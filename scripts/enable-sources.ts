// Turns on, in one go, the sources of the given kinds that ship turned off because they need a paid key:
// x_search (SOCIALDATA_API_KEY), mp_account (DAJIALA_KEY). Add the key to .env, restart, then run:
//   node --env-file=.env scripts/enable-sources.ts x_search [mp_account …]
// Add --ids=a,b to limit it to those source ids. Sources a person paused in the admin are turned on too, so
// pass --ids when only some should run.
import { closeDb, sql } from "@aihot/backend/db";

const KINDS = new Set(["rss", "web_list", "json_list", "x_search", "mp_account"]);
const args = process.argv.slice(2);
const kinds = args.filter((a) => !a.startsWith("--"));
const ids = args.find((a) => a.startsWith("--ids="))?.slice(6).split(",").map((s) => s.trim()).filter(Boolean) ?? null;
if (!kinds.length || kinds.some((k) => !KINDS.has(k))) {
  throw new Error(`usage: node --env-file=.env scripts/enable-sources.ts <${[...KINDS].join("|")}> … [--ids=a,b]`);
}

const rows = await sql<{ id: string; name: string }[]>`
  UPDATE sources SET enabled = true, health = CASE WHEN health = 'paused' THEN 'unknown' ELSE health END, next_fetch_at = now()
  WHERE NOT enabled AND kind IN ${sql(kinds)} AND (${ids}::text[] IS NULL OR id = ANY(${ids}::text[]))
  RETURNING id, name`;
for (const r of rows) console.log(`enabled ${r.id} (${r.name})`);
console.log(`${rows.length} source(s) enabled`);
await closeDb();
