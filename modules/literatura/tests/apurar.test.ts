// X posts researched against local stand-ins for PubMed, Unpaywall, Europe PMC, linked pages and the model.
// Failure cases: a post that links a paper is published as the post itself instead of an article written
// from the paper; the article does not credit the post or does not name the journal; a post with no paper
// to find reaches the pool, the selection or an edition with nothing but its own text; a paper the module
// already took is written (and paid for) again; a page that refuses the site's crawler is worked around;
// a page linking several papers is pinned to one of them by guess; a post naming a study without an
// identifier is matched to a record by guess, or not searched at all; a guideline or congress post with an
// official page is dropped, or written from a page that is not the primary source; a post waiting for its
// paper has its pages asked for again; a paper PubMed does not have yet is dropped, or written up from its
// publisher's page; a page the site already holds is paid for and thrown away; a society page linking one
// paper PubMed lacks waits for it instead of being written up; a post still waiting when its window ends is
// left waiting for good.
import { tag } from "../../../tests/setup.ts";
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { config } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { installModules } from "@aihot/backend/modules";
import { publishArticle } from "@aihot/backend/publication/publish";
import server from "../server.ts";
import { cleanDoi, findPostPaper, pageRefs, postLinks, refsIn, researchXPosts, X_WINDOW_DAYS } from "../backend/apurar.ts";
import { INTEGRAL_SOURCE, MATERIA_SOURCE } from "../backend/collect.ts";

const T = tag();
const X_SOURCE = `x-apurar-${T}`;
const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const materia = { titulo: "Reconstrução em um tempo é tão segura quanto em dois na estenose grau III", achado: "Um estudo multicêntrico comparou as duas técnicas em crianças.", perguntaClinica: "Qual o resultado nesta população?", oQueFizeram: "Coorte.", resultados: [{ desfecho: "Desfecho principal", resultado: "Decanulação semelhante.", efeito: "" }], sinaisDeAlerta: [{ sinal: "centro-unico", detalhe: "Observacional." }], aFavor: [], naoInformado: [], naPratica: "Encaminhe cedo.", contexto: "" };

const guideline = `<p>The American Academy of Otolaryngology published today its clinical practice guideline on pediatric tracheostomy care. ${"The guideline recommends that caregivers of every child discharged with a tracheostomy be trained in tube changes and emergency care before discharge, and that two trained caregivers be available at home. ".repeat(4)}</p><p>${"It also recommends routine airway endoscopy before decannulation and a capped trial of at least twelve hours in children who tolerate it. ".repeat(3)}</p>`;
const subjects: Record<string, object> = {
  "Silva et al": { assunto: "artigo", revista: "J Pediatr Surg", tituloDoEstudo: "", primeiroAutor: "Silva", nomeDoEnsaio: "", termos: ["laryngotracheal reconstruction", "subglottic stenosis"] },
  "in The Laryngoscope": { assunto: "artigo", revista: "Laryngoscope", tituloDoEstudo: "", primeiroAutor: "", nomeDoEnsaio: "", termos: ["laryngotracheal reconstruction", "subglottic stenosis"] },
  "this week on stenosis": { assunto: "artigo", revista: "", tituloDoEstudo: "", primeiroAutor: "", nomeDoEnsaio: "", termos: ["laryngotracheal reconstruction", "subglottic stenosis"] },
  "guideline": { assunto: "diretriz", revista: "", tituloDoEstudo: "", primeiroAutor: "", nomeDoEnsaio: "", termos: [] },
  "congress": { assunto: "congresso", revista: "", tituloDoEstudo: "", primeiroAutor: "", nomeDoEnsaio: "", termos: [] },
};
const fonte = { fontePrimaria: true, organizacao: "American Academy of Otolaryngology", titulo: "Academia americana publica diretriz sobre cuidados com traqueostomia em crianças", achado: "Treinamento de dois cuidadores antes da alta.", lide: "A academia americana de otorrinolaringologia publicou uma diretriz sobre o cuidado da criança traqueostomizada.", corpo: "A diretriz recomenda treinar os cuidadores antes da alta." };

const modelInputs: string[] = [];
const subjectInputs: string[] = [];
const searches: string[] = [];
/** DOIs PubMed does not have yet. */
const lagging = new Set<string>();
const hits: string[] = [];
let base = "";

const stubServer = http.createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (c: Buffer) => chunks.push(c));
  req.on("end", () => {
    const url = req.url ?? "/";
    hits.push(url);
    const send = (status: number, type: string, body: string) => { res.writeHead(status, { "content-type": type }); res.end(body); };
    const html = (head: string, body = "") => send(200, "text/html; charset=utf-8", `<!doctype html><html><head>${head}</head><body>${body}</body></html>`);
    // Linked pages: a journal's article page, a press release, a page linking two papers, a bot challenge, a page with no paper.
    if (url === "/journal/article") return html(`<meta name="citation_title" content="Single-stage versus double-stage laryngotracheal reconstruction"><meta name="citation_doi" content="10.1016/j.jpedsurg.2026.161999">`);
    if (url === "/journal/title-only") return html(`<meta name="citation_title" content="Single-stage versus double-stage laryngotracheal reconstruction for grade III subglottic stenosis in children: a multicenter cohort.">`);
    if (url === "/news/release") return html("<title>Press release</title>", `<p>Read the study: <a href="https://doi.org/10.1016/j.jpedsurg.2026.161999">J Pediatr Surg</a></p>`);
    if (url === "/news/two") return html("<title>Roundup</title>", `<a href="https://doi.org/10.1016/j.jpedsurg.2026.161999">one</a> <a href="https://doi.org/10.1186/s12890-026-01234-5">two</a>`);
    if (url === "/news/blocked") return send(403, "text/html", "<html><head><title>Just a moment...</title><meta name=\"citation_doi\" content=\"10.1016/j.jpedsurg.2026.161999\"></head></html>");
    if (url === "/journal/unindexed") return html(`<title>Early view</title><meta name="citation_title" content="Airway stenting in infants with severe tracheomalacia: a prospective series"><meta name="citation_doi" content="10.1002/lary.77777"><meta name="citation_journal_title" content="The Laryngoscope"><meta name="citation_author" content="Costa, Ana"><meta name="citation_publication_date" content="2026/10/30"><meta name="citation_abstract" content="Twelve infants with severe tracheomalacia received a biodegradable airway stent; ten were weaned from ventilation within three months.">`, guideline);
    if (url === "/journal/teaser") return html(`<title>Teaser</title><meta name="citation_title" content="Balloon dilation in infants with acquired subglottic stenosis"><meta name="citation_doi" content="10.1002/lary.44444"><meta name="description" content="Read the latest articles of The Laryngoscope at Wiley Online Library"><meta property="og:description" content="Balloon dilation in infants with acquired subglottic stenosis.">`, `<article>${guideline}<h2>References</h2><p>${"Smith J. A reference. Laryngoscope 2020. ".repeat(60)}</p></article>`);
    if (url === "/journal/flaky") return html(`<title>Flaky</title><meta name="citation_title" content="Cryotherapy for recurrent laryngeal papillomatosis in children"><meta name="citation_doi" content="10.1002/lary.55555"><meta name="citation_abstract" content="Eight children received cryotherapy; recurrences fell by half.">`);
    if (url === "/journal/green") return html(`<title>Green</title><meta name="citation_title" content="Laryngeal cleft repair outcomes in infants with aspiration"><meta name="citation_doi" content="10.1002/lary.22222"><meta name="citation_abstract" content="Forty infants had endoscopic cleft repair; aspiration resolved in thirty-two.">`, `<article>${guideline.repeat(3)}</article>`);
    if (url === "/journal/gold") return html(`<title>Gold</title><meta name="citation_title" content="Tracheal resection in children with long-segment stenosis"><meta name="citation_doi" content="10.1002/lary.11111"><meta name="citation_abstract" content="Fifteen children had tracheal resection; all were extubated within a week.">`, `<article>${guideline.repeat(3)}<h2>References</h2><p>${"Ref. ".repeat(400)}</p></article>`);
    if (url === "/society/ers") return html("<title>ERS statement on paediatric airway malacia</title>", `<article><h1>ERS statement</h1>${guideline}<p>Full statement: <a href="https://doi.org/10.1183/13993003.99999-2026">ERJ</a></p></article>`);
    if (url === "/society/press") return html("<title>Society statement on tracheostomy care</title>", `<article><h1>Society statement</h1>${guideline}</article>`);
    if (url === "/news/congress") return html("<title>Congress</title>", "<p>See you in Lisbon.</p>");
    if (url === "/news/same") return html("<title>Press release</title>", `<a href="https://doi.org/10.1016/j.jpedsurg.2026.161999">doi</a> <a href="https://pubmed.ncbi.nlm.nih.gov/41000001/">PubMed</a> <a href="https://onlinelibrary.wiley.com/doi/full/10.1016/j.jpedsurg.2026.161999">journal</a>`);
    if (url === "/news/journal-link") return html("<title>Press release</title>", `<p>Read it at <a href="https://www.sciencedirect.com/science/article/doi/10.1016/j.jpedsurg.2026.161999">the journal</a>.</p>`);
    if (url === "/guideline/trach") return html("<title>Pediatric Tracheostomy Care Guideline</title>", `<article><h1>Pediatric Tracheostomy Care Guideline</h1>${guideline}</article>`);
    if (url === "/blog/trach") return html("<title>My take on the new guideline</title>", `<article><h1>My take</h1>${guideline}</article>`);
    if (url.startsWith("/eutils/esearch.fcgi")) {
      const term = new URLSearchParams(Buffer.concat(chunks).toString()).get("term") ?? "";
      searches.push(term);
      const idlist = /"10\.1016\/j\.jpedsurg\.2026\.161999"\[aid\]/.test(term) ? ["41000001"]
        : /"10\.1186\/s12890-026-01234-5"\[aid\]/.test(term) && !lagging.has("10.1186/s12890-026-01234-5") ? ["41000002"]
        : /"laryngotracheal reconstruction"\[tiab\]/.test(term) ? ["41000001"]
        : /^"single-stage versus double-stage laryngotracheal reconstruction for grade iii/i.test(term) ? ["41000001"] : [];
      return send(200, "application/json", JSON.stringify({ esearchresult: { idlist } }));
    }
    if (url.startsWith("/eutils/efetch.fcgi")) return send(200, "text/xml", fixture("pubmed.xml"));
    if (url.startsWith("/unpaywall/10.1002%2Flary.55555")) return send(500, "text/plain", "down");
    if (url.startsWith("/unpaywall/10.1002%2Flary.11111")) return send(200, "application/json", JSON.stringify({ is_oa: true, best_oa_location: { url_for_landing_page: "https://doi.org/10.1002/lary.11111", host_type: "publisher", version: "publishedVersion", license: "cc-by-nc-nd" } }));
    if (url.startsWith("/unpaywall/10.1002%2Flary.22222")) return send(200, "application/json", JSON.stringify({ is_oa: true, best_oa_location: { url_for_landing_page: "https://repository.example.org/cleft", host_type: "repository", version: "acceptedVersion" } }));
    if (url.startsWith("/unpaywall/")) return send(200, "application/json", fixture("unpaywall-closed.json"));
    if (url.startsWith("/epmc/search")) {
      const query = new URL(url, "http://stub").searchParams.get("query") ?? "";
      const result = query === "PMCID:PMC12345678" ? [{ pmid: "41000002", pmcid: "PMC12345678" }] : [];
      return send(200, "application/json", JSON.stringify({ resultList: { result } }));
    }
    if (url.startsWith("/epmc/")) return send(404, "text/plain", "not found");
    if (url.startsWith("/v1/chat/completions")) {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { messages: Array<{ role: string; content: string }> };
      const user = body.messages.find((m) => m.role === "user")!.content;
      const answer = (data: object) => send(200, "application/json", JSON.stringify({ id: `stub-${modelInputs.length}-${subjectInputs.length}`, choices: [{ message: { content: JSON.stringify(data) } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }));
      if (user.startsWith("Post:")) {
        subjectInputs.push(user);
        return answer(Object.entries(subjects).find(([k]) => user.includes(k))?.[1] ?? { assunto: "outro", termos: [] });
      }
      modelInputs.push(user);
      if (user.startsWith("Endereço da página:")) return answer(user.includes("/blog/") ? { fontePrimaria: false } : fonte);
      return answer(materia);
    }
    send(500, "text/plain", "unexpected");
  });
});

before(async () => {
  await new Promise<void>((resolve) => stubServer.listen(0, "127.0.0.1", () => resolve()));
  base = `http://127.0.0.1:${(stubServer.address() as { port: number }).port}`;
  config.allowPrivateNetworkFetch = true;
  config.modelCallsEnabled = true;
  delete process.env.MATERIA_MODEL;
  Object.assign(process.env, {
    PUBMED_BASE_URL: `${base}/eutils`, UNPAYWALL_BASE_URL: `${base}/unpaywall`, EUROPE_PMC_BASE_URL: `${base}/epmc`, LITERATURA_EMAIL: "test@example.com",
    LLM_BASE_URL: `${base}/v1`, LLM_API_KEY: "test-key", LLM_MODEL: "one-model",
  });
  installModules([server]);
  for (const id of [MATERIA_SOURCE, INTEGRAL_SOURCE]) {
    await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, site_fulltext, next_fetch_at)
      VALUES (${id}, ${id}, 'external', 'T1', 'editorial', true, '2100-01-01') ON CONFLICT (id) DO NOTHING`;
  }
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, next_fetch_at)
    VALUES (${X_SOURCE}, 'X: ENT Papers (@ENT_Papers)', 'x_search', 'T2', 'editorial', '2100-01-01')`;
});

after(async () => {
  await new Promise<void>((resolve) => stubServer.close(() => resolve()));
  await stopBoss();
  await closeDb();
});

/** A post of the X source, judged relevant and selected by the engine (an analysis row as the engine writes it). */
async function post(name: string, text: string) {
  const url = `https://x.com/ENT_Papers/status/${name}${T}`;
  const material = await upsertMaterial({
    sourceId: X_SOURCE, url, title: text.slice(0, 100), bodyText: text, bodyStatus: "ok", via: "fetch", publishedAt: new Date(),
    xPost: { tweetId: `${name}${T}`, authorName: "ENT Papers", handle: "ENT_Papers", text },
  });
  await sql`INSERT INTO analyses (article_id, input_revision, origin, relevance, title_zh, summary_zh, score, selected)
    VALUES (${material.articleId}, 1, 'model', 'pass', ${text.slice(0, 60)}, ${text}, 90, true)`;
  return { id: material.articleId, url };
}

const xStatus = async (id: string) => (await sql<{ status: string; pmid: string | null }[]>`SELECT status, pmid FROM literatura_x_posts WHERE article_id = ${id}`)[0];

test("the identifiers in a post: DOIs bare or in a journal's address, PubMed addresses and PMIDs, PMC ids; X's own links are not followed", () => {
  const refs = refsIn("New in J Pediatr Surg https://doi.org/10.1016/J.JPEDSURG.2026.161999. Also https://onlinelibrary.wiley.com/doi/full/10.1002/lary.31234?af=R and https://pubmed.ncbi.nlm.nih.gov/41000009/ (PMID: 41000010), https://pmc.ncbi.nlm.nih.gov/articles/PMC12345678/");
  assert.deepEqual(refs.dois, ["10.1016/j.jpedsurg.2026.161999", "10.1002/lary.31234"]);
  assert.deepEqual(refs.pmids, ["41000009", "41000010"]);
  assert.deepEqual(refs.pmcids, ["PMC12345678"]);
  assert.equal(cleanDoi("10.1056/NEJMoa2400001/full"), "10.1056/nejmoa2400001");
  assert.equal(cleanDoi("10.1002%2Flary.31234)"), "10.1002/lary.31234");
  assert.deepEqual(postLinks("Thread https://x.com/a/status/1 https://twitter.com/i/article/2 https://t.co/abc and https://www.aaohns.org/guideline."), ["https://www.aaohns.org/guideline"]);
  const page = pageRefs(`<meta name="dc.identifier" content="doi:10.1093/bja/aeae001"><meta name="citation_pmid" content="41000011">`, "https://academic.oup.com/bja/article/1/1");
  assert.deepEqual([page.own.dois, page.own.pmids], [["10.1093/bja/aeae001"], ["41000011"]]);
});

test("a post linking a paper's DOI becomes the site's article written from the paper, naming the journal and crediting the post; the post itself stays out of the pool", async () => {
  const { id, url } = await post("doi", "Single vs double stage LTR for grade III SGS — multicenter cohort out now https://doi.org/10.1016/j.jpedsurg.2026.161999");
  const before = modelInputs.length;
  const run = await researchXPosts();
  assert.equal(run["materia-abstract"], 1);
  assert.equal(modelInputs.length, before + 1, "one article is written");
  assert.match(modelInputs.at(-1)!, /Título original: Single-stage versus double-stage laryngotracheal reconstruction/);
  assert.match(modelInputs.at(-1)!, /Revista: Journal of pediatric surgery/);
  assert.doesNotMatch(modelInputs.at(-1)!, /multicenter cohort out now/, "the article is written from the paper, not from the post");

  const x = await xStatus(id);
  assert.deepEqual(x, { status: "materia-abstract", pmid: "41000001" });
  const [article] = await sql<{ source_id: string; url: string; title: string; body_html: string; journal: string; x_post: string }[]>`
    SELECT a.source_id, a.url, a.title, a.body_html, a.raw->>'journal' AS journal, a.raw->>'xPost' AS x_post
    FROM literatura_papers p JOIN articles a ON a.id = p.article_id WHERE p.pmid = '41000001'`;
  assert.equal(article!.source_id, MATERIA_SOURCE);
  assert.equal(article!.url, "https://doi.org/10.1016/j.jpedsurg.2026.161999");
  assert.equal(article!.title, materia.titulo);
  assert.equal(article!.journal, "Journal of pediatric surgery");
  assert.match(article!.body_html, /<h2>Referência<\/h2>/);
  assert.match(article!.body_html, /<em>J Pediatr Surg<\/em>/);
  assert.match(article!.body_html, new RegExp(`Pauta: o artigo foi destacado por ENT Papers <a href="${url.replace(/[.?]/g, "\\$&")}"[^>]*>@ENT_Papers</a> no X`));
  assert.equal(article!.x_post, url);

  await publishArticle(id, { releasedAt: new Date(Date.now() - 60_000) });
  const [p] = await sql<{ eligible: boolean; selected: boolean }[]>`SELECT eligible, selected FROM publications WHERE article_id = ${id}`;
  assert.deepEqual(p, { eligible: false, selected: false }, "the post is not published as an item of its own");

  const again = await researchXPosts();
  assert.equal(again.posts, 0, "a researched post is not taken again");
  assert.equal(modelInputs.length, before + 1);
});

test("a post with no paper to find is not published with its text alone", async () => {
  const { id } = await post("congress", `Great airway session at the congress today! Slides soon ${base}/news/congress`);
  const before = modelInputs.length;
  await researchXPosts();
  assert.deepEqual(await xStatus(id), { status: "sem-fonte", pmid: null });
  assert.equal(modelInputs.length, before, "nothing is written");
  await publishArticle(id, { releasedAt: new Date(Date.now() - 60_000) });
  const [p] = await sql<{ eligible: boolean; selected: boolean; indexable: boolean }[]>`SELECT eligible, selected, indexable FROM publications WHERE article_id = ${id}`;
  assert.deepEqual(p, { eligible: false, selected: false, indexable: false }, "out of the pool, the selection and the editions, and not indexed");
});

test("a paper the module already took is not written again; the post is recorded as covered", async () => {
  const { id } = await post("again", "Must read: PMID 41000001");
  const before = modelInputs.length;
  await researchXPosts();
  assert.deepEqual(await xStatus(id), { status: "ja-coberto", pmid: "41000001" });
  assert.equal(modelInputs.length, before);
});

test("linked pages lead to the paper by their citation tags, by the one paper a press release links, by the exact title, or by a PMC id; never through a refusal or by guess", async () => {
  const pmid = async (text: string) => (await findPostPaper(text)).paper?.pmid ?? null;
  assert.equal(await pmid(`Out now ${base}/journal/article`), "41000001");
  assert.equal(await pmid(`Press ${base}/news/release`), "41000001");
  assert.equal(await pmid(`Press ${base}/news/journal-link`), "41000001", "a link to the journal's own DOI page");
  assert.equal(await pmid(`Press ${base}/news/same`), "41000001", "the paper's DOI, PubMed and journal links are one paper");
  assert.equal(await pmid(`Paper ${base}/journal/title-only`), "41000001");
  assert.equal(await pmid("Free full text https://pmc.ncbi.nlm.nih.gov/articles/PMC12345678/"), "41000002");
  const blocked = hits.length;
  assert.equal(await pmid(`Paywalled ${base}/news/blocked`), null, "a page that refuses the crawler is not read");
  assert.equal(hits.slice(blocked).filter((h) => h === "/news/blocked").length, 1, "asked for once");
  assert.equal(await pmid(`Two studies ${base}/news/two`), null, "a page linking two papers names neither");
});

test("a post naming a study without an identifier is searched in PubMed by what it names, and only a record with all of it is taken", async () => {
  const found = await post("subject", "New multicenter cohort in J Pediatr Surg by Silva et al: single vs double stage LTR for grade III SGS in kids");
  await researchXPosts();
  assert.deepEqual(await xStatus(found.id), { status: "ja-coberto", pmid: "41000001" }, "the study is found (and was already written)");
  assert.match(searches.at(-1)!, /"laryngotracheal reconstruction"\[tiab\] AND "subglottic stenosis"\[tiab\] AND "J Pediatr Surg"\[ta\] AND "Silva"\[1au\]/);

  const wrongJournal = await post("subject-mismatch", "Single vs double stage LTR for SGS in The Laryngoscope");
  await researchXPosts();
  assert.deepEqual(await xStatus(wrongJournal.id), { status: "sem-fonte", pmid: null }, "a record from another journal is not taken");

  const searched = searches.length;
  const vague = await post("subject-vague", "Interesting airway paper this week on stenosis");
  await researchXPosts();
  assert.deepEqual(await xStatus(vague.id), { status: "sem-fonte", pmid: null });
  assert.equal(searches.length, searched, "a topic with no journal, author or trial named is not searched");
});

test("a guideline post is written up from the official page it links, naming the organisation and crediting the post; a third party's page is not a source", async () => {
  const { id, url } = await post("guideline", `New AAO guideline on pediatric tracheostomy care ${base}/guideline/trach`);
  const before = modelInputs.length;
  await researchXPosts();
  assert.equal(modelInputs.length, before + 1);
  assert.match(modelInputs.at(-1)!, /^Endereço da página: .*\/guideline\/trach/);
  assert.match(modelInputs.at(-1)!, /capped trial of at least twelve hours/);
  assert.equal((await xStatus(id))!.status, "materia-pagina");
  const [article] = await sql<{ source_id: string; title: string; body_html: string; body_text: string; x_post: string }[]>`
    SELECT source_id, title, body_html, body_text, raw->>'xPost' AS x_post FROM articles WHERE url = ${`${base}/guideline/trach`}`;
  assert.equal(article!.source_id, MATERIA_SOURCE);
  assert.ok(article!.body_text.startsWith(fonte.achado), "the engine reads the finding the body does not repeat");
  assert.ok(!article!.body_html.includes(fonte.achado));
  assert.equal(article!.title, fonte.titulo);
  assert.match(article!.body_html, /<h2>Fonte<\/h2><p>American Academy of Otolaryngology: <a href="[^"]*\/guideline\/trach"[^>]*>Pediatric Tracheostomy Care Guideline<\/a>/);
  assert.match(article!.body_html, /Pauta: o assunto foi destacado por ENT Papers/);
  assert.equal(article!.x_post, url);

  const again = await post("guideline-again", `The AAO guideline is out ${base}/guideline/trach`);
  await researchXPosts();
  assert.equal((await xStatus(again.id))!.status, "ja-coberto", "a page already written up is not written again");
  assert.equal(modelInputs.length, before + 1);

  const blog = await post("guideline-blog", `My thoughts on the new guideline ${base}/blog/trach`);
  await researchXPosts();
  assert.deepEqual(await xStatus(blog.id), { status: "sem-fonte", pmid: null });
  const [none] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM articles WHERE url = ${`${base}/blog/trach`} AND source_id = ${MATERIA_SOURCE}`;
  assert.equal(none!.n, 0);
});

test("a paper PubMed does not have yet waits by its DOI and is written from the paper once PubMed has it; its publisher's page is never written up", async () => {
  lagging.add("10.1186/s12890-026-01234-5");
  const { id } = await post("early", "Out today: bronchoscopy in persistent wheeze https://doi.org/10.1186/s12890-026-01234-5");
  const publisher = await post("early-page", `Early view ${base}/journal/unindexed`);
  const before = modelInputs.length;
  const subjectsBefore = subjectInputs.length;
  await researchXPosts();
  assert.deepEqual([...await sql`SELECT status, pmid, doi FROM literatura_x_posts WHERE article_id = ${id}`], [{ status: "aguardando-pubmed", pmid: null, doi: "10.1186/s12890-026-01234-5" }]);
  assert.deepEqual([...await sql`SELECT status, pmid, doi FROM literatura_x_posts WHERE article_id = ${publisher.id}`], [{ status: "aguardando-pubmed", pmid: null, doi: "10.1002/lary.77777" }]);
  assert.equal(modelInputs.length, before, "nothing is written from the post or the publisher's page");
  assert.equal(subjectInputs.length, subjectsBefore);

  const read = hits.length;
  lagging.clear();
  await researchXPosts();
  assert.equal(hits.slice(read).filter((h) => h === "/journal/unindexed").length, 0, "the page is not asked for again");
  assert.deepEqual(await xStatus(id), { status: "materia-abstract", pmid: "41000002" });
  assert.equal(modelInputs.length, before + 1);
  assert.match(modelInputs.at(-1)!, /Título original: Flexible bronchoscopy findings/);
  const [article] = await sql<{ url: string; body_html: string }[]>`SELECT a.url, a.body_html FROM literatura_papers p JOIN articles a ON a.id = p.article_id WHERE p.pmid = '41000002'`;
  assert.equal(article!.url, "https://doi.org/10.1186/s12890-026-01234-5");
  assert.match(article!.body_html, /<h2>Referência<\/h2>/);
  assert.equal((await xStatus(publisher.id))!.status, "aguardando-pubmed", "still waiting while the post is in its window");
});

test("an official page the site already holds from another source is not written again", async () => {
  const society = `society-${T}`;
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, next_fetch_at) VALUES (${society}, 'Society', 'rss', 'T1', 'editorial', '2100-01-01')`;
  const held = await upsertMaterial({ sourceId: society, url: `${base}/society/press`, title: "Society statement", bodyText: guideline, bodyStatus: "ok", via: "fetch", publishedAt: new Date() });
  const { id } = await post("guideline-held", `New guideline statement from the society ${base}/society/press`);
  const before = modelInputs.length;
  await researchXPosts();
  assert.equal(modelInputs.length, before, "no article is paid for");
  assert.deepEqual(await xStatus(id), { status: "ja-coberto", pmid: null });
  const [x] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM articles WHERE id = ${held.articleId} AND source_id = ${society}`;
  assert.equal(x!.n, 1);
});

test("a post waiting for its paper is taken again from the paper found, without asking for its pages again", async () => {
  const { id } = await post("waiting", `Bronchoscopy in wheezy kids ${base}/news/release`);
  await sql`INSERT INTO literatura_x_posts (article_id, status, pmid) VALUES (${id}, 'aguardando-unpaywall', '41000002')`;
  const read = hits.length;
  await researchXPosts();
  assert.equal(hits.slice(read).filter((h) => h === "/news/release").length, 0, "the linked page is not asked for again");
  assert.deepEqual(await xStatus(id), { status: "ja-coberto", pmid: "41000002" }, "the paper written before is not written again");
});

test("past the window, a post whose paper waits (Unpaywall) is still taken again from that paper", async () => {
  const { id } = await post("waiting-late", `Bronchoscopy in wheezy kids ${base}/news/release`);
  await sql`INSERT INTO literatura_x_posts (article_id, status, pmid) VALUES (${id}, 'aguardando-unpaywall', '41000002')`;
  await sql`UPDATE articles SET discovered_at = now() - make_interval(days => ${X_WINDOW_DAYS + 1}) WHERE id = ${id}`;
  await researchXPosts();
  assert.deepEqual(await xStatus(id), { status: "ja-coberto", pmid: "41000002" });
});

test("past the window, a post with a found paper that fails is retried up to the attempts allowed, not given up at once", async () => {
  const { id } = await post("waiting-flaky", `Early view ${base}/journal/flaky`);
  await sql`INSERT INTO literatura_x_posts (article_id, status, pmid) VALUES (${id}, 'aguardando-unpaywall', '49999999')`;
  await sql`UPDATE articles SET discovered_at = now() - make_interval(days => ${X_WINDOW_DAYS + 1}) WHERE id = ${id}`;
  await researchXPosts();
  assert.deepEqual([...await sql`SELECT status, pmid, attempts FROM literatura_x_posts WHERE article_id = ${id}`], [{ status: "erro", pmid: "49999999", attempts: 1 }]);
  await researchXPosts();
  await researchXPosts();
  assert.deepEqual([...await sql`SELECT status, attempts FROM literatura_x_posts WHERE article_id = ${id}`], [{ status: "falhou", attempts: 3 }]);
});

test("a society page linking one paper PubMed does not have is written up from the page, not left waiting", async () => {
  const { id } = await post("ers", `New ERS guideline statement on paediatric airway malacia ${base}/society/ers`);
  const before = modelInputs.length;
  await researchXPosts();
  assert.deepEqual(await xStatus(id), { status: "materia-pagina", pmid: null });
  assert.equal(modelInputs.length, before + 1);
  assert.match(modelInputs.at(-1)!, /^Endereço da página: .*\/society\/ers/);
});

test("when the window ends with PubMed still lacking the DOI, the paper's publisher page is written up as a paper, and a post with nothing else ends as sem-fonte", async () => {
  const [publisher] = await sql<{ article_id: string }[]>`SELECT article_id FROM literatura_x_posts WHERE doi = '10.1002/lary.77777' AND status = 'aguardando-pubmed'`;
  assert.ok(publisher, "the post left waiting by an earlier test");
  const bare = await post("early-bare", "Preprint on airway stents doi:10.1002/lary.66666");
  await sql`INSERT INTO literatura_x_posts (article_id, status, doi) VALUES (${bare.id}, 'aguardando-pubmed', '10.1002/lary.66666')`;
  const before = modelInputs.length;
  await researchXPosts({ now: new Date(Date.now() + (X_WINDOW_DAYS + 1) * 86_400_000) });

  assert.deepEqual([...await sql`SELECT status, doi FROM literatura_x_posts WHERE article_id = ${publisher!.article_id}`], [{ status: "materia-editora", doi: "10.1002/lary.77777" }]);
  assert.equal(modelInputs.length, before + 1, "one article, written as a paper");
  assert.match(modelInputs.at(-1)!, /^Título original: Airway stenting in infants with severe tracheomalacia/);
  assert.match(modelInputs.at(-1)!, /Revista: The Laryngoscope \(2026\)/);
  const [article] = await sql<{ source_id: string; body_html: string }[]>`SELECT source_id, body_html FROM articles WHERE url = 'https://doi.org/10.1002/lary.77777'`;
  assert.equal(article!.source_id, MATERIA_SOURCE);
  assert.match(article!.body_html, /<h2>Referência<\/h2>/);
  assert.match(article!.body_html, /DOI: <a href="https:\/\/doi\.org\/10\.1002\/lary\.77777"/);
  assert.doesNotMatch(article!.body_html, /PubMed:/);
  assert.match(article!.body_html, /Pauta: o artigo foi destacado por ENT Papers/);
  assert.match(modelInputs.at(-1)!, /Texto disponível: somente o resumo/);
  const [taken] = await sql<{ id: string }[]>`SELECT id FROM articles WHERE url = 'https://doi.org/10.1002/lary.77777'`;
  assert.deepEqual([...await sql`SELECT status, article_id FROM literatura_papers WHERE pmid = 'doi:10.1002/lary.77777'`], [{ status: "materia-abstract", article_id: taken!.id }], "recorded as taken, as the collector records a paper by its DOI");

  assert.deepEqual([...await sql`SELECT status FROM literatura_x_posts WHERE article_id = ${bare.id}`], [{ status: "sem-fonte" }], "nothing left waiting");
});

test("past the window, a publisher page with only a site blurb is not written up, and a failure gives the post up", async () => {
  const teaser = await post("early-teaser", `Early view ${base}/journal/teaser`);
  const flaky = await post("early-flaky", `Early view ${base}/journal/flaky`);
  await sql`INSERT INTO literatura_x_posts (article_id, status, doi) VALUES (${teaser.id}, 'aguardando-pubmed', '10.1002/lary.44444'), (${flaky.id}, 'aguardando-pubmed', '10.1002/lary.55555')`;
  const before = modelInputs.length;
  await researchXPosts({ now: new Date(Date.now() + (X_WINDOW_DAYS + 1) * 86_400_000) });
  assert.equal(modelInputs.length, before, "nothing is written from a blurb or a reference list");
  assert.deepEqual([...await sql`SELECT status FROM literatura_x_posts WHERE article_id = ${teaser.id}`], [{ status: "sem-fonte" }]);
  assert.deepEqual([...await sql`SELECT status, attempts FROM literatura_x_posts WHERE article_id = ${flaky.id}`], [{ status: "falhou", attempts: 1 }], "no retryable status is left past the window");
});

test("a post whose last try inside the window failed still gets the window-end research; a publisher page is full text only when it is the open copy", async () => {
  const failed = await post("early-failed", `Early view ${base}/journal/green`);
  await sql`INSERT INTO literatura_x_posts (article_id, status, doi, attempts) VALUES (${failed.id}, 'erro', '10.1002/lary.22222', 1)`;
  const before = modelInputs.length;
  await researchXPosts({ now: new Date(Date.now() + (X_WINDOW_DAYS + 1) * 86_400_000) });
  assert.deepEqual([...await sql`SELECT status FROM literatura_x_posts WHERE article_id = ${failed.id}`], [{ status: "materia-editora" }]);
  assert.equal(modelInputs.length, before + 1);
  assert.match(modelInputs.at(-1)!, /^Título original: Laryngeal cleft repair outcomes/);
  assert.match(modelInputs.at(-1)!, /Texto disponível: somente o resumo/, "the open copy is in a repository, not this page");
  const [article] = await sql<{ body_html: string }[]>`SELECT body_html FROM articles WHERE url = 'https://doi.org/10.1002/lary.22222'`;
  assert.match(article!.body_html, /repository\.example\.org/);
});

test("past the window, an open paper's own publisher page (Unpaywall gives its DOI address) is read as its full text, up to the references", async () => {
  const gold = await post("early-gold", `Early view ${base}/journal/gold`);
  await sql`INSERT INTO literatura_x_posts (article_id, status, doi) VALUES (${gold.id}, 'aguardando-pubmed', '10.1002/lary.11111')`;
  const before = modelInputs.length;
  await researchXPosts({ now: new Date(Date.now() + (X_WINDOW_DAYS + 1) * 86_400_000) });
  assert.deepEqual([...await sql`SELECT status FROM literatura_x_posts WHERE article_id = ${gold.id}`], [{ status: "materia-editora" }]);
  assert.equal(modelInputs.length, before + 1);
  assert.match(modelInputs.at(-1)!, /Texto disponível: texto completo\n/);
  assert.match(modelInputs.at(-1)!, /capped trial of at least twelve hours/);
  assert.doesNotMatch(modelInputs.at(-1)!, /Ref\. Ref\./, "the reference list is left out");
  const [article] = await sql<{ body_html: string }[]>`SELECT body_html FROM articles WHERE url = 'https://doi.org/10.1002/lary.11111'`;
  assert.match(article!.body_html, /<h2>Referência<\/h2>/);
});
