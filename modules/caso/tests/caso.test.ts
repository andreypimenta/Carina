// The case of the week from the admin to the weekly edition and its e-mail. Failure cases: a draft, or a case
// taken off the site, shows in an edition; an edition shows the answer before it is written, or to a case off
// the site; the answer shows in the case's own edition; a daily or a monthly carries a case; a change made
// against an older view overwrites a newer one; two cases share an edition; a published case is deleted; the
// picture keeps what the camera wrote into the file, is served while its case is off the site, or stays on
// disk once replaced or deleted; the e-mail lacks the case or lets the editor's text through as HTML.
import { tag } from "../../../tests/setup.ts";
import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { after, before, test } from "node:test";
import sharp from "sharp";
import { Conflict } from "@aihot/backend/audit";
import { config } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { installModules } from "@aihot/backend/modules";
import { loadReport } from "@aihot/backend/publication/reports";
import { buildApp } from "../../../apps/api/src/app.ts";
import { editionEmail } from "../../assinatura/backend/messages.ts";
import server from "../server.ts";
import {
  casoDetail, createCaso, deleteCaso, editCaso, IMAGE_DIR, listCasos, publishCaso, upcomingWeek, withdrawCaso,
} from "../backend/casos.ts";
import type { CasoPart } from "../caso.ts";

const T = tag();
const EDITOR = "editor@test";
const [W10, W11, W12] = ["2025-W10", "2025-W11", "2025-W12"];

let app: Awaited<ReturnType<typeof buildApp>>;

before(async () => {
  config.siteUrl = "https://folego.example";
  installModules([server]);
  app = await buildApp();
  // The editions, before anything reads the reports' index (kept a minute).
  for (const key of [W10, W11, W12, "2025-W31"]) {
    const content = { kind: "weekly", title: `Edição ${key}`, headline: "Manchete", overview: "Uma semana.", themes: [] };
    await sql`INSERT INTO reports (kind, key, window_start, window_end, content, generated_at, origin) VALUES ('weekly', ${key}, now(), now(), ${sql.json(content as never)}, now(), 'imported')`;
  }
  const daily = { kind: "daily", title: "Diária", headline: "Manchete", overview: "Um dia.", themes: [] };
  await sql`INSERT INTO reports (kind, key, window_start, window_end, content, generated_at, origin) VALUES ('daily', '2025-03-05', now(), now(), ${sql.json(daily as never)}, now(), 'imported')`;
});

after(async () => {
  await app.close();
  await stopBoss();
  await closeDb();
});

const version = async (id: number) => (await casoDetail(id))!.version;
const part = async (key: string) => (await loadReport("weekly", key))!.modules?.caso as CasoPart | undefined;
const fields = (week: string, extra: Record<string, unknown> = {}) => ({
  week, title: `Lactente com estridor ${T}`, body: "Lactente de 3 meses com estridor inspiratório que piora ao chorar e ao mamar.", ...extra,
});

/** A picture as the camera leaves it: with EXIF (here, an owner's name and an orientation). */
async function photo(color: string) {
  const data = await sharp({ create: { width: 64, height: 32, channels: 3, background: color } })
    .withMetadata({ orientation: 6 })
    .withExif({ IFD0: { Artist: "Dr. Fulano", Copyright: "Hospital X" } })
    .jpeg()
    .toBuffer();
  const meta = await sharp(data).metadata();
  assert.ok(meta.exif && meta.orientation === 6, "the test picture carries EXIF, with its orientation");
  return `data:image/jpeg;base64,${data.toString("base64")}`;
}

const exists = (file: string) => access(path.join(IMAGE_DIR(), file)).then(() => true, () => false);

test("a case shows in its edition once published; the next edition shows its answer once written; off the site, both lose it", async () => {
  const { id } = await createCaso(fields(W10, { options: ["Laringoscopia flexível", "", "Observação"], correct: 0 }), EDITOR);
  assert.equal(await part(W10), undefined, "a draft shows nowhere");

  await publishCaso(id, { version: await version(id) }, EDITOR);
  const w10 = (await part(W10))!;
  assert.equal(w10.resposta, null);
  assert.equal(w10.caso!.title, `Lactente com estridor ${T}`);
  assert.equal(w10.caso!.question, "Qual a sua conduta?", "an empty question is the default one");
  assert.deepEqual(w10.caso!.options, ["Laringoscopia flexível", "Observação"], "blank choices are left out");
  assert.equal(w10.caso!.answerOn, "segunda, 17/03");
  assert.equal("correct" in w10.caso!, false, "the case's own edition does not give the right choice away");
  assert.equal(await part(W11), undefined, "the next edition waits for the answer");

  await editCaso(id, { ...fields(W10, { options: ["Laringoscopia flexível", "Observação"], correct: 0 }), answer: "Laringomalácia.\n\nA laringoscopia confirma.", version: await version(id) }, EDITOR);
  assert.deepEqual((await part(W11))!, {
    caso: null,
    resposta: { week: W10, title: `Lactente com estridor ${T}`, question: "Qual a sua conduta?", options: ["Laringoscopia flexível", "Observação"], correct: 0, answer: "Laringomalácia.\n\nA laringoscopia confirma." },
  }, "an answer written during the week shows at once");
  assert.equal((await part(W10))!.resposta, null, "the case's own edition does not show its answer");
  assert.equal(await part(W12), undefined, "the answer is in the next edition only");

  const next = await createCaso(fields(W11, { title: `Segundo caso ${T}` }), EDITOR);
  await publishCaso(next.id, { version: await version(next.id) }, EDITOR);
  const w11 = (await part(W11))!;
  assert.equal(w11.caso!.title, `Segundo caso ${T}`);
  assert.equal(w11.resposta!.week, W10, "the edition carries last week's answer and its own case");

  await withdrawCaso(id, { version: await version(id) }, EDITOR);
  assert.equal(await part(W10), undefined, "a case off the site leaves its edition");
  assert.equal((await part(W11))!.resposta, null, "and its answer leaves the next one");
  assert.deepEqual((await loadReport("daily", "2025-03-05"))!.modules, {}, "a daily carries no case");

  const events = (await casoDetail(id))!.history.map((h) => h.action);
  assert.deepEqual(events.toSorted(), ["caso.create", "caso.edit", "caso.publish", "caso.withdraw"]);
});

test("a change against an older view, a second case for an edition and deleting a published case are refused", async () => {
  const { id } = await createCaso(fields(W12), EDITOR);
  const seen = await version(id);
  await editCaso(id, { ...fields(W12), answer: "Primeira.", version: seen }, EDITOR);
  await assert.rejects(editCaso(id, { ...fields(W12), answer: "Segunda.", version: seen }, EDITOR), Conflict);
  assert.equal((await casoDetail(id))!.answer, "Primeira.");

  await assert.rejects(createCaso(fields(W12), EDITOR), (e: Error) => e instanceof Conflict && /segunda, 24\/03/.test(e.message));
  await assert.rejects(createCaso(fields(W12, { options: ["Só uma"] }), EDITOR), /duas alternativas/);
  await assert.rejects(createCaso(fields("2025-W77"), EDITOR), /semana inválida/);

  await publishCaso(id, { version: await version(id) }, EDITOR);
  await assert.rejects(publishCaso(id, { version: await version(id) }, EDITOR), Conflict);
  await assert.rejects(deleteCaso(id, { version: await version(id) }, EDITOR), /Retire o caso do ar/);
  await withdrawCaso(id, { version: await version(id) }, EDITOR);
  assert.deepEqual(await deleteCaso(id, { version: await version(id) }, EDITOR), { id });
  assert.equal(await casoDetail(id), null);
  assert.equal(await deleteCaso(id, { version: "x" }, EDITOR), null);
});

test("the picture is kept without the file's metadata, served by the site only while its case is published, and deleted once unused", async () => {
  const { id } = await createCaso(fields("2025-W20", { image: await photo("#204060"), imageCaption: "Laringoscopia" }), EDITOR);
  const first = (await casoDetail(id))!.image!;
  const file = path.basename(first.url);
  assert.equal(first.caption, "Laringoscopia");
  assert.deepEqual([first.width, first.height], [32, 64], "turned the way the camera held it");
  const stored = await sharp(await readFile(path.join(IMAGE_DIR(), file))).metadata();
  assert.equal(stored.format, "jpeg");
  assert.equal(stored.exif, undefined, "no EXIF reaches the site");
  assert.doesNotMatch((await readFile(path.join(IMAGE_DIR(), file))).toString("latin1"), /Fulano|Hospital X/);

  const site = () => app.inject({ url: `/caso/imagens/${file}` });
  assert.equal((await site()).statusCode, 404, "a draft's picture is not on the site");
  assert.equal((await app.inject({ url: `/api/admin/caso/imagens/${file}` })).statusCode, 401, "the admin's copy needs the admin");
  await publishCaso(id, { version: await version(id) }, EDITOR);
  const served = await site();
  assert.equal(served.statusCode, 200);
  assert.equal(served.headers["content-type"], "image/jpeg");
  assert.equal((await app.inject({ url: "/caso/imagens/..%2F..%2Fsecret.jpg" })).statusCode, 404);

  await editCaso(id, { ...fields("2025-W20"), imageCaption: "Laringoscopia", version: await version(id) }, EDITOR);
  assert.equal((await casoDetail(id))!.image!.url, first.url, "left out, the picture stays");

  await editCaso(id, { ...fields("2025-W20"), image: await photo("#a03020"), version: await version(id) }, EDITOR);
  const second = path.basename((await casoDetail(id))!.image!.url);
  assert.notEqual(second, file);
  assert.equal(await exists(file), false, "a replaced picture is deleted");
  assert.equal((await site()).statusCode, 404);

  await editCaso(id, { ...fields("2025-W20"), image: null, version: await version(id) }, EDITOR);
  assert.equal((await casoDetail(id))!.image, null);
  assert.equal(await exists(second), false, "a removed picture is deleted");

  await editCaso(id, { ...fields("2025-W20"), image: await photo("#30a020"), version: await version(id) }, EDITOR);
  await withdrawCaso(id, { version: await version(id) }, EDITOR);
  await deleteCaso(id, { version: await version(id) }, EDITOR);
  assert.deepEqual(await readdir(IMAGE_DIR()), [], "a deleted case leaves no picture");

  await assert.rejects(createCaso(fields("2025-W21", { image: "data:image/gif;base64,R0lGODlh" }), EDITOR), /PNG, JPG ou WebP/);
  await assert.rejects(createCaso(fields("2025-W21", { image: "data:image/png;base64,bm90IGFuIGltYWdl" }), EDITOR), /Não foi possível ler/);
  assert.deepEqual((await listCasos()).rows.filter((r) => r.week === "2025-W21"), [], "a refused picture saves nothing");
});

test("the e-mailed edition carries the answer and the case, the editor's text escaped", async () => {
  const a = await createCaso(fields("2025-W30", { title: `Caso <b>A</b> ${T}`, options: ["Broncoscopia", "Tomografia"], correct: 1, answer: "Tomografia primeiro." }), EDITOR);
  await publishCaso(a.id, { version: await version(a.id) }, EDITOR);
  const b = await createCaso(fields("2025-W31", { title: `Caso B ${T}`, question: "E agora?", image: await photo("#ffffff") }), EDITOR);
  await publishCaso(b.id, { version: await version(b.id) }, EDITOR);

  const mail = editionEmail((await loadReport("weekly", "2025-W31"))!, "token");
  assert.match(mail.html, /RESPOSTA DO CASO DA SEMANA PASSADA/);
  assert.match(mail.html, /Caso &lt;b&gt;A&lt;\/b&gt;/);
  assert.doesNotMatch(mail.html, /Caso <b>A<\/b>/);
  assert.match(mail.html, /Tomografia ✓/);
  assert.match(mail.html, /CASO DA SEMANA/);
  assert.match(mail.html, /E agora\?/);
  assert.match(mail.html, /src="https:\/\/folego\.example\/caso\/imagens\/caso-[0-9a-f]{16}\.jpg"/);
  assert.match(mail.html, /A resposta sai na próxima edição, segunda, 11\/08/);
  assert.ok(mail.text.indexOf("RESPOSTA DO CASO DA SEMANA PASSADA") < mail.text.indexOf(`Caso B ${T}`), "the answer comes before the new case");
  assert.match(mail.text, /B\) Tomografia ✓/);
  assert.match(mail.text, /Imagem: https:\/\/folego\.example\/caso\/imagens\//);
});

test("the next edition is this week's, or last week's on a Monday before it comes out, and a new case is offered the editions without one", async () => {
  assert.equal(upcomingWeek(new Date("2026-11-02T09:59:00Z")), "2026-W44", "Monday before 07:00 (-03:00): last week's edition is still to come");
  assert.equal(upcomingWeek(new Date("2026-11-02T10:00:00Z")), "2026-W45");
  assert.equal(upcomingWeek(new Date("2026-11-07T12:00:00Z")), "2026-W45");

  const now = new Date("2026-11-04T12:00:00Z");
  const before = await createCaso(fields("2026-W44"), EDITOR);
  await publishCaso(before.id, { version: await version(before.id) }, EDITOR);
  const own = await createCaso(fields("2026-W45"), EDITOR);
  await publishCaso(own.id, { version: await version(own.id) }, EDITOR);
  await editCaso(before.id, { ...fields("2026-W44"), answer: "Resposta.", version: await version(before.id) }, EDITOR);
  assert.deepEqual((await listCasos(now)).weeks.slice(0, 2), ["2026-W46", "2026-W47"], "a new case is offered the editions without one");
});
