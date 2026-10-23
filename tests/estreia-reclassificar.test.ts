// The launch's one-off (scripts/estreia-reclassificar.ts). Failure cases: a dry run writes; an unknown id
// leaves the run half done; an item not listed is touched; a reclassified item keeps the history mark or its
// old timeline, or is not audited; a selection made by the script is not the admin's correction, or is
// released outside the next daily; the recomposed daily misses the reclassified and selected items or keeps
// a deselected one.
import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { after, before, test } from "node:test";
import { promisify } from "node:util";
import { addDays, beijingDate } from "@aihot/contracts/time";
import { REPO_ROOT } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { publishArticle } from "@aihot/backend/publication/publish";
import { getBoss, stopBoss } from "@aihot/backend/jobs/queue";
import { editionAt } from "./setup.ts";

const exec = promisify(execFile);
const T = tag();
const source = `estreia-${T}`;
const now = Date.now();

before(async () => {
  await getBoss();
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode) VALUES (${source}, ${source}, 'rss', 'T1', 'editorial')`;
});
after(async () => { await stopBoss(); await closeDb(); });

/** A judged report found an hour ago; `daysOld` back from its finding makes it stale on discovery. */
async function item(name: string, daysOld: number, selected: boolean) {
  const { articleId: id } = await upsertMaterial({ sourceId: source, url: `https://example.test/${T}/${name}`, title: name, bodyText: "corpo", bodyStatus: "ok",
    via: "fetch", discoveredAt: new Date(now - 3600_000), publishedAt: new Date(now - 3600_000 - daysOld * 86400_000) });
  await sql`UPDATE articles SET processing_state = 'analyzed', grouping_status = 'complete', grouped_at = now() WHERE id = ${id}`;
  await sql`INSERT INTO analyses (article_id, input_revision, origin, relevance, title_zh, summary_zh, score, category, selected)
    VALUES (${id}, 1, 'rule', 'pass', ${name}, 'resumo', 80, 'evidence', ${selected})`;
  await publishArticle(id);
  return id;
}

async function run(args: string[]) {
  try {
    const { stdout } = await exec(process.execPath, ["scripts/estreia-reclassificar.ts", ...args], { cwd: REPO_ROOT, env: process.env, timeout: 90_000 });
    return { code: 0, out: stdout };
  } catch (error) {
    const failed = error as { code?: number; stdout?: string; stderr?: string };
    return { code: failed.code ?? 1, out: `${failed.stdout ?? ""}${failed.stderr ?? ""}` };
  }
}

const state = async (id: string) => (await sql<{ backfill: boolean; backfill_reason: string | null; timeline_at: Date; discovered_at: Date; selected: boolean; visible_after: Date | null }[]>`
  SELECT a.backfill, a.backfill_reason, a.timeline_at, a.discovered_at, p.selected, p.visible_after FROM articles a JOIN publications p ON p.article_id = a.id WHERE a.id = ${id}`)[0]!;

// Each run starts a process that loads the backend and the site's modules; four of them need more than the default timeout.
test("the script reclassifies, selects and deselects only the ids given, as the admin would, and the next daily carries them", { timeout: 360_000 }, async () => {
  const chosen = await item("escolhido", 5, false);
  const released = await item("liberado", 5, true);
  const alert = await item("alerta", 0, true);
  const untouched = await item("intocado", 5, true);
  for (const id of [chosen, released, untouched]) assert.equal((await state(id)).backfill_reason, "stale-on-discovery");
  assert.equal((await state(alert)).selected, true);
  const snapshot = async () => Promise.all([chosen, released, alert, untouched].map(state));
  const initial = await snapshot();

  // The daily whose window holds this moment: the one the next edition time closes.
  const today = beijingDate(new Date());
  const day = Date.now() < editionAt("daily", today).getTime() ? today : addDays(today, 1);
  const args = [chosen, released, `--select=${chosen}`, `--deselect=${alert}`, `--recompose-daily=${day}`];

  const dry = await run(args);
  assert.equal(dry.code, 0, dry.out);
  assert.match(dry.out, /would reclassify/);
  assert.match(dry.out, /dry run: nothing changed/);
  assert.deepEqual(await snapshot(), initial, "a dry run writes nothing");

  const typo = await run([...args, "nao-existe", "--apply", "--reason=estreia"]);
  assert.notEqual(typo.code, 0);
  assert.match(typo.out, /not found, nothing changed: nao-existe/);
  assert.deepEqual(await snapshot(), initial, "an unknown id stops the run before any write");

  const started = new Date();
  const applied = await run([...args, "--apply", "--reason=estreia W43"]);
  assert.equal(applied.code, 0, applied.out);
  for (const id of [chosen, released]) {
    const s = await state(id);
    assert.equal(s.backfill, false);
    assert.equal(s.backfill_reason, null);
    assert.equal(s.timeline_at.getTime(), s.discovered_at.getTime());
  }
  const c = await state(chosen);
  assert.equal(c.selected, true);
  assert.ok(c.visible_after! >= started, "released when the script selects it, like a selection by the model");
  assert.equal((await state(alert)).selected, false);
  assert.deepEqual(await state(untouched), initial[3], "an id not given is not touched");

  const audits = await sql<{ subject: string; action: string; actor: string; reason: string; after: Record<string, unknown> }[]>`
    SELECT subject, action, actor, reason, after FROM audit_log WHERE subject = ANY(${[chosen, released, alert, untouched].map((id) => `content:${id}`)}) ORDER BY id`;
  assert.deepEqual(audits.map((a) => [a.subject, a.action, a.actor, a.reason]), [
    [`content:${alert}`, "content.override", "script:estreia-reclassificar", "estreia W43"],
    [`content:${chosen}`, "content.reclassify-news", "script:estreia-reclassificar", "estreia W43"],
    [`content:${released}`, "content.reclassify-news", "script:estreia-reclassificar", "estreia W43"],
    [`content:${chosen}`, "content.override", "script:estreia-reclassificar", "estreia W43"],
  ]);
  assert.deepEqual(audits[0]!.after, { selected: false });
  assert.deepEqual(audits[3]!.after, { selected: true });

  const [daily] = await sql<{ content: { sections: Array<{ items: Array<{ itemId: string }> }> } }[]>`SELECT content FROM reports WHERE kind = 'daily' AND key = ${day}`;
  const carried = daily!.content.sections.flatMap((s) => s.items.map((i) => i.itemId));
  assert.deepEqual([...carried].sort(), [chosen, released].sort());

  const again = await run([chosen, released, "--apply", "--reason=estreia W43"]);
  assert.match(again.out, /unchanged {2}.*escolhido/);
  assert.match(again.out, /0 reclassified/);
});
