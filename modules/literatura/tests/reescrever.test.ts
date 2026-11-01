// Rewriting one edition in the single structure (scripts/edicao-reescrever.ts), against local stand-ins for PubMed,
// Unpaywall, Europe PMC and the model. Failure cases: a dry run writes or pays; a matéria outside the edition or a
// third party's item changes; the rewrite takes an item out of the edition (a new revision would); an item with no
// readable source gets invented text; a publisher's or official page's item is skipped; text without the main number
// in "Em um minuto", with a figure in "Na prática", lacking a section or saying what was read is published; an editor's
// override is cleared or hides the new text unreported; a second run pays or writes again; the old text cannot be
// restored; the edition keeps the old words, or is sent again; the script reports success with an own item left behind.
import { tag } from "../../../tests/setup.ts";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { promisify } from "node:util";
import { config, REPO_ROOT } from "@aihot/backend/config";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { closeDb, sql } from "@aihot/backend/db";
import { getBoss, stopBoss } from "@aihot/backend/jobs/queue";
import { installModules } from "@aihot/backend/modules";
import { publishArticle } from "@aihot/backend/publication/publish";
import server from "../server.ts";
import { INTEGRAL_SOURCE, MATERIA_SOURCE } from "../backend/collect.ts";
import { hasNumber, mainNumbers, materiaParts, refusal, restoreItems, rewriteEdition } from "../backend/reescrever.ts";

const T = tag();
const KEY = "2026-W01";
const ACTOR = "script:test";
const REASON = "estrutura única";
const POST_URL = `https://x.com/testes/status/${T}`;
const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const jats = fixture("jats.xml").replace("<sec id=\"s1\"><title>Background</title>", `<sec id="s1"><title>Background</title><p>${"Children with persistent wheeze were assessed in clinic. ".repeat(40)}</p>`);

const PMID = { good: "47000001", bad: "47000002", integral: "47000003", outside: "47000004", edited: "47000005", versioned: "47000006", short: "47000007" };
const paper = (pmid: string, title: string, abstract: string, pmc = "") => `<PubmedArticle><MedlineCitation><PMID Version="1">${pmid}</PMID><Article>
  <Journal><JournalIssue><PubDate><Year>2026</Year></PubDate></JournalIssue><Title>Journal of tests</Title></Journal><ArticleTitle>${title}</ArticleTitle>
  <ELocationID EIdType="doi" ValidYN="Y">10.5555/${pmid}</ELocationID><Abstract><AbstractText>${abstract}</AbstractText></Abstract>
  <AuthorList><Author><LastName>Silva</LastName><Initials>A</Initials></Author></AuthorList><Language>eng</Language>
  <PublicationTypeList><PublicationType>Journal Article</PublicationType></PublicationTypeList></Article></MedlineCitation>
  <PubmedData><ArticleIdList><ArticleId IdType="pubmed">${pmid}</ArticleId><ArticleId IdType="doi">10.5555/${pmid}</ArticleId>${pmc ? `<ArticleId IdType="pmc">${pmc}</ArticleId>` : ""}</ArticleIdList></PubmedData></PubmedArticle>`;
const PUBMED = `<PubmedArticleSet>${[
  paper(PMID.good, "Good paper", "Decannulation was achieved in 88.0% of 84 children."),
  paper(PMID.bad, "Bad paper", "Survival rose to 70.8% among 58 infants."),
  paper(PMID.integral, "Translated paper", "Tracheomalacia was found in 31% of 120 children.", "PMC12345678"),
  paper(PMID.outside, "Outside paper", "An outcome of 12% in 40 children."),
  paper(PMID.edited, "Edited paper", "Stridor resolved in 64% of 25 infants."),
  paper(PMID.versioned, "Versioned paper", "Stenosis was treated in a cohort."),
  paper(PMID.short, "Short paper", "Stenosis was followed in a cohort.", "PMC87654321"),
].join("")}</PubmedArticleSet>`;

const materia = (titulo: string, achado: string, resultado: string) => ({
  titulo, perguntaClinica: "Em crianças, a técnica muda o desfecho?", achado, mudaAlgo: "nao", desenho: "coorte", desenhoDetalhe: "coorte de um centro, 84 crianças",
  populacaoIdade: "1 a 5 anos", populacaoDoenca: "Estenose", populacaoCenario: "Centro terciário", limitacaoPrincipal: "Retrospectivo.", oQueFizeram: "Compararam técnicas.",
  resultados: [{ desfecho: "Desfecho", resultado, efeito: "" }], aFavor: [], naoInformado: [], sinaisDeAlerta: [], naPratica: "Não muda a conduta.", contexto: "",
});
const PUBLISHER_DOI = "10.5555/publisher";
const publisherPage = `<html><head><title>Publisher paper</title><meta name="citation_title" content="Publisher paper"><meta name="citation_doi" content="${PUBLISHER_DOI}"><meta name="citation_journal_title" content="Journal of tests"><meta name="citation_abstract" content="Stenting succeeded in 75% of 12 infants."></head><body><p>Article.</p></body></html>`;
const officialPage = `<html><head><title>Diretriz oficial</title></head><body><article><h1>Diretriz oficial</h1>${"<p>A sociedade recomenda treinar os cuidadores antes da alta, o que ocorreu em 90% das altas acompanhadas neste serviço de referência.</p>".repeat(10)}</article></body></html>`;
const fonte = { fontePrimaria: true, organizacao: "Sociedade de testes", titulo: "Sociedade publica diretriz sobre o preparo de cuidadores antes da alta", achado: "Cuidadores treinados em 90% das altas.", lide: "A sociedade publicou uma diretriz sobre a alta da criança.", corpo: "A diretriz recomenda treinar os cuidadores.", tipo: "diretriz", mudaAlgo: "nao", conflitos: "", diretriz: "", paraQuem: "", aplicabilidadeBrasil: "" };
/** What the bad paper's writer answers, in the order the test asks for it. */
let badAnswer: "blank" | "figures" | "table" | "fixed" = "blank";
let saysRead = false;
let writerFails = false;
const calls = { materia: 0, report: 0, other: 0 };
const paths: string[] = [];
const writerInputs: string[] = [];
const llm = (user: string) => {
  if (user.startsWith("Esta edição:")) {
    calls.report++;
    return { overview: "A edição traz a decanulação em oitenta e oito por cento e o uso de 999 cânulas.", sections: {} };
  }
  calls.materia++;
  writerInputs.push(user);
  if (user.includes("Good paper")) return materia("Decanulação em crianças é parecida entre as técnicas comparadas", saysRead ? "Segundo o resumo, decanulação em 88% das crianças." : "A decanulação ocorreu em 88% das crianças.", "Sem diferença entre grupos.");
  if (user.startsWith("Endereço da página")) return fonte;
  if (user.includes("Publisher paper")) return materia("Stent em lactentes teve sucesso na maior parte dos casos da série", "O stent teve sucesso em 75% dos lactentes.", "Sucesso em 75%.");
  if (user.includes("Edited paper")) return materia("Estridor melhorou na maior parte dos lactentes acompanhados na série", "O estridor melhorou em 64% dos lactentes.", "Melhora em 64%.");
  if (user.includes("Bad paper")) {
    const titulo = "Sobrevida na hérnia grave subiu em duas décadas de acompanhamento";
    if (badAnswer === "blank") return { ...materia(titulo, "A sobrevida chegou a 70,8% dos lactentes.", "70,8%."), oQueFizeram: "", naPratica: "" };
    if (badAnswer === "figures") return { ...materia(titulo, "A sobrevida chegou a 70,8% dos lactentes.", "70,8%."), naPratica: "Para 70,8% dos casos, não muda a conduta." };
    if (badAnswer === "table") return materia(titulo, "A sobrevida aumentou nas últimas décadas.", "70,8%, com aumento.");
    return materia(titulo, "Entre 58 lactentes, a sobrevida aumentou.", "Com aumento.");
  }
  if (user.includes("Translated paper")) return materia("Título que a tradução ignora, com tamanho bastante", "Traqueomalácia em 31% das crianças.", "Lista.");
  return materia("Título que ninguém pediu, com tamanho bastante", "A série não traz um número principal.", "Nada.");
};
const stubServer = http.createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (c: Buffer) => chunks.push(c));
  req.on("end", () => {
    const url = req.url ?? "/";
    paths.push(url.split("?")[0]!);
    const send = (status: number, type: string, body: string) => { res.writeHead(status, { "content-type": type }); res.end(body); };
    if (url.startsWith("/eutils/efetch.fcgi")) return send(200, "text/xml", PUBMED);
    if (url.startsWith("/eutils/esearch.fcgi")) return send(200, "application/json", JSON.stringify({ esearchresult: { idlist: [] } }));
    if (url === "/journal/publisher") return send(200, "text/html", publisherPage);
    if (url === "/oficial/diretriz") return send(200, "text/html", officialPage);
    if (url === "/oficial/sumiu") return send(404, "text/html", "");
    if (url.startsWith("/unpaywall/")) return send(200, "application/json", fixture("unpaywall-closed.json"));
    if (url.startsWith("/epmc/search")) return send(200, "application/json", JSON.stringify({ resultList: { result: [] } }));
    if (url === "/epmc/PMC12345678/fullTextXML") return send(200, "text/xml", jats);
    if (url === "/epmc/PMC87654321/fullTextXML") return send(200, "text/xml", fixture("jats.xml"));
    if (url.startsWith("/crossref/")) return send(404, "application/json", "{}");
    if (url.startsWith("/v1/chat/completions")) {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { messages: Array<{ role: string; content: string }> };
      const user = body.messages.find((m) => m.role === "user")!.content;
      if (writerFails && user.startsWith("Esta edição:")) return send(400, "application/json", "{}");
      return send(200, "application/json", JSON.stringify({ id: `stub-${paths.length}`, choices: [{ message: { content: JSON.stringify(llm(user)) } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }));
    }
    send(500, "text/plain", "unexpected");
  });
});

const tmp = mkdtempSync(path.join(os.tmpdir(), "reescrever-"));
const previewPath = path.join(tmp, "preview.md");
const run = (mode: "plan" | "generate" | "apply", log?: (line: string) => void) => rewriteEdition(KEY, { mode, reason: REASON, actor: ACTOR, previewPath, log });
const ids = {} as Record<"good" | "bad" | "integral" | "third" | "noSource" | "outside" | "publisher" | "page" | "pageGone" | "edited" | "earlierVersion" | "laterVersion" | "versioned" | "short" | "shortIntegral", string>;
const EDITED_SUMMARY = "Resumo ajustado pelo editor.";

/** An item already selected and grouped, as an edition carries it. */
async function item(name: keyof typeof ids, sourceId: string, raw: Record<string, unknown>, title: string, excerpt: string, url = `https://example.test/${T}/${name}`) {
  const { articleId } = await upsertMaterial({ sourceId, url, title, excerpt, language: "pt", publishedAt: new Date(), bodyHtml: `<p>${excerpt} velho</p>`, bodyText: `${excerpt} velho`, bodyStatus: "ok", raw, via: "literatura", staleOnDiscovery: false });
  await sql`UPDATE articles SET processing_state = 'analyzed', grouping_status = 'complete', grouped_at = now() WHERE id = ${articleId}`;
  await sql`INSERT INTO analyses (article_id, input_revision, origin, relevance, title_zh, summary_zh, reason_zh, score, category, selected)
    VALUES (${articleId}, 1, 'rule', 'pass', ${title}, ${excerpt}, 'Por que importa', 80, 'evidence', true)`;
  await publishArticle(articleId);
  ids[name] = articleId;
}

const state = async (id: string) => (await sql<Record<string, unknown>[]>`
  SELECT a.title, a.excerpt, a.body_html, a.body_text, a.revision, a.content_hash, a.processing_state, a.grouping_status, p.selected, p.visibility, p.title AS pub_title, p.summary AS pub_summary, p.area, p.score, c.data AS confianca
  FROM articles a JOIN publications p ON p.article_id = a.id LEFT JOIN literatura_confianca c ON c.article_id = a.id WHERE a.id = ${id}`)[0]!;
const report = async () => (await sql<{ id: number; revision: number; generated_at: Date; content: { headline: string; overview: string | null; themes: Array<{ summary: string | null; storyRefs: Array<{ itemId: string; title: string; summary: string }> }> } }[]>`SELECT id, revision, generated_at, content FROM reports WHERE kind = 'weekly' AND key = ${KEY}`)[0]!;
const entry = async (id: string) => (await report()).content.themes.flatMap((t) => t.storyRefs).find((e) => e.itemId === id)!;
const statusOf = (out: Awaited<ReturnType<typeof run>>, id: string) => out.items.find((i) => i.id === id)!;
const sends = async () => (await sql<{ n: number }[]>`SELECT (SELECT count(*) FROM assinatura_editions WHERE edition_key = ${KEY})::int + (SELECT count(*) FROM assinatura_sends WHERE edition_key = ${KEY})::int AS n`)[0]!.n;

before(async () => {
  await new Promise<void>((resolve) => stubServer.listen(0, "127.0.0.1", () => resolve()));
  const base = `http://127.0.0.1:${(stubServer.address() as { port: number }).port}`;
  config.allowPrivateNetworkFetch = true;
  config.modelCallsEnabled = true;
  delete process.env.MATERIA_MODEL;
  Object.assign(process.env, { PUBMED_BASE_URL: `${base}/eutils`, UNPAYWALL_BASE_URL: `${base}/unpaywall`, EUROPE_PMC_BASE_URL: `${base}/epmc`, CROSSREF_BASE_URL: `${base}/crossref`, LITERATURA_EMAIL: "test@example.com", LLM_BASE_URL: `${base}/v1`, LLM_API_KEY: "test-key", LLM_MODEL: "one-model", REPORT_MODEL: "default" });
  await getBoss();
  installModules([server]);
  for (const id of [MATERIA_SOURCE, INTEGRAL_SOURCE, `rss-${T}`]) {
    await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, site_fulltext, next_fetch_at) VALUES (${id}, ${id}, 'external', 'T1', 'editorial', true, '2100-01-01') ON CONFLICT (id) DO NOTHING`;
  }
  await item("good", MATERIA_SOURCE, { pmid: PMID.good, basis: "abstract" }, "Título velho do estudo bom", "Decanulação em 88,0% de 84 crianças.");
  await item("bad", MATERIA_SOURCE, { pmid: PMID.bad, basis: "abstract" }, "Título velho do estudo ruim", "Sobrevida de 70,8% em 58 lactentes.");
  await item("integral", INTEGRAL_SOURCE, { pmid: PMID.integral, pmcid: "PMC12345678" }, "Título da tradução", "Traqueomalácia em 31% de 120 crianças.");
  await item("third", `rss-${T}`, {}, "Notícia de terceiros", "Uma notícia.");
  await item("noSource", MATERIA_SOURCE, {}, "Matéria sem origem guardada", "Sem artigo.");
  await item("outside", MATERIA_SOURCE, { pmid: PMID.outside, basis: "abstract" }, "Título de fora da edição", "Desfecho de 12% em 40 crianças.");
  await item("publisher", MATERIA_SOURCE, { doi: PUBLISHER_DOI, basis: "abstract", xPost: POST_URL }, "Título velho da editora", "Stent em 75% de 12 lactentes.", `${base}/journal/publisher`);
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, next_fetch_at) VALUES (${`x-${T}`}, 'X', 'x_search', 'T2', 'editorial', '2100-01-01')`;
  await upsertMaterial({ sourceId: `x-${T}`, url: POST_URL, title: "Post", bodyText: "Post", bodyStatus: "ok", via: "fetch", publishedAt: new Date(), xPost: { tweetId: T, authorName: "Testes", handle: "testes", text: "Nova diretriz publicada." } });
  await item("page", MATERIA_SOURCE, { basis: "pagina", xPost: POST_URL }, "Título velho da página oficial", "Cuidadores em 90% das altas.", `${base}/oficial/diretriz`);
  await item("pageGone", MATERIA_SOURCE, { basis: "pagina", xPost: POST_URL }, "Página que saiu do ar", "Sem página.", `${base}/oficial/sumiu`);
  await item("edited", MATERIA_SOURCE, { pmid: PMID.edited, basis: "abstract" }, "Título velho editado", "Estridor em 64% de 25 lactentes.");
  await sql`INSERT INTO editorial_overrides (article_id, fields) VALUES (${ids.edited}, ${sql.json({ summary: EDITED_SUMMARY })})`;
  await publishArticle(ids.edited);
  await sql`INSERT INTO literatura_papers (pmid, doi, status, article_id) VALUES (${PMID.good}, ${`10.5555/${PMID.good}`}, 'materia-antiga', ${ids.good})`;
  const refs = await Promise.all((["good", "bad", "integral", "third", "noSource", "publisher", "page", "pageGone", "edited"] as const).map(async (k) => {
    const s = await state(ids[k]);
    return { itemId: ids[k], title: s.pub_title, summary: s.pub_summary };
  }));
  await sql`INSERT INTO reports (kind, key, window_start, window_end, content, generated_at, model, origin)
    VALUES ('weekly', ${KEY}, now() - interval '7 days', now(), ${sql.json({ kind: "weekly", periodStart: "2025-12-29", periodEnd: "2026-01-04", headline: refs[0]!.title, leadItemId: ids.good, overview: "Decanulação em 88,0% de 84 crianças; sobrevida de 70,8%.", generator: { model: "default", written: true }, storyOrder: refs.map((r) => r.itemId), themes: [{ heading: "Estudos clínicos", summary: "Introdução antiga.", storyRefs: refs }] } as never)}, '2026-01-05T10:00:00Z', 'default', 'model')`;
  // The edition went out already.
  await sql`INSERT INTO assinatura_editions (edition_key, channel, recipients) VALUES (${KEY}, 'email', 0)`;
});

after(async () => {
  rmSync(tmp, { recursive: true, force: true });
  await new Promise<void>((resolve) => stubServer.close(() => resolve()));
  await stopBoss();
  await closeDb();
});

test("the main number is taken from the old lead line, in either notation, when the source has it", () => {
  assert.deepEqual(mainNumbers("Com 3.667 crianças, sucesso de 67% com VATS (IC 95% 60-70).", "Among 3,667 children success was 67%."), ["67", "3.667"]);
  assert.deepEqual(mainNumbers("Fetos de 28,4 semanas, sobrevida de 96,6%", "At 28.4 weeks, survival 96.6%."), ["96,6", "28,4"], "a percentage leads a decimal");
  assert.deepEqual(mainNumbers("Sobrevida de 71% em 2020", "Survival reached 70.8%."), ["71"]);
  assert.deepEqual(mainNumbers("Técnica descrita em 2024", "A technique was described in 2024."), []);
  assert.deepEqual(mainNumbers("Sobrevida de 45%", "Survival rose."), [], "a figure the source does not have is no study's number");
  assert.ok(hasNumber("A sobrevida chegou a 70,8%.", "70.8"));
  assert.ok(!hasNumber("A sobrevida chegou a 58 casos.", "70,8"));
});

test("digits inside a name are no figure; a range's bounds and a dose are", () => {
  for (const [line, source] of [["Bronquiolite pós-COVID-19 em lactentes", "COVID-19 in infants"], ["Crianças com T21", "Children with T21"], ["Níveis de IL-10", "IL-10 levels"], ["Deleção 22q11", "22q11 deletion"]]) {
    assert.deepEqual(mainNumbers(line!, source!), [], line);
  }
  assert.deepEqual(mainNumbers("Sucesso de 60-70% dos casos", "Success in 60-70%."), ["70", "60"], "both bounds of a range stay");
  assert.deepEqual(mainNumbers("Dose de 10mg", "A dose of 10 mg."), ["10"], "a unit after the figure does not make it a name");
  assert.ok(hasNumber("Em 19 crianças com COVID-19.", "19"));
  assert.ok(!hasNumber("Crianças com COVID-19.", "19"));
  const ok = { required: { achado: "Achado" }, text: ["Achado."], achado: "Achado.", numbers: [] };
  assert.equal(refusal({ ...ok, noFigures: "Em crianças com COVID-19 ou T21, não muda a conduta." }), null);
  assert.equal(refusal({ ...ok, achado: "Bronquiolite em lactentes.", numbers: mainNumbers("Bronquiolite pós-COVID-19", "COVID-19") }), null);
});

test("a mention of the abstract or full text is refused, except in a review's methods; an executive summary is no such mention", () => {
  const ok = { required: { achado: "Achado" }, achado: "Achado.", numbers: [] };
  const base = materia("Título com tamanho bastante", "Um achado com tamanho bastante.", "Resultado.");
  const parts = (fields: Record<string, unknown>) => materiaParts({ ...base, ...fields } as never);
  const review = { desenho: "revisao-sistematica" };
  const table: Array<[parts: { text: string[]; methods?: string[]; desenho?: string }, refused: boolean]> = [
    [parts({ ...review, naoInformado: ["Critérios de seleção não descritos no resumo."] }), true],
    [parts({ ...review, limitacaoPrincipal: "Sem acesso à íntegra." }), true],
    [parts({ desenho: "coorte", oQueFizeram: "O texto completo não foi localizado." }), true],
    [parts({ ...review, oQueFizeram: "triagem de resumos e leitura do texto completo por dois revisores" }), false],
    [{ text: ["o resumo executivo da diretriz"] }, false],
  ];
  for (const [fields, refused] of table) {
    const why = refusal({ ...ok, ...fields });
    if (refused) assert.match(why ?? "", /says what was read/, JSON.stringify(fields));
    else assert.equal(why, null, JSON.stringify(fields));
  }
});

test("text that says what was read, leaves a required field empty, misses the number in achado or has figures in naPratica is refused", () => {
  const ok = { required: { achado: "Achado" }, text: ["Em 88% dos casos."], achado: "Em 88% dos casos.", numbers: ["88"] };
  assert.equal(refusal(ok), null);
  assert.match(refusal({ ...ok, required: { achado: " " } })!, /achado empty/);
  for (const said of ["Segundo o resumo, em 88%.", "A partir do texto completo, 88%.", "O artigo na íntegra não foi consultado.", "O artigo completo não estava disponível.", "Neste resumo, 88%.", "Apenas resumo disponível.", "Em seu resumo, os autores dizem 88%."]) {
    assert.match(refusal({ ...ok, text: [said] })!, /says what was read/, said);
  }
  for (const fine of ["Apresentado em um resumo de congresso.", "A equipe integra o serviço."]) assert.equal(refusal({ ...ok, text: [fine] }), null, fine);
  assert.match(refusal({ ...ok, achado: "Em muitos casos." })!, /main number 88 is missing from achado/, "the number in another field does not count");
  assert.equal(refusal({ ...ok, numbers: ["67", "88"] }), null, "any of the numbers given will do");
  assert.equal(refusal({ ...ok, noFigures: "Não muda a conduta." }), null);
  assert.match(refusal({ ...ok, noFigures: "Em 88% dos casos, muda." })!, /naPratica has figures \(88\)/);
});

test("rewriting an edition: plan, generate, apply, a failed item, a re-run, a restore", { timeout: 120_000 }, async () => {
  const all = Object.values(ids);
  const snapshot = async () => Promise.all(all.map(state));
  const initial = await snapshot();
  const reportBefore = await report();
  const sent = await sends();

  // Plan: nothing written, nothing paid, and the preview says what it would cost.
  const planned = await run("plan");
  assert.deepEqual(await snapshot(), initial);
  assert.equal(calls.materia + calls.report, 0, "a plan calls no model");
  assert.equal(planned.modelCalls, 7, "six items and the edition's overview");
  assert.ok(planned.tokens > 0);
  assert.equal(statusOf(planned, ids.good).mainNumber, "88,0");
  assert.equal(statusOf(planned, ids.third).status, "kept");
  assert.equal(statusOf(planned, ids.noSource).type, "sem-fonte");
  assert.equal(statusOf(planned, ids.publisher).status, "would-write");
  assert.equal(statusOf(planned, ids.publisher).mainNumber, "75");
  assert.equal(statusOf(planned, ids.page).type, "pagina");
  assert.equal(statusOf(planned, ids.page).status, "would-write");
  assert.equal(statusOf(planned, ids.pageGone).type, "sem-fonte");
  assert.match(statusOf(planned, ids.pageGone).why!, /official page cannot be read/);
  assert.match(statusOf(planned, ids.edited).why!, /override of summary still shows/);
  const plan = readFileSync(previewPath, "utf8");
  assert.match(plan, /Chamadas de modelo: 7\. Tokens estimados: \d+/);
  assert.match(plan, /Título antigo: Título velho do estudo bom/);

  // Generate: the model writes and the preview shows it; nothing published changes.
  saysRead = true;
  const generated = await run("generate");
  assert.deepEqual(await snapshot(), initial);
  assert.deepEqual((await report()).revision, reportBefore.revision);
  assert.equal(statusOf(generated, ids.good).status, "refused", "text saying what was read never goes further");
  assert.match(statusOf(generated, ids.bad).why!, /oQueFizeram, naPratica empty/);
  saysRead = false;
  badAnswer = "figures";
  const again = await run("generate");
  assert.match(statusOf(again, ids.bad).why!, /naPratica has figures/);
  assert.equal(statusOf(again, ids.good).status, "generated", "a refused answer is not reused: the next run asks again");
  assert.match(readFileSync(previewPath, "utf8"), /A decanulação ocorreu em 88% das crianças\./);
  const paid = calls.materia;

  // Apply: only the edition's own items change, and they stay in it.
  badAnswer = "table";
  const logged: string[] = [];
  const applied = await run("apply", (line) => logged.push(line));
  assert.equal(calls.materia, paid + 1, "what --generate paid for is reused; only the refused item is asked again");
  assert.equal(statusOf(applied, ids.good).status, "written");
  assert.equal(statusOf(applied, ids.integral).status, "written");
  assert.equal(statusOf(applied, ids.bad).status, "refused");
  assert.match(statusOf(applied, ids.bad).why!, /main number 70,8 or 58 is missing from achado/);
  assert.equal(statusOf(applied, ids.noSource).status, "kept");
  assert.equal(statusOf(applied, ids.pageGone).status, "kept");

  const good = await state(ids.good);
  assert.equal(good.title, "Decanulação em crianças é parecida entre as técnicas comparadas");
  assert.equal(good.pub_title, good.title);
  assert.equal(good.excerpt, "A decanulação ocorreu em 88% das crianças.");
  assert.match(good.body_html as string, /<h2>O que encontraram<\/h2>/);
  assert.equal((good.confianca as { estrutura: string }).estrutura, "unica");
  assert.match(good.pub_summary as string, /^A decanulação ocorreu em 88% das crianças\. Muda algo agora\?/);
  const counted = statusOf(applied, ids.good);
  assert.equal(counted.limit, 10);
  assert.ok(counted.newWords! > 10 && counted.newWords! < (good.body_text as string).split(/\s+/).length, "only the model's own fields count, not the reference block");
  assert.match(logged.find((l) => l.includes(ids.good))!, /acima do limite de 10/);
  assert.match(readFileSync(previewPath, "utf8"), /acima do limite de 10/);
  assert.equal(statusOf(applied, ids.integral).limit, null, "a translation's body is the paper's: no limit to flag");
  assert.equal(statusOf(applied, ids.page).status, "written");
  const was = initial[0]!;
  for (const k of ["revision", "processing_state", "grouping_status", "selected", "visibility", "area", "score"]) assert.equal(good[k], was[k], `${k} stands: the item stays judged and in the edition`);

  const translated = await state(ids.integral);
  const wasTranslated = initial[2]!;
  for (const k of ["title", "body_html", "body_text", "excerpt", "revision", "selected"]) assert.equal(translated[k], wasTranslated[k], `${k} of a translation stays`);
  assert.equal((translated.confianca as { feitura: string; estrutura: string }).feitura, "traducao");
  assert.match(translated.pub_summary as string, /^Traqueomalácia em 31% das crianças\./);

  const publisher = await state(ids.publisher);
  assert.equal(statusOf(applied, ids.publisher).status, "written");
  assert.equal(publisher.title, "Stent em lactentes teve sucesso na maior parte dos casos da série");
  assert.match(publisher.body_html as string, /<h2>O que encontraram<\/h2>/);
  assert.equal((publisher.confianca as { estrutura: string }).estrutura, "unica");

  const page = await state(ids.page);
  assert.equal(page.title, fonte.titulo);
  assert.equal(page.excerpt, fonte.achado);
  assert.match(page.body_html as string, /<h2>Fonte<\/h2>/);
  assert.match(page.body_html as string, /@testes/);
  assert.equal((page.confianca as { feitura: string }).feitura, "pagina");
  assert.equal(page.revision, initial[all.indexOf(ids.page)]!.revision);

  const edited = await state(ids.edited);
  assert.equal(statusOf(applied, ids.edited).status, "overridden", "the new text is stored, but cards still show the editor's");
  assert.match(statusOf(applied, ids.edited).why!, /override of summary still shows/);
  assert.equal(edited.excerpt, "O estridor melhorou em 64% dos lactentes.");
  assert.equal(edited.pub_summary, EDITED_SUMMARY);
  assert.deepEqual((await sql`SELECT fields FROM editorial_overrides WHERE article_id = ${ids.edited}`)[0]!.fields, { summary: EDITED_SUMMARY }, "the override is never cleared");

  for (const k of ["bad", "third", "noSource", "outside", "pageGone"] as const) assert.deepEqual(await state(ids[k]), initial[all.indexOf(ids[k])], `${k} is unchanged`);

  // The edition follows, as a correction, without being sent again.
  const r = await report();
  assert.equal(r.revision, reportBefore.revision + 1);
  assert.equal(r.generated_at.getTime(), reportBefore.generated_at.getTime(), "the edition keeps its date");
  assert.equal(r.content.headline, good.title);
  assert.equal((await entry(ids.good)).title, good.title);
  assert.equal((await entry(ids.good)).summary, good.pub_summary);
  assert.equal((await entry(ids.integral)).summary, translated.pub_summary);
  assert.equal((await entry(ids.bad)).title, "Título velho do estudo ruim", "a refused item keeps its entry");
  assert.equal((await entry(ids.third)).title, "Notícia de terceiros");
  assert.equal(r.content.overview, null, "an overview naming what its items do not (999) gives way to the plain one");
  assert.equal(r.content.themes[0]!.summary, null);
  const [revision] = await sql<{ content: { overview: string }; reason: string }[]>`SELECT content, reason FROM report_revisions WHERE report_id = ${r.id}`;
  assert.equal(revision!.content.overview, "Decanulação em 88,0% de 84 crianças; sobrevida de 70,8%.");
  assert.match(revision!.reason, /estrutura única/);
  assert.equal(await sends(), sent, "nothing is planned or sent");

  // The old text is in the audit log.
  const [log] = await sql<{ before: { title: string; bodyHtml: string }; actor: string; reason: string }[]>`SELECT before, actor, reason FROM audit_log WHERE subject = ${`content:${ids.good}`} AND action = 'literatura.reescrever'`;
  assert.equal(log!.before.title, "Título velho do estudo bom");
  assert.match(log!.before.bodyHtml, /velho/);
  assert.equal(log!.actor, ACTOR);

  // A re-run writes only what failed: a done item costs nothing.
  badAnswer = "fixed";
  writerFails = true;
  const beforeRerun = { ...calls };
  const rerun = await run("apply");
  assert.equal(statusOf(rerun, ids.good).status, "done");
  assert.equal(statusOf(rerun, ids.integral).status, "done");
  assert.equal(statusOf(rerun, ids.publisher).status, "done");
  assert.equal(statusOf(rerun, ids.page).status, "done", "a page's record has no estrutura: it is still done, and not paid for again");
  assert.equal(statusOf(rerun, ids.edited).status, "overridden", "still reported on every run");
  assert.equal(statusOf(rerun, ids.bad).status, "written");
  assert.equal(calls.materia, beforeRerun.materia + 1);
  assert.match((rerun.report as { error: string }).error, /./, "a writer that fails leaves the edition for the next run");
  assert.equal((await report()).revision, reportBefore.revision + 1);

  writerFails = false;
  const third = await run("apply");
  assert.equal(third.items.filter((i) => i.status === "written").length, 0);
  assert.equal((third.report as { changed: number }).changed, 1);
  assert.equal((await entry(ids.bad)).title, (await state(ids.bad)).title);
  assert.equal((await report()).revision, reportBefore.revision + 2);

  const beforeIdle = { ...calls };
  const idle = await run("apply");
  assert.deepEqual(calls, beforeIdle, "nothing left to do pays nothing");
  assert.equal((idle.report as { changed: number }).changed, 0);
  assert.equal((await report()).revision, reportBefore.revision + 2);
  assert.deepEqual(await state(ids.outside), initial[all.indexOf(ids.outside)]);
  assert.equal(await sends(), sent);

  // A bad rewrite is put back, and a new one pays for new text.
  await assert.rejects(restoreItems(KEY, [ids.outside], { reason: "errado", actor: ACTOR }), /not in edition/);
  await restoreItems(KEY, [ids.good], { reason: "texto ruim", actor: ACTOR });
  const restored = await state(ids.good);
  assert.equal(restored.title, "Título velho do estudo bom");
  assert.equal(restored.body_html, was.body_html);
  assert.equal(restored.content_hash, was.content_hash);
  assert.equal(restored.confianca, null);
  assert.equal((await sql<{ status: string }[]>`SELECT status FROM literatura_papers WHERE pmid = ${PMID.good}`)[0]!.status, "materia-antiga", "the paper's status goes back with its text");
  assert.equal((await entry(ids.good)).title, "Título velho do estudo bom");
  const paidBefore = calls.materia;
  const fresh = await run("apply");
  assert.equal(statusOf(fresh, ids.good).status, "written");
  assert.equal(calls.materia, paidBefore + 1, "the restored answer is not reused");

  await restoreItems(KEY, [ids.page], { reason: "texto ruim", actor: ACTOR });
  assert.equal((await state(ids.page)).title, "Título velho da página oficial");
  assert.equal(statusOf(await run("plan"), ids.page).status, "would-write", "a restored page can be rewritten again");
  await run("apply");
});

test("an item is told only of the versions before it, and a short PMC text gives a link but is not written from", { timeout: 60_000 }, async () => {
  const key = "2026-W02";
  await item("earlierVersion", MATERIA_SOURCE, {}, "Versão anterior do estudo", "Antes.");
  await item("versioned", MATERIA_SOURCE, { pmid: PMID.versioned, basis: "abstract" }, "Título velho da versão", "Agora.");
  await item("laterVersion", MATERIA_SOURCE, {}, "Versão posterior do estudo", "Depois.");
  await item("short", MATERIA_SOURCE, { pmid: PMID.short, basis: "abstract" }, "Título velho do texto curto", "Curto.");
  await item("shortIntegral", INTEGRAL_SOURCE, { pmid: PMID.short }, "Tradução sem texto completo", "Curto.");
  for (const [name, daysAgo] of [["earlierVersion", 10], ["versioned", 5], ["laterVersion", 1]] as const) {
    await sql`UPDATE publications SET timeline_at = now() - make_interval(days => ${daysAgo}) WHERE article_id = ${ids[name]}`;
  }
  const study = [`doi:10.5555/${PMID.versioned}`];
  await sql`INSERT INTO literatura_estudos (article_id, ids, estado) VALUES (${ids.earlierVersion}, ${study}, 'preprint'), (${ids.laterVersion}, ${study}, 'artigo-revisado')`;
  const storyRefs = (["versioned", "short", "shortIntegral"] as const).map((k) => ({ itemId: ids[k], title: k, summary: k }));
  await sql`INSERT INTO reports (kind, key, window_start, window_end, content, generated_at, model, origin)
    VALUES ('weekly', ${key}, now() - interval '7 days', now(), ${sql.json({ kind: "weekly", periodStart: "2026-01-05", periodEnd: "2026-01-11", headline: "Edição", themes: [{ heading: "Estudos", summary: null, storyRefs }] } as never)}, now(), 'default', 'model')`;
  writerInputs.length = 0;
  const out = await rewriteEdition(key, { mode: "generate", reason: REASON, actor: ACTOR, previewPath });

  const versioned = writerInputs.find((u) => u.includes("Versioned paper"))!;
  assert.match(versioned, /Versão anterior do estudo/);
  assert.doesNotMatch(versioned, /Versão posterior do estudo/, "what came after the item is not given as earlier");

  const short = writerInputs.find((u) => u.includes("Short paper"))!;
  assert.doesNotMatch(short, /Texto disponível: texto completo/);
  const shortResult = statusOf(out, ids.short);
  assert.equal(shortResult.status, "generated", shortResult.why ?? "");
  assert.match(shortResult.newText!, /Texto completo gratuito:.*europepmc\.org/);
  assert.doesNotMatch(shortResult.newText!, /pago na editora/);
  assert.equal(statusOf(out, ids.shortIntegral).type, "sem-fonte", "a translation needs the full text itself");
  assert.match(statusOf(out, ids.shortIntegral).why!, /cannot be read again/);
});

test("the script needs a reason to write, and without --apply writes only the preview", { timeout: 90_000 }, async () => {
  const exec = promisify(execFile);
  const script = (args: string[]) => exec(process.execPath, ["scripts/edicao-reescrever.ts", ...args], { cwd: REPO_ROOT, env: { ...process.env, ALLOW_PRIVATE_NETWORK_FETCH: "true" }, timeout: 80_000 });
  await assert.rejects(script([KEY, "--apply"]), /--apply and --restore need --reason/);
  await assert.rejects(exec(process.execPath, ["scripts/edicao-reescrever.ts", KEY, "--apply", `--reason=${REASON}`, `--preview=${path.join(tmp, "apply.md")}`], { cwd: REPO_ROOT, env: { ...process.env, ALLOW_PRIVATE_NETWORK_FETCH: "true", MODEL_CALLS_ENABLED: "true" }, timeout: 80_000 }), (error: { code: number; stdout: string }) => {
    assert.equal(error.code, 1, "an own item left in the old form fails the run");
    for (const id of [ids.noSource, ids.pageGone]) assert.match(error.stdout, new RegExp(`LEFT UNCHANGED  ${id}  sem-fonte  .+`));
    assert.match(error.stdout, new RegExp(`LEFT UNCHANGED  ${ids.third}  terceiros  .+`), "a third party's item is listed too");
    assert.match(error.stdout, new RegExp(`STILL OVERRIDDEN  ${ids.edited}  materia  .+`));
    return true;
  });
  const before = await report();
  const file = path.join(tmp, "script.md");
  const { stdout } = await script([KEY, `--preview=${file}`]);
  assert.match(stdout, /dry run: nothing published changed/);
  assert.match(stdout, /model calls: \d+; estimated tokens: \d+/);
  assert.match(readFileSync(file, "utf8"), /Edição 2026-W01/);
  assert.equal((await report()).revision, before.revision);
});
