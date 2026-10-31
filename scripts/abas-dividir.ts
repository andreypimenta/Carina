// One-off for the split of the first section (abas, industry/taxonomy.ts AREAS) on 31/10/2026: "Cirurgia
// torácica pediátrica e via aérea" (key cirurgia) became "Cirurgia torácica pediátrica" (still cirurgia) and
// "Via aérea pediátrica" (via-aerea), and "Otorrinolaringologia pediátrica" (otorrino) was added.
// - Items in cirurgia that an older structure prompt put there, or that took it from their tags, are sorted
//   again between the two sections the old one split into: the first tag of Cirurgia torácica or Via aérea
//   decides (the retired tag "Via aérea adulto", which old items carry, counts as Via aérea), cirurgia with none;
//   they never go to Pneumologia or Otorrino.
//   The latest analysis takes the section (also one that had none and stays in cirurgia, so republishing never
//   sorts it by its tags into another section) and the item is published again without calling models; one
//   transaction per item, safe to stop and run again. Issues already out keep the sections they were published with.
// - Editor corrections that chose cirurgia, and items without an analysis (only the editor's tags), are only
//   listed: the editor decides them in the admin.
// - E-mail readers who chose the old section first get both new ones (cirurgia,via-aerea). Run it once, right
//   after updating: a reader who chose Cirurgia torácica alone after the update would be changed too.
// Without --apply it only counts.
//   node --env-file=.env scripts/abas-dividir.ts [--apply]
//   docker compose exec worker node scripts/abas-dividir.ts [--apply]
import { parseArgs } from "node:util";
import { AREAS } from "@aihot/industry/taxonomy";
import { closeDb, sql } from "@aihot/backend/db";
import { PROMPT_VERSIONS } from "@aihot/backend/editorial/analyze";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { installModules } from "@aihot/backend/modules";
import { publishArticleTx } from "@aihot/backend/publication/publish";
import { SERVER_MODULES } from "@aihot/site/modules/server";

const { values } = parseArgs({ options: { apply: { type: "boolean", default: false } } });
const split = AREAS.filter((a) => a.key === "cirurgia" || a.key === "via-aerea").map((a) => ({ key: a.key, tags: a.key === "via-aerea" ? [...a.tags, "Via aérea adulto"] : [...a.tags] }));
const splitOf = (tags: string[]) => tags.flatMap((t) => split.filter((a) => a.tags.includes(t)))[0]?.key ?? "cirurgia";

const rows = await sql<{ article_id: string; tags: string[]; analysis_id: number | null; area: string | null; current: boolean; edited: boolean; public: boolean }[]>`
  SELECT p.article_id, p.tags, a.id AS analysis_id, a.area, coalesce(a.prompt_version LIKE ${`%${PROMPT_VERSIONS.structure}%`}, false) AS current,
    coalesce(o.fields ? 'area', false) AS edited, (p.visibility = 'public' AND p.eligible) AS public
  FROM publications p
  LEFT JOIN LATERAL (SELECT id, area, prompt_version FROM analyses WHERE article_id = p.article_id ORDER BY input_revision DESC, id DESC LIMIT 1) a ON true
  LEFT JOIN editorial_overrides o ON o.article_id = p.article_id
  WHERE p.area = 'cirurgia' ORDER BY p.article_id`;
const moves = rows.flatMap((r) => {
  const to = splitOf(r.tags);
  return !r.edited && r.analysis_id !== null && (r.area === null || (to !== "cirurgia" && r.area === "cirurgia" && !r.current)) ? [{ ...r, analysis_id: r.analysis_id, to }] : [];
});
const edited = rows.filter((r) => (r.edited || r.analysis_id === null) && splitOf(r.tags) !== "cirurgia");
console.log(`${rows.length} items in cirurgia; ${moves.length} get their section from their tags`);
for (const a of AREAS) {
  const to = moves.filter((m) => m.to === a.key);
  if (to.length) console.log(`  ${a.label}: ${to.length} (${to.filter((m) => m.public).length} public)`);
}
if (edited.length) console.log(`${edited.length} items whose tags point to Via aérea keep cirurgia from an editor correction or have no analysis (decide in the admin):\n  ${edited.map((r) => r.article_id).join("\n  ")}`);
const [readers] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM assinatura_subscribers WHERE interest = 'cirurgia'`;
console.log(`${readers!.n} readers chose the old section first`);

if (!values.apply) {
  console.log("dry run: nothing changed; pass --apply to write");
} else {
  installModules(SERVER_MODULES);
  let done = 0;
  for (const m of moves) {
    await sql.begin(async (tx) => {
      await tx`UPDATE analyses SET area = ${m.to} WHERE id = ${m.analysis_id} AND (area = 'cirurgia' OR area IS NULL)`;
      await publishArticleTx(tx, m.article_id);
    });
    if (++done % 500 === 0) console.log(`${done}/${moves.length}`);
  }
  const changed = await sql`UPDATE assinatura_subscribers SET interest = 'cirurgia,via-aerea', updated_at = now() WHERE interest = 'cirurgia'`;
  console.log(`${done} items sorted; ${changed.count} readers now read Cirurgia torácica and Via aérea first`);
  // A changed publication may queue follow-up jobs (sync, media); the queue's connection must close too.
  await stopBoss();
}
await closeDb();
