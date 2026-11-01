// One-off: rewrites a weekly edition's items in the matéria's single structure (modules/literatura/backend/reescrever.ts)
// and brings the edition's frozen text to them, without sending it again. No other matéria and no other edition changes.
// One transaction per item, safe to stop and run again: what is done is not paid for or written twice.
// Without --apply nothing published changes and a preview file is written, with the model calls and an estimate of the tokens:
//   by default no model is called;
//   --generate has the model write, shows the text in the preview, and --apply then reuses those answers.
// --restore=<id> puts an item back as it was before its rewrite, from the audit log.
//   node --env-file=.env scripts/edicao-reescrever.ts <edition> [--generate] [--apply --reason="…"] [--restore=<id> --reason="…"] [--preview=file]
//   docker compose exec worker node scripts/edicao-reescrever.ts …
import path from "node:path";
import { parseArgs } from "node:util";
import { config } from "@aihot/backend/config";
import { closeDb } from "@aihot/backend/db";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { installModules } from "@aihot/backend/modules";
import { restoreItems, rewriteEdition, stayedOld, type Mode } from "@aihot/literatura/reescrever";
import { SERVER_MODULES } from "@aihot/site/modules/server";

const ACTOR = "script:edicao-reescrever";
const USAGE = 'usage: node --env-file=.env scripts/edicao-reescrever.ts <edition, e.g. 2026-W43> [--generate] [--apply --reason="…"] [--restore=<id> --reason="…"] [--preview=file]';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    apply: { type: "boolean", default: false }, generate: { type: "boolean", default: false }, reason: { type: "string" },
    restore: { type: "string", multiple: true }, preview: { type: "string" },
  },
});
const key = positionals[0];
if (positionals.length !== 1 || !/^\d{4}-W\d{2}$/.test(key!)) throw new Error(USAGE);
const reason = values.reason?.trim();
const restoring = values.restore ?? [];
if ((values.apply || restoring.length) && !reason) throw new Error("--apply and --restore need --reason, written to the audit log and the edition's revision");
if (restoring.length && (values.apply || values.generate)) throw new Error("--restore runs alone");
const mode: Mode = values.apply ? "apply" : values.generate ? "generate" : "plan";
if ((mode !== "plan" || restoring.length) && !config.modelCallsEnabled) throw new Error("this needs model calls: MODEL_CALLS_ENABLED=true");

installModules(SERVER_MODULES);
try {
  if (restoring.length) {
    console.log("edition:", await restoreItems(key!, restoring, { reason: reason!, actor: ACTOR, log: console.log }));
  } else {
    const previewPath = values.preview ?? path.join(config.dataDir, `reescrever-${key}.md`);
    const out = await rewriteEdition(key!, { mode, reason: reason ?? "", actor: ACTOR, previewPath, log: console.log });
    const count = (status: string) => out.items.filter((i) => i.status === status).length;
    console.log(`${out.items.length} items: ${count("written")} written, ${count("generated")} generated, ${count("would-write")} to write, ${count("done")} already done, ${count("overridden")} still overridden, ${count("kept")} kept, ${count("refused")} refused, ${count("failed")} failed`);
    for (const i of out.items.filter((x) => stayedOld(x) || x.status === "kept")) console.log(`  ${i.status === "overridden" ? "STILL OVERRIDDEN" : "LEFT UNCHANGED"}  ${i.id}  ${i.type}  ${i.why}`);
    console.log(`model calls: ${out.modelCalls}; estimated tokens: ${out.tokens}`);
    console.log(`preview: ${previewPath}`);
    if (mode === "apply") {
      if (typeof out.report === "object" && "error" in out.report) console.log(`EDITION NOT UPDATED: ${out.report.error}; run again`);
      else console.log("edition:", out.report);
      if (out.items.some(stayedOld) || (typeof out.report === "object" && "error" in out.report)) process.exitCode = 1;
    } else console.log(`dry run: nothing published changed; pass --apply --reason="…" to write`);
  }
} finally {
  // A changed publication may queue follow-up jobs (sync, media); the queue's connection must close too.
  await stopBoss();
  await closeDb();
}
