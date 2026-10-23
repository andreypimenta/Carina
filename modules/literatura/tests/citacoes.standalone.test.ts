// The specials' text and its citation check, on fixed studies. Failure cases: a paragraph that cites no study,
// or one that is not in the list, reaches the editor as if it were sourced; a name, figure or year the cited
// studies do not have survives; a figure written the Brazilian way, a sentence of transition inside a sourced
// paragraph or an eponym of cited names is taken for an invented one; the eras' headings overlap or go out of
// order; an era with nothing left keeps its heading; a citation is drawn as plain text.
import assert from "node:assert/strict";
import { test } from "node:test";
import { checkText } from "../backend/citacoes.ts";
import { assembleLinha, type Linha } from "../backend/linha-do-tempo.ts";
import { parseBody, type ReferenciaLida } from "../especiais.ts";

const REFS: ReferenciaLida[] = [
  { n: 1, pmid: "5000001", doi: null, title: "Subglottic stenosis in infants and children", authors: ["Holinger PH", "Kutnick SL"], journal: "Ann Otol Rhinol Laryngol", year: "1965", kind: "Primeiras descrições", abstract: "Thirty-one children with acquired and congenital subglottic stenosis were treated." },
  { n: 2, pmid: "7000002", doi: "10.1177/000348949410300405", title: "Proposed grading system for subglottic stenosis based on endotracheal tube sizes", authors: ["Myer CM", "O'Connor DM", "Cotton RT"], journal: "Ann Otol Rhinol Laryngol", year: "1994", kind: "Classificação", abstract: "A grading system with four grades is proposed, based on the largest endotracheal tube that passes." },
  { n: 3, pmid: "9000003", doi: "10.1002/lary.28000", title: "Single-stage versus double-stage laryngotracheal reconstruction: a systematic review and meta-analysis", authors: ["Silva A", "Souza B"], journal: "Laryngoscope", year: "2020", kind: "Revisão sistemática", abstract: "We pooled 1,240 children from 31 studies. The overall decannulation rate was 87.5% (95% CI 84.1-90.4)." },
];
const THEME = "Estenose subglótica pediátrica";

const written: Linha = {
  titulo: "Estenose subglótica pediátrica: de 1965 à metanálise de 2020",
  linhaFina: "Seis décadas de estudos, da série de Holinger ao consenso da Sociedade Europeia.",
  abertura: ["Trinta e uma crianças com estenose subglótica adquirida e congênita foram tratadas na série de 1965 [1]. Faltava, porém, uma forma de comparar os resultados."],
  epocas: [
    // Out of order, as a model may give them: the eras go by the oldest study each cites.
    { titulo: "Comparar as técnicas", paragrafos: ["Em 2020, uma metanálise reuniu 1.240 crianças e encontrou decanulação de 87,5% [3]."] },
    {
      titulo: "Classificar para comparar",
      paragrafos: [
        "A pergunta mudou. Myer, O'Connor e Cotton propuseram quatro graus pelo maior tubo que passa [2], e a classificação de Myer-Cotton passou a ordenar as séries [2].",
        "Uma série de Boston com 412 crianças confirmou a classificação [2].",
        "Sem apoio nenhum, a técnica se espalhou.",
      ],
    },
    { titulo: "Primeiras descrições", paragrafos: ["Holinger descreveu crianças com estenose adquirida e congênita [1], e a metanálise de 2020 ainda as tomaria como ponto de partida [1, 3]."] },
    { titulo: "Sem apoio", paragrafos: ["Um estudo mostrou benefício da técnica."] },
  ],
  ondeEstamos: ["Uma metanálise de 1.240 crianças encontrou decanulação de 87,5% [3].", "Outra revisão confirmou o achado [7]."],
  emAberto: ["Faltam ensaios que comparem as técnicas [3]."],
};

test("a written timeline keeps only paragraphs its studies support, in eras of strict chronological order, and lists what it took out and why", () => {
  const draft = assembleLinha(written, REFS, THEME);
  assert.equal(draft.title, written.titulo);
  assert.equal(draft.dek, "", "a dek naming what no study does is left out");
  assert.equal(draft.body, [
    "Trinta e uma crianças com estenose subglótica adquirida e congênita foram tratadas na série de 1965 [1]. Faltava, porém, uma forma de comparar os resultados.",
    "## 1965 · Primeiras descrições",
    "Holinger descreveu crianças com estenose adquirida e congênita [1], e a metanálise de 2020 ainda as tomaria como ponto de partida [1, 3].",
    "## 1994 · Classificar para comparar",
    "A pergunta mudou. Myer, O'Connor e Cotton propuseram quatro graus pelo maior tubo que passa [2], e a classificação de Myer-Cotton passou a ordenar as séries [2].",
    "## 2020 · Comparar as técnicas",
    "Em 2020, uma metanálise reuniu 1.240 crianças e encontrou decanulação de 87,5% [3].",
    "## Onde estamos hoje",
    "Uma metanálise de 1.240 crianças encontrou decanulação de 87,5% [3].",
    "## O que ainda não sabemos",
    "Faltam ensaios que comparem as técnicas [3].",
  ].join("\n\n"));
  const reasons = Object.fromEntries(draft.discarded.map((d) => [d.text, d.reason]));
  for (const name of ["Boston", "412"]) assert.ok(reasons["Uma série de Boston com 412 crianças confirmou a classificação [2]."]!.includes(name), name);
  assert.equal(reasons["Sem apoio nenhum, a técnica se espalhou."], "não cita nenhum estudo da lista", "a paragraph of transition alone has no source");
  assert.equal(reasons["Um estudo mostrou benefício da técnica."], "não cita nenhum estudo da lista");
  assert.equal(reasons["Outra revisão confirmou o achado [7]."], "cita [7], que não está na lista");
  assert.match(reasons[`Linha fina: ${written.linhaFina}`]!, /Sociedade/);
  assert.equal(draft.discarded.length, 5);
});

test("a title naming what no study does gives way to the format and the theme", () => {
  const draft = assembleLinha({ ...written, titulo: "Estenose subglótica: o consenso de Boston de 2015" }, REFS, THEME);
  assert.equal(draft.title, `Linha do tempo: ${THEME}`);
});

test("the check reads an edited text: a paragraph with a figure, a year or a name its studies lack is flagged; a span heading and an eponym of cited names are not", () => {
  const body = [
    "## 1965–1994 · Primeiras descrições",
    "Holinger tratou crianças [1].",
    "Em 1972, Holinger tratou mais crianças [1].",
    "A decanulação chegou a 92,3% [3].",
    "A classificação de Myer-Cotton tem quatro graus [2].",
    "A classificação de Myer-Holinger tem quatro graus [2].",
    "- Ponto sem fonte.",
    "- Um ponto apoiado [2, 3].",
  ].join("\n\n");
  const found = checkText({ title: "Estenose subglótica pediátrica", dek: "Da série de 1965 à metanálise.", body }, REFS, THEME);
  assert.deepEqual(found.map((f) => f.text), [
    "Em 1972, Holinger tratou mais crianças [1].",
    "A decanulação chegou a 92,3% [3].",
    "A classificação de Myer-Holinger tem quatro graus [2].",
    "Ponto sem fonte.",
  ]);
  assert.match(found[1]!.reason, /92,3%|92\.3%/);
  assert.match(found[2]!.reason, /^Holinger:/, "each name of an eponym must be in the studies cited");
});

test("the text's markup: headings, paragraphs, lists and citations, single, several and spans", () => {
  const blocks = parseBody("Abertura [1, 3].\n\n## 1965 · Primeiras descrições\n\nPrimeira série [1].\nContinua o parágrafo [1–3].\n\n- Um ponto [2].\n- Outro ponto.");
  assert.deepEqual(blocks, [
    { type: "paragraph", text: [{ text: "Abertura " }, { ref: 1 }, { ref: 3 }, { text: "." }] },
    { type: "heading", text: "1965 · Primeiras descrições" },
    { type: "paragraph", text: [{ text: "Primeira série " }, { ref: 1 }, { text: ". Continua o parágrafo " }, { ref: 1 }, { ref: 2 }, { ref: 3 }, { text: "." }] },
    { type: "list", items: [[{ text: "Um ponto " }, { ref: 2 }, { text: "." }], [{ text: "Outro ponto." }]] },
  ]);
});
