// The leads in the literature run, against local stand-ins for a hospital's news feed and pages, PubMed,
// Unpaywall and the model. Failure cases: a hospital's post enters the site itself; the paper a post is about is
// not written up; an older paper the post cites, or one off the site's subjects, is paid for; a post is opened
// again on every run; a post that failed to open, or whose paper is still to be taken, is never opened again; a
// Google News item (a news.google.com link) does not reach the hospital's page through its redirect, or fails
// on Google's own page instead of being let go.
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
import type { Pista } from "../backend/pistas.ts";
import type { Revistas } from "../backend/revistas.ts";

const T = tag();
const NOW = new Date("2026-10-30T12:00:00Z");
const DOI = `10.5555/${T.toLowerCase()}-lead`;
const papers: Record<string, { title: string; entered: string; doi: string }> = {
  "43000001": { title: "Tracheostomy in infants: a multicentre cohort.", entered: "2026-10-20", doi: DOI },
  "43000002": { title: "Airway stents in children.", entered: "2020-01-10", doi: "10.5555/old" },
  "43000003": { title: "Liver transplant in children.", entered: "2026-10-01", doi: "10.5555/liver" },
};
const opened: string[] = [];
let failing = true;
const modelCalls: string[] = [];
const materia = { titulo: "Traqueostomia em lactentes", linhaFina: "Coorte multicêntrica", lide: "Um estudo acompanhou lactentes.", contexto: "", metodos: "Coorte.", resultados: "Poucas complicações.", limitacoes: "Observacional.", paraOPediatra: "Encaminhe cedo.", paraOEspecialista: "Padronize o cuidado." };

const pubmedXml = (ids: string[]) => `<?xml version="1.0"?><PubmedArticleSet>${ids.map((pmid) => {
  const p = papers[pmid]!;
  const [y, m, d] = p.entered.split("-");
  return `<PubmedArticle><MedlineCitation><PMID>${pmid}</PMID><Article>
  <Journal><Title>Pediatric Pulmonology</Title><ISOAbbreviation>Pediatr Pulmonol</ISOAbbreviation><JournalIssue><PubDate><Year>${y}</Year></PubDate></JournalIssue></Journal>
  <ArticleTitle>${p.title}</ArticleTitle><Abstract><AbstractText>A study.</AbstractText></Abstract>
  <AuthorList><Author><LastName>Silva</LastName><Initials>A</Initials></Author></AuthorList><Language>eng</Language>
  <PublicationTypeList><PublicationType>Journal Article</PublicationType></PublicationTypeList></Article></MedlineCitation>
  <PubmedData><History><PubMedPubDate PubStatus="entrez"><Year>${y}</Year><Month>${m}</Month><Day>${d}</Day></PubMedPubDate></History>
  <ArticleIdList><ArticleId IdType="pubmed">${pmid}</ArticleId><ArticleId IdType="doi">${p.doi}</ArticleId></ArticleIdList></PubmedData></PubmedArticle>`;
}).join("")}</PubmedArticleSet>`;

let base = "";
const post = (name: string) => `${base}/news/${T}/${name}`;
const stubServer = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://stub");
  const send = (status: number, type: string, body: string) => { res.writeHead(status, { "content-type": type }); res.end(body); };
  req.resume();
  req.on("end", () => {
    if (url.pathname === "/news/feed.xml") {
      const item = (name: string, date: string) => `<item><title>News ${name}</title><link>${post(name)}</link><pubDate>${date}</pubDate></item>`;
      return send(200, "application/rss+xml", `<rss><channel><title>Hospital news</title>
        ${item("study", "Thu, 29 Oct 2026 10:00:00 GMT")}${item("award", "Wed, 28 Oct 2026 10:00:00 GMT")}${item("cites", "Tue, 27 Oct 2026 10:00:00 GMT")}
        ${item("flaky", "Mon, 26 Oct 2026 10:00:00 GMT")}${item("old", "Tue, 01 Sep 2026 10:00:00 GMT")}</channel></rss>`);
    }
    if (url.pathname === "/gnews/rss") {
      const item = (name: string) => `<item><title>News ${name} - Hospital</title><link>${base}/gnews/articles/${T}-${name}?oc=5</link><pubDate>Thu, 29 Oct 2026 08:00:00 GMT</pubDate><source url="${base}">Hospital</source></item>`;
      return send(200, "application/rss+xml", `<rss><channel><title>Google News</title>${item("hop")}${item("page")}</channel></rss>`);
    }
    if (url.pathname === `/gnews/articles/${T}-hop`) { res.writeHead(302, { location: post("via-gnews") }); return res.end(); }
    if (url.pathname === `/gnews/articles/${T}-page`) return send(200, "text/html", `<html><script>window.WIZ_global_data={"x":"AU_yqL"};</script><c-wiz data-p="%.@.[]"></c-wiz></html>`);
    if (url.pathname.startsWith(`/news/${T}/`)) {
      const name = url.pathname.split("/").pop()!;
      opened.push(name);
      if (name === "study") return send(200, "text/html", `<p>Published in <a href="https://doi.org/${DOI}">Pediatric Pulmonology</a>.</p>`);
      if (name === "cites") return send(200, "text/html", `<p>Earlier work: <a href="https://pubmed.ncbi.nlm.nih.gov/43000002/">2020</a>, <a href="https://pubmed.ncbi.nlm.nih.gov/43000003/">liver</a>.</p>`);
      if (name === "via-gnews") return send(200, "text/html", `<p>Read the study on <a href="https://pubmed.ncbi.nlm.nih.gov/43000001/">PubMed</a>.</p>`);
      if (name === "flaky" && failing) return send(500, "text/plain", "busy");
      return send(200, "text/html", "<p>Our hospital won an award.</p>");
    }
    if (url.pathname === "/eutils/esearch.fcgi") {
      const term = url.searchParams.get("term") ?? "";
      return send(200, "application/json", JSON.stringify({ esearchresult: { idlist: term === `"${DOI}"[aid]` ? ["43000001"] : [] } }));
    }
    if (url.pathname === "/eutils/efetch.fcgi") return send(200, "text/xml", pubmedXml(url.searchParams.get("id")!.split(",")));
    if (url.pathname.startsWith("/unpaywall/")) return send(200, "application/json", JSON.stringify({ is_oa: false }));
    if (url.pathname.startsWith("/epmc/")) return send(200, "application/json", JSON.stringify({ resultList: { result: [] } }));
    if (url.pathname === "/v1/chat/completions") {
      modelCalls.push(url.pathname);
      return send(200, "application/json", JSON.stringify({ id: `stub-${modelCalls.length}`, choices: [{ message: { content: JSON.stringify(materia) } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }));
    }
    send(500, "text/plain", "unexpected");
  });
});

const revistas: Revistas = { filtro: { idade: ["child*", "infan*"], tema: ["trache*", "airway*"] }, revistas: [] };
const pistas = (): Pista[] => [
  { id: "hospital", name: "Hospital news", kind: "rss", config: { feedUrl: `${base}/news/feed.xml` } },
  { id: "gnews-hospital", name: "Google News · site:hospital", kind: "rss", config: { feedUrl: `${base}/gnews/rss` } },
];

before(async () => {
  await new Promise<void>((resolve) => stubServer.listen(0, "127.0.0.1", () => resolve()));
  base = `http://127.0.0.1:${(stubServer.address() as { port: number }).port}`;
  config.allowPrivateNetworkFetch = true;
  config.modelCallsEnabled = true;
  delete process.env.MATERIA_MODEL;
  Object.assign(process.env, {
    PUBMED_BASE_URL: `${base}/eutils`, UNPAYWALL_BASE_URL: `${base}/unpaywall`, EUROPE_PMC_BASE_URL: `${base}/epmc`,
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

test("a hospital's post leads to the recent paper on the subjects it names, which is written up; the post itself never enters, and is opened once", async () => {
  const first = await collectLiterature({ now: NOW, revistas, pistas: pistas() });
  assert.equal(first.pistasLidas, 2);
  assert.equal(first.pistasPosts, 5, "the five posts that opened; the one that failed waits, the one before the window is not read");
  assert.equal(first.pistasArtigos, 1);
  assert.equal(first["materia-abstract"], 1);
  assert.equal(modelCalls.length, 1, "only the paper the post is about is written: not the 2020 paper it cites, not the liver one");
  assert.deepEqual([...opened].sort(), ["award", "cites", "flaky", "study", "via-gnews"], "the Google News redirect is followed to the hospital's page");

  const rows = await sql<{ pmid: string; status: string }[]>`SELECT pmid, status FROM literatura_papers WHERE pmid LIKE ${`pista:${base}/news/${T}/%`} OR pmid = '43000001' ORDER BY pmid`;
  assert.deepEqual(rows.map((r) => [r.pmid.replace(`${base}/news/${T}/`, ""), r.status]), [
    ["43000001", "materia-abstract"], ["pista:award", "pista-sem-artigo"], ["pista:cites", "pista-sem-artigo"], ["pista:study", "pista"],
  ]);
  const gnews = await sql<{ pmid: string; status: string }[]>`SELECT pmid, status FROM literatura_papers WHERE pmid LIKE ${`pista:${base}/gnews/articles/${T}-%`} ORDER BY pmid`;
  assert.deepEqual(gnews.map((r) => [r.pmid.replace(`pista:${base}/gnews/articles/${T}-`, ""), r.status]), [
    ["hop?oc=5", "pista"], ["page?oc=5", "pista-sem-artigo"],
  ], "the item that reached the hospital's page led to its paper; the one left on Google's page is let go");
  const [{ n }] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM articles WHERE url LIKE ${`${base}/news/%`} OR url LIKE ${`${base}/gnews/%`}`;
  assert.equal(n, 0, "no post is material of the site");

  // Next run: only the post that failed is opened again, and it names nothing.
  failing = false;
  opened.length = 0;
  const second = await collectLiterature({ now: NOW, revistas, pistas: pistas() });
  assert.deepEqual(opened, ["flaky"]);
  assert.equal(second.pistasPosts, 1);
  assert.equal(modelCalls.length, 1, "nothing is written twice");
});
