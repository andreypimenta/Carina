// The timeline (linha do tempo), the first format of the specials: from a theme and a PubMed search the editor
// gives, the landmark studies (the oldest records, classifications, consensus statements, systematic reviews,
// trials, large series and the best matches) and the model's account of them by era, in Portuguese, ending
// with the best evidence today and what is still open (industry/prompts/linha-do-tempo.md). Every passage
// cites studies of the list; what the citation check finds wrong is taken out, and listed, before the editor
// reads the draft (citacoes.ts).
import { z } from "zod";
import { chatJson } from "@aihot/backend/providers/llm";
import { modelFor } from "@aihot/backend/editorial/models";
import { promptText, promptVersion } from "@aihot/backend/editorial/prompts";
import { authorLine, fetchPapers, searchAll, skippable, type Paper } from "./pubmed.ts";
import { corpusOf, passageProblem, unnamed } from "./citacoes.ts";
import { FORMATS, type ReferenciaLida, type Trecho } from "../especiais.ts";

export const LINHA_STEP = "linha-do-tempo";
export const LINHA_PURPOSE = "especial_linha_do_tempo";
const VERSION = () => promptVersion(LINHA_STEP);

/**
 * The landmarks the list gathers: each a filter on the editor's search and how many studies it adds, in this
 * order of precedence; a study found by two keeps the first one's kind. The best matches fill the list.
 */
const LANDMARKS: Array<{ kind: string; filter: string | null; max: number }> = [
  { kind: "Primeiras descrições", filter: null, max: 6 },
  { kind: "Classificação", filter: '(classification[ti] OR grading[ti] OR staging[ti] OR "grading system"[tiab] OR "classification system"[tiab])', max: 4 },
  { kind: "Diretriz ou consenso", filter: '(Guideline[pt] OR "Practice Guideline"[pt] OR "Consensus Development Conference"[pt] OR consensus[ti] OR guideline*[ti] OR recommendation*[ti])', max: 5 },
  { kind: "Revisão sistemática", filter: '(systematic[sb] OR "Meta-Analysis"[pt])', max: 6 },
  { kind: "Ensaio clínico", filter: '("Randomized Controlled Trial"[pt] OR "Controlled Clinical Trial"[pt] OR "Clinical Trial"[pt])', max: 6 },
  { kind: "Série ou coorte", filter: '("Multicenter Study"[pt] OR "Cohort Studies"[Mesh] OR "Retrospective Studies"[Mesh] OR "case series"[tiab])', max: 6 },
  { kind: "Estudo", filter: null, max: 7 },
];
/** A list shorter than this is not a history: the search is too narrow. */
const MIN_REFS = 3;
/** What the model reads of each abstract. */
const ABSTRACT_CHARS = 1500;
/** esearch reaches only a search's first 10,000 records. */
const REACH = 9_999;

/** The oldest records of a search; a search too large for esearch to reach its end is first narrowed to earlier decades. */
async function oldestPmids(term: string, max: number): Promise<string[]> {
  let scoped = term;
  let { count } = await searchAll(scoped, "pub_date", 0);
  for (const until of [2009, 1999, 1989, 1979]) {
    if (count <= REACH) break;
    scoped = `(${term}) AND 1800:${until}[dp]`;
    ({ count } = await searchAll(scoped, "pub_date", 0));
  }
  return (await searchAll(scoped, "pub_date", max, Math.max(0, Math.min(count, REACH) - max))).pmids;
}

/** What kind of landmark a study is listed as: the record's own publication type, unless it was found as one of the oldest or a classification. */
function kindOf(paper: Paper, found: string): string {
  if (found === "Primeiras descrições" || found === "Classificação") return found;
  const types = new Set(paper.publicationTypes.map((t) => t.toLowerCase()));
  if (["practice guideline", "guideline", "consensus development conference"].some((t) => types.has(t))) return "Diretriz ou consenso";
  if (types.has("meta-analysis") || types.has("systematic review")) return "Revisão sistemática";
  if (types.has("randomized controlled trial")) return "Ensaio clínico randomizado";
  if ([...types].some((t) => t.startsWith("clinical trial") || t === "controlled clinical trial")) return "Ensaio clínico";
  if (types.has("multicenter study")) return "Estudo multicêntrico";
  if (types.has("case reports")) return "Relato de caso";
  if (types.has("review")) return "Revisão";
  return found;
}

/** The landmark studies of a search, oldest first, numbered as the text cites them. */
export async function gatherReferences(query: string): Promise<ReferenciaLida[]> {
  const found = new Map<string, string>();
  for (const l of LANDMARKS) {
    const pmids = l.kind === "Primeiras descrições" ? await oldestPmids(query, l.max)
      : (await searchAll(l.filter ? `(${query}) AND ${l.filter}` : query, "relevance", l.max + found.size)).pmids;
    let added = 0;
    for (const pmid of pmids) {
      if (added >= l.max) break;
      if (found.has(pmid)) continue;
      found.set(pmid, l.kind);
      added++;
    }
  }
  const papers = (await fetchPapers([...found.keys()])).filter((p) => !skippable(p));
  return papers
    .sort((a, b) => (a.year ?? "9999").localeCompare(b.year ?? "9999") || Number(a.pmid) - Number(b.pmid))
    .map((p, i) => ({
      n: i + 1,
      pmid: p.pmid,
      doi: p.doi,
      title: p.title,
      authors: p.authors,
      journal: p.journal,
      year: p.year,
      kind: kindOf(p, found.get(p.pmid)!),
      abstract: p.abstract.map((s) => (s.label ? `${s.label}: ${s.text}` : s.text)).join(" "),
    }));
}

/** What the model reads: the theme, the search and the studies. */
export function linhaInput(theme: string, query: string, refs: ReferenciaLida[]): string {
  const cut = (text: string) => (text.length > ABSTRACT_CHARS ? `${text.slice(0, text.lastIndexOf(" ", ABSTRACT_CHARS))} […]` : text);
  return [
    `Tema: ${theme}`,
    `Busca no PubMed: ${query}`,
    `Estudos (${refs.length}, em ordem cronológica; cite pelo número entre colchetes):`,
    ...refs.map((r) => [
      "",
      `[${r.n}] ${r.year ?? "ano não informado"} · ${r.kind} · ${r.journal} · ${authorLine(r.authors, 6) || "autores não informados"}`,
      `Título: ${r.title}`,
      r.abstract ? `Resumo: ${cut(r.abstract)}` : "Resumo: não disponível (escreva só a partir do título)",
    ].join("\n")),
  ].join("\n");
}

/** Optional parts: models often answer null, leave them out or give one paragraph as a string. */
const text = z.string().nullish().transform((v) => v?.trim() ?? "");
const texts = z.union([z.string(), z.array(z.string())]).nullish()
  .transform((v) => (typeof v === "string" ? v.split(/\n\s*\n/) : v ?? []).map((s) => s.trim()).filter(Boolean));
const Output = z.object({
  titulo: z.string().min(10),
  linhaFina: text,
  abertura: text,
  epocas: z.array(z.object({ titulo: text, marcos: z.array(z.object({ ano: z.union([z.string(), z.number()]).nullish().transform((v) => String(v ?? "").trim()), texto: text })).nullish().transform((v) => v ?? []) })).min(1),
  melhorEvidencia: texts,
  emAberto: texts,
});
export type Linha = z.infer<typeof Output>;

/** The years a span of dated entries covers: "1965–1979", or one year. */
function span(whens: string[]): string {
  const years = whens.flatMap((w) => w.match(/\d{4}/g) ?? []).sort();
  if (!years.length) return "";
  return years[0] === years.at(-1) ? years[0]! : `${years[0]}–${years.at(-1)}`;
}

/**
 * The draft from what the model wrote: each passage the check takes out is listed with its reason, an era
 * left with no entry loses its heading, and an era's heading is the span of its entries' years, which the
 * check has read, before its name. A title naming what no study does gives way to the format's name and the
 * theme; such a dek is left out.
 */
export function assembleLinha(out: Linha, refs: ReferenciaLida[], theme: string): { title: string; dek: string; body: string; discarded: Trecho[] } {
  const byNumber = new Map(refs.map((r) => [r.n, r]));
  const all = corpusOf(refs, [theme]);
  const discarded: Trecho[] = [];
  const stands = (when: string | null, passage: string) => {
    const reason = passageProblem({ when, text: passage }, byNumber, [theme]);
    if (reason) discarded.push({ text: when ? `${when} — ${passage}` : passage, reason });
    return !reason;
  };
  const free = (label: string, value: string) => {
    const names = unnamed(value, all);
    if (names.length) discarded.push({ text: `${label}: ${value}`, reason: `${names.join(", ")}: não aparece em nenhum estudo da lista` });
    return !names.length;
  };
  const blocks: string[] = [];
  if (out.abertura && stands(null, out.abertura)) blocks.push(out.abertura);
  for (const era of out.epocas) {
    const entries = era.marcos.filter((m) => m.texto).map((m) => ({ when: /^\d{4}(\s*[–-]\s*\d{2,4})?$/.test(m.ano) ? m.ano : null, text: m.texto }))
      .filter((m) => stands(m.when, m.text));
    if (!entries.length) continue;
    const years = span(entries.flatMap((e) => (e.when ? [e.when] : [])));
    const name = era.titulo && free("Intertítulo", era.titulo) ? era.titulo : "";
    if (years || name) blocks.push(`## ${[years, name].filter(Boolean).join(" · ")}`);
    blocks.push(...entries.map((e) => (e.when ? `${e.when} — ${e.text}` : e.text)));
  }
  const evidence = out.melhorEvidencia.filter((p) => stands(null, p));
  if (evidence.length) blocks.push("## A melhor evidência hoje", ...evidence);
  const open = out.emAberto.filter((p) => stands(null, p));
  if (open.length) blocks.push("## Pontos em aberto", open.map((p) => `- ${p.replace(/\s+/g, " ")}`).join("\n"));
  return {
    title: free("Título", out.titulo) ? out.titulo : `${FORMATS["linha-do-tempo"].name}: ${theme}`,
    dek: out.linhaFina && free("Linha fina", out.linhaFina) ? out.linhaFina : "",
    body: blocks.join("\n\n"),
    discarded,
  };
}

/** A timeline draft: the studies of the search and the text written from them. */
export async function writeLinha(id: number, theme: string, query: string) {
  const refs = await gatherReferences(query);
  if (refs.length < MIN_REFS) {
    const found = refs.length === 0 ? "não encontrou nenhum estudo" : `encontrou só ${refs.length} ${refs.length === 1 ? "estudo" : "estudos"}`;
    throw new Error(`A busca ${found} no PubMed; amplie a busca e peça de novo.`);
  }
  const res = await chatJson({
    model: await modelFor(LINHA_STEP),
    purpose: LINHA_PURPOSE,
    subject: `especial:${id}`,
    promptVersion: VERSION(),
    system: promptText(LINHA_STEP),
    user: linhaInput(theme, query, refs),
    schema: Output,
    temperature: 0.3,
    maxTokens: 8000,
    // Inside the worker's shutdown drain (jobs/queue.ts), so a stop never leaves the receipt unknown.
    timeoutMs: 180_000,
  });
  return { refs, ...assembleLinha(res.data, refs, theme), receiptId: res.receiptId };
}
