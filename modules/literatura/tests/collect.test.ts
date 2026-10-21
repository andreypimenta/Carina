// The literature run against local stand-ins for PubMed, Unpaywall, Europe PMC and the model. Failure cases:
// a paper whose licence allows it is not republished in full, or one whose licence does not is republished;
// the site's article is written from the abstract when a readable full text exists; a paper is written twice
// (paying twice) on the next run; an erratum becomes an article; the article lands outside today.
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
import { collectLiterature, INTEGRAL_SOURCE, MATERIA_SOURCE, takePaper } from "../backend/collect.ts";
import { parsePubmedXml } from "../backend/pubmed.ts";

const T = tag();
const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const long = (xml: string) => xml.replace("<sec id=\"s1\"><title>Background</title>", `<sec id="s1"><title>Background</title><p>${"Children with persistent wheeze were assessed in clinic. ".repeat(40)}</p>`);
const ndJats = long(fixture("jats.xml")).replace("http://creativecommons.org/licenses/by/4.0/", "http://creativecommons.org/licenses/by-nc-nd/4.0/");

const modelInputs: string[] = [];
const hits: string[] = [];
const materia = { titulo: "Broncoscopia em sibilância persistente achou traqueomalácia em 31%", linhaFina: "Coorte de 120 crianças", lide: "Um estudo brasileiro avaliou 120 crianças com sibilância persistente.", contexto: "", metodos: "Coorte.", resultados: "Traqueomalácia em 31%.", limitacoes: "Centro único.", paraOPediatra: "Sibilância que não melhora merece avaliação.", paraOEspecialista: "Reforça a broncoscopia." };

const stubServer = http.createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (c: Buffer) => chunks.push(c));
  req.on("end", () => {
    const url = req.url ?? "/";
    hits.push(url.split("?")[0]!);
    const send = (status: number, type: string, body: string) => { res.writeHead(status, { "content-type": type }); res.end(body); };
    if (url.startsWith("/eutils/esearch.fcgi")) return send(200, "application/json", JSON.stringify({ esearchresult: { idlist: ["41000001", "41000002", "41000003"] } }));
    if (url.startsWith("/eutils/efetch.fcgi")) return send(200, "text/xml", fixture("pubmed.xml"));
    if (url.startsWith("/unpaywall/10.1186")) return send(200, "application/json", fixture("unpaywall-oa.json"));
    if (url.startsWith("/unpaywall/")) return send(200, "application/json", fixture("unpaywall-closed.json"));
    if (url === "/epmc/PMC12345678/fullTextXML") return send(200, "text/xml", long(fixture("jats.xml")));
    if (url === "/epmc/PMC99/fullTextXML") return send(200, "text/xml", ndJats);
    if (url.startsWith("/epmc/")) return send(404, "text/plain", "not found");
    if (url.startsWith("/v1/chat/completions")) {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { messages: Array<{ role: string; content: string }> };
      modelInputs.push(body.messages.find((m) => m.role === "user")!.content);
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
  });
  installModules([server]);
  for (const id of [MATERIA_SOURCE, INTEGRAL_SOURCE]) {
    await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, site_fulltext, next_fetch_at)
      VALUES (${id}, ${id}, 'external', 'T1', 'editorial', true, '2100-01-01') ON CONFLICT (id) DO NOTHING`;
  }
  await sql`DELETE FROM literatura_papers WHERE pmid IN ('41000001', '41000002', '41000003', '41000004')`;
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
  assert.equal(modelInputs.length, 1, "only the closed paper is written by the model");
  assert.match(modelInputs[0]!, /Texto disponível: somente o resumo/);

  const papers = await sql<{ pmid: string; status: string; source_id: string | null; title: string | null; body_html: string | null; language: string | null; url: string | null; published_at: Date | null }[]>`
    SELECT p.pmid, p.status, a.source_id, a.title, a.body_html, a.language, a.url, a.published_at
    FROM literatura_papers p LEFT JOIN articles a ON a.id = p.article_id
    WHERE p.pmid IN ('41000001', '41000002', '41000003') ORDER BY p.pmid`;
  const [closed, open, erratum] = papers;
  assert.equal(closed!.source_id, MATERIA_SOURCE);
  assert.equal(closed!.title, materia.titulo);
  assert.equal(closed!.language, "pt");
  assert.equal(closed!.url, "https://doi.org/10.1016/j.jpedsurg.2026.161999");
  assert.match(closed!.body_html!, /Para o pediatra/);
  assert.match(closed!.body_html!, /o artigo completo é pago na editora/);
  assert.equal(closed!.published_at!.toISOString(), "2026-10-19T03:00:00.000Z");

  assert.equal(open!.source_id, INTEGRAL_SOURCE);
  assert.equal(open!.language, "en");
  assert.match(open!.body_html!, /Tradução integral do artigo de Lee J, publicado em BMC pulmonary medicine \(2026\) sob a licença <a href="http:\/\/creativecommons.org\/licenses\/by\/4.0\/">CC BY<\/a>/);
  assert.match(open!.body_html!, /Tracheomalacia was the most frequent finding/);
  assert.match(open!.body_html!, /Texto completo gratuito/);
  assert.doesNotMatch(open!.body_html!, /thank the families/);

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
  assert.match(row!.body_html, /a partir do texto completo em acesso aberto/);
  assert.doesNotMatch(row!.body_html, /Children with persistent wheeze were assessed/);
});
