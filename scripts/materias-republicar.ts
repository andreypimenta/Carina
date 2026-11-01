// One-off for the single structure of the matéria (docs/fontes.md): the journal's own sources stop showing the
// engine's title, summary and "Por que importa". Each of their items is published again without calling models,
// so it takes its own title and summary (publication/publish.ts). The only change to a body is removing the line
// saying whether the abstract or the full text was read. One transaction per item, safe to stop and run again.
// Issues already out keep what they were published with.
// Without --apply it only counts: the items, and the matérias that stay in the old format.
//   node --env-file=.env scripts/materias-republicar.ts [--apply]
//   docker compose exec worker node scripts/materias-republicar.ts [--apply]
import { parseArgs } from "node:util";
import { OWN_TEXT_SOURCES } from "@aihot/industry/taxonomy";
import { closeDb, sql } from "@aihot/backend/db";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { emit, installModules } from "@aihot/backend/modules";
import { republishSource } from "@aihot/backend/publication/publish";
import { removeNotasDeOrigem } from "@aihot/literatura/confianca";
import { SERVER_MODULES } from "@aihot/site/modules/server";

const { values } = parseArgs({ options: { apply: { type: "boolean", default: false } } });

const [old] = await sql<{ total: number; sem_ficha: number; com_ficha: number }[]>`
  SELECT count(*)::int AS total, count(*) FILTER (WHERE c.article_id IS NULL)::int AS sem_ficha, count(*) FILTER (WHERE c.article_id IS NOT NULL)::int AS com_ficha
  FROM articles a LEFT JOIN literatura_confianca c ON c.article_id = a.id
  WHERE a.source_id = 'literatura-materia' AND (c.article_id IS NULL OR c.data->>'estrutura' IS NULL)`;
console.log(`${old!.total} matérias stay in the old format: ${old!.sem_ficha} without a trust record, ${old!.com_ficha} with one`);

if (!values.apply) {
  const counts = await sql<{ source_id: string; n: number }[]>`SELECT source_id, count(*)::int AS n FROM publications WHERE source_id = ANY(${[...OWN_TEXT_SOURCES]}) GROUP BY 1 ORDER BY 1`;
  const [notes] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM articles WHERE source_id = 'literatura-materia' AND body_html ~ 'Matéria escrita pelo [^<]* a partir do (resumo|texto completo)'`;
  console.log(`  ${notes!.n} bodies keep the line saying what was read`);
  for (const c of counts) console.log(`  ${c.source_id}: ${c.n} to publish again`);
  console.log("dry run: nothing changed; pass --apply to write");
} else {
  installModules(SERVER_MODULES);
  console.log(`${await removeNotasDeOrigem()} bodies lost the line saying what was read`);
  for (const source of OWN_TEXT_SOURCES) {
    const result = await republishSource(source, async (done, total) => console.log(`${source}: ${done}/${total}`));
    // As the worker's republish job does: names and rights are also read live by the exits.
    if (result.total > 0) await emit("sourceRepublished", { sourceId: source });
    console.log(`${source}: ${result.changed} of ${result.total} changed`);
  }
  // A changed publication may queue follow-up jobs (sync, media); the queue's connection must close too.
  await stopBoss();
}
await closeDb();
