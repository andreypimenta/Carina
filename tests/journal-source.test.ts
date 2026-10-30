// A paper is shown as coming from the journal that published it (its material's raw.journal), not from the
// search that found it. Failure cases: an issue written before the change keeping the source it froze; the
// article page or the availability read naming the search; a paper with no journal losing its
// source; PubMed's title shown as PubMed writes it.
import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { publishArticle } from "@aihot/backend/publication/publish";
import { loadReport } from "@aihot/backend/publication/reports";
import { loadItemDetail } from "@aihot/backend/publication/detail";
import { itemAvailability } from "@aihot/backend/publication/availability";
import { journalName } from "@aihot/backend/publication/rules";

const T = tag();
const SOURCE = `journal-source-${T}`;
const SEARCH = "PubMed · matérias do Fôlego";
const WEEK = "2098-W21";
after(async () => {
  await stopBoss();
  await closeDb();
});

let withJournal: string;
let withoutJournal: string;
async function paper(n: number, raw: Record<string, unknown>) {
  const { articleId } = await upsertMaterial({ sourceId: SOURCE, url: `https://doi.org/10.1000/${T}.${n}`, title: `Paper ${n} ${T}`, bodyText: "b", bodyHtml: "<p>b</p>",
    bodyStatus: "ok", via: "literatura", publishedAt: new Date(), raw });
  await sql`INSERT INTO analyses (article_id, input_revision, origin, relevance, category, title_zh, summary_zh, score, selected)
            VALUES (${articleId}, 1, 'rule', 'pass', 'industry', ${`Matéria ${n} ${T}`}, ${`Resumo ${n}`}, 80, true)`;
  await publishArticle(articleId, { releasedAt: new Date() });
  return articleId;
}

before(async () => {
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, next_fetch_at) VALUES (${SOURCE}, ${SEARCH}, 'rss', 'T2', 'editorial', '2100-01-01')`;
  withJournal = await paper(1, { pmid: "1", journal: "The New England journal of medicine" });
  withoutJournal = await paper(2, { pmid: "2" });
});

test("PubMed's journal titles read as the journal's name", () => {
  assert.equal(journalName("The New England journal of medicine"), "The New England Journal of Medicine");
  assert.equal(journalName("Lancet (London, England)"), "Lancet");
  assert.equal(journalName("BMJ (Clinical research ed.)"), "BMJ");
  assert.equal(journalName("JAMA pediatrics"), "JAMA Pediatrics");
  assert.equal(journalName("Jornal brasileiro de pneumologia : publicacao oficial da Sociedade Brasileira de Pneumologia"),
    "Jornal Brasileiro de Pneumologia : Publicacao Oficial da Sociedade Brasileira de Pneumologia");
});

test("an issue cites a paper by its journal, even one that froze the search as its source", async () => {
  const ref = (itemId: string) => ({ itemId, title: itemId, sourceName: SEARCH, sourceId: SOURCE, firstParty: false, sourceUrl: "https://doi.org/x" });
  const content = { kind: "weekly", title: "Semanal", overview: "o", themes: [{ heading: "h", summary: "s", storyRefs: [ref(withJournal), ref(withoutJournal)] }] };
  await sql`INSERT INTO reports (kind, key, window_start, window_end, content, generated_at, origin)
            VALUES ('weekly', ${WEEK}, now(), now(), ${sql.json(content as never)}, now(), 'imported')`;
  const items = (await loadReport("weekly", WEEK))?.sections[0]?.items ?? [];
  assert.deepEqual(items.map((c) => c.sourceName), ["The New England Journal of Medicine", SEARCH]);
});

test("the article page and the availability read name the journal", async () => {
  const detail = await loadItemDetail(withJournal);
  assert.equal(detail.kind === "found" ? detail.item.source.name : detail.kind, "The New England Journal of Medicine");
  const other = await loadItemDetail(withoutJournal);
  assert.equal(other.kind === "found" ? other.item.source.name : other.kind, SEARCH);
  const availability = await itemAvailability([withJournal, withoutJournal]);
  assert.deepEqual([availability[withJournal]?.sourceName, availability[withoutJournal]?.sourceName], ["The New England Journal of Medicine", SEARCH]);
});
