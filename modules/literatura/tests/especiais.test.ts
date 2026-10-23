// The specials against local stand-ins for PubMed, iCite and the model. Failure cases: a special reaches the
// site without the editor approving and then publishing it; an approved text changes without a new approval;
// a change made against an older view overwrites a newer one; the model's unsupported passages reach the
// draft; a PMID the editor requires is left out of the list, or one PubMed lacks or that is an erratum is silently
// dropped; the model does not learn how often each study is cited; iCite out fails the writing, or the model or
// the panel read counts it never gave; a failed or never-finished writing leaves the draft stuck;
// PubMed is asked with collection off; the weekly carries no special, two, the same one twice, one published
// after it was due, or one that has left the site; an issue without one breaks.
import { editionAt, tag } from "../../../tests/setup.ts";
import assert from "node:assert/strict";
import http from "node:http";
import { after, before, test } from "node:test";
import { Conflict } from "@aihot/backend/audit";
import { config } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import { getBoss, stopBoss } from "@aihot/backend/jobs/queue";
import { installModules } from "@aihot/backend/modules";
import { loadReport } from "@aihot/backend/publication/reports";
import { composeDaily, composeWeekly } from "@aihot/backend/reports/compose";
import server from "../server.ts";
import {
  approveEspecial, createEspecial, discardEspecial, editEspecial, ESPECIAL_FAILED_QUEUE, ESPECIAL_QUEUE, especialDetail, publishedEspecial,
  publishedEspeciais, publishEspecial, reopenEspecial, rewriteEspecial, writeEspecial,
} from "../backend/especiais.ts";

const T = tag();
const SOURCE = `especiais-${T}`;
const EDITOR = "editor@test";
let pubmedEmpty = false;
let pubmedRequests = 0;
let iciteDown = false;
/** Something to do while the model is still writing, before it answers. */
let whileWriting: (() => Promise<void>) | null = null;
const modelInputs: string[] = [];

const article = (pmid: string, year: string, title: string, authors: string[], abstract: string, type: string) => `
<PubmedArticle><MedlineCitation><PMID>${pmid}</PMID><Article>
  <Journal><JournalIssue><PubDate><Year>${year}</Year></PubDate></JournalIssue><Title>Annals of Otology</Title></Journal>
  <ArticleTitle>${title}</ArticleTitle><Abstract><AbstractText>${abstract}</AbstractText></Abstract>
  <AuthorList>${authors.map((a) => `<Author><LastName>${a.split(" ")[0]}</LastName><Initials>${a.split(" ")[1]}</Initials></Author>`).join("")}</AuthorList>
  <Language>eng</Language><PublicationTypeList><PublicationType>${type}</PublicationType></PublicationTypeList>
</Article></MedlineCitation><PubmedData><ArticleIdList><ArticleId IdType="pubmed">${pmid}</ArticleId></ArticleIdList></PubmedData></PubmedArticle>`;
const ARTICLES = new Map([
  ["5000001", article("5000001", "1965", "Subglottic stenosis in infants and children", ["Holinger PH", "Kutnick SL"], "Thirty-one children with subglottic stenosis were treated.", "Journal Article")],
  ["9000003", article("9000003", "2020", "Laryngotracheal reconstruction: a systematic review and meta-analysis", ["Silva A"], "We pooled 1,240 children; the decannulation rate was 87.5%.", "Meta-Analysis")],
  ["7000002", article("7000002", "1994", "Proposed grading system for subglottic stenosis", ["Myer CM", "Cotton RT"], "A grading system with four grades is proposed.", "Journal Article")],
  // A classic the search does not find: only an editor's PMID brings it.
  ["6000004", article("6000004", "1980", "Anterior cricoid split as an alternative to tracheotomy", ["Cotton RT", "Seid AB"], "The anterior cricoid split avoided tracheotomy in premature infants.", "Journal Article")],
  ["6000005", article("6000005", "1981", "Erratum: Anterior cricoid split", ["Cotton RT"], "", "Published Erratum")],
]);
const CITATIONS: Record<string, number> = { "5000001": 31, "7000002": 662, "9000003": 63, "6000004": 166 };

const timeline = {
  titulo: "Estenose subglótica pediátrica: de 1965 à metanálise de 2020",
  linhaFina: "Da série de Holinger à metanálise de 2020.",
  abertura: "A estenose subglótica da criança é estudada desde 1965 [1].",
  epocas: [
    { titulo: "Primeiras descrições", paragrafos: ["Holinger tratou crianças com estenose subglótica [1]."] },
    { titulo: "A classificação", paragrafos: ["Myer e Cotton propuseram quatro graus [2].", "Uma série de Boston confirmou a classificação [2]."] },
  ],
  ondeEstamos: "Uma metanálise de 1.240 crianças encontrou decanulação de 87,5% [3].",
  emAberto: ["Faltam ensaios que comparem as técnicas [3].", "Sem fonte nenhuma."],
};

const stub = http.createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (c: Buffer) => chunks.push(c));
  req.on("end", () => {
    const url = req.url ?? "/";
    if (url.startsWith("/eutils/")) pubmedRequests++;
    const send = (type: string, body: string) => { res.writeHead(200, { "content-type": type }); res.end(body); };
    if (url.startsWith("/eutils/esearch.fcgi")) {
      const ids = pubmedEmpty ? [] : ["5000001", "7000002", "9000003"];
      return send("application/json", JSON.stringify({ esearchresult: { count: String(ids.length), idlist: ids } }));
    }
    if (url.startsWith("/eutils/efetch.fcgi")) {
      const ids = new URL(url, "http://stub").searchParams.get("id")!.split(",");
      return send("text/xml", `<?xml version="1.0"?><PubmedArticleSet>${ids.map((id) => ARTICLES.get(id) ?? "").join("")}</PubmedArticleSet>`);
    }
    if (url.startsWith("/icite/pubs")) {
      if (iciteDown) {
        res.writeHead(503);
        return res.end("down");
      }
      const ids = new URL(url, "http://stub").searchParams.get("pmids")!.split(",");
      return send("application/json", JSON.stringify({ data: ids.filter((id) => id in CITATIONS).map((id) => ({ pmid: Number(id), year: 2000, citation_count: CITATIONS[id] })) }));
    }
    if (url.startsWith("/v1/chat/completions")) {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { messages: Array<{ role: string; content: string }> };
      const timelineCall = body.messages.some((m) => m.role === "system" && m.content.includes("Linha do tempo"));
      if (timelineCall) modelInputs.push(body.messages.find((m) => m.role === "user")!.content);
      const answer = timelineCall ? timeline : { overview: "", sections: {} };
      const meanwhile = timelineCall ? whileWriting : null;
      if (meanwhile) whileWriting = null;
      return void Promise.resolve(meanwhile?.()).then(() => send("application/json", JSON.stringify({ id: `stub-${Date.now()}`, choices: [{ message: { content: JSON.stringify(answer) } }], usage: { prompt_tokens: 1, completion_tokens: 1 } })));
    }
    res.writeHead(500);
    res.end("unexpected");
  });
});

before(async () => {
  await new Promise<void>((resolve) => stub.listen(0, "127.0.0.1", () => resolve()));
  const base = `http://127.0.0.1:${(stub.address() as { port: number }).port}`;
  config.allowPrivateNetworkFetch = true;
  config.modelCallsEnabled = true;
  delete process.env.LINHA_DO_TEMPO_MODEL;
  Object.assign(process.env, {
    PUBMED_BASE_URL: `${base}/eutils`, ICITE_BASE_URL: `${base}/icite`, LLM_BASE_URL: `${base}/v1`, LLM_API_KEY: "test-key", LLM_MODEL: "one-model",
    DEEPSEEK_BASE_URL: `${base}/v1`, DEEPSEEK_API_KEY: "test-key",
  });
  installModules([server]);
  await sql`INSERT INTO sources (id, name, kind, tier) VALUES (${SOURCE}, 'Especiais', 'rss', 'T1')`;
});

after(async () => {
  await new Promise<void>((resolve) => stub.close(() => resolve()));
  await stopBoss();
  await closeDb();
});

const version = async (id: number) => (await especialDetail(id))!.version;
const row = async (id: number) => (await sql`SELECT * FROM literatura_especiais WHERE id = ${id}`)[0]!;
/** The worker's writing as the latest request asked it. */
const write = async (id: number) => writeEspecial(id, await version(id));

test("a special reaches the site only through the editor's approval and publication; the check takes out what its studies do not support", async () => {
  const { id } = await createEspecial({ format: "linha-do-tempo", theme: "Estenose subglótica pediátrica", query: "subglottic stenosis" }, EDITOR);
  assert.equal((await row(id)).status, "rascunho");
  assert.equal((await row(id)).writing, "pendente");
  const [job] = await sql`SELECT 1 FROM pgboss.job WHERE name = 'literatura.especial' AND data->>'id' = ${String(id)}`;
  assert.ok(job, "the writing waits for the worker; the api never calls the model");
  await assert.rejects(approveEspecial(id, { version: await version(id) }, EDITOR), Conflict, "a draft not yet written cannot be approved");

  assert.deepEqual(await write(id), { id, result: "escrito" });
  const written = (await especialDetail(id))!;
  assert.equal(written.writing, "pronto");
  assert.deepEqual(written.refs.map((r) => [r.n, r.pmid, r.year]), [[1, "5000001", "1965"], [2, "7000002", "1994"], [3, "9000003", "2020"]], "the studies are numbered oldest first");
  assert.match(modelInputs.at(-1)!, /\[1\] 1965 · Primeiras descrições · .* · citado 31 vezes/);
  assert.match(modelInputs.at(-1)!, /\[2\] 1994 · .* · citado 662 vezes/, "the model reads how often each study is cited");
  assert.match(written.body!, /^## 1994 · A classificação\n\nMyer e Cotton propuseram quatro graus \[2\]\.$/m);
  assert.match(written.body!, /^## Onde estamos hoje\n\nUma metanálise/m);
  assert.doesNotMatch(written.body!, /Boston|Sem fonte/);
  assert.deepEqual(written.discarded.map((d) => d.text).sort(), ["Sem fonte nenhuma.", "Uma série de Boston confirmou a classificação [2]."]);
  assert.deepEqual(written.warnings, []);
  assert.equal(await write(id).then((r) => r.result), "nada a escrever", "a written draft is not written (and paid for) again");

  // Nothing is on the site yet.
  assert.equal((await publishedEspeciais()).some((e) => e.title === written.title), false);
  await assert.rejects(publishEspecial(id, { version: written.version }, EDITOR), Conflict, "a draft cannot be published without approval");

  // The editor's edits: an older view is refused; the check reads the saved text.
  await assert.rejects(editEspecial(id, { version: "2000-01-01T00:00:00.000Z", title: "Outro título", dek: "", body: "x [1]." }, EDITOR), Conflict);
  // The editor takes out the only passage citing study 2 and adds one the studies do not support.
  const body = `${written.body!.replace(/^Myer e Cotton .*\n\n/m, "")}\n\nUm achado de 45,2% [1].`;
  await editEspecial(id, { version: written.version, title: written.title, dek: written.dek, body }, EDITOR);
  const edited = (await especialDetail(id))!;
  assert.deepEqual(edited.warnings.map((w) => w.text), ["Um achado de 45,2% [1]."]);

  await approveEspecial(id, { version: edited.version }, EDITOR);
  const approved = (await especialDetail(id))!;
  assert.equal(approved.status, "aprovado");
  assert.equal(approved.approvedBy, EDITOR);
  await assert.rejects(editEspecial(id, { version: approved.version, title: "Mudado", dek: "", body: "x [1]." }, EDITOR), Conflict, "an approved text is fixed");
  await assert.rejects(rewriteEspecial(id, { version: approved.version, theme: "x tema", query: "x busca" }, EDITOR), Conflict);
  assert.equal((await publishedEspeciais()).some((e) => e.title === written.title), false, "approved is not published");

  // Back to draft needs a new approval.
  await reopenEspecial(id, { version: approved.version }, EDITOR);
  assert.equal((await row(id)).status, "rascunho");
  assert.equal((await row(id)).approved_by, null);
  await approveEspecial(id, { version: await version(id), reason: "revisado" }, EDITOR);

  const { slug } = (await publishEspecial(id, { version: await version(id) }, EDITOR))!;
  assert.equal(slug, "estenose-subglotica-pediatrica-de-1965-a-metanalise-de-2020");
  const page = (await publishedEspecial(slug))!;
  assert.equal(page.title, written.title);
  assert.deepEqual(page.refs.map((r) => [r.n, r.pmid]), [[1, "5000001"], [2, "9000003"]], "the page lists the studies the text cites, numbered again");
  assert.match(page.body, /87,5% \[2\]\./);
  assert.equal(page.refCount, 2);
  assert.equal("abstract" in page.refs[0]!, false, "the page does not republish the abstracts");
  assert.equal("citations" in page.refs[0]!, false);
  assert.match((await especialDetail(id))!.body!, /87,5% \[3\]\./, "the approved text keeps the list's numbers");
  assert.ok((await publishedEspeciais()).some((e) => e.slug === slug));
  await assert.rejects(publishEspecial(id, { version: await version(id) }, EDITOR), Conflict);

  await assert.rejects(discardEspecial(id, { version: await version(id), reason: "" }, EDITOR), /reason/, "taking one off the site needs a reason");
  await discardEspecial(id, { version: await version(id), reason: "erro na referência 2" }, EDITOR);
  assert.equal(await publishedEspecial(slug), null, "a discarded special leaves the site");
  assert.deepEqual((await especialDetail(id))!.history.map((h) => h.action).reverse(), [
    "especial.create", "especial.edit", "especial.approve", "especial.reopen", "especial.approve", "especial.publish", "especial.discard",
  ]);
});

test("a writing that fails is recorded on the draft, which can then be written again", async () => {
  const { id } = await createEspecial({ format: "linha-do-tempo", theme: "Tema sem estudos", query: "nothing at all" }, EDITOR);
  pubmedEmpty = true;
  try {
    assert.equal((await write(id)).result, "falhou");
  } finally {
    pubmedEmpty = false;
  }
  const failed = (await especialDetail(id))!;
  assert.equal(failed.writing, "falhou");
  assert.match(failed.error!, /nenhum estudo/);
  await rewriteEspecial(id, { version: failed.version, theme: "Estenose subglótica pediátrica", query: "subglottic stenosis" }, EDITOR);
  assert.equal((await row(id)).writing, "pendente");
  assert.equal((await write(id)).result, "escrito");
});

test("the PMIDs the editor requires join the list even when the search does not find them; one PubMed lacks fails the writing, saying which", async () => {
  await assert.rejects(createEspecial({ format: "linha-do-tempo", theme: "Estenose subglótica pediátrica", query: "subglottic stenosis", pmids: ["PMID 6000004"] }, EDITOR), /dígitos/);
  const { id } = await createEspecial({ format: "linha-do-tempo", theme: "Estenose subglótica pediátrica", query: "subglottic stenosis", pmids: ["6000004", "6000004"] }, EDITOR);
  assert.deepEqual((await especialDetail(id))!.pmids, ["6000004"]);
  assert.equal((await write(id)).result, "escrito");
  const written = (await especialDetail(id))!;
  assert.deepEqual(written.refs.map((r) => [r.n, r.pmid, r.year, r.citations]), [[1, "5000001", "1965", 31], [2, "6000004", "1980", 166], [3, "7000002", "1994", 662], [4, "9000003", "2020", 63]]);

  await rewriteEspecial(id, { version: written.version, theme: written.theme, query: written.query, pmids: ["6000004", "8888888"] }, EDITOR);
  assert.equal((await write(id)).result, "falhou");
  const failed = (await especialDetail(id))!;
  assert.match(failed.error!, /8888888/);
  assert.deepEqual(failed.pmids, ["6000004", "8888888"]);
  assert.deepEqual((failed.history.at(0)!.after as { pmids: string[] }).pmids, ["6000004", "8888888"], "the audit keeps the PMIDs");

  await rewriteEspecial(id, { version: failed.version, theme: written.theme, query: written.query, pmids: ["6000005"] }, EDITOR);
  assert.equal((await write(id)).result, "falhou");
  assert.match((await especialDetail(id))!.error!, /6000005 \(erratum\)/, "an erratum is not dropped in silence");
});

test("with iCite out, the draft is written without citation counts, and the panel says iCite did not answer", async () => {
  const { id } = await createEspecial({ format: "linha-do-tempo", theme: "Estenose subglótica pediátrica", query: "subglottic stenosis" }, EDITOR);
  iciteDown = true;
  const asked = modelInputs.length;
  try {
    assert.equal((await write(id)).result, "escrito");
  } finally {
    iciteDown = false;
  }
  const written = (await especialDetail(id))!;
  assert.deepEqual(written.refs.map((r) => [r.pmid, r.citations]), [["5000001", undefined], ["7000002", undefined], ["9000003", undefined]]);
  assert.equal(written.refs[0]!.kind, "Primeiras descrições");
  assert.doesNotMatch(modelInputs.slice(asked).join("\n"), /citado/);
  assert.match(written.discarded.find((t) => t.text === "iCite")!.reason, /não respondeu \(iCite HTTP 503\)/);
});

const liveJobs = async (id: number) =>
  (await sql`SELECT id FROM pgboss.job WHERE name = ${ESPECIAL_QUEUE.name} AND data->>'id' = ${String(id)} AND state IN ('created', 'retry')`).map((j) => j.id as string);

test("a draft still being written can be asked again; the writing asked before leaves the new request alone", async () => {
  const { id } = await createEspecial({ format: "linha-do-tempo", theme: "Tema que não termina", query: "old search" }, EDITOR);
  const first = await version(id);
  // The first writing is still running when the editor asks again with another search.
  whileWriting = async () => { await rewriteEspecial(id, { version: first, theme: "Estenose subglótica pediátrica", query: "subglottic stenosis" }, EDITOR); };
  assert.equal((await writeEspecial(id, first)).result, "descartado ou pedido de novo enquanto era escrito");
  const r = await row(id);
  assert.equal(r.writing, "pendente");
  assert.equal(r.title, null, "the old search's text is not kept");
  assert.equal(r.query, "subglottic stenosis");
  assert.equal((await writeEspecial(id, first)).result, "nada a escrever", "the old writing's retry does not pay again");
  assert.equal((await liveJobs(id)).length, 2, "the new request is queued beside the old one");
  assert.equal((await write(id)).result, "escrito");
});

test("a writing whose every attempt is cut short marks the draft failed, which can then be written again", async () => {
  const { id } = await createEspecial({ format: "linha-do-tempo", theme: "Tema interrompido", query: "subglottic stenosis" }, EDITOR);
  const boss = await getBoss();
  // Each attempt taken and cut short (a stopped worker, the expiry): the job fails without the draft being touched.
  for (let attempt = 0; attempt < 2; attempt++) {
    const [waiting] = await liveJobs(id);
    assert.ok(waiting, `attempt ${attempt + 1} is waiting`);
    await sql`UPDATE pgboss.job SET start_after = now() WHERE id = ${waiting}`;
    const taken = await boss.fetch<{ id: number; version: string }>(ESPECIAL_QUEUE.name, { batchSize: 100 });
    const others = taken.filter((j) => j.data.id !== id).map((j) => j.id);
    if (others.length) await boss.complete(ESPECIAL_QUEUE.name, others);
    assert.ok(taken.some((j) => j.id === waiting));
    await boss.fail(ESPECIAL_QUEUE.name, waiting!);
    assert.equal((await row(id)).writing, "pendente");
  }
  assert.deepEqual(await liveJobs(id), [], "no attempt is left");
  const dead = (await boss.fetch<{ id: number; version: string }>(ESPECIAL_FAILED_QUEUE.name, { batchSize: 50 })).find((j) => j.data.id === id);
  assert.ok(dead, "the exhausted writing reaches the dead letter queue");
  await ESPECIAL_FAILED_QUEUE.run([dead.data]);
  const failed = (await especialDetail(id))!;
  assert.equal(failed.writing, "falhou");
  assert.match(failed.error!, /interrompida/);
  await rewriteEspecial(id, { version: failed.version, theme: failed.theme, query: failed.query }, EDITOR);
  await ESPECIAL_FAILED_QUEUE.run([dead.data]);
  assert.equal((await row(id)).writing, "pendente", "the old writing's end does not fail the new request");
  assert.equal((await write(id)).result, "escrito");
  await ESPECIAL_FAILED_QUEUE.run([{ id, version: await version(id) }]);
  assert.equal((await row(id)).writing, "pronto", "a written draft is not marked failed");
});

test("with collection off, the writing fails before asking PubMed", async () => {
  const { id } = await createEspecial({ format: "linha-do-tempo", theme: "Estenose subglótica pediátrica", query: "subglottic stenosis" }, EDITOR);
  const asked = pubmedRequests;
  const collect = process.env.COLLECT_ENABLED;
  process.env.COLLECT_ENABLED = "false";
  try {
    assert.equal((await write(id)).result, "falhou");
  } finally {
    process.env.COLLECT_ENABLED = collect;
  }
  assert.equal(pubmedRequests, asked);
  const failed = (await especialDetail(id))!;
  assert.equal(failed.writing, "falhou");
  assert.match(failed.error!, /COLLECT_ENABLED/);
});

/** A selected item in the window of the daily dated `date`, and that daily. */
async function daily(date: string) {
  const id = `especiais-${tag()}`;
  const at = editionAt("daily", date, -12 * 3600);
  await sql`INSERT INTO articles (id, source_id, identity_key, url, title, discovered_at, timeline_at)
    VALUES (${id}, ${SOURCE}, ${id}, 'https://example.com/especiais', ${id}, ${at}, ${at})`;
  await sql`INSERT INTO publications (article_id, title, source_id, channel, url, discovered_at, timeline_at, sort_at, eligible, selected, visible_after, visibility, score)
    VALUES (${id}, ${id}, ${SOURCE}, 'news', 'https://example.com/especiais', ${at}, ${at}, ${at}, true, true, ${at}, 'public', 90)`;
  await composeDaily(date);
}

/** A published special, as the admin leaves one. */
async function published(title: string, at: string) {
  const [r] = await sql<{ id: number }[]>`INSERT INTO literatura_especiais (format, theme, query, status, writing, title, body, slug, created_by, approved_by, approved_at, published_at)
    VALUES ('linha-do-tempo', 'Tema', 'busca', 'publicado', 'pronto', ${title}, 'Texto [1].', ${`${title}-${T}`.toLowerCase()}, ${EDITOR}, ${EDITOR}, ${at}, ${at}) RETURNING id`;
  return r!.id;
}

const carried = async (key: string) => (await sql`SELECT content->'modules' AS modules FROM reports WHERE kind = 'weekly' AND key = ${key}`)[0]!.modules;

test("the first weekly due after a special's publication carries it, one per issue; an issue without one is as before; one that leaves the site leaves the issue", async () => {
  await sql`UPDATE literatura_especiais SET status = 'descartado' WHERE status = 'publicado'`;
  // W05 (29/01–04/02/2024) comes out on 05/02; W06 on 12/02; W04 on 29/01.
  const a = await published("Primeiro", "2024-02-01T12:00:00Z");
  const b = await published("Segundo", "2024-02-02T12:00:00Z");
  const c = await published("Terceiro", "2024-02-10T12:00:00Z");
  await daily("2024-01-25");
  await daily("2024-02-02");
  await daily("2024-02-07");

  await composeWeekly("2024-W05");
  assert.deepEqual(await carried("2024-W05"), { literatura: { id: a } });
  const w05 = (await loadReport("weekly", "2024-W05"))!;
  assert.deepEqual(w05.modules, { literatura: { slug: `primeiro-${T}`, format: "linha-do-tempo", formatName: "Linha do tempo", title: "Primeiro", dek: null, publishedAt: "2024-02-01T12:00:00.000Z", refCount: 0 } });

  await composeWeekly("2024-W06");
  assert.deepEqual(await carried("2024-W06"), { literatura: { id: b } }, "the second special waits for the next issue");

  await composeWeekly("2024-W04");
  assert.equal(await carried("2024-W04"), null, "an issue filled in late does not take a special published after it was due");
  const w04 = (await loadReport("weekly", "2024-W04"))!;
  assert.deepEqual(w04.modules, {});
  assert.ok(w04.sections.length > 0, "an issue without a special reads as before");
  assert.equal((await sql`SELECT issue_key FROM literatura_especiais WHERE id = ${c}`)[0]!.issue_key, null);
  assert.equal((await sql`SELECT content ? 'modules' AS has FROM reports WHERE kind = 'daily' AND key = '2024-02-02'`)[0]!.has, false, "dailies carry no special");

  await composeWeekly("2024-W05", "editor correction");
  assert.deepEqual(await carried("2024-W05"), { literatura: { id: a } }, "an issue written again keeps its special");

  await sql`UPDATE literatura_especiais SET status = 'descartado' WHERE id = ${a}`;
  assert.deepEqual((await loadReport("weekly", "2024-W05"))!.modules, {}, "a special off the site is off the issue");
});
