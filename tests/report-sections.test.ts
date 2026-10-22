// Failure cases: a Brazilian item appears both in "Do Brasil" and in its category's section; cases and
// reviews share one section again; the sections leave the pack's order in a daily or in a weekly.
import { editionAt, stub, tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { isoWeekLabel } from "@aihot/contracts/time";
import { closeDb, sql } from "@aihot/backend/db";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { composeDaily, composeWeekly } from "@aihot/backend/reports/compose";
import { sectionOf, SECTION_ORDER } from "@aihot/backend/reports/edition";

const provider = await stub(() => ({ choices: [{ message: { content: JSON.stringify({ overview: "", sections: {} }) } }] }));
process.env.DEEPSEEK_BASE_URL = `${provider.url}/v1`;
process.env.DEEPSEEK_API_KEY = "test-key";
after(async () => { await provider.close(); await stopBoss(); await closeDb(); });

test("the tag sections open the issue, then each category's section in the pack's order", () => {
  assert.deepEqual(SECTION_ORDER, [
    "Do Brasil", "Estudos clínicos", "Diretrizes e regulação", "Técnica e inovação", "Casos curiosos", "Fundamentos", "Opinião e debate", "Sociedades e eventos",
  ]);
  assert.equal(sectionOf("cases", ["Relato de caso"]), "Casos curiosos");
  assert.equal(sectionOf("reviews", ["Revisão narrativa"]), "Fundamentos");
  assert.equal(sectionOf("evidence", ["Estudo observacional", "Brasil"]), "Do Brasil");
  assert.equal(sectionOf(null, ["Brasil"]), "Do Brasil");
  assert.equal(sectionOf(null, []), "Sociedades e eventos");
});

/** A selected item from a source of its own, `hours` before the edition time of the daily dated `date`. */
async function item(date: string, hours: number, category: string, tags: string[]) {
  const id = `sections-${tag()}`;
  const at = editionAt("daily", date, -hours * 3600);
  await sql`INSERT INTO sources (id, name, kind, tier) VALUES (${id}, ${id}, 'rss', 'T1')`;
  await sql`INSERT INTO articles (id, source_id, identity_key, url, title, discovered_at, timeline_at)
    VALUES (${id}, ${id}, ${id}, ${`https://example.com/${id}`}, ${id}, ${at}, ${at})`;
  await sql`INSERT INTO publications (article_id, title, source_id, channel, url, discovered_at, timeline_at, sort_at, eligible, selected, visible_after, visibility, score, category, tags)
    VALUES (${id}, ${id}, ${id}, 'news', ${`https://example.com/${id}`}, ${at}, ${at}, ${at}, true, true, ${at}, 'public', 80, ${category}, ${tags})`;
  return id;
}

test("dailies and weeklies put every item in one section, Brazilian ones in Do Brasil, in the pack's order", async () => {
  const [monday, tuesday] = ["2031-06-02", "2031-06-03"];
  const ids = {
    brazilianStudy: await item(monday, 10, "evidence", ["Estudo observacional", "Brasil", "Estenose subglótica"]),
    study: await item(monday, 9, "evidence", ["Ensaio clínico"]),
    caseReport: await item(monday, 8, "cases", ["Relato de caso"]),
    review: await item(monday, 7, "reviews", ["Revisão narrativa"]),
    brazilianRule: await item(tuesday, 10, "guidelines", ["Regulação", "Brasil"]),
    brazilianReview: await item(tuesday, 9, "reviews", ["Revisão narrativa", "Brasil"]),
    society: await item(tuesday, 8, "industry", ["Sociedades/eventos"]),
  };
  const expected = [
    { label: "Do Brasil", items: [ids.brazilianStudy, ids.brazilianRule, ids.brazilianReview] },
    { label: "Estudos clínicos", items: [ids.study] },
    { label: "Casos curiosos", items: [ids.caseReport] },
    { label: "Fundamentos", items: [ids.review] },
    { label: "Sociedades e eventos", items: [ids.society] },
  ];
  const sorted = (groups: Array<{ label: string; items: string[] }>) => groups.map((g) => ({ label: g.label, items: [...g.items].sort() }));

  await composeDaily(monday);
  await composeDaily(tuesday);
  const dailies = await sql<{ content: { sections: Array<{ label: string; items: Array<{ itemId: string }> }> } }[]>`
    SELECT content FROM reports WHERE kind = 'daily' AND key IN (${monday}, ${tuesday}) ORDER BY key`;
  const daily = dailies.map((d) => d.content.sections.map((s) => ({ label: s.label, items: s.items.map((i) => i.itemId) })));
  assert.deepEqual(sorted(daily[0]!), sorted([
    { label: "Do Brasil", items: [ids.brazilianStudy] },
    { label: "Estudos clínicos", items: [ids.study] },
    { label: "Casos curiosos", items: [ids.caseReport] },
    { label: "Fundamentos", items: [ids.review] },
  ]));
  assert.deepEqual(sorted(daily[1]!), sorted([
    { label: "Do Brasil", items: [ids.brazilianRule, ids.brazilianReview] },
    { label: "Sociedades e eventos", items: [ids.society] },
  ]));

  const week = isoWeekLabel(monday);
  await composeWeekly(week);
  const [weekly] = await sql<{ content: { themes: Array<{ heading: string; storyRefs: Array<{ itemId: string }> }> } }[]>`
    SELECT content FROM reports WHERE kind = 'weekly' AND key = ${week}`;
  const themes = weekly!.content.themes.map((t) => ({ label: t.heading, items: t.storyRefs.map((r) => r.itemId) }));
  assert.deepEqual(sorted(themes), sorted(expected));
  assert.equal(new Set(themes.flatMap((t) => t.items)).size, Object.keys(ids).length);
});
