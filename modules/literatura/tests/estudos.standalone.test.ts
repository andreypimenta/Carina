// Where a study stands, its versions, regulatory alerts and ELSO's guidelines, on fixed inputs. Failure cases: a
// trial registration a paper names is missed (or a stray number taken for one), so its versions are not linked; a
// preprint and its article are matched by a title alone, or not matched at all; a recruiting or results-posted
// registry entry is not told apart; a registry entry's title carries no label in lists and editions; a device the
// list names is missed, or an Anvisa page's text loses its order; an alert reads as evidence; a commented-out ELSO
// card or one without its update month is read wrong.
import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePubmedXml, trialIdsIn } from "../backend/pubmed.ts";
import { estadoDoPaper, estadoDoRegistro, paperIds, surname, titleSimilarity } from "../backend/estudos.ts";
import { anvisaText, namesDevice, renderAlerta, type AlertasSettings, type Ato } from "../backend/alertas.ts";
import { parseGuidelines, renderAviso } from "../backend/elso.ts";
import { alertaTitleLabel, estadoTitleLabel, isRegistro, PREPRINT_LABEL } from "../confianca.ts";
import { materiaInput } from "../backend/materia.ts";

const record = `<?xml version="1.0"?><PubmedArticleSet><PubmedArticle><MedlineCitation><PMID>41000100</PMID>
<Article><Journal><Title>Pediatric Pulmonology</Title><JournalIssue><PubDate><Year>2026</Year></PubDate></JournalIssue></Journal>
<ArticleTitle>Balloon dilation versus open repair for subglottic stenosis in children: a randomized trial.</ArticleTitle>
<Abstract><AbstractText>Compared with the trial NCT01234567. Call 2024-123456-12 for details.</AbstractText></Abstract>
<AuthorList><Author><LastName>Gonçalves</LastName><Initials>A</Initials></Author><Author><LastName>Lee</LastName><Initials>J</Initials></Author></AuthorList>
<Language>eng</Language><PublicationTypeList><PublicationType>Randomized Controlled Trial</PublicationType></PublicationTypeList>
<DataBankList><DataBank><DataBankName>ClinicalTrials.gov</DataBankName><AccessionNumberList><AccessionNumber>NCT07654321</AccessionNumber></AccessionNumberList></DataBank>
<DataBank><DataBankName>ReBEC</DataBankName><AccessionNumberList><AccessionNumber>RBR-7X8Y9Z</AccessionNumber></AccessionNumberList></DataBank></DataBankList>
</Article>
<CommentsCorrectionsList><CommentsCorrections RefType="UpdateOf"><RefSource>medRxiv. 2025</RefSource><PMID Version="1">40999999</PMID></CommentsCorrections>
<CommentsCorrections RefType="CommentIn"><RefSource>x</RefSource><PMID Version="1">41000200</PMID></CommentsCorrections></CommentsCorrectionsList>
<CoiStatement>JL received consulting fees from Acme Airway.</CoiStatement>
</MedlineCitation><PubmedData><ArticleIdList><ArticleId IdType="doi">10.1002/ppul.99999</ArticleId></ArticleIdList></PubmedData></PubmedArticle></PubmedArticleSet>`;

test("a paper's record gives the trial registrations of its data banks, the versions PubMed links and its conflicts statement", () => {
  const [paper] = parsePubmedXml(record);
  assert.deepEqual(paper!.trialIds!.sort(), ["NCT07654321", "RBR-7x8y9z"], "a trial its abstract only mentions is not its own");
  assert.deepEqual(paper!.versionPmids, ["40999999"], "a comment is not a version");
  assert.equal(paper!.coiStatement, "JL received consulting fees from Acme Airway.");
  assert.deepEqual(paperIds(paper!, ["10.1101/2025.01.02.25300001"]).sort(), [
    "doi:10.1002/ppul.99999", "doi:10.1101/2025.01.02.25300001", "pmid:40999999", "pmid:41000100", "trial:NCT07654321", "trial:RBR-7x8y9z",
  ]);
  assert.equal(estadoDoPaper(paper!), "artigo-revisado");
  assert.equal(estadoDoPaper({ ...paper!, doi: "10.1101/2025.01.02.25300001" }), "preprint");
  assert.equal(surname(paper!.authors), "goncalves");
  assert.deepEqual(trialIdsIn("https://clinicaltrials.gov/study/NCT07901946?cond=tracheomalacia"), ["NCT07901946"]);
  assert.deepEqual(trialIdsIn("NCT123 and ISRCTN12345678"), ["ISRCTN12345678"]);
  const [rebec] = trialIdsIn("https://ensaiosclinicos.gov.br/rg/RBR-7X8Y9Z");
  assert.ok(paperIds(paper!).includes(`trial:${rebec}`), "a ReBEC registry page and the paper its record lists share one key");
});

test("the writer is told the versions and the trial's other papers the site already published, so a later one is not a new finding", () => {
  const [paper] = parsePubmedXml(record);
  const input = materiaInput(paper!, null, [
    { articleId: "a1", title: "Preprint – não revisado por pares: Dilatação com balão", estado: "preprint", data: "2026-03-02", mesmoEnsaio: false },
    { articleId: "a2", title: "Dilatação com balão: resultado primário", estado: "artigo-revisado", data: "2026-01-10", mesmoEnsaio: true },
  ]);
  assert.match(input, /Outras versões deste estudo já publicadas pelo jornal: “Preprint – não revisado por pares: Dilatação com balão” \(preprint, 02\/03\/2026\)\n/);
  assert.match(input, /Outras publicações do mesmo ensaio já publicadas pelo jornal: “Dilatação com balão: resultado primário” \(artigo revisado, 10\/01\/2026\)\n/);
  assert.match(input, /Declaração de conflitos de interesse \(registro do PubMed\): JL received consulting fees/);
  assert.doesNotMatch(materiaInput(paper!, null), /Outras versões/);
});

test("a preprint and its article match by title only nearly word for word", () => {
  const a = "Balloon dilation versus open repair for subglottic stenosis in children: a randomized trial";
  assert.ok(titleSimilarity(a, "Balloon dilation versus open repair for subglottic stenosis in children") >= 0.8);
  assert.ok(titleSimilarity(a, "Balloon dilation for subglottic stenosis in adults: a cohort") < 0.8);
  assert.equal(titleSimilarity("Short title", "Short title"), 0, "too few words to tell");
});

test("a registry entry's stage from ClinicalTrials.gov, and the labels a title starts with", () => {
  assert.equal(estadoDoRegistro("NOT_YET_RECRUITING", false), "registrado");
  assert.equal(estadoDoRegistro("RECRUITING", false), "recrutando");
  assert.equal(estadoDoRegistro("ENROLLING_BY_INVITATION", undefined), "recrutando");
  assert.equal(estadoDoRegistro("COMPLETED", true), "resultados-depositados");
  assert.equal(estadoDoRegistro("COMPLETED", false), "registrado");
  assert.equal(estadoTitleLabel("recrutando"), "Estudo registrado – recrutando");
  assert.equal(estadoTitleLabel("resultados-depositados"), "Estudo registrado – resultados depositados");
  assert.equal(estadoTitleLabel("preprint"), PREPRINT_LABEL);
  assert.equal(estadoTitleLabel("artigo-revisado"), null);
  assert.ok(isRegistro("recrutando") && !isRegistro("preprint"));
  assert.equal(alertaTitleLabel({ orgao: "FDA", categoria: "recolhimento" }), "Alerta regulatório (FDA) – recolhimento");
});

const cfg: AlertasSettings = {
  days: 21, perRun: 20, productCodes: ["BTO"], fdaTerms: ["suction"], anvisaSubject: "dispositivos médicos",
  devicePatterns: ["traque[oó]stom", "c[aâ]nula", "suction", "ventilator", "ecmo"], elso: { url: "https://www.elso.org/g.aspx", pediatric: "pediatric|neonat" },
};

test("an act is read only when it names a listed device; an Anvisa page's text keeps its order; an alert says it is no evidence", () => {
  assert.equal(namesDevice(cfg, { title: "Anvisa suspende dispositivos", text: "Cânula de traqueostomia, todos os lotes" }), true);
  assert.equal(namesDevice(cfg, { title: "Anvisa suspende produtos odontológicos", text: "Resina composta" }), false);
  assert.equal(anvisaText({ description: "Resumo.", blocks: { b: { plaintext: " Segundo bloco " }, a: { plaintext: "Primeiro" } }, blocks_layout: { items: ["a", "b"] } }), "Resumo.\nPrimeiro\nSegundo bloco");
  const ato: Ato = { key: "fda-recall:Z-1", orgao: "FDA", tipo: "recolhimento", title: "Neonatal breathing circuit", text: "", url: "https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfRES/res.cfm?id=1", date: "2026-08-21" };
  const html = renderAlerta({ relevante: true, categoria: "recolhimento", titulo: "FDA recolhe circuito neonatal", linhaFina: "Lotes de 2026.", corpo: "A empresa recolheu.\n\nMotivo: vazamento." }, ato);
  assert.match(html, /<p><strong>Lotes de 2026\.<\/strong><\/p><p>A empresa recolheu\.<\/p><p>Motivo: vazamento\.<\/p>/);
  assert.match(html, /<a href="https:\/\/www\.accessdata\.fda\.gov[^"]+">Neonatal breathing circuit<\/a> \(21\/08\/2026\)/);
  assert.match(html, /não evidência de eficácia/);
});

test("ELSO's guideline cards: the title, ELSO's PDF over the journal's page, the update month; commented-out cards left out", () => {
  const html = `<h3>Respiratory Support Guidelines</h3>
<div class="rounded-border"><p><a class="txt-blue" href="https://journals.lww.com/asaiojournal/x.aspx">ELSO Guidelines for Neonatal Respiratory Failure</a></p><p>Last updated: October 2020</p><p><a class="txt-blue" href="/Portals/0/files/pdf/neonatal.pdf">Download pdf</a></p></div>
<!-- <div class="rounded-border"><p><a class="txt-blue" href="/old.pdf">Old Pediatric Guideline</a></p></div> -->
<div class="rounded-border"><p><a class="txt-blue" href="/Portals/0/Files/Guideline/peds.pdf">Pediatric ECPR</a></p></div>`;
  assert.deepEqual(parseGuidelines(html, "https://www.elso.org/ecmo-resources/elso-ecmo-guidelines.aspx"), [
    { title: "ELSO Guidelines for Neonatal Respiratory Failure", url: "https://www.elso.org/Portals/0/files/pdf/neonatal.pdf", updated: "2020-10" },
    { title: "Pediatric ECPR", url: "https://www.elso.org/Portals/0/Files/Guideline/peds.pdf", updated: null },
  ]);
  const aviso = renderAviso({ title: "Pediatric ECPR", url: "https://www.elso.org/p.pdf", updated: "2026-06" }, "https://www.elso.org/g.aspx", true);
  assert.match(aviso, /atualizou em sua página oficial de diretrizes o documento “Pediatric ECPR”\. A página informa como última atualização 06\/2026\./);
  assert.match(aviso, /ainda não leu o documento/);
});
