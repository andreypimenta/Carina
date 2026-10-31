// One-off for the sections (abas, industry/taxonomy.ts AREAS): items published before the structure step
// chose a section have none. Each is published again without calling models, so it takes its section from
// its tags (editorial/vocabulary.ts areaOf); one transaction per item, 500 items per batch, safe to stop
// and run again. Issues already out keep the sections they were published with.
// Without --apply it only counts what each section would receive.
//   node --env-file=.env scripts/abas-preencher.ts [--apply]
//   docker compose exec worker node scripts/abas-preencher.ts [--apply]
import { parseArgs } from "node:util";
import { AREAS } from "@aihot/industry/taxonomy";
import { closeDb, sql } from "@aihot/backend/db";
import { areaOf } from "@aihot/backend/editorial/vocabulary";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { installModules } from "@aihot/backend/modules";
import { publishArticleTx } from "@aihot/backend/publication/publish";
import { SERVER_MODULES } from "@aihot/site/modules/server";

const { values } = parseArgs({ options: { apply: { type: "boolean", default: false } } });

const missing = await sql<{ article_id: string; area: string | null; tags: string[]; public: boolean }[]>`
  SELECT p.article_id, a.area, p.tags, (p.visibility = 'public' AND p.eligible) AS public
  FROM publications p
  LEFT JOIN LATERAL (SELECT area FROM analyses WHERE article_id = p.article_id ORDER BY input_revision DESC, id DESC LIMIT 1) a ON true
  WHERE p.area IS NULL ORDER BY p.article_id`;
const counts = new Map<string, { all: number; public: number }>(AREAS.map((a) => [a.key, { all: 0, public: 0 }]));
for (const row of missing) {
  const count = counts.get(areaOf(row.area, row.tags))!;
  count.all++;
  if (row.public) count.public++;
}
console.log(`${missing.length} items without a section`);
for (const a of AREAS) console.log(`  ${a.label}: ${counts.get(a.key)!.all} (${counts.get(a.key)!.public} public)`);

if (!values.apply) {
  console.log("dry run: nothing changed; pass --apply to write");
} else {
  installModules(SERVER_MODULES);
  let after = "";
  let done = 0;
  for (;;) {
    const batch = await sql<{ article_id: string }[]>`
      SELECT article_id FROM publications WHERE area IS NULL AND article_id > ${after} ORDER BY article_id LIMIT 500`;
    if (batch.length === 0) break;
    for (const { article_id } of batch) await sql.begin((tx) => publishArticleTx(tx, article_id));
    done += batch.length;
    after = batch.at(-1)!.article_id;
    console.log(`${done}/${missing.length}`);
  }
  // A changed publication may queue follow-up jobs (sync, media); the queue's connection must close too.
  await stopBoss();
}
await closeDb();
