// The literature module's readers and its licence rule, on fixed records. Failure cases: a DOI or PMC id
// is missed (no open copy is looked for), an erratum is written up as a paper, the entry day is read from
// another date (the paper lands outside the edition), a licence that forbids translation is republished,
// or the reference list leaks into the republished body.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { authorLine, parsePubmedXml, skippable } from "../backend/pubmed.ts";
import { blockText, jatsToHtml, licenseFromCode, licenseFromStatement, parseUnpaywall, republishable } from "../backend/access.ts";
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

test("licences: republication goes by the licence URL or code; sentences are read for display only", () => {
  assert.equal(licenseFromCode("cc-by"), "cc-by");
  assert.equal(licenseFromCode("http://creativecommons.org/licenses/by-nc-nd/4.0/"), "cc-by-nc-nd");
  assert.equal(licenseFromCode("CC BY\u2013NC\u2013ND 4.0"), "cc-by-nc-nd");
  assert.equal(licenseFromCode("https://creativecommons.org/publicdomain/zero/1.0/"), "cc0");
  assert.equal(licenseFromCode("implied-oa"), null);
  assert.equal(licenseFromCode("This article is licensed under a Creative Commons Attribution 4.0 International License"), null, "a sentence is not a code");
  assert.equal(licenseFromStatement("This is an open access article under the Creative Commons Attribution-NonCommercial-No Derivatives License"), "cc-by-nc-nd");
  assert.equal(licenseFromStatement("Creative Commons Attribution\u2013NonCommercial\u2013NoDerivs licence"), "cc-by-nc-nd");
  assert.equal(licenseFromStatement("Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 License. The Creative Commons Public Domain Dedication waiver (http://creativecommons.org/publicdomain/zero/1.0/) applies to the data made available in this article."), "cc-by-nc-nd");
  for (const l of ["cc-by", "cc-by-sa", "cc0", "pd"] as const) assert.equal(republishable(l, false), true, l);
  for (const l of ["cc-by-nd", "cc-by-nc-nd"] as const) assert.equal(republishable(l, true), false, l);
  assert.equal(republishable("cc-by-nc", false), false);
  assert.equal(republishable("cc-by-nc", true), true);
  assert.equal(republishable(null, true), false);
});

test("Unpaywall: an open copy with its licence, \"closed\" when it says there is none", () => {
  assert.deepEqual(parseUnpaywall(fixture("unpaywall-oa.json")), { kind: "open", copy: {
    url: "https://bmcpulmmed.biomedcentral.com/articles/10.1186/s12890-026-01234-5", license: "cc-by", host: "publisher", version: "publishedVersion",
  } });
  assert.deepEqual(parseUnpaywall(fixture("unpaywall-closed.json")), { kind: "closed" });
});

test("text of HTML keeps blocks and table cells apart; superscripts keep their caret", () => {
  assert.equal(blockText("<h2>Results</h2><p>Of 45 children</p><table><tr><td>12</td><td>45</td></tr></table>"), "Results Of 45 children 12 45");
  const [paper] = parsePubmedXml(`<PubmedArticleSet><PubmedArticle><MedlineCitation><PMID>1</PMID><Article><Journal><Title>J</Title></Journal><ArticleTitle>T</ArticleTitle><Abstract><AbstractText>Platelets 1.5 x 10<sup>9</sup>/L, p&lt;10<sup>-3</sup>, CO<sub>2</sub>.</AbstractText></Abstract></Article></MedlineCitation></PubmedArticle></PubmedArticleSet>`);
  assert.equal(paper!.abstract[0]!.text, "Platelets 1.5 x 10^9/L, p<10^-3, CO2.");
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

test("JATS: blocks nested in paragraphs, floats-group, formulas, escaped labels; third-party figures left out", () => {
  const xml = `<article xmlns:xlink="http://www.w3.org/1999/xlink"><front><article-meta><permissions><license><license-p>Creative Commons Attribution-NoDerivatives</license-p></license></permissions></article-meta></front>
  <body><sec><title>Results</title><p>Two groups:<list><list-item><p>one</p></list-item><list-item><p>two</p></list-item></list>after the list, with <inline-formula><alternatives><tex-math>x^2</tex-math><mml:math><mml:mi>x</mml:mi></mml:math></alternatives></inline-formula>.</p>
  <fig><label>Fig &lt;1&gt;</label><caption><p>Own figure</p></caption><graphic xlink:href="f1"/></fig>
  <fig><label>Fig 2</label><caption><p>Reprinted with permission from Smith et al.</p></caption><graphic xlink:href="f2"/></fig></sec></body>
  <floats-group><table-wrap><label>Table 1</label><table><tr><td>a</td><td>b</td></tr></table></table-wrap></floats-group></article>`;
  const full = jatsToHtml(xml, "PMC1");
  assert.match(full.html, /<p>Two groups:<\/p><ul><li>one<\/li><li>two<\/li><\/ul><p>after the list, with x\^2.<\/p>/);
  assert.match(full.html, /<figcaption>Fig &lt;1&gt; Own figure<\/figcaption>/);
  assert.doesNotMatch(full.html, /f2\.jpg|Smith/);
  assert.equal(full.omittedFigures, 1);
  assert.match(full.html, /<table><caption>Table 1<\/caption><tr><td>a<\/td><td>b<\/td><\/tr><\/table>$/);
  assert.equal(full.license, null, "no licence URL: never republished, whatever the sentence says");
  assert.equal(licenseFromStatement(full.statement), "cc-by-nd");
});

test("the article: sections in order, text escaped, the reference and the access note at the foot", () => {
  const [paper] = parsePubmedXml(fixture("pubmed.xml"));
  const html = renderMateria({
    desenho: "coorte", oQueFizeram: "Coorte <retrospectiva>.\n\nSegundo parágrafo.", resultados: [{ desfecho: "Decanulação", resultado: "88% e 91%", efeito: "" }],
    aFavor: [], sinaisDeAlerta: [{ sinal: "retrospectivo", detalhe: "Dados de prontuário." }], naoInformado: [], naPratica: "Ajuda a escolher.", contexto: "",
  }, paper!, { kind: "closed" }, null);
  assert.match(html, /^<h2>O que fizeram<\/h2><p>Coorte &lt;retrospectiva&gt;.<\/p><p>Segundo parágrafo.<\/p><h2>O que encontraram<\/h2>/);
  assert.doesNotMatch(html, /Contexto|Para o pediatra|Matéria escrita/);
  assert.match(html, /<h2>Quanto confiar<\/h2><ul><li><strong>Retrospectivo:<\/strong> Dados de prontuário.<\/li><\/ul><h2>Na prática<\/h2>.*<h2>Referência<\/h2>/);
  assert.match(html, /DOI: <a href="https:\/\/doi.org\/10.1016\/j.jpedsurg.2026.161999">/);
  assert.match(html, /o artigo completo é pago na editora/);
  const unknown = referenceBlock(paper!, { kind: "unknown" }, null);
  assert.doesNotMatch(unknown, /pago|gratuito/, "nothing is said about access that is not known");
  assert.match(referenceBlock(paper!, { kind: "unknown" }, "PMC42"), /<a href="https:\/\/europepmc.org\/article\/PMC\/PMC42">europepmc.org<\/a>/);
  const open = referenceBlock(paper!, { kind: "open", copy: { url: "https://europepmc.org/article/MED/41000001", license: "cc-by-nc-nd", host: "repository", version: "acceptedVersion" } }, null);
  assert.match(open, /Texto completo gratuito:<\/strong> <a href="https:\/\/europepmc.org\/article\/MED\/41000001">europepmc.org<\/a> \(manuscrito aceito pelos autores\), licença CC BY-NC-ND/);
  assert.match(materiaInput(paper!, null), /Texto disponível: somente o resumo\nLimite desta matéria: cerca de 48 palavras, somando todos os campos\n\nBACKGROUND: The best strategy/);
});
