// Dates of another year (features/feed/Timeline.tsx, lib/format.ts). Failure cases: a paper imported from an
// archive, dated 2019-02-19, sits under a header reading "19 de fev." (on the timeline, a story's report days, a
// topic's "Atualizado em" line, the "dd/mm hh:mm" stamps), and readers take it for this year's; the year is decided
// by the server's or reader's own clock instead of Brasília's, so the last hours of a Brasília year are dated wrong.
import assert from "node:assert/strict";
import { test } from "node:test";
import { beijingDate } from "@aihot/contracts/time";
import { monthDay, monthDayTime } from "../app/lib/format.ts";

const brasilia = (at: string) => Date.parse(`${at}-03:00`);

test("a day of today's year has no year; another year's carries it", () => {
  assert.equal(monthDay("2026-10-05", "2026-10-19"), "5 de out.");
  assert.equal(monthDay("2019-02-19", "2026-10-19"), "19 de fev. de 2019");
  assert.equal(monthDay("2025-12-31", "2026-01-01"), "31 de dez. de 2025");
});

test("the dd/mm stamps carry another Brasília year", () => {
  const now = brasilia("2026-10-05T09:00:00");
  assert.equal(monthDayTime("2026-10-05T12:00:00.000Z", now), "05/10 09:00");
  assert.equal(monthDayTime("2019-02-19T15:00:00.000Z", now), "19/02/2019 12:00");
});

test("the year turns at Brasília midnight, whatever the clock it is read on", () => {
  // 23:30 on 31 December in Brasília is already 1 January in UTC.
  const lastHalfHour = brasilia("2026-12-31T23:30:00");
  assert.equal(new Date(lastHalfHour).getUTCFullYear(), 2027);
  assert.equal(monthDay("2026-12-31", beijingDate(lastHalfHour)), "31 de dez.");
  assert.equal(monthDay("2027-01-01", beijingDate(lastHalfHour)), "1 de jan. de 2027");
  assert.equal(monthDayTime("2027-01-01T02:00:00.000Z", lastHalfHour), "31/12 23:00");
  const newYear = brasilia("2027-01-01T00:30:00");
  assert.equal(monthDay("2026-12-31", beijingDate(newYear)), "31 de dez. de 2026");
  assert.equal(monthDayTime("2027-01-01T02:00:00.000Z", newYear), "31/12/2026 23:00");
});
