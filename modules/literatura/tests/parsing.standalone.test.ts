// The literature module's readers and its licence rule, on fixed records. Failure cases: a DOI or PMC id
// is missed (no open copy is looked for), an erratum is written up as a paper, the entry day is read from
// another date (the paper lands outside the edition), a licence that forbids translation is republished,
// or the reference list leaks into the republished body.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { authorLine, parsePubmedXml, skippable } from "../backend/pubmed.ts";
import { jatsToHtml, normalizeLicense, parseUnpaywall, republishable } from "../backend/access.ts";
import { entryTime } from "../backend/collect.ts";
import { materiaInput, referenceBlock, renderMateria } from "../backend/materia.ts";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

test("PubMed records: ids, abstract sections, authors, types and the day each entered PubMed", () => {
  const [a, b, c] = parsePubmedXml(fixture("pubmed.xml"));
  assert.equal(a!.pmid, "41000001");
  assert.equal(a!.doi, "10.1016/j.jpedsurg.2026.161999");
  assert.equal(a!.pmcid, null);
  assert.equal(a!.title, "Single-stage versus double-stage laryngotracheal reconstruction for grade III subglottic stenosis in children: a multicenter cohort");
  assert.deepEqual(a!.abstract.map((s) => s.label), ["BACKGROUND", "METHODS", "RESULTS", "CONCLUSIONS"]);
  assert.equal(a!.abstract[0]!.text, "The best strategy for grade III subglottic stenosis is debated.");
  assert.deepEqual(a!.authors, ["Silva A", "Souza B", "Costa C", "Pediatric Airway Group"]);
  assert.equal(a!.journalAbbrev, "J Pediatr Surg");
  assert.equal(a!.year, "2026");
  assert.equal(a!.enteredOn, "2026-10-19");
  assert.deepEqual(a!.publicationTypes, ["Journal Article", "Multicenter Study"]);
  assert.equal(skippable(a!), null);

  assert.equal(b!.pmcid, "PMC12345678");
  assert.equal(b!.year, "2026");
  assert.equal(b!.abstract[0]!.label, null);
  assert.equal(b!.enteredOn, "2026-10-20");

  assert.equal(skippable(c!), "erratum");
  assert.equal(authorLine(a!.authors), "Silva A, Souza B, Costa C et al.");
});

test("an entry day is the start of that day in Brasília, never later than now", () => {
  assert.equal(entryTime("2026-10-19")!.toISOString(), "2026-10-19T03:00:00.000Z");
  const now = new Date("2026-10-19T02:00:00Z");
  assert.equal(entryTime("2026-10-19", now)!.toISOString(), now.toISOString());
  assert.equal(entryTime(null), null);
});

test("licences: only those that allow a translation are republished; NC only when the site says it is non-commercial", () => {
  assert.equal(normalizeLicense("cc-by"), "cc-by");
  assert.equal(normalizeLicense("http://creativecommons.org/licenses/by-nc-nd/4.0/"), "cc-by-nc-nd");
  assert.equal(normalizeLicense("CC BY-NC 4.0"), "cc-by-nc");
  assert.equal(normalizeLicense("https://creativecommons.org/publicdomain/zero/1.0/"), "cc0");
  assert.equal(normalizeLicense("This is an open access article under the Creative Commons Attribution-NonCommercial-NoDerivs License"), "cc-by-nc-nd");
  assert.equal(normalizeLicense("implied-oa"), null);
  assert.equal(normalizeLicense("elsevier-specific: oa user license"), null);
  for (const l of ["cc-by", "cc-by-sa", "cc0", "pd"] as const) assert.equal(republishable(l, false), true, l);
  for (const l of ["cc-by-nd", "cc-by-nc-nd"] as const) assert.equal(republishable(l, true), false, l);
  assert.equal(republishable("cc-by-nc", false), false);
  assert.equal(republishable("cc-by-nc", true), true);
  assert.equal(republishable(null, true), false);
});

test("Unpaywall: the best open copy with its licence, none for a closed paper", () => {
  assert.deepEqual(parseUnpaywall(fixture("unpaywall-oa.json")), {
    url: "https://bmcpulmmed.biomedcentral.com/articles/10.1186/s12890-026-01234-5", license: "cc-by", host: "publisher", version: "publishedVersion",
  });
  assert.equal(parseUnpaywall(fixture("unpaywall-closed.json")), null);
});

test("JATS: abstract, sections, lists, figures and tables; citations as text; no reference list or acknowledgements", () => {
  const full = jatsToHtml(fixture("jats.xml"), "PMC12345678");
  assert.equal(full.license, "cc-by");
  assert.equal(full.licenseUrl, "http://creativecommons.org/licenses/by/4.0/");
  assert.match(full.html, /^<h2>Resumo<\/h2><h3>Background<\/h3><p>Persistent wheeze/);
  assert.match(full.html, /<h2>Methods<\/h2><h3>Patients<\/h3><p>We included 120 children/);
  assert.match(full.html, /<ul><li>Wheeze for more than 3 months<\/li><li>No known airway disease<\/li><\/ul>/);
  assert.match(full.html, /such as <em>tracheomalacia<\/em>/);
  assert.match(full.html, /treatment \[1\] may/);
  assert.match(full.html, /<a href="https:\/\/example.org\/data">the dataset<\/a>/);
  assert.match(full.html, /<img src="https:\/\/europepmc.org\/articles\/PMC12345678\/bin\/12890_2026_1234_Fig1_HTML.jpg" alt="Fig. 1">/);
  assert.match(full.html, /<figcaption>Fig. 1 Bronchoscopic findings. Distribution by age.<\/figcaption>/);
  assert.match(full.html, /<table><caption>Table 1 Findings<\/caption><tr><th>Finding<\/th><th>n \(%\)<\/th><\/tr><tr><td>Tracheomalacia<\/td><td>37 \(31\)<\/td><\/tr><\/table>/);
  assert.doesNotMatch(full.html, /Smith J|thank the families/);
});

test("the article: sections in order, text escaped, the reference and the access note at the foot", () => {
  const [paper] = parsePubmedXml(fixture("pubmed.xml"));
  const html = renderMateria({
    titulo: "Reconstrução em um tempo teve decanulação semelhante", linhaFina: "Coorte de 84 crianças <grau III>", lide: "Primeiro parágrafo.\n\nSegundo parágrafo.",
    contexto: "", metodos: "Coorte retrospectiva.", resultados: "88% e 91%.", limitacoes: "Retrospectivo.", paraOPediatra: "", paraOEspecialista: "Ajuda a escolher.",
  }, paper!, null, "abstract");
  assert.match(html, /^<p><strong>Coorte de 84 crianças &lt;grau III&gt;<\/strong><\/p><p>Primeiro parágrafo.<\/p><p>Segundo parágrafo.<\/p><h2>Como foi feito<\/h2>/);
  assert.doesNotMatch(html, /Contexto|Para o pediatra/);
  assert.match(html, /<h2>O que encontraram<\/h2><p>88% e 91%.<\/p><h2>Limitações<\/h2>.*<h2>Para o especialista<\/h2>/);
  assert.match(html, /DOI: <a href="https:\/\/doi.org\/10.1016\/j.jpedsurg.2026.161999">/);
  assert.match(html, /o artigo completo é pago na editora/);
  assert.match(html, /a partir do resumo publicado/);
  const open = referenceBlock(paper!, { url: "https://europepmc.org/article/MED/41000001", license: "cc-by-nc-nd", host: "repository", version: "acceptedVersion" }, "full");
  assert.match(open, /Texto completo gratuito:<\/strong> <a href="https:\/\/europepmc.org\/article\/MED\/41000001">europepmc.org<\/a> \(manuscrito aceito pelos autores\), licença CC BY-NC-ND/);
  assert.match(materiaInput(paper!, null), /Texto disponível: somente o resumo\n\nBACKGROUND: The best strategy/);
});
