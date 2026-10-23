// Failure cases: a daily carries more than two main entries from one news source; the PubMed sources, where
// every entry is a different paper, are held to two and push the week's papers out of the weekly.
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { closeDb } from "@aihot/backend/db";
import { arrangeDaily, MAIN_ENTRIES, type EditionEntry } from "@aihot/backend/reports/edition";
import { UNCAPPED_SOURCES } from "@aihot/industry/taxonomy";

after(closeDb);

function entry(itemId: string, sourceId: string, importance: number): EditionEntry {
  return {
    entry: { itemId, factId: null, storyPublicId: null, title: itemId, summary: "", sourceName: sourceId, sourceUrl: `https://example.com/${itemId}`,
      sourceId, firstParty: true, role: "imprensa", score: importance, publishedAt: "2031-06-02T10:00:00.000Z", sources: 1 },
    category: "evidence", tags: [], storyId: null, mentions: new Set(), sourceIds: new Set([sourceId]), authority: 0, importance, previous: null,
  };
}

test("a news source leads at most two main entries; the PubMed sources lead as many as the daily has room for", () => {
  assert.deepEqual([...UNCAPPED_SOURCES].sort(), ["literatura-integral", "literatura-materia"]);
  const entries = [
    ...[1, 2, 3, 4].map((i) => entry(`news-${i}`, "rss-news", 100 - i)),
    ...[1, 2, 3, 4, 5, 6, 7].map((i) => entry(`materia-${i}`, "literatura-materia", 90 - i)),
    ...[1, 2, 3].map((i) => entry(`integral-${i}`, "literatura-integral", 80 - i)),
  ];
  const { main, flashes } = arrangeDaily(entries);
  const ids = main.map((e) => e.entry.itemId);
  assert.equal(main.length, MAIN_ENTRIES);
  assert.deepEqual(ids.filter((id) => id.startsWith("news-")), ["news-1", "news-2"]);
  assert.equal(ids.filter((id) => id.startsWith("materia-")).length, 7);
  assert.equal(ids.filter((id) => id.startsWith("integral-")).length, 3);
  assert.deepEqual(flashes.map((e) => e.entry.itemId).filter((id) => id.startsWith("news-")), ["news-3", "news-4"]);
});
