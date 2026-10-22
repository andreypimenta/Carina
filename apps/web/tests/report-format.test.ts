// Failure cases: a story's date inside a week or month written "10.20" instead of the site's "20/10"; a
// story published late at night in the site's time zone dated the next (UTC) day; the archive column's
// week label too long for its narrow column ("a partir de 19/10").
import assert from "node:assert/strict";
import { test } from "node:test";
import { archiveMark, shortDay } from "../app/features/report/format.ts";

test("a story inside a week or month is dated dd/mm in the site's time zone", () => {
  assert.equal(shortDay("2026-10-20T13:00:00Z"), "20/10");
  assert.equal(shortDay("2026-10-20T02:00:00Z"), "19/10");
});

test("the archive column marks a week by its number over its Monday", () => {
  assert.deepEqual(archiveMark("weekly", "2026-W43"), { big: "43", small: "19/10" });
});
