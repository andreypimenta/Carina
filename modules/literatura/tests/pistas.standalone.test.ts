// What a lead's post names, on fixed pages. Failure cases: a DOI is read with what its link adds (a query, /full,
// a closing bracket of the sentence) and PubMed finds no paper; a DOI with brackets of its own is cut; a
// PubMed link is missed; a reference named twice is looked up twice.
import assert from "node:assert/strict";
import { test } from "node:test";
import { referencesIn } from "../backend/pistas.ts";

test("a page's DOIs and PubMed IDs, as PubMed knows them, once each and in the order named", () => {
  const html = `<p>Published in <a href="https://doi.org/10.1016/S0140-6736(26)01949-5">The Lancet</a> (doi: 10.1016/S0140-6736(26)01949-5).</p>
    <a href="https://www.nejm.org/doi/full/10.1056/NEJMoa2604565?url_ver=Z39.88-2003&amp;rfr_id=ori">NEJM</a>
    <a href="https://www.nejm.org/doi/10.1056/NEJMoa2604565/full/">again</a>
    <a href="https://onlinelibrary.wiley.com/doi/abs/10.1002%2Fppul.71898">Wiley</a>
    <a href="https://pubmed.ncbi.nlm.nih.gov/41400336/">PubMed</a> and <a href="https://www.ncbi.nlm.nih.gov/pubmed/31901092">old link</a>
    <p>See (10.1183/23120541.00723-2026).</p>`;
  assert.deepEqual(referencesIn(html), {
    dois: ["10.1016/s0140-6736(26)01949-5", "10.1056/nejmoa2604565", "10.1002/ppul.71898", "10.1183/23120541.00723-2026"],
    pmids: ["41400336", "31901092"],
  });
});

test("a page with no reference names nothing", () => {
  assert.deepEqual(referencesIn("<p>Cincinnati Children's named a best employer again.</p>"), { dois: [], pmids: [] });
});
