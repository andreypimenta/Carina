// Calendar days printed on the report pages (features/report/format.ts). Failure cases, the same class as
// day-header-year.test.ts: on 2 January 2027 the "Dia anterior" link on the 1 January issue reads "Dia anterior ·
// 31 de dez.", read as 2027's. The follow-up badge in ReportPaper.tsx and the calendar grid's hover labels go through the same monthDay.
import assert from "node:assert/strict";
import { test } from "node:test";
import { neighbourLabel, periodGrid } from "../app/features/report/format.ts";

test("the previous and next day links name the year across the year boundary", () => {
  // 31 December 2026, 23:30 in Brasília: the year has not turned for the site's clock.
  const endOfYear = Date.parse("2026-12-31T23:30:00-03:00");
  assert.equal(neighbourLabel("daily", "2026-12-30", "prev", endOfYear), "Dia anterior · 30 de dez.");
  assert.equal(neighbourLabel("daily", "2027-01-01", "next", endOfYear), "Dia seguinte · 1 de jan. de 2027");
  const newYear = Date.parse("2027-01-01T08:00:00-03:00");
  assert.equal(neighbourLabel("daily", "2026-12-31", "prev", newYear), "Dia anterior · 31 de dez. de 2026");
  assert.equal(neighbourLabel("daily", "2027-01-02", "next", newYear), "Dia seguinte · 2 de jan.");
});

test("the calendar grid of another year's daily names the year", () => {
  const { cells } = periodGrid("daily", "2019-02-19", [{ key: "2019-02-19", issueNumber: 1 }], 1);
  assert.match(cells.find((c) => c.key === "2019-02-19")!.label, /^19 de fev\. de 2019 · edição nº 1$/);
});
