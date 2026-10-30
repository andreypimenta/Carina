// Failure cases: an article's share card showing a range's end, a confidence level or any percentage of its
// summary as its key number; an article sent to the groups opening under a weekly issue that does not cite it
// while one does, or under none while issues exist.
import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { keyNumberBadge } from "@aihot/backend/publication/og";
import { weeklyOf } from "@aihot/backend/publication/reports";

const T = tag();

after(async () => {
  await sql`DELETE FROM reports WHERE kind = 'weekly' AND content->>'test' = ${T}`;
  await closeDb();
});

test("the share card's key number is a change's result or the title's first percentage", () => {
  const key = (title: string, summary: string | null = null) => keyNumberBadge(title, summary)?.value ?? null;
  assert.equal(key("Sobrevida com FETO subiu de 44,1% para 70,8% em duas décadas"), "70,8%");
  assert.equal(key("Traqueíte após traqueostomia atinge 11,3 % e associa-se a pneumonia"), "11,3%");
  assert.equal(key("Mortalidade de 0,6% e complicações em 10% dos pacientes"), "0,6%");
  assert.equal(key("Sucesso de 63% a 98% com fibrinólise; drenagem isolada em 47%"), "47%");
  assert.equal(key("Redução com IC 95% estreito"), null);
  assert.equal(key("LISA comparada com CPAP", "O MIST reduziu a intubação de 72,1% para 36,5% (IC 95%: 0,40-0,64)."), "36,5%");
  assert.equal(key("VATS supera a drenagem isolada", "Sucesso de 67% a 100% com VATS, contra 47% com drenagem."), null, "a summary's lone percentage says too little");
  assert.equal(key("Stent adaptado de tubo T de Montgomery", null), null);
});

test("an article's weekly issue is the newest citing it, else the newest one", async () => {
  const issue = (key: string, ids: string[]) => sql`
    INSERT INTO reports (kind, key, window_start, window_end, content, generated_at, origin)
    VALUES ('weekly', ${key}, now() - interval '7 days', now(), ${sql.json({ test: T, themes: [{ heading: "Tema", storyRefs: ids.map((itemId) => ({ itemId, title: itemId, related: [{ itemId: `${itemId}-rel`, title: "Relacionada" }] })) }] } as never)}, now(), 'manual')`;
  await issue("2097-W10", [`cited-${T}`]);
  await issue("2097-W11", [`cited-${T}`]);
  await issue("2097-W12", [`other-${T}`]);
  assert.equal(await weeklyOf(`cited-${T}`), "2097-W11");
  assert.equal(await weeklyOf(`cited-${T}-rel`), "2097-W11", "a related report counts as cited");
  const [{ newest }] = await sql<{ newest: string }[]>`SELECT max(key) AS newest FROM reports WHERE kind = 'weekly'`;
  assert.equal(await weeklyOf(`never-${T}`), newest);
});
