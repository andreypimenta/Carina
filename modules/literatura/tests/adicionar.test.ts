// A paper the editor adds by PMID or DOI, against local stand-ins for PubMed, Unpaywall, Europe PMC and the
// model. Failure cases: a DOI is not found, or finds another paper; a paper months old enters as history and
// never reaches a daily; a paper already taken is written (and paid for) again, also one first written from a
// journal's table of contents under its DOI; Seleção = sim is not the
// admin's audited manual correction; the admin's request calls the model in the api instead of the worker.
import "../../../tests/setup.ts";
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { config } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { installModules } from "@aihot/backend/modules";
import server from "../server.ts";
import { ADICIONAR_QUEUE, addPaper, findPaper, listAdded, notIncluded, parseId, requestAdd } from "../backend/adicionar.ts";
import { INTEGRAL_SOURCE, MATERIA_SOURCE } from "../backend/collect.ts";

const PMID = "42215001";
const DOI = "10.1016/j.ijporl.2026.112853";
const LATER = "42215002";
const INDEXED_LATER = "42215003";
// The fixture's first paper, entered in PubMed in May, under the PMID and DOI asked for.
const record = (pmid: string, doi: string) => readFileSync(new URL("./fixtures/pubmed.xml", import.meta.url), "utf8")
  .match(/<PubmedArticle>[\s\S]*?<\/PubmedArticle>/)![0]
  .replaceAll("41000001", pmid)
  .replace("10.1016/J.JPEDSURG.2026.161999", doi)
  .replace('<PubMedPubDate PubStatus="entrez"><Year>2026</Year><Month>10</Month><Day>19</Day>', '<PubMedPubDate PubStatus="entrez"><Year>2026</Year><Month>5</Month><Day>29</Day>');
const RECORDS: Record<string, string> = { [PMID]: record(PMID, DOI), [LATER]: record(LATER, "10.5555/later"), [INDEXED_LATER]: record(INDEXED_LATER, "10.5555/sumario") };

const modelInputs: string[] = [];
const searches: string[] = [];
const materia = { titulo: "Traqueíte após traqueostomia pediátrica", linhaFina: "Análise do NSQIP", lide: "Um estudo avaliou traqueíte após traqueostomia.", contexto: "", metodos: "Coorte.", resultados: "Traqueíte em parte das crianças.", limitacoes: "Base administrativa.", paraOPediatra: "Atenção à traqueíte.", paraOEspecialista: "Reforça o cuidado." };

const stubServer = http.createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (c: Buffer) => chunks.push(c));
  req.on("end", () => {
    const url = new URL(req.url ?? "/", "http://stub");
    const send = (status: number, type: string, body: string) => { res.writeHead(status, { "content-type": type }); res.end(body); };
    if (url.pathname === "/eutils/esearch.fcgi") {
      const term = new URLSearchParams(Buffer.concat(chunks).toString()).get("term")!;
      searches.push(term);
      return send(200, "application/json", JSON.stringify({ esearchresult: { idlist: term === `"${DOI}"[aid]` ? [PMID] : term === `"10.5555/sumario"[aid]` ? [INDEXED_LATER] : [] } }));
    }
    if (url.pathname === "/eutils/efetch.fcgi") {
      const ids = url.searchParams.get("id")!.split(",");
      return send(200, "text/xml", `<?xml version="1.0" ?><PubmedArticleSet>${ids.map((id) => RECORDS[id] ?? "").join("")}</PubmedArticleSet>`);
    }
    if (url.pathname.startsWith("/unpaywall/")) return send(200, "application/json", readFileSync(new URL("./fixtures/unpaywall-closed.json", import.meta.url), "utf8"));
    if (url.pathname === "/epmc/search") return send(200, "application/json", JSON.stringify({ resultList: { result: [] } }));
    if (url.pathname === "/v1/chat/completions") {
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
});

after(async () => {
  await new Promise<void>((resolve) => stubServer.close(() => resolve()));
  await stopBoss();
  await closeDb();
});

test("a PMID or a DOI in the forms an editor pastes", () => {
  assert.deepEqual(parseId(" 42215001 "), { pmid: "42215001" });
  assert.deepEqual(parseId("PMID: 42215001"), { pmid: "42215001" });
  assert.deepEqual(parseId("10.1016/J.IJPORL.2026.112853"), { doi: DOI });
  assert.deepEqual(parseId("https://doi.org/10.1016/j.ijporl.2026.112853"), { doi: DOI });
  assert.deepEqual(parseId("doi: 10.1016/j.ijporl.2026.112853"), { doi: DOI });
  assert.equal(parseId("tracheitis"), null);
});

test("a DOI is found through PubMed's article identifier; an unknown one is refused", async () => {
  const paper = await findPaper(`https://doi.org/${DOI}`);
  assert.equal(paper.pmid, PMID);
  assert.equal(paper.enteredOn, "2026-05-29");
  assert.ok(searches.includes(`"${DOI}"[aid]`));
  await assert.rejects(() => findPaper("10.9999/nowhere"), /não está no PubMed/);
  await assert.rejects(() => findPaper("1"), /não está no PubMed/);
});

test("with model calls off the paper is not included, says so, and can be added again", async () => {
  const paper = await findPaper(PMID);
  config.modelCallsEnabled = false;
  try {
    const out = await addPaper(paper, { select: true, reason: "estreia", actor: "test:editor" });
    assert.equal(out.status, "aguardando-modelo");
    assert.equal(out.articleId, null);
    assert.equal(out.selected, false);
    assert.match(notIncluded(out.status)!, /^Não incluído: .*adicione de novo mais tarde/);
    assert.equal((await sql`SELECT 1 FROM literatura_papers WHERE pmid = ${PMID}`).length, 0, "nothing recorded");
  } finally {
    config.modelCallsEnabled = true;
  }
  assert.equal(notIncluded("materia-abstract"), null);
});

test("a paper from May enters as news of now, selected as the admin's manual correction does it, and is not taken again", async () => {
  const paper = await findPaper(PMID);
  const out = await addPaper(paper, { select: true, reason: "estreia", actor: "test:editor" });
  assert.equal(out.status, "materia-abstract");
  assert.equal(out.existing, false);
  assert.equal(out.selected, true);
  assert.equal(modelInputs.length, 1);

  const [a] = await sql<{ source_id: string; published_at: Date; discovered_at: Date; timeline_at: Date; backfill: boolean; backfill_reason: string | null }[]>`
    SELECT source_id, published_at, discovered_at, timeline_at, backfill, backfill_reason FROM articles WHERE id = ${out.articleId!}`;
  assert.equal(a!.source_id, MATERIA_SOURCE);
  assert.equal(a!.published_at.toISOString(), "2026-05-29T03:00:00.000Z");
  assert.equal(a!.backfill, false, "months old, still news");
  assert.equal(a!.backfill_reason, null);
  assert.equal(a!.timeline_at.getTime(), a!.discovered_at.getTime(), "on the timeline when it was added");
  assert.ok(Date.now() - a!.timeline_at.getTime() < 60_000);

  const [o] = await sql<{ fields: { selected?: boolean }; updated_by: string }[]>`SELECT fields, updated_by FROM editorial_overrides WHERE article_id = ${out.articleId!}`;
  assert.equal(o!.fields.selected, true);
  assert.equal(o!.updated_by, "test:editor");
  const [override] = await sql`SELECT reason FROM audit_log WHERE action = 'content.override' AND subject = ${`content:${out.articleId}`}`;
  assert.equal(override!.reason, "estreia");

  const again = await addPaper(paper, { select: false, reason: "de novo", actor: "test:editor" });
  assert.equal(again.existing, true);
  assert.equal(again.articleId, out.articleId);
  assert.equal(modelInputs.length, 1, "not written (nor paid for) twice");
  assert.equal((await sql`SELECT 1 FROM articles WHERE source_id = ${MATERIA_SOURCE}`).length, 1);

  const [latest] = await listAdded();
  assert.equal(latest!.pmid, PMID);
  assert.equal(latest!.existing, true);
});

test("the admin's request queues the paper for the worker, which takes it; one taken before is not queued", async () => {
  const calls = modelInputs.length;
  const asked = await requestAdd({ id: LATER, select: true }, "admin:editor");
  assert.deepEqual({ pmid: asked.pmid, queued: asked.queued, existing: asked.existing }, { pmid: LATER, queued: true, existing: null });
  assert.equal(modelInputs.length, calls, "the api never calls the model");
  const [job] = await sql<{ data: { pmid: string; select: boolean; reason: string; actor: string } }[]>`
    SELECT data FROM pgboss.job WHERE name = ${ADICIONAR_QUEUE.name} AND data->>'pmid' = ${LATER}`;
  assert.deepEqual(job!.data, { pmid: LATER, select: true, reason: `artigo acrescentado pelo editor (PMID ${LATER})`, actor: "admin:editor" });

  await ADICIONAR_QUEUE.run([job!.data]);
  const [latest] = await listAdded();
  assert.equal(latest!.pmid, LATER);
  assert.equal(latest!.actor, "admin:editor");
  assert.equal(latest!.status, "materia-abstract");
  assert.equal(latest!.existing, false);
  assert.equal(latest!.selected, true);
  const [o] = await sql<{ fields: { selected?: boolean } }[]>`SELECT fields FROM editorial_overrides WHERE article_id = ${latest!.articleId!}`;
  assert.equal(o!.fields.selected, true);

  const repeat = await requestAdd({ id: PMID }, "admin:editor");
  assert.equal(repeat.queued, false);
  assert.equal(repeat.existing!.status, "materia-abstract");
  await assert.rejects(() => requestAdd({ id: "not an id" }, "admin:editor"), /PMID .* ou um DOI/);
});

test("a paper first written from a journal's table of contents, under its DOI, is not taken again by its PMID", async () => {
  const [taken] = await sql<{ article_id: string }[]>`SELECT article_id FROM literatura_papers WHERE pmid = ${PMID}`;
  await sql`INSERT INTO literatura_papers (pmid, doi, status, article_id) VALUES ('doi:10.5555/sumario', '10.5555/sumario', 'materia-abstract', ${taken!.article_id})`;
  const calls = modelInputs.length;
  const asked = await requestAdd({ id: "10.5555/sumario" }, "admin:editor");
  assert.equal(asked.queued, false);
  assert.deepEqual(asked.existing, { status: "materia-abstract", articleId: taken!.article_id });
  const out = await addPaper(await findPaper(INDEXED_LATER), { select: false, reason: "de novo", actor: "test:editor" });
  assert.equal(out.existing, true);
  assert.equal(out.articleId, taken!.article_id);
  assert.equal(modelInputs.length, calls, "not written (nor paid for) twice");
});
