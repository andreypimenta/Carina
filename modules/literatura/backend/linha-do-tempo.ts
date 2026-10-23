// The timeline (linha do tempo), the first format of the specials: from a theme and a PubMed search the editor
// gives, the landmark studies (the PMIDs the editor requires, the oldest records, and the most influential
// classifications, consensus statements, systematic reviews, trials and studies of each decade) and the
// model's account of them, in Portuguese: an essay in running paragraphs under era headings, ending with where
// the theme's central questions stand today and what is still unknown (industry/prompts/linha-do-tempo.md).
// Every paragraph cites studies of the list; what the citation check finds wrong is taken out, and listed,
// before the editor reads the draft (citacoes.ts).
import { z } from "zod";
import { chatJson } from "@aihot/backend/providers/llm";
import { modelFor } from "@aihot/backend/editorial/models";
import { promptText, promptVersion } from "@aihot/backend/editorial/prompts";
import { authorLine, fetchPapers, searchAll, skippable, type Paper } from "./pubmed.ts";
import { influence, type Influence } from "./icite.ts";
import { corpusOf, passageProblem, unnamed } from "./citacoes.ts";
import { citedIn, FORMATS, type ReferenciaLida, type Trecho } from "../especiais.ts";

export const LINHA_STEP = "linha-do-tempo";
export const LINHA_PURPOSE = "especial_linha_do_tempo";
const VERSION = () => promptVersion(LINHA_STEP);

/**
 * The kinds of landmark sought among the search's records, each a filter on the editor's search and how many
 * of its most influential records the list takes, in this order of precedence.
 */
const LANDMARKS: Array<{ kind: string; filter: string; max: number }> = [
  { kind: "Classificação", filter: '(classification[ti] OR grading[ti] OR staging[ti] OR "grading system"[tiab] OR "classification system"[tiab])', max: 2 },
  { kind: "Diretriz ou consenso", filter: '(Guideline[pt] OR "Practice Guideline"[pt] OR "Consensus Development Conference"[pt] OR consensus[ti] OR guideline*[ti] OR recommendation*[ti])', max: 3 },
  { kind: "Revisão sistemática", filter: '(systematic[sb] OR "Meta-Analysis"[pt])', max: 4 },
  { kind: "Ensaio clínico", filter: '("Randomized Controlled Trial"[pt] OR "Controlled Clinical Trial"[pt] OR "Clinical Trial"[pt])', max: 3 },
];
/** The most studies a list has; the editor's own come first. */
export const MAX_REFS = 40;
/** The oldest records of the search open the list, however little cited. */
const OLDEST = 2;
/** Each decade with cited records gives the list up to this many of its most influential. */
const PER_DECADE = 2;
/** A record's influence is its citations, discounted by its Best Match rank: at this rank it counts half. */
const RELEVANCE = 300;
/** A list shorter than this is not a history: the search is too narrow. */
const MIN_REFS = 3;
/** What the model reads of each abstract. */
const ABSTRACT_CHARS = 1500;
/** esearch reaches only a search's first 10,000 records. */
const REACH = 9_999;

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

/**
 * Which records the list takes, and what each was found as: the PMIDs the editor requires (as the kind of
 * landmark the search finds them as, if it does), then the search's oldest records, its most influential
 * classifications, consensus statements, systematic reviews and trials (`byKind`, the search's records of each
 * LANDMARKS kind), the most influential of each decade, and the most influential of all, up to MAX_REFS.
 * `pmids` are the search's records in PubMed's Best Match order (its first REACH, for a larger search); a
 * record's influence is how often it is cited, discounted by how far down that order it is, so that a
 * much-cited record the search only grazes does not crowd out the theme's own.
 */
export function chooseLandmarks(pmids: string[], known: ReadonlyMap<string, Influence>, byKind: ReadonlyMap<string, string[]>, required: string[]): Map<string, string> {
  const rank = new Map(pmids.map((pmid, i) => [pmid, i]));
  const weight = (pmid: string) => (known.get(pmid)?.citations ?? 0) / (1 + rank.get(pmid)! / RELEVANCE);
  const byWeight = (list: string[]) => list.filter((pmid) => rank.has(pmid)).sort((a, b) => weight(b) - weight(a) || rank.get(a)! - rank.get(b)!);
  const year = (pmid: string) => known.get(pmid)?.year ?? null;

  const found = new Map<string, string>();
  const take = (list: string[], kind: string, max = MAX_REFS) => {
    let added = 0;
    for (const pmid of list) {
      if (found.size >= MAX_REFS || added >= max) break;
      if (found.has(pmid)) continue;
      found.set(pmid, kind);
      added++;
    }
  };
  for (const pmid of required) take([pmid], LANDMARKS.find((l) => byKind.get(l.kind)?.includes(pmid))?.kind ?? "Estudo");
  const dated = pmids.filter((pmid) => year(pmid) !== null);
  take([...dated].sort((a, b) => year(a)! - year(b)! || rank.get(a)! - rank.get(b)!), "Primeiras descrições", OLDEST);
  for (const l of LANDMARKS) take(byWeight(byKind.get(l.kind) ?? []), l.kind, l.max);
  const decades = Map.groupBy(dated.filter((pmid) => known.get(pmid)!.citations > 0), (pmid) => Math.floor(year(pmid)! / 10));
  for (const decade of [...decades.keys()].sort()) take(byWeight(decades.get(decade)!), "Estudo", PER_DECADE);
  take(byWeight(pmids), "Estudo");
  return found;
}

/** The landmark studies of a search and the PMIDs the editor requires (chooseLandmarks), oldest first, numbered as the text cites them. */
export async function gatherReferences(query: string, required: string[] = []): Promise<ReferenciaLida[]> {
  const { pmids } = await searchAll(query, "relevance", REACH);
  const known = await influence([...new Set([...required, ...pmids])]);
  const byKind = new Map<string, string[]>();
  for (const l of LANDMARKS) byKind.set(l.kind, (await searchAll(`(${query}) AND ${l.filter}`, "relevance", REACH)).pmids);
  const found = chooseLandmarks(pmids, known, byKind, required);
  const fetched = await fetchPapers([...found.keys()]);
  const absent = required.filter((pmid) => !fetched.some((p) => p.pmid === pmid));
  if (absent.length) throw new Error(`O PubMed não tem ${absent.length === 1 ? "o PMID" : "os PMIDs"} ${absent.join(", ")}; corrija a lista de PMIDs e peça de novo.`);
  return fetched.filter((p) => !skippable(p))
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
      citations: known.get(p.pmid)?.citations ?? 0,
    }));
}

/** What the model reads: the theme, the search and the studies, each with how often it has been cited. */
export function linhaInput(theme: string, query: string, refs: ReferenciaLida[]): string {
  const cut = (text: string) => (text.length > ABSTRACT_CHARS ? `${text.slice(0, text.lastIndexOf(" ", ABSTRACT_CHARS))} […]` : text);
  const cited = (n: number | undefined) => (n === undefined ? [] : [n === 1 ? "citado 1 vez" : `citado ${n} vezes`]);
  return [
    `Tema: ${theme}`,
    `Busca no PubMed: ${query}`,
    `Estudos (${refs.length}, em ordem cronológica; cite pelo número entre colchetes):`,
    ...refs.map((r) => [
      "",
      [`[${r.n}] ${r.year ?? "ano não informado"}`, r.kind, r.journal, authorLine(r.authors, 6) || "autores não informados", ...cited(r.citations)].join(" · "),
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
  abertura: texts,
  epocas: z.array(z.object({ titulo: text, paragrafos: texts })).min(1),
  ondeEstamos: texts,
  emAberto: texts,
});
export type Linha = z.infer<typeof Output>;

/**
 * The draft from what the model wrote: each paragraph the check takes out is listed with its reason, and an
 * era left with none loses its heading. Eras go in the order of the oldest study each cites, and each heading
 * opens with the years of the studies it cites, up to the year before the next era begins, so the headings
 * never overlap. A title naming what no study does gives way to the format's name and the theme; such a dek
 * is left out.
 */
export function assembleLinha(out: Linha, refs: ReferenciaLida[], theme: string): { title: string; dek: string; body: string; discarded: Trecho[] } {
  const byNumber = new Map(refs.map((r) => [r.n, r]));
  const all = corpusOf(refs, [theme]);
  const discarded: Trecho[] = [];
  const stands = (passage: string) => {
    const reason = passageProblem(passage, byNumber, [theme]);
    if (reason) discarded.push({ text: passage, reason });
    return !reason;
  };
  const free = (label: string, value: string) => {
    const names = unnamed(value, all);
    if (names.length) discarded.push({ text: `${label}: ${value}`, reason: `${names.join(", ")}: não aparece em nenhum estudo da lista` });
    return !names.length;
  };
  const yearsCited = (paragraphs: string[]) => paragraphs.flatMap(citedIn).map((n) => Number(byNumber.get(n)?.year)).filter((y) => y > 0).sort((a, b) => a - b);
  const eras = out.epocas
    .map((era) => ({ name: era.titulo, paragraphs: era.paragrafos.filter(stands) }))
    .filter((era) => era.paragraphs.length)
    .map((era) => ({ ...era, years: yearsCited(era.paragraphs) }))
    .sort((a, b) => (a.years[0] ?? Infinity) - (b.years[0] ?? Infinity));
  const blocks: string[] = out.abertura.filter(stands);
  eras.forEach((era, i) => {
    const next = eras[i + 1]?.years[0];
    const within = era.years.filter((y) => next === undefined || y < next);
    const span = within.length ? (within[0] === within.at(-1) ? `${within[0]}` : `${within[0]}–${within.at(-1)}`) : "";
    const name = era.name && free("Intertítulo", era.name) ? era.name : "";
    if (span || name) blocks.push(`## ${[span, name].filter(Boolean).join(" · ")}`);
    blocks.push(...era.paragraphs);
  });
  const today = out.ondeEstamos.filter(stands);
  if (today.length) blocks.push("## Onde estamos hoje", ...today);
  const open = out.emAberto.filter(stands);
  if (open.length) blocks.push("## O que ainda não sabemos", ...open);
  return {
    title: free("Título", out.titulo) ? out.titulo : `${FORMATS["linha-do-tempo"].name}: ${theme}`,
    dek: out.linhaFina && free("Linha fina", out.linhaFina) ? out.linhaFina : "",
    body: blocks.join("\n\n"),
    discarded,
  };
}

/** A timeline draft: the studies of the search (and the editor's PMIDs) and the text written from them. */
export async function writeLinha(id: number, theme: string, query: string, pmids: string[]) {
  const refs = await gatherReferences(query, pmids);
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
    maxTokens: 12000,
    // Inside the worker's shutdown drain (jobs/queue.ts), so a stop never leaves the receipt unknown.
    timeoutMs: 180_000,
  });
  return { refs, ...assembleLinha(res.data, refs, theme), receiptId: res.receiptId };
}
