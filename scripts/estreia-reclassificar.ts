// One-off for the launch: items of the first collection marked as history (a new source's first import, or
// stale on discovery) that the editor chose are news again, so the dailies and the weekly carry them. Only
// the ids given are touched, in this order, each in its own transaction:
//   --deselect: Seleção = não, as the admin's manual correction does it (overrideFields, same audit);
//   the ids given bare or in --ids-file (one per line, # comments): backfill off, timeline_at = discovered_at,
//     republished and audited;
//   --select: Seleção = sim, as the admin does it; released now, like a selection by the model, so the next
//     daily carries it;
//   --recompose-daily: that date's daily is recomposed, its previous edition kept as a revision.
// Without --apply it only shows what would change.
//   node --env-file=.env scripts/estreia-reclassificar.ts <id> … [--ids-file=ids.txt] [--select=a,b] [--deselect=c]
//     [--recompose-daily=2026-10-23] [--apply --reason="…"]
//   docker compose exec worker node scripts/estreia-reclassificar.ts …
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { overrideFields } from "@aihot/backend/admin/content";
import { audit } from "@aihot/backend/audit";
import { closeDb, sql, type Db } from "@aihot/backend/db";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { emit, installModules } from "@aihot/backend/modules";
import { publishArticleTx } from "@aihot/backend/publication/publish";
import { composeDaily } from "@aihot/backend/reports/compose";
import { SERVER_MODULES } from "@aihot/site/modules/server";

const ACTOR = "script:estreia-reclassificar";
const USAGE = 'usage: node --env-file=.env scripts/estreia-reclassificar.ts <id> … [--ids-file=ids.txt] [--select=a,b] [--deselect=c] [--recompose-daily=YYYY-MM-DD] [--apply --reason="…"]';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    "ids-file": { type: "string" }, select: { type: "string", multiple: true }, deselect: { type: "string", multiple: true },
    "recompose-daily": { type: "string" }, apply: { type: "boolean", default: false }, reason: { type: "string" },
  },
});
const list = (items: readonly string[] = []) => [...new Set(items.flatMap((s) => s.split(",")).map((s) => s.trim()).filter(Boolean))];
const fromFile = values["ids-file"] ? readFileSync(values["ids-file"], "utf8").split("\n").map((l) => l.replace(/#.*/, "")) : [];
const ids = list([...positionals, ...fromFile]);
const select = list(values.select);
const deselect = list(values.deselect);
const day = values["recompose-daily"];
const reason = values.reason?.trim();
if (!ids.length && !select.length && !deselect.length && !day) throw new Error(USAGE);
const both = select.filter((id) => deselect.includes(id));
if (both.length) throw new Error(`both --select and --deselect: ${both.join(", ")}`);
if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`--recompose-daily takes a date (YYYY-MM-DD): ${day}`);
if (values.apply && !reason) throw new Error("--apply needs --reason, written to the audit log and the daily's revision");

interface Row {
  id: string; source_id: string; title: string; backfill: boolean; backfill_reason: string | null; published_at: Date | null; discovered_at: Date; timeline_at: Date;
  selected: boolean | null; version: number;
}
const read = (db: Db, of: string[]) => db<Row[]>`
  SELECT a.id, a.source_id, a.title, a.backfill, a.backfill_reason, a.published_at, a.discovered_at, a.timeline_at, p.selected, coalesce(o.version, 0) AS version
  FROM articles a LEFT JOIN publications p ON p.article_id = a.id LEFT JOIN editorial_overrides o ON o.article_id = a.id
  WHERE a.id = ANY(${of}::text[])`;
const isNews = (r: Row) => !r.backfill && r.backfill_reason === null && r.timeline_at.getTime() === r.discovered_at.getTime();
const state = (r: Row) => ({ backfill: r.backfill, backfillReason: r.backfill_reason, timelineAt: r.timeline_at.toISOString() });

// Every id must exist before anything is written: a typo stops the run instead of leaving it half done.
const all = list([...ids, ...select, ...deselect]);
const byId = new Map((await read(sql, all)).map((r) => [r.id, r]));
const missing = all.filter((id) => !byId.has(id));
if (missing.length) {
  await closeDb();
  throw new Error(`not found, nothing changed: ${missing.join(", ")}`);
}
const verb = (doing: string) => (values.apply ? doing : `would ${doing}`);
for (const id of deselect) console.log(`${verb("deselect")}  ${id}  selected now: ${byId.get(id)!.selected ?? "unpublished"}  ${byId.get(id)!.title}`);
for (const id of ids) {
  const r = byId.get(id)!;
  console.log(isNews(r)
    ? `unchanged  ${id}  ${r.source_id}  already news  ${r.title}`
    : `${verb("reclassify")}  ${id}  ${r.source_id}  ${r.backfill_reason ?? "backfill"}  timeline ${r.timeline_at.toISOString()} → ${r.discovered_at.toISOString()}  ${r.title}`);
}
for (const id of select) console.log(`${verb("select")}  ${id}  selected now: ${byId.get(id)!.selected ?? "unpublished"}  ${byId.get(id)!.title}`);

if (!values.apply) {
  if (day) console.log(`would recompose the daily of ${day}`);
  console.log("dry run: nothing changed; pass --apply --reason=\"…\" to write");
} else {
  installModules(SERVER_MODULES);
  const choose = async (id: string, selected: boolean) => {
    const [r] = await read(sql, [id]);
    await overrideFields(id, { fields: { selected }, reason: reason!, version: r!.version }, ACTOR);
    const [after] = await read(sql, [id]);
    // Selection also needs the item to be judged and grouped; the correction is kept either way.
    if (after!.selected !== selected) console.log(`warning  ${id}  Seleção = ${selected ? "sim" : "não"} recorded, but the item is ${after!.selected ? "selected" : "not selected"}`);
  };
  for (const id of deselect) await choose(id, false);
  let changed = 0;
  for (const id of ids) {
    await sql.begin(async (tx) => {
      const [r] = await tx<Row[]>`SELECT id, backfill, backfill_reason, discovered_at, timeline_at FROM articles WHERE id = ${id} FOR UPDATE`;
      if (isNews(r!)) return;
      await tx`UPDATE articles SET backfill = false, backfill_reason = NULL, timeline_at = discovered_at, updated_at = now() WHERE id = ${id}`;
      await publishArticleTx(tx, id);
      await emit("articleChanged", { id, kind: "content", reason: "launch history reclassified as news" }, tx);
      const [next] = await read(tx, [id]);
      await audit(ACTOR, "content.reclassify-news", `content:${id}`, reason!, state(r!), state(next!), { db: tx });
      changed++;
    });
  }
  for (const id of select) await choose(id, true);
  console.log(`${deselect.length} deselected, ${changed} reclassified, ${select.length} selected`);
  if (day) {
    const issue = await composeDaily(day, reason);
    console.log(`daily ${issue.key} recomposed: ${issue.entries} main entr${issue.entries === 1 ? "y" : "ies"}`);
  }
  // The republished items queued their follow-up jobs (sync, media); the queue's connection must close too.
  await stopBoss();
}
await closeDb();
