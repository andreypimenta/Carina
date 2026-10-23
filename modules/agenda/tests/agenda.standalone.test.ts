// The agenda: the congress file is refused whole when an entry is malformed; the page splits what is to come from
// what is over; a weekly issue names the congresses near the Monday it comes out and shows them as the file has
// them when the issue is read.
import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";
import { beijingDate } from "@aihot/contracts/time";
import { registerAgenda } from "../api/agenda.ts";
import { agendaPage, congressos, parseCongressos, weeklyCard, weeklyPart } from "../backend/congressos.ts";
import { near, whenLabel, type Congresso } from "../agenda.ts";

const c = (id: string, start: string, end?: string): Congresso => ({ id, name: `Congresso ${id}`, organizer: "Sociedade", start, ...(end ? { end } : {}), url: `https://example.org/${id}` });
const list = [c("past", "2026-05-02", "2026-05-05"), c("ongoing", "2026-10-20", "2026-10-28"), c("soon", "2026-11-11", "2026-11-13"), c("far", "2026-12-03", "2026-12-06"), c("oneday", "2026-10-26")];

test("the site's congress file is valid and every congress has its dates in order", () => {
  const all = congressos();
  assert.ok(all.length >= 10);
  for (const congresso of all) assert.ok(!congresso.end || congresso.end >= congresso.start, congresso.id);
});

test("a malformed congress file is refused whole", () => {
  const ok = { id: "a", name: "A", organizer: "O", start: "2026-11-11", url: "https://example.org/a" };
  assert.equal(parseCongressos({ congressos: [ok] }).length, 1);
  for (const bad of [
    { ...ok, start: "2026-02-30" },
    { ...ok, start: "11/11/2026" },
    { ...ok, end: "2026-11-10" },
    { ...ok, url: "javascript:alert(1)" },
    { ...ok, city: "Natal" },
    { ...ok, id: "Com Espaço" },
  ]) assert.throws(() => parseCongressos({ congressos: [ok, { ...bad, id: bad.id === "a" ? "b" : bad.id }] }), JSON.stringify(bad));
  assert.throws(() => parseCongressos({ congressos: [ok, ok] }), /duplicate id/);
});

test("the page lists what is going on or to come, soonest first, and what is over, latest first", () => {
  const page = agendaPage("2026-10-26", list);
  assert.deepEqual(page.upcoming.map((x) => x.id), ["ongoing", "oneday", "soon", "far"]);
  assert.deepEqual(page.past.map((x) => x.id), ["past"]);
  assert.deepEqual(agendaPage("2026-10-27", list).past.map((x) => x.id), ["oneday", "past"]);
});

test("near means going on that day or starting within 30 days after it", () => {
  assert.deepEqual(near(list, "2026-10-26").map((x) => x.id), ["ongoing", "oneday", "soon"]);
  assert.deepEqual(near(list, "2026-11-03").map((x) => x.id), ["soon", "far"]);
  assert.deepEqual(near(list, "2026-12-07"), []);
});

test("a weekly issue names the congresses near the Monday it comes out; other issues name none", async () => {
  // Week 43 of 2026 ends on Sunday 25/10; the issue comes out on Monday 26/10.
  assert.deepEqual(await weeklyPart({ kind: "weekly", key: "2026-W43" }, list), { ids: ["ongoing", "oneday", "soon"] });
  assert.equal(await weeklyPart({ kind: "weekly", key: "2026-W50" }, list), null);
  assert.equal(await weeklyPart({ kind: "daily", key: "2026-10-26" }, list), null);
  assert.equal(await weeklyPart({ kind: "monthly", key: "2026-10" }, list), null);
});

test("a weekly issue shows its congresses as the file has them now", async () => {
  const moved = list.map((x) => (x.id === "soon" ? { ...x, start: "2026-11-12" } : x)).filter((x) => x.id !== "oneday");
  const shown = await weeklyCard({ ids: ["ongoing", "oneday", "soon"] }, moved);
  assert.deepEqual(shown?.map((x) => [x.id, x.start]), [["ongoing", "2026-10-20"], ["soon", "2026-11-12"]]);
  assert.equal(await weeklyCard({ ids: ["oneday"] }, moved), null);
  assert.equal(await weeklyCard(null, moved), null);
});

test("dates read as the site writes them", () => {
  assert.equal(whenLabel(c("a", "2026-05-02", "2026-05-05")), "2 a 5/05/2026");
  assert.equal(whenLabel(c("a", "2027-05-30", "2027-06-01")), "30/05 a 1/06/2027");
  assert.equal(whenLabel(c("a", "2026-12-30", "2027-01-02")), "30/12/2026 a 2/01/2027");
  assert.equal(whenLabel(c("a", "2026-10-01")), "1/10/2026");
});

test("the site route answers the agenda of the site's day, cacheable", async () => {
  const app = Fastify();
  registerAgenda(app);
  const res = await app.inject({ method: "GET", url: "/api/site/agenda" });
  assert.equal(res.statusCode, 200);
  assert.match(String(res.headers["cache-control"]), /^public, max-age=300/);
  const body = res.json() as ReturnType<typeof agendaPage>;
  assert.deepEqual(body, agendaPage(beijingDate(new Date())));
  await app.close();
});
