// A PubMed paper added by PMID or DOI, outside the literature module's saved searches, as the admin's
// "Adicionar artigo" does it (modules/literatura/backend/adicionar.ts) but at once: the full text when its
// licence allows it, else the site's own article (a paid model call, through a receipt), once per PMID; news
// from now on, so the next daily and the weekly edition can carry it. --select also marks Seleção = sim, as
// the admin's manual correction does it. Without --apply it only shows the paper and what would happen.
//   node --env-file=.env scripts/literatura-adicionar.ts <pmid|doi> [--select] [--apply] [--reason="…"]
//   docker compose exec worker node scripts/literatura-adicionar.ts …
import { parseArgs } from "node:util";
import { closeDb } from "@aihot/backend/db";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { installModules } from "@aihot/backend/modules";
import { addPaper, defaultReason, earlier, findPaper } from "@aihot/literatura/adicionar";
import { SERVER_MODULES } from "@aihot/site/modules/server";

const ACTOR = "script:literatura-adicionar";
const USAGE = 'usage: node --env-file=.env scripts/literatura-adicionar.ts <pmid|doi> [--select] [--apply] [--reason="…"]';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { select: { type: "boolean", default: false }, apply: { type: "boolean", default: false }, reason: { type: "string" } },
});
if (positionals.length !== 1) throw new Error(USAGE);

try {
  const paper = await findPaper(positionals[0]!);
  const reason = values.reason?.trim() || defaultReason(paper.pmid);
  console.log(`PMID ${paper.pmid}  ${paper.doi ?? "sem DOI"}  entrou no PubMed em ${paper.enteredOn ?? "?"}  ${paper.title}`);
  const before = await earlier(paper.pmid);
  if (!values.apply) {
    console.log(before
      ? `already taken (${before.status}${before.articleId ? `, item ${before.articleId}` : ""}): not written again${values.select && before.articleId ? "; would select it" : ""}`
      : `would take it as the saved searches do${values.select ? " and select it" : ""}`);
    console.log("dry run: nothing changed; pass --apply to write");
  } else {
    installModules(SERVER_MODULES);
    const out = await addPaper(paper, { select: values.select, reason, actor: ACTOR });
    console.log(`${out.existing ? "already taken" : "taken"}: ${out.status}${out.articleId ? `  item ${out.articleId}` : "  no item"}${out.selected ? "  Seleção = sim" : ""}`);
    if (values.select && !out.articleId) console.log("warning  no item to select");
    // The new item queued its processing jobs; the queue's connection must close too.
    await stopBoss();
  }
} finally {
  await closeDb();
}
