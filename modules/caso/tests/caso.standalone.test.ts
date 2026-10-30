// The weeks a case moves through: its edition, the one before (whose answer it carries) and the next (with
// its own answer), across the turn of a year and in a year of 53 weeks. Failure case: a case's answer goes to
// the wrong edition, or the admin names the wrong Monday.
import assert from "node:assert/strict";
import { test } from "node:test";
import { editionDay, editionLabel, nextWeek, optionLetter, paragraphs, previousWeek } from "../caso.ts";

test("an edition comes out the Monday after its week; the weeks before and after cross the year", () => {
  assert.equal(editionDay("2026-W44"), "2026-11-02");
  assert.equal(editionLabel("2026-W44"), "segunda, 02/11");
  assert.equal(nextWeek("2026-W52"), "2026-W53", "2026 has 53 weeks");
  assert.equal(nextWeek("2026-W53"), "2027-W01");
  assert.equal(previousWeek("2027-W01"), "2026-W53");
  assert.equal(previousWeek("2025-W01"), "2024-W52");
  assert.equal(editionLabel("2026-W53"), "segunda, 04/01");
  assert.equal(editionDay("bad"), null);
  assert.equal(editionLabel("bad"), "bad");
});

test("paragraphs are split by blank lines; choices are lettered", () => {
  assert.deepEqual(paragraphs("Um.\nainda um.\n\n  \nDois.\n\n"), ["Um.\nainda um.", "Dois."]);
  assert.deepEqual([0, 1, 4].map(optionLetter), ["A", "B", "E"]);
});
