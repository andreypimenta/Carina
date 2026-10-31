// The watched journals in the literature run, against local stand-ins for a journal's Crossref listing, a
// publisher's RSS, PubMed, Unpaywall and the model. Failure cases: a paper on the site's subjects that only a
// table of contents lists is not written up, or shows no journal; an off-subject paper is paid for; a paper of
// an indexed journal is written from its title alone instead of waiting for PubMed's abstract; the PubMed record
// of a paper first read in a table of contents becomes a second article (paying twice), or is dropped when the
// table of contents paper failed; a journal whose listing fails stops the others.
import { tag } from "../../../tests/setup.ts";
import assert from "node:assert/strict";
import http from "node:http";
import { after, before, test } from "node:test";
import { config } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { installModules } from "@aihot/backend/modules";
import server from "../server.ts";
import { collectLiterature, INTEGRAL_SOURCE, MATERIA_SOURCE } from "../backend/collect.ts";
import type { Revistas } from "../backend/revistas.ts";

const T = tag();
const NOW = new Date("2026-10-30T12:00:00Z");
const doi = (name: string) => `10.5555/${T.toLowerCase()}-${name}`;
const pmidOf = { early: "42000001", lost: "42000002" } as Record<string, string>;
let pubmedHas = new Set<string>();
const modelInputs: string[] = [];
const searches: string[] = [];
const materia = { titulo: "Traqueoplastia por deslizamento em lactentes", linhaFina: "Série de 12 casos", lide: "Um centro descreveu 12 lactentes.", contexto: "", metodos: "Série de casos.", resultados: "Todos extubados.", limitacoes: "Centro único.", paraOPediatra: "Estridor persistente merece investigação.", paraOEspecialista: "Técnica reprodutível." };

const pubmedXml = (pmid: string, d: string) => `<?xml version="1.0"?><PubmedArticleSet><PubmedArticle><MedlineCitation><PMID>${pmid}</PMID><Article>
  <Journal><Title>Journal of watched surgery</Title><ISOAbbreviation>J Watch Surg</ISOAbbreviation><JournalIssue><PubDate><Year>2026</Year></PubDate></JournalIssue></Journal>
  <ArticleTitle>Slide tracheoplasty in infants.</ArticleTitle><Abstract><AbstractText>Twelve infants with tracheal stenosis.</AbstractText></Abstract>
  <AuthorList><Author><LastName>Silva</LastName><Initials>A</Initials></Author></AuthorList><Language>eng</Language>
  <PublicationTypeList><PublicationType>Journal Article</PublicationType></PublicationTypeList></Article></MedlineCitation>
  <PubmedData><History><PubMedPubDate PubStatus="entrez"><Year>2026</Year><Month>10</Month><Day>29</Day></PubMedPubDate></History>
  <ArticleIdList><ArticleId IdType="pubmed">${pmid}</ArticleId><ArticleId IdType="doi">${d}</ArticleId></ArticleIdList></PubmedData></PubmedArticle></PubmedArticleSet>`;

const stubServer = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://stub");
  const send = (status: number, type: string, body: string) => { res.writeHead(status, { "content-type": type }); res.end(body); };
  const chunks: Buffer[] = [];
  req.on("data", (c: Buffer) => chunks.push(c));
  req.on("end", () => {
    if (url.pathname === "/crossref/works") {
      const issn = /issn:([^,]+)/.exec(url.searchParams.get("filter") ?? "")?.[1];
      if (issn === "0000-0002") return send(429, "text/plain", "slow down");
      return send(200, "application/json", JSON.stringify({ message: { items: [
        { DOI: doi("early"), title: ["Slide tracheoplasty in infants"], abstract: "<jats:p>Twelve infants with tracheal stenosis.</jats:p>", author: [{ given: "Ana", family: "Silva" }], created: { "date-time": "2026-10-28T10:00:00Z" } },
        { DOI: doi("adult"), title: ["Tracheal resection in adults"], abstract: "<jats:p>Ninety adults.</jats:p>", created: { "date-time": "2026-10-28T10:00:00Z" } },
        { DOI: doi("titleonly"), title: ["Pectus excavatum in children: a registry"], created: { "date-time": "2026-10-28T10:00:00Z" } },
        { DOI: doi("old"), title: ["Airway stents in children"], created: { "date-time": "2026-09-01T10:00:00Z" } },
      ] } }));
    }
    if (url.pathname === "/feed.xml") {
      return send(200, "application/rss+xml", `<rss xmlns:prism="http://prismstandard.org/namespaces/basic/2.0/"><channel><item><title>Foreign body aspiration in children</title>
        <link>https://journal-b.example/${T}/1</link><description>Forty children with airway foreign bodies.</description>
        <pubDate>Wed, 28 Oct 2026 10:00:00 GMT</pubDate></item></channel></rss>`);
    }
    if (url.pathname === "/eutils/esearch.fcgi") {
      const term = new URLSearchParams(Buffer.concat(chunks).toString()).get("term") ?? "";
      searches.push(term);
      const aid = /^"(.+)"\[aid\]$/.exec(term)?.[1];
      const ids = aid ? (pubmedHas.has(aid) ? [pmidOf[aid.split("-").pop()!]!] : []) : [...pubmedHas].map((d) => pmidOf[d.split("-").pop()!]!);
      return send(200, "application/json", JSON.stringify({ esearchresult: { idlist: ids } }));
    }
    if (url.pathname === "/eutils/efetch.fcgi") {
      const id = url.searchParams.get("id")!;
      return send(200, "text/xml", pubmedXml(id, doi(Object.keys(pmidOf).find((k) => pmidOf[k] === id)!)));
    }
    if (url.pathname.startsWith("/unpaywall/")) return send(200, "application/json", JSON.stringify({ is_oa: false }));
    if (url.pathname.startsWith("/epmc/")) return send(200, "application/json", JSON.stringify({ resultList: { result: [] } }));
    if (url.pathname === "/v1/chat/completions") {
      modelInputs.push(url.pathname);
      return send(200, "application/json", JSON.stringify({ id: `stub-${modelInputs.length}`, choices: [{ message: { content: JSON.stringify(materia) } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }));
    }
    send(500, "text/plain", "unexpected");
  });
});

let base = "";
const cfg = (): Revistas => ({
  filtro: { idade: ["child*", "infan*"], tema: ["trache*", "airway*", "pectus", "foreign body"] },
  revistas: [
    { id: "watched", name: "Journal of Watched Surgery", nlm: "J Watch Surg", sumario: { crossref: "0000-0001" } },
    { id: "busy", name: "Busy Journal", nlm: "Busy J", sumario: { crossref: "0000-0002" } },
    { id: "regional", name: "Revista Regional de Cirurgia Torácica", sumario: { rss: `${base}/feed.xml` } },
  ],
});

before(async () => {
  await new Promise<void>((resolve) => stubServer.listen(0, "127.0.0.1", () => resolve()));
  base = `http://127.0.0.1:${(stubServer.address() as { port: number }).port}`;
  config.allowPrivateNetworkFetch = true;
  config.modelCallsEnabled = true;
  delete process.env.MATERIA_MODEL;
  Object.assign(process.env, {
    PUBMED_BASE_URL: `${base}/eutils`, CROSSREF_BASE_URL: `${base}/crossref`, UNPAYWALL_BASE_URL: `${base}/unpaywall`, EUROPE_PMC_BASE_URL: `${base}/epmc`,
    LITERATURA_EMAIL: "test@example.com", NCBI_API_KEY: "test-key", LLM_BASE_URL: `${base}/v1`, LLM_API_KEY: "test-key", LLM_MODEL: "one-model",
  });
  installModules([server]);
  for (const id of [MATERIA_SOURCE, INTEGRAL_SOURCE]) {
    await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, site_fulltext, next_fetch_at)
      VALUES (${id}, ${id}, 'external', 'T1', 'editorial', true, '2100-01-01') ON CONFLICT (id) DO NOTHING`;
  }
});

after(async () => {
  await new Promise<void>((resolve) => stubServer.close(() => resolve()));
  await stopBoss();
  await closeDb();
});

test("papers on the subjects that only a table of contents lists are written up under their journal (one with no DOI, by its address); the PubMed record that comes later joins the same article", async () => {
  const first = await collectLiterature({ now: NOW, revistas: cfg() });
  assert.equal(first.revistasLidas, 2, "the two listings that answered were read");
  assert.deepEqual(first.revistasFalharam, ["busy"], "a listing that fails does not stop the others");
  assert.ok(searches.some((t) => t.startsWith('(("J Watch Surg"[ta] OR "Busy J"[ta]) AND')), "the indexed journals are searched in PubMed");
  assert.ok(!searches.includes(`"${doi("adult")}"[aid]`), "an off-subject paper is not even looked up");
  assert.ok(!searches.includes(`"${doi("old")}"[aid]`), "a paper listed before the run's window is not taken");
  assert.equal(first["materia-abstract"], 2);
  assert.equal(modelInputs.length, 2, "the two papers with an abstract are written; the indexed journal's title-only paper waits for PubMed");

  const regional = `https://journal-b.example/${T}/1`;
  const rows = await sql<{ pmid: string; doi: string | null; status: string; article_id: string; journal: string; url: string; body: string }[]>`
    SELECT p.pmid, p.doi, p.status, p.article_id, a.raw->>'journal' AS journal, a.url, a.body_html AS body
    FROM literatura_papers p JOIN articles a ON a.id = p.article_id WHERE p.pmid IN (${`doi:${doi("early")}`}, ${`url:${regional}`}) ORDER BY p.pmid`;
  assert.deepEqual(rows.map((r) => [r.pmid, r.doi, r.status, r.journal, r.url]), [
    [`doi:${doi("early")}`, doi("early"), "materia-abstract", "Journal of Watched Surgery", `https://doi.org/${doi("early")}`],
    [`url:${regional}`, null, "materia-abstract", "Revista Regional de Cirurgia Torácica", regional],
  ]);
  assert.doesNotMatch(rows[0]!.body, /pubmed\.ncbi/, "no PubMed link for a paper PubMed does not have yet");
  assert.match(rows[1]!.body, /Artigo: <a href="https:\/\/journal-b\.example\//, "a paper with no DOI links to its page");

  // PubMed now has the first paper: its record joins the article written from the table of contents.
  pubmedHas = new Set([doi("early")]);
  const second = await collectLiterature({ now: NOW, revistas: cfg() });
  assert.equal(second.sumario, 1);
  assert.equal(modelInputs.length, 2, "nothing is written twice");
  const [joined] = await sql<{ status: string; article_id: string }[]>`SELECT status, article_id FROM literatura_papers WHERE pmid = ${pmidOf.early!}`;
  assert.equal(joined!.status, "sumario");
  assert.equal(joined!.article_id, rows[0]!.article_id);

  const third = await collectLiterature({ now: NOW, revistas: cfg() });
  assert.equal(third.new, 0);
  assert.equal(modelInputs.length, 2);
});

test("the PubMed record of a table of contents paper that failed is written up, not joined to an article it never had", async () => {
  await sql`INSERT INTO literatura_papers (pmid, doi, status, attempts) VALUES (${`doi:${doi("lost")}`}, ${doi("lost")}, 'falhou', 3)`;
  pubmedHas = new Set([doi("lost")]);
  const calls = modelInputs.length;
  const out = await collectLiterature({ now: NOW, revistas: cfg() });
  assert.equal(out["materia-abstract"], 1);
  assert.equal(modelInputs.length, calls + 1);
  const [row] = await sql<{ status: string; article_id: string | null }[]>`SELECT status, article_id FROM literatura_papers WHERE pmid = ${pmidOf.lost!}`;
  assert.equal(row!.status, "materia-abstract");
  assert.ok(row!.article_id);
});
