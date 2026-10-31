// Failure cases: an item appears in no section or in both; an item published before sections existed has
// none; the sections leave the pack's order; pulmonology crowds the surgical and airway core out of a daily
// or a weekly; a section's cap shrinks an issue the other section cannot fill; the site's section filter
// lets the other section through.
import { editionAt, stub, tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { isoWeekLabel } from "@aihot/contracts/time";
import { AREAS, TOPIC_TAGS } from "@aihot/industry/taxonomy";
import { closeDb, sql } from "@aihot/backend/db";
import { areaOf } from "@aihot/backend/editorial/vocabulary";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { loadPool } from "@aihot/backend/publication/pool";
import { loadTimeline } from "@aihot/backend/publication/timeline";
import { composeDaily, composeWeekly } from "@aihot/backend/reports/compose";
import { MAIN_ENTRIES, sectionOf, SECTION_ORDER, takeBySection } from "@aihot/backend/reports/edition";

const provider = await stub(() => ({ choices: [{ message: { content: JSON.stringify({ overview: "", sections: {} }) } }] }));
process.env.DEEPSEEK_BASE_URL = `${provider.url}/v1`;
process.env.DEEPSEEK_API_KEY = "test-key";
after(async () => { await provider.close(); await stopBoss(); await closeDb(); });

const SURGERY = "Cirurgia torácica pediátrica e via aérea";
const PULMONOLOGY = "Pneumologia pediátrica";

test("the two sections, in order; an item without one takes it from its first section tag, else the core", () => {
  assert.deepEqual(SECTION_ORDER, [SURGERY, PULMONOLOGY]);
  for (const a of AREAS) for (const t of a.tags) assert.ok((TOPIC_TAGS as readonly string[]).includes(t), `${t} is a topic tag`);
  assert.equal(sectionOf("pneumologia", ["Estudo observacional", "Estenose subglótica"]), PULMONOLOGY);
  assert.equal(sectionOf(null, ["Estudo observacional", "Brasil", "Fibrose cística", "Traqueostomia"]), PULMONOLOGY);
  assert.equal(sectionOf(null, ["Relato de caso", "Traqueostomia", "Fibrose cística"]), SURGERY);
  assert.equal(sectionOf(null, ["Revisão narrativa"]), SURGERY);
  assert.equal(areaOf("outra", []), "cirurgia");
});

test("a section's cap keeps the core's places, and gives them back when the core has no more", () => {
  const ranked = (areas: string[]) => areas.map((area, i) => ({ id: `${area}-${i}`, area }));
  const pickArea = (e: { area: string }) => e.area;
  const crowded = ranked([...Array(14).fill("pneumologia"), ...Array(6).fill("cirurgia")]);
  const daily = takeBySection(crowded, MAIN_ENTRIES, "daily", pickArea);
  assert.equal(daily.taken.length, MAIN_ENTRIES);
  assert.equal(daily.taken.filter((e) => e.area === "pneumologia").length, 10, "6 within the cap, 4 more once the core ran out");
  assert.equal(daily.taken.filter((e) => e.area === "cirurgia").length, 6);
  assert.deepEqual(daily.taken.map((e) => e.id), [...daily.taken].sort((a, b) => crowded.indexOf(a) - crowded.indexOf(b)).map((e) => e.id), "rank order");
  const both = ranked([...Array(14).fill("pneumologia"), ...Array(14).fill("cirurgia")]);
  const capped = takeBySection(both, 20, "weekly", pickArea);
  assert.equal(capped.taken.filter((e) => e.area === "pneumologia").length, 8);
  assert.equal(capped.taken.filter((e) => e.area === "cirurgia").length, 12);
  assert.equal(capped.left.length, both.length - 20);
});

/** A selected item from a source of its own, `hours` before the edition time of the daily dated `date`. */
async function item(date: string, hours: number, area: string | null, tags: string[], score = 80) {
  const id = `sections-${tag()}`;
  const at = editionAt("daily", date, -hours * 3600);
  await sql`INSERT INTO sources (id, name, kind, tier) VALUES (${id}, ${id}, 'rss', 'T1')`;
  await sql`INSERT INTO articles (id, source_id, identity_key, url, title, discovered_at, timeline_at)
    VALUES (${id}, ${id}, ${id}, ${`https://example.com/${id}`}, ${id}, ${at}, ${at})`;
  await sql`INSERT INTO publications (article_id, title, source_id, channel, url, discovered_at, timeline_at, sort_at, eligible, selected, visible_after, visibility, score, category, area, tags)
    VALUES (${id}, ${id}, ${id}, 'news', ${`https://example.com/${id}`}, ${at}, ${at}, ${at}, true, true, ${at}, 'public', ${score}, 'evidence', ${area}, ${tags})`;
  return id;
}

test("dailies and weeklies put every item in one of the two sections, the core first", async () => {
  const [monday, tuesday] = ["2031-06-02", "2031-06-03"];
  const ids = {
    airway: await item(monday, 10, "cirurgia", ["Estudo observacional", "Estenose subglótica"]),
    cf: await item(monday, 9, "pneumologia", ["Ensaio clínico", "Fibrose cística"]),
    unsorted: await item(monday, 8, null, ["Relato de caso", "Displasia broncopulmonar"]),
    pectus: await item(tuesday, 10, null, ["Técnica cirúrgica", "Pectus"]),
    society: await item(tuesday, 9, null, ["Sociedades/eventos"]),
  };
  const sorted = (groups: Array<{ label: string; items: string[] }>) => groups.map((g) => ({ label: g.label, items: [...g.items].sort() }));

  await composeDaily(monday);
  await composeDaily(tuesday);
  const dailies = await sql<{ content: { sections: Array<{ label: string; items: Array<{ itemId: string }> }> } }[]>`
    SELECT content FROM reports WHERE kind = 'daily' AND key IN (${monday}, ${tuesday}) ORDER BY key`;
  const daily = dailies.map((d) => d.content.sections.map((s) => ({ label: s.label, items: s.items.map((i) => i.itemId) })));
  assert.deepEqual(sorted(daily[0]!), sorted([
    { label: SURGERY, items: [ids.airway] },
    { label: PULMONOLOGY, items: [ids.cf, ids.unsorted] },
  ]));
  assert.deepEqual(sorted(daily[1]!), sorted([{ label: SURGERY, items: [ids.pectus, ids.society] }]));

  const week = isoWeekLabel(monday);
  await composeWeekly(week);
  const [weekly] = await sql<{ content: { themes: Array<{ heading: string; storyRefs: Array<{ itemId: string }> }> } }[]>`
    SELECT content FROM reports WHERE kind = 'weekly' AND key = ${week}`;
  const themes = weekly!.content.themes.map((t) => ({ label: t.heading, items: t.storyRefs.map((r) => r.itemId) }));
  assert.deepEqual(sorted(themes), sorted([
    { label: SURGERY, items: [ids.airway, ids.pectus, ids.society] },
    { label: PULMONOLOGY, items: [ids.cf, ids.unsorted] },
  ]));
});

test("a busy pulmonology day leaves the core its places in the daily", async () => {
  const day = "2031-07-08";
  const pulmonology = await Promise.all(Array.from({ length: 14 }, (_, i) => item(day, 2 + i * 0.5, "pneumologia", ["Ensaio clínico", "Fibrose cística"], 95)));
  const surgery = await Promise.all(Array.from({ length: 10 }, (_, i) => item(day, 1 + i * 0.5, "cirurgia", ["Estudo observacional", "Traqueostomia"], 70)));
  await composeDaily(day);
  const [issue] = await sql<{ content: { sections: Array<{ label: string; items: Array<{ itemId: string }> }>; flashes: Array<{ itemId: string }> } }[]>`
    SELECT content FROM reports WHERE kind = 'daily' AND key = ${day}`;
  const section = (label: string) => issue!.content.sections.find((s) => s.label === label)?.items.map((i) => i.itemId) ?? [];
  assert.equal(section(PULMONOLOGY).length, 6);
  assert.equal(section(SURGERY).length, MAIN_ENTRIES - 6);
  assert.ok(section(PULMONOLOGY).every((id) => pulmonology.includes(id)));
  assert.ok(section(SURGERY).every((id) => surgery.includes(id)));
  assert.ok(issue!.content.flashes.some((f) => pulmonology.includes(f.itemId)), "the rest of pulmonology is still in the flashes");
});

test("the site's lists filter by section", async () => {
  const day = "2031-08-12";
  const label = `abas-${tag()}`;
  const core = await item(day, 3, "cirurgia", ["Estudo observacional", label]);
  const lung = await item(day, 2, "pneumologia", ["Estudo observacional", label]);
  const now = editionAt("daily", day, 3600);
  const pool = async (area: "cirurgia" | "pneumologia" | null) =>
    (await loadPool({ channel: "all", category: null, area, tag: label, now })).items.map((i) => i.id).sort();
  assert.deepEqual(await pool(null), [core, lung].sort());
  assert.deepEqual(await pool("cirurgia"), [core]);
  assert.deepEqual(await pool("pneumologia"), [lung]);
  const timeline = await loadTimeline({ channel: "all", category: null, area: "pneumologia", tag: label, now });
  assert.deepEqual(timeline.cards.map((c) => c.item.id), [lung]);
  assert.equal(timeline.filters.area, "pneumologia");
});
