// Which studies a timeline's list takes from a search, on a fixed search of 600 records. Failure cases: a
// much-cited record the search only grazes crowds out the theme's own; a PMID the editor requires is left out
// or loses its kind; the oldest records, a decade with cited records or a kind of landmark is missing; one
// kind takes more than its share; the list passes its size.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Influence } from "../backend/icite.ts";
import { chooseLandmarks, MAX_REFS } from "../backend/linha-do-tempo.ts";

/** The search's records in Best Match order: record i is "1000i", from 2020 and cited 5 times unless set below. */
const pmids = Array.from({ length: 600 }, (_, i) => String(1000 + i));
const at = (i: number) => pmids[i]!;
const known = new Map<string, Influence>(pmids.map((pmid) => [pmid, { year: 2020, citations: 5 }]));
const set = (i: number, year: number, citations: number) => known.set(at(i), { year, citations });
// The theme's own, near the top and well cited.
for (let i = 1; i <= 45; i++) set(i, 2020, 60);
// Much cited, but far down the Best Match order.
set(580, 2021, 150);
// The oldest records, never cited.
set(590, 1950, 0);
set(591, 1955, 0);
set(592, 1958, 0);
// The one record of the 1970s.
set(300, 1972, 100);
const byKind = new Map([
  ["Classificação", [at(400)]],
  ["Revisão sistemática", [at(504), at(500), at(501), at(502), at(503)]],
]);
// Required: a classic the search does not find, and one it finds as a classification.
const outside = "9999999";
known.set(outside, { year: 1980, citations: 166 });

test("the list takes the editor's PMIDs, the oldest records, each kind and decade, then the most influential, with relevance discounting citations", () => {
  const found = chooseLandmarks(pmids, known, byKind, [outside, at(400)]);
  assert.equal(found.size, MAX_REFS);
  assert.equal(found.get(outside), "Estudo");
  assert.equal(found.get(at(400)), "Classificação", "a required record keeps the kind the search finds it as");
  assert.equal(found.get(at(590)), "Primeiras descrições");
  assert.equal(found.get(at(591)), "Primeiras descrições");
  assert.equal(found.has(at(592)), false, "only the two oldest are taken for their age");
  assert.deepEqual([500, 501, 502, 503].map((i) => found.get(at(i))), Array(4).fill("Revisão sistemática"));
  assert.equal(found.has(at(504)), false, "a kind takes no more than its share, the most influential first");
  assert.equal(found.get(at(300)), "Estudo", "a decade with a cited record is not left out");
  assert.ok(found.has(at(1)) && found.has(at(31)));
  assert.equal(found.has(at(580)), false, "150 citations far down the order count less than 60 near the top");
});

test("the editor's PMIDs come first, even when they fill the list", () => {
  const required = pmids.slice(100, 100 + MAX_REFS + 5);
  const found = chooseLandmarks(pmids, known, byKind, required);
  assert.deepEqual([...found.keys()], required.slice(0, MAX_REFS));
});
