// Why a matéria can be trusted, on fixed inputs. Failure cases: a preprint is not recognised (or a Cold Spring
// Harbor journal is taken for one) and is graded as changing practice; "alinhado a diretriz" stands without the
// guideline the material names; the text read is taken from the model instead of the pipeline (an accepted
// manuscript shown as the published text); a guideline's dates are lost or read from the wrong tag; the
// editor's name is invented while the site names none; the e-mail line shows a piece without "Em um minuto".
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { isGuideline, isPreprint, parsePubmedXml } from "../backend/pubmed.ts";
import { confiancaDaMateria, confiancaDaPagina, confiancaDaTraducao, emUmMinuto, preprintNote, renderMateria, textoLido, type Materia } from "../backend/materia.ts";
import { pageDates } from "../backend/apurar.ts";
import { materiaMail } from "../backend/confianca.ts";
import { articleIdFrom, linhaRevisao, minutoCompacto, PREPRINT_LABEL, type MateriaPart } from "../confianca.ts";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const now = new Date("2026-10-31T15:00:00Z");

const materia: Materia = {
  titulo: "Reconstrução em um tempo teve decanulação semelhante", linhaFina: "", lide: "Primeiro parágrafo do lide.", contexto: "", metodos: "",
  resultados: "88% e 91%.", limitacoes: "", paraOPediatra: "", paraOEspecialista: "",
  achado: "Decanulação semelhante entre os dois tempos cirúrgicos.", paraQuem: "Cirurgiões de via aérea pediátrica", mudaAlgo: "alinhado-a-diretriz", diretriz: "",
  populacaoIdade: "", populacaoDoenca: "Estenose subglótica grau III", populacaoCenario: "Três centros terciários",
  desenho: "coorte", desenhoDetalhe: "coorte retrospectiva multicêntrica", limitacaoPrincipal: "Retrospectivo, sem randomização.",
};

test("preprints by PubMed type, server DOI or server name; a Cold Spring Harbor journal is not one; guidelines by type", () => {
  const base = { doi: null, journal: "J Pediatr Surg", publicationTypes: ["Journal Article"] };
  assert.equal(isPreprint(base), false);
  assert.equal(isPreprint({ ...base, publicationTypes: ["Preprint"] }), true);
  assert.equal(isPreprint({ ...base, doi: "10.1101/2026.03.14.26348123" }), true, "medRxiv");
  assert.equal(isPreprint({ ...base, doi: "10.1101/812345" }), true, "an old bioRxiv DOI");
  assert.equal(isPreprint({ ...base, doi: "10.1101/gr.278123.123" }), false, "Genome Research shares the prefix");
  assert.equal(isPreprint({ ...base, doi: "10.21203/rs.3.rs-4123456/v1" }), true, "Research Square");
  assert.equal(isPreprint({ ...base, journal: "medRxiv : the preprint server for health sciences" }), true);
  assert.equal(isGuideline({ publicationTypes: ["Practice Guideline"] }), true);
  assert.equal(isGuideline({ publicationTypes: ["Consensus Development Conference"] }), true);
  assert.equal(isGuideline({ publicationTypes: ["Journal Article", "Review"] }), false);
});

test("the grade: a preprint never changes anything; aligned with a guideline only with its name; no finding, no block", () => {
  assert.deepEqual(emUmMinuto(materia, false), { achado: materia.achado, paraQuem: materia.paraQuem, mudaAlgo: "pode-informar-discussao", diretriz: null });
  assert.equal(emUmMinuto({ ...materia, diretriz: "AAO-HNS 2024" }, false)!.mudaAlgo, "alinhado-a-diretriz");
  assert.equal(emUmMinuto({ ...materia, diretriz: "AAO-HNS 2024" }, false)!.diretriz, "AAO-HNS 2024");
  assert.deepEqual(emUmMinuto({ ...materia, diretriz: "AAO-HNS 2024" }, true), { achado: materia.achado, paraQuem: materia.paraQuem, mudaAlgo: "nao", diretriz: null });
  assert.equal(emUmMinuto({ ...materia, mudaAlgo: "pode-informar-discussao", diretriz: "AAO-HNS 2024" }, false)!.diretriz, null, "a guideline is named only with its grade");
  assert.equal(emUmMinuto({ ...materia, achado: " " }, false), null);
});

test("the text read is what the pipeline gave the model: the abstract, a full text, or the authors' accepted manuscript only when read from that copy", () => {
  const accepted = { kind: "open" as const, copy: { url: "https://x.org/a", license: null, host: "repository" as const, version: "acceptedVersion" as const } };
  assert.equal(textoLido(null, accepted), "resumo");
  assert.equal(textoLido("pmc", { kind: "unknown" }), "texto-completo");
  assert.equal(textoLido("pmc", accepted), "texto-completo", "PMC's text is not Unpaywall's copy");
  assert.equal(textoLido("copy", { kind: "open", copy: { url: "https://x.org/a", license: null, host: "publisher", version: "publishedVersion" } }), "texto-completo");
  assert.equal(textoLido("copy", accepted), "manuscrito-aceito");
  assert.equal(textoLido("publisher", accepted), "manuscrito-aceito");
});

test("a matéria's record: missing population fields say so, a guideline carries its dates, a preprint is labelled in its body", () => {
  const [paper] = parsePubmedXml(fixture("pubmed.xml"));
  assert.equal(paper!.publishedOn, "2026-10", "the issue's month when PubMed has no electronic date");
  const c = confiancaDaMateria(materia, paper!, "resumo", now);
  assert.deepEqual(c.populacao, { idade: "não informada", doenca: "Estenose subglótica grau III", cenario: "Três centros terciários" });
  assert.equal(c.desenho, "coorte");
  assert.equal(c.limitacao, "Retrospectivo, sem randomização.");
  assert.equal(confiancaDaMateria({ ...materia, limitacaoPrincipal: " " }, paper!, "resumo", now).limitacao, "não informada");
  assert.equal(c.textoLido, "resumo");
  assert.equal(c.preprint, false);
  assert.equal(c.datas, null, "a cohort has no document dates");
  const guideline = confiancaDaMateria(materia, { ...paper!, publicationTypes: ["Practice Guideline"], publishedOn: "2019-04-02" }, "texto-completo", now);
  assert.deepEqual(guideline.datas, { publicado: "2019-04-02", revisado: null, conferido: "2026-10-31" });

  const preprint = { ...paper!, doi: "10.1101/2026.03.14.26348123" };
  assert.equal(confiancaDaMateria({ ...materia, diretriz: "AAO-HNS 2024" }, preprint, "texto-completo", now).minuto!.mudaAlgo, "nao");
  assert.ok(renderMateria(materia, preprint, { kind: "unknown" }, null, "full").startsWith(preprintNote()));
  assert.ok(!renderMateria(materia, paper!, { kind: "unknown" }, null, "full").includes(PREPRINT_LABEL));
  assert.match(preprintNote(), /Preprint – não revisado por pares/);
});

test("an official page's dates come from its metadata, else its JSON-LD; nothing is made up", () => {
  assert.deepEqual(pageDates(`<html><head><meta property="article:published_time" content="2021-05-10T09:00:00-03:00"><meta property="article:modified_time" content="2024-02-01T12:00:00Z"></head></html>`),
    { publishedOn: "2021-05-10", modifiedOn: "2024-02-01" });
  assert.deepEqual(pageDates(`<html><head><script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage","datePublished":"2020-01-15","dateModified":"2023-07-30T10:00:00Z"}]}</script></head></html>`),
    { publishedOn: "2020-01-15", modifiedOn: "2023-07-30" });
  assert.deepEqual(pageDates(`<html><head><script type="application/ld+json">{broken</script><meta property="article:modified_time" content="ontem"></head></html>`), { publishedOn: null, modifiedOn: null });
  const page = { url: "https://sbp.com.br/diretriz", title: "Diretriz", text: "…", publishedOn: "2021-05-10", modifiedOn: null };
  const fonte = { fontePrimaria: true, organizacao: "SBP", titulo: "", linhaFina: "", lide: "", corpo: "", tipo: "diretriz" as const, achado: "A sociedade publicou a diretriz.", paraQuem: "Pediatras", mudaAlgo: "alinhado-a-diretriz" as const, diretriz: "Diretriz SBP de asma" };
  const c = confiancaDaPagina(fonte, page, now);
  assert.equal(c.textoLido, "pagina-oficial");
  assert.equal(c.desenho, "diretriz");
  assert.deepEqual(c.datas, { publicado: "2021-05-10", revisado: null, conferido: "2026-10-31" });
  assert.equal(confiancaDaPagina({ ...fonte, tipo: "congresso" }, page, now).datas, null);
});

test("the review line names the editor only once the site does; the e-mail line only for a piece with Em um minuto", () => {
  const [paper] = parsePubmedXml(fixture("pubmed.xml"));
  const c = confiancaDaMateria(materia, paper!, "resumo", now);
  assert.match(linhaRevisao(c, null), /^Matéria redigida com auxílio de inteligência artificial \(IA\) a partir da fonte original .* e selecionada automaticamente: .* O editor responsável acompanha o que vai ao ar e corrige quando necessário;/);
  assert.match(linhaRevisao(c, "Dra. Fulana"), /O editor responsável, Dra\. Fulana, acompanha o que vai ao ar/);
  const traducao = confiancaDaTraducao(materia, paper!, now);
  assert.equal(traducao.feitura, "traducao");
  assert.equal(traducao.textoLido, "texto-completo");
  assert.equal(traducao.desenho, "coorte");
  assert.match(linhaRevisao(traducao, null), /^Artigo traduzido na íntegra com inteligência artificial \(IA\) e selecionado automaticamente: .* O editor responsável acompanha/);
  for (const feitura of ["materia", "pagina", "traducao"] as const) assert.doesNotMatch(linhaRevisao({ ...c, feitura }, "Dra. Fulana"), /revisa|antes da publicação/, "nothing is reviewed before it goes live");

  const part: MateriaPart = { confianca: c, correcoes: [] };
  assert.equal(minutoCompacto(part), "Em um minuto: Decanulação semelhante entre os dois tempos cirúrgicos. Para quem: Cirurgiões de via aérea pediátrica. Muda algo agora? Pode informar a discussão.");
  const mail = materiaMail(part)!;
  assert.match(mail.html, /Em um minuto<\/b> Decanulação semelhante/);
  assert.match(mail.html, /Coorte · Texto lido: somente o resumo/);
  assert.match(mail.text, /\(Coorte · Texto lido: somente o resumo\)$/);
  assert.equal(materiaMail({ confianca: { ...c, minuto: null }, correcoes: [] }), null);
  assert.equal(materiaMail({ confianca: null, correcoes: [{ id: 1, data: "2026-10-30", oQueMudou: "x", porque: "y" }] }), null);
  assert.match(materiaMail({ confianca: { ...c, preprint: true }, correcoes: [] })!.text, /^Preprint – não revisado por pares\. Em um minuto/);
});

test("a correction's matéria from its page's address or its id", () => {
  assert.equal(articleIdFrom("https://folego.med.br/items/clx1a2b3c4d5e6f7g8h9i0j1k"), "clx1a2b3c4d5e6f7g8h9i0j1k");
  assert.equal(articleIdFrom("https://folego.med.br/items/clx1a2b3c4d5e6f7g8h9i0j1k/original?x=1"), "clx1a2b3c4d5e6f7g8h9i0j1k");
  assert.equal(articleIdFrom("https://folego.med.br/assine/2026-W44/clx1a2b3c4d5e6f7g8h9i0j1k?g=x"), "clx1a2b3c4d5e6f7g8h9i0j1k");
  assert.equal(articleIdFrom(" clx1a2b3c4d5e6f7g8h9i0j1k "), "clx1a2b3c4d5e6f7g8h9i0j1k");
  assert.equal(articleIdFrom("https://folego.med.br/especiais/linha"), null);
});
