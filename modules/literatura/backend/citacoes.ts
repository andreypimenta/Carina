// The citation check of a special's text: every passage cites studies of its list and names nothing, and
// gives no figure or year, that the studies it cites do not; headings, the title and the dek are read
// against the whole list. It is the editions' grounded check (reports/compose.ts) applied passage by passage.
// That check reads Portuguese against Portuguese; here the studies are mostly in English, so figures are
// compared as numbers rather than as written (1.240 and 1,240; 87,5% and 87.5%).
import { ungrounded } from "@aihot/backend/reports/compose";
import { citedIn, passages, withoutCitations, type ReferenciaLida, type Trecho } from "../especiais.ts";

/** Figures written the Brazilian way, as numbers: 1.240 → 1240, 87,5% → 87.5%. */
const portugueseFigures = (text: string) => text.replace(/(\d)\.(?=\d{3}(?!\d))/g, "$1").replace(/(\d),(?=\d)/g, "$1.");
/** Figures written the English way, as numbers: 1,240 → 1240. */
const englishFigures = (text: string) => text.replace(/(\d),(?=\d{3}(?!\d))/g, "$1");

/** What a passage citing these studies may name: their authors, titles, journals, years and abstracts, and `also`. */
export function corpusOf(refs: ReferenciaLida[], also: string[]): string {
  const text = [...also, ...refs.map((r) => [r.authors.join(", "), r.title, r.journal, r.year ?? "", r.abstract].join("\n"))].join("\n");
  return `${englishFigures(text)}\n${portugueseFigures(text)}`;
}

/** An eponym of two names, "Myer-Cotton" or "Fearon-Cotton", as the two names, each read on its own. */
const eponyms = (text: string) => text.replace(/(\p{Lu}[\p{Ll}'’]+)-(?=\p{Lu}\p{Ll})/gu, "$1 ");

/** What `text` names or figures that the corpus does not. */
export const unnamed = (text: string, corpus: string) => ungrounded(eponyms(portugueseFigures(withoutCitations(text))), corpus);

/**
 * Why a passage cannot stand, or null: it cites no study, cites one that is not in the list, or names or
 * figures what the studies it cites do not. A paragraph is read whole, so a sentence that leads from one study
 * to the next needs no citation of its own, but what it names must be in the studies the paragraph cites.
 */
export function passageProblem(passage: string, refs: ReadonlyMap<number, ReferenciaLida>, also: string[]): string | null {
  const cited = citedIn(passage);
  if (!cited.length) return "não cita nenhum estudo da lista";
  const missing = cited.filter((n) => !refs.has(n));
  if (missing.length) return `cita ${missing.map((n) => `[${n}]`).join(", ")}, que não está na lista`;
  const names = unnamed(passage, corpusOf(cited.map((n) => refs.get(n)!), also));
  return names.length ? `${names.join(", ")}: não aparece nos estudos citados` : null;
}

/** What the check finds in a special's text as it is now: the passages that cannot stand and the headings, title or dek naming what no study does. */
export function checkText(text: { title: string | null; dek: string | null; body: string }, refs: ReferenciaLida[], theme: string): Trecho[] {
  const byNumber = new Map(refs.map((r) => [r.n, r]));
  const all = corpusOf(refs, [theme]);
  const found: Trecho[] = [];
  const free = (label: string, value: string | null, read = value) => {
    const names = read ? unnamed(read, all) : [];
    if (names.length) found.push({ text: `${label}: ${value}`, reason: `${names.join(", ")}: não aparece em nenhum estudo da lista` });
  };
  free("Título", text.title);
  free("Linha fina", text.dek);
  for (const p of passages(text.body)) {
    if (p.heading) {
      // "1965–1979 · Primeiras descrições": the name after the span opens it like a sentence.
      free("Intertítulo", p.text, p.text.replace(/\s*·\s*/g, ". "));
      continue;
    }
    const reason = passageProblem(p.text, byNumber, [theme]);
    if (reason) found.push({ text: p.text, reason });
  }
  return found;
}
