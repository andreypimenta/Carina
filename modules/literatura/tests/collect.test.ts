// The literature run against local stand-ins for PubMed, Unpaywall, Europe PMC and the model. Failure cases:
// a paper whose licence allows it is not republished in full, or one whose licence does not is republished;
// the site's article is written from the abstract when a readable full text exists (in PMC or at the free copy
// Unpaywall points to), or from a publisher's page that holds no more than the abstract; a paper is written twice
// (paying twice) on the next run; an erratum becomes an article; the article lands outside today; a paper found
// days after entering PubMed is archived as history and never reaches an edition; a paper is written up before
// Unpaywall knows its DOI.
import { tag } from "../../../tests/setup.ts";
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { config } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { installModules } from "@aihot/backend/modules";
import server from "../server.ts";
import { removeNotasDeOrigem } from "../backend/confianca.ts";
import { collectLiterature, INTEGRAL_SOURCE, MATERIA_SOURCE, MAX_ATTEMPTS, recordFailure, takePaper } from "../backend/collect.ts";
import { parsePubmedXml } from "../backend/pubmed.ts";
import { exportMarkdown, itemParts, loadItemDetail } from "@aihot/backend/publication/detail";
import { itemFeed } from "@aihot/backend/publication/feeds";
import { overrideFields } from "@aihot/backend/admin/content";
import { publishArticle } from "@aihot/backend/publication/publish";
import { addCorrection, listCorrections } from "../backend/correcoes.ts";
import { EXPEDIENTE } from "@aihot/site";
import { achadoVisivel, linhaTransparencia, type MateriaPart } from "../confianca.ts";
import { REGISTRO_TAG, syncRegistros } from "../backend/estudos.ts";
import { ALERTA_SOURCE, alertasSettings, collectAlertas } from "../backend/alertas.ts";
import { ELSO_SOURCE, readElso } from "../backend/elso.ts";
import { upsertMaterial } from "@aihot/backend/content/materials";


const T = tag();
const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const long = (xml: string) => xml.replace("<sec id=\"s1\"><title>Background</title>", `<sec id="s1"><title>Background</title><p>${"Children with persistent wheeze were assessed in clinic. ".repeat(40)}</p>`);
const ndJats = long(fixture("jats.xml")).replace("http://creativecommons.org/licenses/by/4.0/", "http://creativecommons.org/licenses/by-nc-nd/4.0/");

const modelInputs: string[] = [];
const hits: string[] = [];
const lido = async (id: string) => (await sql<{ lido: string }[]>`SELECT data->>'textoLido' AS lido FROM literatura_confianca WHERE article_id = ${id}`)[0]!.lido;
const materia = {
  titulo: "Broncoscopia em sibilância persistente achou traqueomalácia em 31%", perguntaClinica: "Qual o resultado nesta população?", oQueFizeram: "Coorte.", resultados: [{ desfecho: "Desfecho principal", resultado: "Traqueomalácia em 31%.", efeito: "" }], sinaisDeAlerta: [{ sinal: "centro-unico", detalhe: "Centro único." }], aFavor: [], naoInformado: [], naPratica: "Sibilância que não melhora merece avaliação.", contexto: "",
  achado: "Traqueomalácia apareceu em 31% das crianças com sibilância persistente.", mudaAlgo: "alinhado-a-diretriz", diretriz: "Diretriz ERS de sibilância 2024",
  conflitos: "Os autores declaram não ter conflitos.", populacaoIdade: "1 a 5 anos", populacaoDoenca: "Sibilância persistente", populacaoCenario: "Ambulatório de um centro terciário", desenho: "coorte", desenhoDetalhe: "coorte retrospectiva", limitacaoPrincipal: "Centro único.",
  // Text read is never taken from the model.
  textoLido: "texto-completo",
};

let elsoPage = `<div class="rounded-border"><p><a class="txt-blue" href="/a.pdf">ELSO Guidelines for Neonatal Respiratory Failure</a></p><p>Last updated: October 2020</p></div>
<div class="rounded-border"><p><a class="txt-blue" href="/b.pdf">Adult Respiratory Failure</a></p></div>`;

const stubServer = http.createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (c: Buffer) => chunks.push(c));
  req.on("end", () => {
    const url = req.url ?? "/";
    hits.push(url.split("?")[0]!);
    const send = (status: number, type: string, body: string) => { res.writeHead(status, { "content-type": type }); res.end(body); };
    // The free copy Unpaywall points to, served here: the article, a page with only the abstract, a bot challenge.
    const copyAt = (page: string) => fixture("unpaywall-oa.json").replace(/https:\/\/bmcpulmmed\.biomedcentral\.com\/articles\/[^"]+/g, `http://${req.headers.host}/publisher/${page}`);
    if (url.startsWith("/unpaywall/10.5555%2Fdown")) return send(503, "text/plain", "busy");
    if (url.startsWith("/unpaywall/10.5555%2Faccepted")) return send(200, "application/json", JSON.stringify({ is_oa: true, best_oa_location: { url_for_landing_page: `http://${req.headers.host}/publisher/open`, host_type: "repository", version: "acceptedVersion" } }));
    if (url.startsWith("/unpaywall/10.5555%2Fnew")) return send(404, "application/json", JSON.stringify({ error: true, message: "not in our database" }));
    const copy = /^\/unpaywall\/10\.5555%2F(open|stub|blocked)\b/.exec(url)?.[1];
    if (copy) return send(200, "application/json", copyAt(copy));
    if (url === "/publisher/open") return send(200, "text/html; charset=utf-8", fixture("publisher-article.html"));
    if (url === "/publisher/stub") return send(200, "text/html; charset=utf-8", fixture("publisher-abstract-only.html"));
    if (url === "/publisher/blocked") return send(403, "text/html", "<html><head><title>Just a moment...</title></head><body>Checking your browser</body></html>");
    if (url.startsWith("/eutils/esearch.fcgi")) return send(200, "application/json", JSON.stringify({ esearchresult: { idlist: ["41000001", "41000002", "41000003"] } }));
    if (url.startsWith("/eutils/efetch.fcgi")) return send(200, "text/xml", fixture("pubmed.xml"));
    if (url.startsWith("/unpaywall/10.1186")) return send(200, "application/json", fixture("unpaywall-oa.json"));
    if (url.startsWith("/unpaywall/")) return send(200, "application/json", fixture("unpaywall-closed.json"));
    if (url.startsWith("/epmc/search")) return send(200, "application/json", JSON.stringify({ resultList: { result: [] } }));
    if (url === "/epmc/PMC12345678/fullTextXML") return send(200, "text/xml", long(fixture("jats.xml")));
    if (url === "/epmc/PMC99/fullTextXML") return send(200, "text/xml", ndJats);
    if (url.startsWith("/epmc/")) return send(404, "text/plain", "not found");
    // Crossref knows the article of the version-linking test as the published version of its preprint.
    const crossref = /^\/crossref\/works\/(.+?)(?:\?|$)/.exec(url)?.[1];
    if (crossref) {
      const doi = decodeURIComponent(crossref);
      return doi.startsWith("10.9999/publicado-") ? send(200, "application/json", JSON.stringify({ message: { relation: { "has-preprint": [{ "id-type": "doi", id: `https://doi.org/10.1101/2026.09.01.${doi.slice(18)}` }] } } })) : send(404, "text/plain", "Resource not found.");
    }
    if (url.startsWith("/ctgov/studies")) {
      const ids = new URL(url, "http://x").searchParams.get("filter.ids")!.split(",");
      return send(200, "application/json", JSON.stringify({ studies: ids.map((id) => ({ protocolSection: { identificationModule: { nctId: id }, statusModule: { overallStatus: "RECRUITING" } }, hasResults: false })) }));
    }
    if (url.startsWith("/openfda/device/recall.json")) return send(200, "application/json", JSON.stringify({ results: [
      { product_res_number: `Z-1-${T}`, cfres_id: "1", res_event_number: `E1-${T}`, recalling_firm: "Medline", product_description: "DBD-CIRCUIT, VENT, INSPIRATORY, HEATED, NEO", reason_for_recall: "Leak", event_date_posted: "2026-10-20", product_code: "BTT" },
      { product_res_number: `Z-3-${T}`, cfres_id: "3", res_event_number: `E1-${T}`, recalling_firm: "Medline", product_description: "DBD-CIRCUIT, VENT, HEATED, PED", reason_for_recall: "Leak", event_date_posted: "2026-10-20", product_code: "BTT" },
      { product_res_number: `Z-2-${T}`, cfres_id: "2", res_event_number: `E2-${T}`, recalling_firm: "Dental Co", product_description: "Composite resin", reason_for_recall: "Color", event_date_posted: "2026-10-21", product_code: "EBF" },
    ] }));
    if (url.startsWith("/openfda/")) return send(404, "application/json", JSON.stringify({ error: { code: "NOT_FOUND" } }));
    if (url.startsWith("/anvisa/pt-br/@search")) return send(200, "application/json", JSON.stringify({ items: [{ "@id": `https://www.gov.br/anvisa/pt-br/assuntos/noticias-anvisa/2026/canulas-${T}`, title: "Anvisa suspende dispositivos", effective: "2026-10-22T15:00:00+00:00" }] }));
    if (url.startsWith("/anvisa/pt-br/assuntos/")) return send(200, "application/json", JSON.stringify({ title: "Anvisa suspende dispositivos", description: "Cânulas de uso adulto", blocks: { a: { plaintext: "Cânula de traqueostomia adulto, lotes 1 a 3." } }, blocks_layout: { items: ["a"] } }));
    if (url === "/elso/guidelines") return send(200, "text/html", elsoPage);
    if (url.startsWith("/v1/chat/completions")) {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { messages: Array<{ role: string; content: string }> };
      const user = body.messages.find((m) => m.role === "user")!.content;
      modelInputs.push(user);
      if (user.startsWith("Órgão:")) {
        const alerta = /NEO/.test(user) ? { relevante: true, categoria: "recolhimento", titulo: "FDA recolhe circuito respiratório neonatal da Medline", linhaFina: "Vazamento.", corpo: "A Medline recolheu o circuito." } : { relevante: false };
        return send(200, "application/json", JSON.stringify({ id: `stub-${modelInputs.length}`, choices: [{ message: { content: JSON.stringify(alerta) } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }));
      }
      return send(200, "application/json", JSON.stringify({ id: `stub-${modelInputs.length}`, choices: [{ message: { content: JSON.stringify(materia) } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }));
    }
    send(500, "text/plain", "unexpected");
  });
});

before(async () => {
  await new Promise<void>((resolve) => stubServer.listen(0, "127.0.0.1", () => resolve()));
  const base = `http://127.0.0.1:${(stubServer.address() as { port: number }).port}`;
  config.allowPrivateNetworkFetch = true;
  config.modelCallsEnabled = true;
  delete process.env.MATERIA_MODEL;
  Object.assign(process.env, {
    PUBMED_BASE_URL: `${base}/eutils`, UNPAYWALL_BASE_URL: `${base}/unpaywall`, EUROPE_PMC_BASE_URL: `${base}/epmc`, LITERATURA_EMAIL: "test@example.com",
    LLM_BASE_URL: `${base}/v1`, LLM_API_KEY: "test-key", LLM_MODEL: "one-model",
    CROSSREF_BASE_URL: `${base}/crossref`, CTGOV_BASE_URL: `${base}/ctgov`, OPENFDA_BASE_URL: `${base}/openfda`, ANVISA_BASE_URL: `${base}/anvisa`,
  });
  installModules([server]);
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, site_fulltext, next_fetch_at, tags)
    VALUES ('ctgov-test', 'ClinicalTrials.gov', 'rss', 'T1', 'editorial', false, '2100-01-01', ${[REGISTRO_TAG]}) ON CONFLICT (id) DO NOTHING`;
  for (const id of [MATERIA_SOURCE, INTEGRAL_SOURCE, ALERTA_SOURCE, ELSO_SOURCE]) {
    await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, site_fulltext, next_fetch_at)
      VALUES (${id}, ${id}, 'external', 'T1', 'editorial', true, '2100-01-01') ON CONFLICT (id) DO NOTHING`;
  }
  await sql`DELETE FROM literatura_papers WHERE pmid IN ('41000001', '41000002', '41000003', '41000004', '41000005', '41000006', '41000007', '41000008', '41000009', '41000010', '41000011', '41000012', '41000013', '41000014', '41000015')`;
});

after(async () => {
  await new Promise<void>((resolve) => stubServer.close(() => resolve()));
  await stopBoss();
  await closeDb();
});

test("a run republishes the open-licence paper, writes the closed one from its abstract and skips the erratum; the next run takes none again", async () => {
  const first = await collectLiterature();
  assert.equal(first.found, 3);
  assert.equal(first.integral, 1);
  assert.equal(first["materia-abstract"], 1);
  assert.equal(first.erratum, 1);
  assert.equal(modelInputs.length, 2, "the closed paper is written by the model, the open one read for its trust record");
  assert.ok(modelInputs.some((m) => /Texto disponível: somente o resumo/.test(m)));
  assert.ok(modelInputs.some((m) => /Texto disponível: texto completo\n/.test(m) && /Children with persistent wheeze were assessed/.test(m)), "the translation's record is read from its full text");

  const papers = await sql<{ pmid: string; status: string; source_id: string | null; title: string | null; body_html: string | null; language: string | null; url: string | null; published_at: Date | null;
    backfill: boolean | null; backfill_reason: string | null; timeline_at: Date | null; discovered_at: Date | null }[]>`
    SELECT p.pmid, p.status, a.source_id, a.title, a.body_html, a.language, a.url, a.published_at, a.backfill, a.backfill_reason, a.timeline_at, a.discovered_at
    FROM literatura_papers p LEFT JOIN articles a ON a.id = p.article_id
    WHERE p.pmid IN ('41000001', '41000002', '41000003') ORDER BY p.pmid`;
  const [closed, open, erratum] = papers;
  assert.equal(closed!.source_id, MATERIA_SOURCE);
  assert.equal(closed!.title, materia.titulo);
  assert.equal(closed!.language, "pt");
  assert.equal(closed!.url, "https://doi.org/10.1016/j.jpedsurg.2026.161999");
  assert.match(closed!.body_html!, /<h2>Na prática<\/h2>/);
  assert.match(closed!.body_html!, /o artigo completo é pago na editora/);
  assert.equal(closed!.published_at!.toISOString(), "2026-10-19T03:00:00.000Z");
  for (const paper of [closed!, open!]) {
    assert.ok(paper.discovered_at!.getTime() - paper.published_at!.getTime() > 48 * 3600_000, "the fixture's paper entered PubMed more than 48 hours ago");
    assert.equal(paper.backfill, false, "a paper days old is still news for the week's edition");
    assert.equal(paper.backfill_reason, null);
    assert.equal(paper.timeline_at!.getTime(), paper.discovered_at!.getTime(), "it counts in the edition of the day it was found");
  }

  assert.equal(open!.source_id, INTEGRAL_SOURCE);
  assert.equal(open!.language, "en");
  assert.match(open!.body_html!, /Tradução do artigo de Lee J, publicado em BMC pulmonary medicine \(2026\) sob a licença <a href="http:\/\/creativecommons.org\/licenses\/by\/4.0\/">CC BY<\/a>/);
  assert.match(open!.body_html!, /Tracheomalacia was the most frequent finding/);
  assert.match(open!.body_html!, /Texto completo gratuito/);
  assert.doesNotMatch(open!.body_html!, /thank the families/);
  assert.doesNotMatch(open!.body_html!, /Matéria escrita pelo Fôlego/, "a republished text is not the site's article");
  const [openRow] = await sql<{ article_id: string }[]>`SELECT article_id FROM literatura_papers WHERE pmid = '41000002'`;
  const translated = ((await itemParts([openRow!.article_id])).get(openRow!.article_id)!.literatura as MateriaPart).confianca!;
  assert.equal(translated.feitura, "traducao");
  assert.equal(await lido(openRow!.article_id), "texto-completo");
  assert.deepEqual(translated.minuto, { achado: materia.achado, paraQuem: null, mudaAlgo: "alinhado-a-diretriz", diretriz: "Diretriz ERS de sibilância 2024" });
  assert.deepEqual(translated.populacao, { idade: "1 a 5 anos", doenca: "Sibilância persistente", cenario: "Ambulatório de um centro terciário" });
  assert.equal(translated.desenho, "coorte");
  assert.equal(translated.limitacao, "Centro único.");

  assert.equal(erratum!.status, "erratum");
  assert.equal(erratum!.source_id, null);

  const before = { model: modelInputs.length, efetch: hits.filter((h) => h.endsWith("efetch.fcgi")).length };
  const second = await collectLiterature();
  assert.equal(second.new, 0);
  assert.equal(modelInputs.length, before.model, "no paper is written twice");
  assert.equal(hits.filter((h) => h.endsWith("efetch.fcgi")).length, before.efetch, "nothing left to fetch");
});

test("a full text whose licence forbids translation is read to write the site's article, not republished", async () => {
  const [, paper] = parsePubmedXml(fixture("pubmed.xml"));
  const out = await takePaper({ ...paper!, pmid: "41000004", doi: `10.9999/${T}`, pmcid: "PMC99" });
  assert.equal(out.status, "materia-full");
  assert.match(modelInputs.at(-1)!, /Texto disponível: texto completo/);
  assert.match(modelInputs.at(-1)!, /Children with persistent wheeze were assessed/);
  const [row] = await sql<{ source_id: string; body_html: string }[]>`SELECT source_id, body_html FROM articles WHERE id = ${out.articleId!}`;
  assert.equal(row!.source_id, MATERIA_SOURCE);
  assert.doesNotMatch(row!.body_html, /Matéria escrita/, "what was read is never said");
  assert.doesNotMatch(row!.body_html, /Children with persistent wheeze were assessed/);
});

test("a service that fails is tried again on later runs, never written up from less; a paper that keeps failing is given up", async () => {
  const [paper] = parsePubmedXml(fixture("pubmed.xml"));
  const down = { ...paper!, pmid: "41000005", doi: "10.5555/down" };
  const calls = modelInputs.length;
  await assert.rejects(() => takePaper(down), /Unpaywall HTTP 503/);
  assert.equal(modelInputs.length, calls, "no article is written from the abstract because a service was down");
  // The run records each failure; the last allowed one gives the paper up.
  const statuses: string[] = [];
  for (let i = 0; i < MAX_ATTEMPTS; i++) statuses.push((await recordFailure("41000005")).status);
  assert.deepEqual(statuses, [...Array(MAX_ATTEMPTS - 1).fill("erro"), "falhou"]);
  const [row] = await sql<{ attempts: number; status: string }[]>`SELECT attempts, status FROM literatura_papers WHERE pmid = '41000005'`;
  assert.equal(row!.status, "falhou");
  assert.equal(row!.attempts, MAX_ATTEMPTS);
});

test("an open paper under a republishable licence waits for PMC for a while, then is written up from the publisher's free copy, not republished", async () => {
  const [paper] = parsePubmedXml(fixture("pubmed.xml"));
  const fresh = { ...paper!, pmid: "41000006", doi: "10.5555/open", pmcid: null };
  const entered = new Date("2026-10-19T03:00:00Z");
  assert.equal((await takePaper(fresh, new Date(entered.getTime() + 12 * 3600_000))).status, "aguardando-pmc");
  const later = await takePaper(fresh, new Date(entered.getTime() + 40 * 3600_000));
  assert.equal(later.status, "materia-full");
  const input = modelInputs.at(-1)!;
  assert.match(input, /Texto disponível: texto completo/);
  assert.match(input, /Single-stage patients left hospital a median of four days earlier/);
  assert.doesNotMatch(input, /Monnier P|thank the families/, "the reference list and what follows it are not the article");
  assert.doesNotMatch(input, /Journal home/);
  const [row] = await sql<{ source_id: string; body_html: string; raw: { basis: string; fullTextFrom: string } }[]>`SELECT source_id, body_html, raw FROM articles WHERE id = ${later.articleId!}`;
  assert.equal(row!.source_id, MATERIA_SOURCE);
  assert.equal(row!.raw.basis, "full");
  assert.equal(row!.raw.fullTextFrom, "copy");
  assert.doesNotMatch(row!.body_html, /Matéria escrita/, "what was read is never said");
  assert.match(row!.body_html, /Texto completo gratuito:<\/strong> <a href="http:\/\/127\.0\.0\.1:\d+\/publisher\/open"/);
  assert.doesNotMatch(row!.body_html, /four days earlier/, "the copy is read, not republished");
});

test("a free copy that shows only the abstract or refuses the site's crawler leaves the article written from the abstract", async () => {
  const [paper] = parsePubmedXml(fixture("pubmed.xml"));
  const old = new Date("2026-10-30T03:00:00Z");
  for (const [pmid, doi] of [["41000007", "10.5555/stub"], ["41000008", "10.5555/blocked"]] as const) {
    const out = await takePaper({ ...paper!, pmid, doi, pmcid: null }, old);
    assert.equal(out.status, "materia-abstract", doi);
    assert.ok(hits.includes(`/publisher/${doi.split("/")[1]}`), "the copy was asked for");
    const [row] = await sql<{ body_html: string; raw: { basis: string; fullTextFrom?: string } }[]>`SELECT body_html, raw FROM articles WHERE id = ${out.articleId!}`;
    assert.equal(row!.raw.basis, "abstract");
    assert.equal(row!.raw.fullTextFrom, undefined);
  }
});

test("a DOI Unpaywall does not know yet is asked about again on later runs for a few days, then the paper is written up", async () => {
  const [paper] = parsePubmedXml(fixture("pubmed.xml"));
  const fresh = { ...paper!, pmid: "41000009", doi: "10.5555/new", pmcid: null };
  const entered = new Date("2026-10-19T03:00:00Z");
  const calls = modelInputs.length;
  assert.equal((await takePaper(fresh, new Date(entered.getTime() + 30 * 3600_000))).status, "aguardando-unpaywall");
  assert.equal(modelInputs.length, calls, "nothing is written while waiting");
  const [row] = await sql`SELECT 1 FROM literatura_papers WHERE pmid = '41000009'`;
  assert.equal(row, undefined, "a waiting paper is not recorded, so the next run takes it again");
  const later = await takePaper(fresh, new Date(entered.getTime() + 4 * 86_400_000));
  assert.equal(later.status, "materia-abstract");
  // Without a contact address Unpaywall is never asked, so there is nothing to wait for.
  const email = process.env.LITERATURA_EMAIL;
  delete process.env.LITERATURA_EMAIL;
  try {
    const out = await takePaper({ ...fresh, pmid: "41000010", doi: `10.5555/new-${T}` }, new Date(entered.getTime() + 30 * 3600_000));
    assert.equal(out.status, "materia-abstract");
  } finally {
    process.env.LITERATURA_EMAIL = email;
  }
});

test("each new matéria stores why it can be trusted, with the text the pipeline read; its page and the e-mail read it with its corrections (itemParts)", async () => {
  const [paper] = parsePubmedXml(fixture("pubmed.xml"));
  const out = await takePaper({ ...paper!, pmid: "41000011", doi: `10.9999/abs-${T}`, pmcid: null }, new Date("2026-10-30T03:00:00Z"));
  assert.equal(out.status, "materia-abstract");
  const parts = (await itemParts([out.articleId!, "nao-existe"]));
  assert.deepEqual([...parts.keys()], [out.articleId]);
  const part = parts.get(out.articleId!)!.literatura as MateriaPart;
  assert.equal(await lido(out.articleId!), "resumo", "the abstract was read, whatever the model says");
  assert.doesNotMatch(JSON.stringify(part), /textoLido|"resumo"|texto-completo/, "the part reaches the browser: what was read stays in the record");
  assert.equal(part.confianca!.feitura, "materia");
  assert.deepEqual(part.confianca!.minuto, { achado: materia.achado, paraQuem: null, mudaAlgo: "alinhado-a-diretriz", diretriz: "Diretriz ERS de sibilância 2024" });
  assert.deepEqual(part.confianca!.populacao, { idade: "1 a 5 anos", doenca: "Sibilância persistente", cenario: "Ambulatório de um centro terciário" });
  assert.deepEqual(part.correcoes, []);

  await assert.rejects(() => addCorrection({ item: out.articleId, oQueMudou: "x", porque: "y" }, "editor"), /o que mudou e por quê/);
  await assert.rejects(() => addCorrection({ item: "https://site/items/naoexiste1234567890", oQueMudou: "Número", porque: "Erro" }, "editor"), /não existe/);
  await assert.rejects(() => addCorrection({ item: out.articleId, data: "2999-01-01", oQueMudou: "Número", porque: "Erro" }, "editor"), /futuro/);
  const added = await addCorrection({ item: `https://site.example/items/${out.articleId}`, data: "2026-10-30", oQueMudou: "A coorte tinha 120 crianças, não 210.", porque: "Erro de transcrição do resumo." }, "editor");
  const fixed = (await itemParts([out.articleId!])).get(out.articleId!)!.literatura as MateriaPart;
  assert.deepEqual(fixed.correcoes, [{ id: added.id, data: "2026-10-30", oQueMudou: "A coorte tinha 120 crianças, não 210.", porque: "Erro de transcrição do resumo." }]);
  assert.equal((await listCorrections()).find((c) => c.id === added.id)?.actor, "editor");
  const [audited] = await sql`SELECT 1 FROM audit_log WHERE action = 'literatura.correcao' AND subject = ${`content:${out.articleId}`}`;
  assert.ok(audited, "the correction is audited");

  const full = await takePaper({ ...paper!, pmid: "41000012", doi: `10.9999/pmc-${T}`, pmcid: "PMC99" });
  assert.equal(await lido(full.articleId!), "texto-completo");
  const pmcRead = await takePaper({ ...paper!, pmid: "41000013", doi: `10.5555/accepted-pmc-${T}`, pmcid: "PMC99" });
  assert.equal(pmcRead.status, "materia-full");
  assert.equal(await lido(pmcRead.articleId!), "texto-completo",
    "PMC's text is not the accepted manuscript Unpaywall's open copy is");
  const copyRead = await takePaper({ ...paper!, pmid: "41000014", doi: `10.5555/accepted-copy-${T}`, pmcid: null }, new Date("2026-10-30T03:00:00Z"));
  assert.equal(copyRead.status, "materia-full");
  assert.equal(await lido(copyRead.articleId!), "manuscrito-aceito");
});

test("a translation keeps its trust record when the model answers only the trust fields, without a matéria's title or sections", async () => {
  const [, paper] = parsePubmedXml(fixture("pubmed.xml"));
  const saved = { titulo: materia.titulo, resultados: materia.resultados };
  Object.assign(materia, { titulo: "", resultados: null });
  try {
    const calls = modelInputs.length;
    // Its own title, so the prompt differs from the first run's translation of this paper and the receipt is not reused.
    const out = await takePaper({ ...paper!, title: `${paper!.title} (${T})`, pmid: `trust-${T}`, doi: `10.9999/trust-${T}`, pmcid: "PMC12345678" });
    assert.equal(out.status, "integral");
    assert.equal(modelInputs.length, calls + 1);
    const c = ((await itemParts([out.articleId!])).get(out.articleId!)!.literatura as MateriaPart).confianca!;
    assert.equal(c.feitura, "traducao");
    assert.equal(await lido(out.articleId!), "texto-completo");
    assert.equal(c.desenho, "coorte");
    assert.equal(c.limitacao, "Centro único.");
    assert.equal(c.minuto!.achado, materia.achado);
    const [receipt] = await sql<{ status: string }[]>`SELECT status FROM receipts WHERE subject = ${`pubmed:trust-${T}:full`}`;
    assert.equal(receipt!.status, "completed");
  } finally {
    Object.assign(materia, saved);
  }
});

test("design and main limitation are always on a matéria: an unknown design is 'outro', a missing limitation says so; a translation waits for the model like a matéria", async () => {
  const [, paper] = parsePubmedXml(fixture("pubmed.xml"));
  const saved = { desenho: materia.desenho, limitacaoPrincipal: materia.limitacaoPrincipal };
  Object.assign(materia, { desenho: "estudo-pragmatico", limitacaoPrincipal: "" });
  try {
    const out = await takePaper({ ...paper!, pmid: "41000015", doi: `10.9999/sem-limite-${T}`, pmcid: null }, new Date("2026-10-30T03:00:00Z"));
    const c = ((await itemParts([out.articleId!])).get(out.articleId!)!.literatura as MateriaPart).confianca!;
    assert.equal(c.desenho, "outro");
    assert.equal(c.limitacao, "não informada");
  } finally {
    Object.assign(materia, saved);
  }

  config.modelCallsEnabled = false;
  try {
    const calls = modelInputs.length;
    const waiting = await takePaper({ ...paper!, pmid: `wait-${T}`, doi: `10.9999/wait-${T}`, pmcid: "PMC12345678" });
    assert.equal(waiting.status, "aguardando-modelo");
    assert.equal(modelInputs.length, calls);
    assert.equal((await sql`SELECT 1 FROM literatura_papers WHERE pmid = ${`wait-${T}`}`).length, 0, "nothing recorded, so a later run takes it");
  } finally {
    config.modelCallsEnabled = true;
  }
});

test("a preprint is labelled in its public title, whatever wrote the title, and in its body; it never changes practice", async () => {
  const [paper] = parsePubmedXml(fixture("pubmed.xml"));
  const out = await takePaper({ ...paper!, pmid: null, doi: `10.1101/2026.10.01.${Date.now()}`, pmcid: null, url: undefined }, new Date("2026-10-30T03:00:00Z"));
  assert.equal(out.status, "materia-abstract");
  assert.match(modelInputs.at(-1)!, /Preprint: sim/);
  const [row] = await sql<{ body_html: string }[]>`SELECT body_html FROM articles WHERE id = ${out.articleId!}`;
  assert.match(row!.body_html, /^<p><strong>Preprint – não revisado por pares\.<\/strong>/);
  const part = (await itemParts([out.articleId!])).get(out.articleId!)!.literatura as MateriaPart;
  assert.equal(part.confianca!.preprint, true);
  assert.equal(part.confianca!.minuto!.mudaAlgo, "nao");
  await publishArticle(out.articleId!);
  const [pub] = await sql<{ title: string }[]>`SELECT title FROM publications WHERE article_id = ${out.articleId!}`;
  assert.equal(pub!.title, `Preprint – não revisado por pares: ${materia.titulo}`);
  await publishArticle(out.articleId!);
  const [again] = await sql<{ title: string }[]>`SELECT title FROM publications WHERE article_id = ${out.articleId!}`;
  assert.equal(again!.title, pub!.title, "labelled once");
});

test("the published article of a covered preprint is written as its next version, and each version's page lists the other", async () => {
  const [fixed] = parsePubmedXml(fixture("pubmed.xml"));
  // A title of its own: the fixture's is shared by the other tests' papers of the same first author.
  const paper = { ...fixed!, title: `Airway stents in neonates with tracheomalacia ${T}`, pmcid: null, trialIds: [], versionPmids: [] };
  const day = new Date("2026-10-30T03:00:00Z");
  const n = String(Date.now());
  const pre = await takePaper({ ...paper, pmid: null, doi: `10.1101/2026.09.01.${n}` }, day);
  await publishArticle(pre.articleId!);
  const calls = modelInputs.length;
  const art = await takePaper({ ...paper, pmid: `v-${T}`, doi: `10.9999/publicado-${n}` }, day);
  assert.equal(modelInputs.length, calls + 1);
  assert.match(modelInputs.at(-1)!, /Outras versões deste estudo já publicadas pelo jornal: “Preprint – não revisado por pares: [^”]+” \(preprint, /, "the writer knows it is the next version");
  await publishArticle(art.articleId!);
  const parts = await itemParts([pre.articleId!, art.articleId!]);
  const prePart = parts.get(pre.articleId!)!.literatura as MateriaPart;
  const artPart = parts.get(art.articleId!)!.literatura as MateriaPart;
  assert.equal(prePart.estado, "preprint");
  assert.equal(artPart.estado, "artigo-revisado");
  assert.deepEqual(prePart.versoes.map((v) => [v.id, v.estado]), [[art.articleId!, "artigo-revisado"]]);
  assert.deepEqual(artPart.versoes.map((v) => [v.id, v.estado]), [[pre.articleId!, "preprint"]]);
  const [pub] = await sql<{ title: string }[]>`SELECT title FROM publications WHERE article_id = ${art.articleId!}`;
  assert.equal(pub!.title, materia.titulo, "a reviewed article's title carries no label");
});

test("a trial register's entry is labelled registered at once, then by ClinicalTrials.gov's status, and linked to the paper that names it", async () => {
  const nct = `NCT${String(Date.now()).slice(-8)}`;
  const { articleId } = await upsertMaterial({ sourceId: "ctgov-test", url: `https://clinicaltrials.gov/study/${nct}?cond=x`, title: "Balloon dilation in children", via: "fetch", publishedAt: new Date() });
  await publishArticle(articleId);
  const title = async () => (await sql<{ title: string }[]>`SELECT title FROM publications WHERE article_id = ${articleId}`)[0]!.title;
  assert.equal(await title(), "Estudo registrado: Balloon dilation in children");
  assert.equal(((await itemParts([articleId])).get(articleId)!.literatura as MateriaPart).estado, "registrado");

  const out = await syncRegistros();
  assert.ok((out.recrutando as number) >= 1);
  assert.equal(await title(), "Estudo registrado – recrutando: Balloon dilation in children");
  const again = await syncRegistros();
  assert.equal(again.checked, 0, "checked once a day");

  const [paper] = parsePubmedXml(fixture("pubmed.xml"));
  const art = await takePaper({ ...paper!, title: `Balloon dilation trial results ${T}`, pmid: `t-${T}`, doi: `10.9999/trial-${T}`, pmcid: null, trialIds: [nct], versionPmids: [] }, new Date("2026-10-30T03:00:00Z"));
  assert.match(modelInputs.at(-1)!, /Outras versões deste estudo já publicadas pelo jornal: “Estudo registrado – recrutando: Balloon dilation in children” \(recrutando, /);
  await publishArticle(art.articleId!);
  const part = (await itemParts([articleId])).get(articleId)!.literatura as MateriaPart;
  assert.equal(part.confianca, null);
  assert.deepEqual(part.versoes.map((v) => v.id), [art.articleId!]);
});

test("a second paper of a covered trial is written and listed as another publication of that trial, not as a version", async () => {
  const nct = `NCT${String(Date.now() + 7).slice(-8)}`;
  const [fixed] = parsePubmedXml(fixture("pubmed.xml"));
  const day = new Date("2026-10-30T03:00:00Z");
  const paper = { ...fixed!, pmcid: null, trialIds: [nct], versionPmids: [] };
  const primary = await takePaper({ ...paper, title: `Nasal high flow in bronchiolitis: primary results ${T}`, pmid: `p-${T}`, doi: `10.9999/primary-${T}` }, day);
  await publishArticle(primary.articleId!);
  const secondary = await takePaper({ ...paper, title: `Cost of nasal high flow in bronchiolitis: secondary analysis ${T}`, pmid: `s-${T}`, doi: `10.9999/secondary-${T}` }, day);
  assert.match(modelInputs.at(-1)!, /Outras publicações do mesmo ensaio já publicadas pelo jornal: “[^”]+” \(artigo revisado, /, "the writer knows the trial was covered");
  assert.doesNotMatch(modelInputs.at(-1)!, /Outras versões deste estudo/);
  await publishArticle(secondary.articleId!);
  const parts = await itemParts([primary.articleId!, secondary.articleId!]);
  const first = parts.get(primary.articleId!)!.literatura as MateriaPart;
  const second = parts.get(secondary.articleId!)!.literatura as MateriaPart;
  assert.deepEqual(second.versoes, []);
  assert.deepEqual(second.mesmoEnsaio.map((v) => v.id), [primary.articleId!]);
  assert.deepEqual(first.versoes, []);
  assert.deepEqual(first.mesmoEnsaio.map((v) => v.id), [secondary.articleId!]);
});

test("regulatory alerts: an act naming no listed device is not read, one the model finds not pediatric is dropped, a relevant one is an alert labelled in its title", async () => {
  const calls = modelInputs.length;
  const out = await collectAlertas({ now: new Date("2026-10-25T12:00:00Z"), cfg: alertasSettings() });
  assert.deepEqual(out.failed, []);
  assert.equal(out["sem-dispositivo"], 1, "the dental recall never reaches the model; the neonatal circuit's product code is on the list");
  assert.equal(out.alerta, 1);
  assert.equal(out.irrelevante, 1, "the adult cannulas are read and dropped");
  assert.equal(modelInputs.length, calls + 2);
  assert.match(modelInputs.find((m) => m.includes(`E1-${T}`))!, /Produtos \(2\):[\s\S]*HEATED, NEO[\s\S]*HEATED, PED/, "one recall event with its products, not an alert per model");
  const [row] = await sql<{ article_id: string }[]>`SELECT article_id FROM literatura_alertas WHERE key = ${`fda-recall:E1-${T}`}`;
  const [article] = await sql<{ url: string; body_html: string; source_id: string }[]>`SELECT url, body_html, source_id FROM articles WHERE id = ${row!.article_id}`;
  assert.equal(article!.source_id, ALERTA_SOURCE);
  assert.equal(article!.url, "https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfRES/res.cfm?id=1");
  assert.match(article!.body_html, /não evidência de eficácia/);
  await publishArticle(row!.article_id);
  const [pub] = await sql<{ title: string }[]>`SELECT title FROM publications WHERE article_id = ${row!.article_id}`;
  assert.equal(pub!.title, "Alerta regulatório (FDA) – recolhimento: FDA recolhe circuito respiratório neonatal da Medline");
  const second = await collectAlertas({ now: new Date("2026-10-25T12:00:00Z"), cfg: alertasSettings() });
  assert.equal(modelInputs.length, calls + 2, "each act is read once");
  assert.equal(second.alerta, undefined);
});

test("ELSO: the guidelines on the page at the first read are the baseline; a new pediatric one becomes a notice with its dates", async () => {
  const cfg = { ...alertasSettings(), elso: { url: `${process.env.CTGOV_BASE_URL!.replace(/\/ctgov$/, "")}/elso/guidelines`, pediatric: "pediatric|paediatric|neonat|child|infant" } };
  await sql`DELETE FROM literatura_alertas WHERE key LIKE 'elso:%'`;
  const calls = modelInputs.length;
  const first = await readElso({ cfg, now: new Date("2026-10-30T12:00:00Z") });
  assert.deepEqual(first, { guidelines: 2, pediatric: 1, written: 0, baseline: true });
  elsoPage += `<div class="rounded-border"><p><a class="txt-blue" href="/c.pdf">Pediatric ECPR ${T}</a></p><p>Last updated: June 2026</p></div>`;
  const second = await readElso({ cfg, now: new Date("2026-10-31T12:00:00Z") });
  assert.equal(second.written, 1);
  assert.equal(modelInputs.length, calls, "a notice needs no model");
  const [row] = await sql<{ article_id: string }[]>`SELECT article_id FROM literatura_alertas WHERE key = ${`elso:Pediatric ECPR ${T}|2026-06`}`;
  const c = ((await itemParts([row!.article_id])).get(row!.article_id)!.literatura as MateriaPart).confianca!;
  assert.equal(c.feitura, "aviso");
  assert.deepEqual(c.datas, { publicado: null, revisado: "2026-06", conferido: "2026-10-31" });
  assert.equal((await readElso({ cfg })).written, 0);
});

test("the journal's own text keeps its title and summary over the engine's; an older matéria takes its own line; a translation keeps its title in Portuguese; other sources are untouched", async () => {
  const [paper, open] = parsePubmedXml(fixture("pubmed.xml"));
  const analyse = async (id: string, relevance = "pass") => {
    await sql`UPDATE articles SET grouping_status = 'complete', grouped_at = now() WHERE id = ${id}`;
    await sql`INSERT INTO analyses (article_id, input_revision, origin, relevance, title_zh, summary_zh, reason_zh, score, selected)
      VALUES (${id}, 1000, 'rule', ${relevance}, 'Título reescrito pelo motor', 'Resumo escrito pelo motor', 'Por que importa escrito pelo motor', 90, true)`;
    await publishArticle(id);
    const [pub] = await sql<{ title: string; original_title: string | null; summary: string | null; reason: string | null; selected: boolean }[]>`
      SELECT title, original_title, summary, reason, selected FROM publications WHERE article_id = ${id}`;
    return pub!;
  };
  const novel = await takePaper({ ...paper!, pmid: `own-${T}`, doi: `10.9999/own-${T}`, pmcid: null }, new Date("2026-10-30T03:00:00Z"));
  const own = await analyse(novel.articleId!);
  assert.equal(own.title, materia.titulo);
  assert.equal(own.original_title, null);
  assert.equal(own.reason, null);
  assert.equal(own.summary, `${materia.achado.replace(/\.$/, "")}. Muda algo agora? Alinhado a diretriz (Diretriz ERS de sibilância 2024).`);
  assert.equal(own.selected, true, "selection still works from the engine's judgement");
  const [engineStill] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM analyses WHERE article_id = ${novel.articleId!} AND title_zh = 'Título reescrito pelo motor'`;
  assert.equal(engineStill!.n, 1, "understand keeps its answer for type, tags and section");
  const detail = await loadItemDetail(novel.articleId!);
  assert.equal(detail.kind === "found" && detail.item.ownText, true, "the page leaves out the summary and the source line");

  // A matéria from before the trust record: its body is not touched, its summary is its own line.
  const older = await takePaper({ ...paper!, pmid: `old-${T}`, doi: `10.9999/old-${T}`, pmcid: null }, new Date("2026-10-30T03:00:00Z"));
  await sql`DELETE FROM literatura_confianca WHERE article_id = ${older.articleId!}`;
  await sql`UPDATE articles SET excerpt = 'Linha fina da matéria antiga', body_html = '<p>Corpo antigo</p>' WHERE id = ${older.articleId!}`;
  const oldPub = await analyse(older.articleId!);
  assert.equal(oldPub.title, materia.titulo);
  assert.equal(oldPub.summary, "Linha fina da matéria antiga");
  assert.equal(oldPub.reason, null);
  const [body] = await sql<{ body_html: string }[]>`SELECT body_html FROM articles WHERE id = ${older.articleId!}`;
  assert.equal(body!.body_html, "<p>Corpo antigo</p>");

  const integral = await takePaper({ ...open!, title: `${open!.title} (own ${T})`, pmid: `int-${T}`, doi: `10.9999/int-${T}`, pmcid: "PMC12345678" });
  assert.equal(integral.status, "integral");
  const translated = await analyse(integral.articleId!);
  assert.equal(translated.title, "Título reescrito pelo motor", "its own title is the paper's in English");
  assert.match(translated.summary!, /Muda algo agora\?/);

  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, site_fulltext, next_fetch_at) VALUES ('rss-own-test', 'Revista', 'rss', 'T1', 'editorial', true, '2100-01-01') ON CONFLICT (id) DO NOTHING`;
  const { articleId } = await upsertMaterial({ sourceId: "rss-own-test", url: `https://example.org/${T}`, title: "An English headline", language: "en", publishedAt: new Date(), excerpt: "Abstract", bodyHtml: null, bodyText: null, bodyStatus: "pending", via: "rss", staleOnDiscovery: false });
  const other = await analyse(articleId);
  assert.equal(other.title, "Título reescrito pelo motor");
  assert.equal(other.original_title, "An English headline");
  assert.equal(other.summary, "Resumo escrito pelo motor");
  assert.equal(other.reason, "Por que importa escrito pelo motor");
  const otherDetail = await loadItemDetail(articleId);
  assert.equal(otherDetail.kind === "found" && otherDetail.item.ownText, false);
});

test("Markdown and full RSS carry the question, Em um minuto, the card and the transparency line once, around the body; the page's stored body has none of them", async () => {
  const [paper] = parsePubmedXml(fixture("pubmed.xml"));
  const { articleId } = await takePaper({ ...paper!, pmid: `exit-${T}`, doi: `10.9999/exit-${T}`, pmcid: null, coiStatement: "JL consults for X." }, new Date("2026-10-30T03:00:00Z"));
  const id = articleId!;
  assert.match(modelInputs.at(-1)!, /^Limite desta matéria: cerca de \d+ palavras, somando todos os campos$/m, "the cap reaches the model");
  await sql`UPDATE articles SET grouping_status = 'complete', grouped_at = now() WHERE id = ${id}`;
  await publishArticle(id);
  await sql`UPDATE publications SET selected = true, seat = true, syndicate = true, body_mode = 'full', visible_after = now() - interval '1 minute', published_at = now() WHERE article_id = ${id}`;

  const times = (text: string, what: string) => text.split(what).length - 1;
  const carried = [materia.perguntaClinica, "Em um minuto", materia.achado, "Muda algo agora?", materia.diretriz, "Ficha do estudo", materia.populacaoCenario, materia.desenhoDetalhe, "Conflitos de interesse declarados", "inteligência artificial", "acompanha o que vai ao ar"];

  const markdown = (await exportMarkdown(id))!.body;
  for (const what of carried) assert.equal(times(markdown, what), 1, `Markdown: ${what}`);
  assert.equal(times(markdown, "Texto lido"), 0, "readers never see what was read");
  assert.equal(times(markdown, "## Resumo"), 0, "Em um minuto is the summary");
  assert.ok(markdown.indexOf(materia.perguntaClinica) < markdown.indexOf("## Em um minuto") && markdown.indexOf("## Em um minuto") < markdown.indexOf("## Ficha do estudo"), "in the page's order");
  assert.ok(markdown.indexOf("## Ficha do estudo") < markdown.indexOf("## O que encontraram"), "the card comes before the text");
  assert.ok(markdown.indexOf("## Referência") < markdown.indexOf("inteligência artificial"), "the line comes after it");

  const feed = await itemFeed("selected-full", null);
  const feedItem = feed.split("<item>").find((i) => i.includes(`<guid isPermaLink="false">${id}</guid>`))!;
  const content = /<content:encoded>([\s\S]*?)<\/content:encoded>/.exec(feedItem)![1]!;
  assert.match(/<description>([\s\S]*?)<\/description>/.exec(feedItem)![1]!, /Muda algo agora\?/, "the description keeps the summary");
  for (const what of carried) assert.equal(times(content, what), 1, `RSS: ${what}`);
  assert.equal(times(content, "Texto lido"), 0, "readers never see what was read");
  assert.ok(content.indexOf("Ficha do estudo") < content.indexOf("O que encontraram"));
  assert.ok(content.indexOf("Referência") < content.indexOf("inteligência artificial"));

  const detail = await loadItemDetail(id);
  assert.ok(detail.kind === "found");
  const page = detail.item.body!.zh ?? detail.item.body!.original!;
  assert.match(page, /O que encontraram/);
  for (const what of ["Pergunta clínica", "Em um minuto", "Muda algo agora?", "Ficha do estudo", "inteligência artificial"]) assert.equal(times(page, what), 0, `page body: ${what}`);
});

test("an editor's summary on the journal's own text takes the stored finding's place in Em um minuto, on the page's part, Markdown and RSS; clearing it brings the finding back", async () => {
  const [paper] = parsePubmedXml(fixture("pubmed.xml"));
  const { articleId } = await takePaper({ ...paper!, pmid: `edit-${T}`, doi: `10.9999/edit-${T}`, pmcid: null }, new Date("2026-10-30T03:00:00Z"));
  const id = articleId!;
  await sql`UPDATE articles SET grouping_status = 'complete', grouped_at = now() WHERE id = ${id}`;
  await publishArticle(id);
  const seat = () => sql`UPDATE publications SET selected = true, seat = true, syndicate = true, body_mode = 'full', visible_after = now() - interval '1 minute', published_at = now() WHERE article_id = ${id}`;
  const exits = async () => {
    const feed = await itemFeed("selected-full", null);
    const content = /<content:encoded>([\s\S]*?)<\/content:encoded>/.exec(feed.split("<item>").find((i) => i.includes(`<guid isPermaLink="false">${id}</guid>`))!)![1]!;
    return [(await exportMarkdown(id))!.body, content];
  };
  const times = (text: string, what: string) => text.split(what).length - 1;
  const corrected = `Traqueomalácia apareceu em 29% das crianças (${T}).`;
  const published = `${corrected} Muda algo agora? Alinhado a diretriz (Diretriz ERS de sibilância 2024).`;

  await overrideFields(id, { fields: { summary: published }, version: 0, reason: "número errado" }, "test-summary");
  await seat();
  const [pub] = await sql<{ summary: string }[]>`SELECT summary FROM publications WHERE article_id = ${id}`;
  assert.equal(pub!.summary, published, "the card");
  const detail = await loadItemDetail(id);
  assert.ok(detail.kind === "found");
  const part = detail.item.modules!.literatura as MateriaPart;
  assert.equal(achadoVisivel(part), corrected, "the page and the lean page draw this part");
  assert.equal(part.confianca!.minuto!.achado, corrected, "the e-mail's line");
  for (const exit of await exits()) {
    assert.equal(times(exit, corrected), 1);
    assert.equal(times(exit, materia.achado), 0);
    assert.equal(times(exit, "Muda algo agora?"), 1);
  }

  await overrideFields(id, { fields: {}, clear: ["summary"], version: 1, reason: "volta" }, "test-summary");
  await seat();
  assert.equal(achadoVisivel((await itemParts([id])).get(id)!.literatura as MateriaPart), materia.achado);
  for (const exit of await exits()) assert.equal(times(exit, materia.achado), 1);

  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, site_fulltext, next_fetch_at) VALUES ('rss-edit-test', 'Revista', 'rss', 'T1', 'editorial', true, '2100-01-01') ON CONFLICT (id) DO NOTHING`;
  const other = await upsertMaterial({ sourceId: "rss-edit-test", url: `https://example.org/edit-${T}`, title: "An English headline", language: "en", publishedAt: new Date(), excerpt: "Abstract", bodyHtml: null, bodyText: null, bodyStatus: "pending", via: "rss", staleOnDiscovery: false });
  await publishArticle(other.articleId);
  await overrideFields(other.articleId, { fields: { summary: "Resumo editado" }, version: 0, reason: "ajuste" }, "test-summary");
  assert.equal((await itemParts([other.articleId])).has(other.articleId), false, "other sources have no part from it");
});

test("a model answer whose results are all blank fails the attempt instead of publishing an empty table", async () => {
  const [paper] = parsePubmedXml(fixture("pubmed.xml"));
  const pmid = `blank-${T}`;
  const { resultados } = materia;
  materia.resultados = [{ desfecho: " ", resultado: "", efeito: "" }];
  try {
    await assert.rejects(takePaper({ ...paper!, pmid, doi: `10.9999/${pmid}`, pmcid: null }, new Date("2026-10-30T03:00:00Z")));
  } finally {
    materia.resultados = resultados;
  }
  assert.equal((await sql`SELECT 1 FROM articles WHERE url LIKE ${`%${pmid}%`}`).length, 0);
});

test("an integral text keeps its summary on the page and in Markdown until an Em um minuto or a translation says it", async () => {
  const [paper] = parsePubmedXml(fixture("pubmed.xml"));
  const id = (await takePaper({ ...paper!, pmid: `integral-${T}`, doi: `10.9999/integral-${T}`, pmcid: null }, new Date("2026-10-30T03:00:00Z"))).articleId!;
  const [record] = await sql<{ data: never }[]>`SELECT data FROM literatura_confianca WHERE article_id = ${id}`;
  await sql`DELETE FROM literatura_confianca WHERE article_id = ${id}`;
  await sql`UPDATE articles SET source_id = ${INTEGRAL_SOURCE}, language = 'en', body_html = '<p>English full text.</p>', body_text = 'English full text.', grouping_status = 'complete', grouped_at = now() WHERE id = ${id}`;
  await publishArticle(id);
  await sql`UPDATE publications SET summary = 'Resumo em português', body_mode = 'full', visibility = 'public', visible_after = now() - interval '1 minute' WHERE article_id = ${id}`;
  const covered = async () => {
    const detail = await loadItemDetail(id);
    assert.ok(detail.kind === "found");
    assert.equal(detail.item.ownText, true);
    return detail.item.summaryCovered;
  };

  assert.equal(await covered(), false);
  assert.match((await exportMarkdown(id))!.body, /## Resumo\n\nResumo em português/);

  await sql`INSERT INTO translations (article_id, lang, revision, body_html, body_text, origin) SELECT id, 'pt', revision, '<p>Texto traduzido.</p>', 'Texto traduzido.', 'source' FROM articles WHERE id = ${id}`;
  assert.equal(await covered(), true, "a translation is in the site's language");
  await sql`DELETE FROM translations WHERE article_id = ${id}`;

  await sql`INSERT INTO literatura_confianca (article_id, data) VALUES (${id}, ${sql.json(record!.data)})`;
  assert.equal(await covered(), true, "Em um minuto is the summary");
  assert.doesNotMatch((await exportMarkdown(id))!.body, /## Resumo/);
});

test("the cleanup removes the line saying what was read from an older matéria, without a model call, and one without a record still says it was written with AI on the page, in Markdown and in RSS", async () => {
  const [paper] = parsePubmedXml(fixture("pubmed.xml"));
  const { articleId } = await takePaper({ ...paper!, pmid: `nota-${T}`, doi: `10.9999/nota-${T}`, pmcid: null }, new Date("2026-10-30T03:00:00Z"));
  const id = articleId!;
  const note = "Matéria escrita pelo Fôlego a partir do resumo publicado.";
  await sql`DELETE FROM literatura_confianca WHERE article_id = ${id}`;
  await sql`UPDATE articles SET body_html = ${`<h2>Como foi feito</h2><p>Métodos antigos.</p><h2>Referência</h2><p>Citação.</p><p><em>${note}</em></p>`}, body_text = ${`Métodos antigos. Citação. ${note}`}, grouping_status = 'complete', grouped_at = now() WHERE id = ${id}`;
  await publishArticle(id);
  await sql`UPDATE publications SET selected = true, seat = true, syndicate = true, body_mode = 'full', visible_after = now() - interval '1 minute', published_at = now() WHERE article_id = ${id}`;

  const calls = modelInputs.length;
  assert.ok(await removeNotasDeOrigem() >= 1);
  assert.equal(modelInputs.length, calls);
  const [row] = await sql<{ body_html: string; body_text: string }[]>`SELECT body_html, body_text FROM articles WHERE id = ${id}`;
  assert.equal(row!.body_html, "<h2>Como foi feito</h2><p>Métodos antigos.</p><h2>Referência</h2><p>Citação.</p>");
  assert.equal(row!.body_text, "Métodos antigos. Citação.");
  assert.equal(await removeNotasDeOrigem(), 0, "safe to run again");

  const legacy = (await takePaper({ ...paper!, pmid: `nota-antiga-${T}`, doi: `10.9999/nota-antiga-${T}`, pmcid: null }, new Date("2026-10-30T03:00:00Z"))).articleId!;
  const legacyNote = "Matéria escrita pelo Carina a partir do resumo publicado; o texto completo não estava disponível em acesso aberto.";
  await sql`UPDATE articles SET body_html = ${`<p>Citação.</p><p><em>${legacyNote}</em></p>`}, body_text = ${`Citação. ${legacyNote}`} WHERE id = ${legacy}`;
  assert.equal(await removeNotasDeOrigem(), 1, "the wording of the first version too");
  const [cleaned] = await sql<{ body_html: string; body_text: string }[]>`SELECT body_html, body_text FROM articles WHERE id = ${legacy}`;
  assert.deepEqual([cleaned!.body_html, cleaned!.body_text], ["<p>Citação.</p>", "Citação."]);

  const line = linhaTransparencia("materia", EXPEDIENTE.editor.name);
  const detail = await loadItemDetail(id);
  assert.ok(detail.kind === "found");
  const part = detail.item.modules!.literatura as MateriaPart;
  assert.equal(part.confianca, null);
  assert.equal(part.feitura, "materia", "the page's End draws the line from it");
  const markdown = (await exportMarkdown(id))!.body;
  const feedItem = (await itemFeed("selected-full", null)).split("<item>").find((i) => i.includes(`<guid isPermaLink="false">${id}</guid>`))!;
  for (const [exit, text] of [["page", JSON.stringify(detail.item)], ["Markdown", markdown], ["RSS", feedItem]] as const) {
    assert.match(text, /Métodos antigos/, exit);
    assert.doesNotMatch(text, /Matéria escrita pelo|Texto lido|textoLido/, exit);
  }
  assert.equal(markdown.split(line).length - 1, 1, "Markdown: the transparency line, once");
  assert.equal(feedItem.split(line).length - 1, 1, "RSS: the transparency line, once");
});
