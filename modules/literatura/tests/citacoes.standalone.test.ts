// The specials' text and its citation check, on fixed studies. Failure cases: a passage that cites no study,
// or one that is not in the list, reaches the editor as if it were sourced; a name, figure or year the cited
// studies do not have survives; a figure written the Brazilian way is taken for an invented one; an era with
// nothing left keeps its heading; a citation or a dated entry is drawn as plain text.
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
  abertura: "A estenose subglótica da criança é estudada desde 1965 [1].",
  epocas: [
    { titulo: "Primeiras descrições", marcos: [{ ano: "1965", texto: "Holinger descreveu crianças com estenose adquirida e congênita [1]." }] },
    {
      titulo: "A classificação",
      marcos: [
        { ano: "1994", texto: "Myer, O'Connor e Cotton propuseram quatro graus pelo maior tubo que passa [2]." },
        { ano: "1998", texto: "Uma série de Boston com 412 crianças confirmou a classificação [2]." },
      ],
    },
    { titulo: "Sem apoio", marcos: [{ ano: "2001", texto: "Um estudo mostrou benefício da técnica." }] },
  ],
  melhorEvidencia: ["Uma metanálise de 1.240 crianças encontrou decanulação de 87,5% [3].", "Outra revisão confirmou o achado [7]."],
  emAberto: ["Faltam ensaios que comparem as técnicas [3]."],
};

test("a written timeline keeps only passages its studies support, and lists what it took out and why", () => {
  const draft = assembleLinha(written, REFS, THEME);
  assert.equal(draft.title, written.titulo);
  assert.equal(draft.dek, "", "a dek naming what no study does is left out");
  assert.equal(draft.body, [
    "A estenose subglótica da criança é estudada desde 1965 [1].",
    "## 1965 · Primeiras descrições",
    "1965 — Holinger descreveu crianças com estenose adquirida e congênita [1].",
    "## 1994 · A classificação",
    "1994 — Myer, O'Connor e Cotton propuseram quatro graus pelo maior tubo que passa [2].",
    "## A melhor evidência hoje",
    "Uma metanálise de 1.240 crianças encontrou decanulação de 87,5% [3].",
    "## Pontos em aberto",
    "- Faltam ensaios que comparem as técnicas [3].",
  ].join("\n\n"));
  const reasons = Object.fromEntries(draft.discarded.map((d) => [d.text, d.reason]));
  for (const name of ["1998", "Boston", "412"]) assert.ok(reasons["1998 — Uma série de Boston com 412 crianças confirmou a classificação [2]."]!.includes(name), name);
  assert.equal(reasons["2001 — Um estudo mostrou benefício da técnica."], "não cita nenhum estudo da lista");
  assert.equal(reasons["Outra revisão confirmou o achado [7]."], "cita [7], que não está na lista");
  assert.match(reasons[`Linha fina: ${written.linhaFina}`]!, /Sociedade/);
  assert.equal(draft.discarded.length, 4);
});

test("a title naming what no study does gives way to the format and the theme", () => {
  const draft = assembleLinha({ ...written, titulo: "Estenose subglótica: o consenso de Boston de 2015" }, REFS, THEME);
  assert.equal(draft.title, `Linha do tempo: ${THEME}`);
});

test("the check reads an edited text: a passage with a figure its study lacks, a missing study and an unsupported year are flagged; a span heading is not", () => {
  const body = [
    "## 1965–1994 · Primeiras descrições",
    "1965 — Holinger tratou crianças [1].",
    "1972 — Holinger tratou mais crianças [1].",
    "A decanulação chegou a 92,3% [3].",
    "- Ponto sem fonte.",
    "- Um ponto apoiado [2, 3].",
  ].join("\n\n");
  const found = checkText({ title: "Estenose subglótica pediátrica", dek: "Da série de 1965 à metanálise.", body }, REFS, THEME);
  assert.deepEqual(found.map((f) => f.text), [
    "1972 — Holinger tratou mais crianças [1].",
    "A decanulação chegou a 92,3% [3].",
    "Ponto sem fonte.",
  ]);
  assert.match(found[1]!.reason, /92,3%|92\.3%/);
});

test("the text's markup: headings, dated entries, lists and citations, single, several and spans", () => {
  const blocks = parseBody("Abertura [1, 3].\n\n## 1965 · Primeiras descrições\n\n1965 — Primeira série [1].\n\n1994–1996 — Classificação [1–3].\n\n- Um ponto [2].\n- Outro ponto.");
  assert.deepEqual(blocks, [
    { type: "paragraph", when: null, text: [{ text: "Abertura " }, { ref: 1 }, { ref: 3 }, { text: "." }] },
    { type: "heading", text: "1965 · Primeiras descrições" },
    { type: "paragraph", when: "1965", text: [{ text: "Primeira série " }, { ref: 1 }, { text: "." }] },
    { type: "paragraph", when: "1994–1996", text: [{ text: "Classificação " }, { ref: 1 }, { ref: 2 }, { ref: 3 }, { text: "." }] },
    { type: "list", items: [[{ text: "Um ponto " }, { ref: 2 }, { text: "." }], [{ text: "Outro ponto." }]] },
  ]);
});
