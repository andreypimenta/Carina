// The journal's specials (especiais): texts the site writes from real PubMed references, kept as drafts in
// the admin and put on the site only after an editor approves and then publishes them. Plain data shared by
// the backend (backend/especiais.ts) and the pages (web/): the states, the formats, what the api answers and
// how a special's text is marked up.
import type { AdminAuditEntry } from "@aihot/contracts/admin";

/**
 * rascunho → aprovado → publicado; any of them → descartado (a published one leaves the site). Only a draft
 * is edited or written again, and an approved one sent back to draft needs a new approval.
 */
export type EspecialStatus = "rascunho" | "aprovado" | "publicado" | "descartado";
export const STATUS_LABEL: Record<EspecialStatus, string> = { rascunho: "Rascunho", aprovado: "Aprovado", publicado: "Publicado", descartado: "Descartado" };

/** Where a draft's writing is: waiting for the worker, done, or failed (the editor can ask again). */
export type EspecialWriting = "pendente" | "pronto" | "falhou";

/**
 * The formats, each written its own way (backend/especiais.ts FORMAT_WRITERS); the states, the admin, the
 * public page and the weekly's block are the same for all. Next to come: "Cabeças pensantes" (specialists who
 * disagree, with the readers' vote) and "Imagem da semana".
 */
export const FORMATS = {
  "linha-do-tempo": {
    name: "Linha do tempo",
    pitch: "A história de um tema contada pelos estudos que o marcaram, até onde estamos hoje e o que ainda não sabemos.",
  },
} as const;
export type EspecialFormat = keyof typeof FORMATS;
export const isFormat = (value: unknown): value is EspecialFormat => typeof value === "string" && Object.hasOwn(FORMATS, value);

/** A study a special cites, as [n] in its text. */
export interface Referencia {
  n: number;
  pmid: string;
  doi: string | null;
  title: string;
  authors: string[];
  journal: string;
  year: string | null;
  /** What kind of landmark it is: "Primeiras descrições", "Ensaio clínico randomizado", "Revisão sistemática"… */
  kind: string;
}

/** A reference as the writer and the citation check read it: with its abstract. */
export interface ReferenciaLida extends Referencia {
  abstract: string;
  /** How often PubMed records cite it (iCite) when the list was gathered; lists gathered before then have none. */
  citations?: number;
}

/** A passage the citation check took out of a written draft, or flags in an edited one, and why. */
export interface Trecho {
  text: string;
  reason: string;
}

export interface EspecialCard {
  slug: string;
  format: EspecialFormat;
  formatName: string;
  title: string;
  dek: string | null;
  publishedAt: string;
  refCount: number;
}

/** A published special as its page shows it. */
export interface EspecialPage extends EspecialCard {
  theme: string;
  body: string;
  refs: Referencia[];
  /** The weekly issue that carried it, once one has. */
  issueKey: string | null;
}

export interface AdminEspecialRow {
  id: number;
  format: EspecialFormat;
  theme: string;
  status: EspecialStatus;
  writing: EspecialWriting;
  title: string | null;
  slug: string | null;
  issueKey: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

/** The PMIDs an editor typed, separated by spaces, commas or lines: "4626647, 7458136". */
export const pmidList = (text: string) => text.split(/[\s,;]+/).filter(Boolean);

export interface AdminEspeciais {
  rows: AdminEspecialRow[];
  /** The saved PubMed searches (industry/literatura.json), to start a special's search from. */
  searches: Array<{ id: string; name: string; term: string }>;
}

export interface AdminEspecial extends AdminEspecialRow {
  query: string;
  /** PMIDs the editor requires in the list, whether or not the search finds them. */
  pmids: string[];
  error: string | null;
  dek: string | null;
  body: string | null;
  refs: ReferenciaLida[];
  /** What the check took out of the text the model wrote. */
  discarded: Trecho[];
  /** What the check finds in the text as it is now (the editor's edits included). */
  warnings: Trecho[];
  createdBy: string;
  approvedBy: string | null;
  approvedAt: string | null;
  /** Sent back with every change: a change made against an older view is refused. */
  version: string;
  /** Its audited changes, newest first. */
  history: AdminAuditEntry[];
}

// ── The text ────────────────────────────────────────────────────────────────────────────────────────────
// Plain text an editor can change in a box: blocks are separated by a blank line; "## " opens a heading and
// "- " a list item, any other block is a paragraph; a study is cited by its number in brackets: [3], [3, 5],
// [3–5].

export type Inline = { text: string } | { ref: number };
export type Block =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: Inline[] }
  | { type: "list"; items: Inline[][] };

const CITATION = /\[(\d+(?:\s*[,–-]\s*\d+)*)\]/g;

/** The numbers a citation names: "3, 5" → 3, 5; "3–5" → 3, 4, 5. */
function numbers(inside: string): number[] {
  return inside.split(",").flatMap((part) => {
    const [a, b] = part.split(/[–-]/).map((n) => Number(n.trim()));
    if (b === undefined) return [a!];
    return b >= a! && b - a! <= 50 ? Array.from({ length: b - a! + 1 }, (_, i) => a! + i) : [a!, b];
  });
}

/** Every study a passage cites, in order, once each. */
export function citedIn(text: string): number[] {
  return [...new Set([...text.matchAll(CITATION)].flatMap((m) => numbers(m[1]!)))];
}

/** The text with its citations numbered again by `to`; a number `to` does not map stays as it is. */
export function renumberCitations(text: string, to: ReadonlyMap<number, number>): string {
  return text.replace(CITATION, (_m, inside: string) => `[${numbers(inside).map((n) => to.get(n) ?? n).join(", ")}]`);
}

/** A passage without its citations. */
export const withoutCitations = (text: string) => text.replace(CITATION, "").replace(/\s+([.,;:!?])/g, "$1").replace(/\s{2,}/g, " ").trim();

function inline(text: string): Inline[] {
  const out: Inline[] = [];
  let at = 0;
  for (const m of text.matchAll(CITATION)) {
    if (m.index > at) out.push({ text: text.slice(at, m.index) });
    for (const ref of numbers(m[1]!)) out.push({ ref });
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at) });
  return out;
}

const blocksOf = (body: string) => body.replace(/\r\n/g, "\n").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
const linesOf = (block: string) => block.split("\n").map((l) => l.trim());
const isList = (lines: string[]) => lines.every((l) => l.startsWith("- "));
const heading = (block: string) => block.slice(3).replace(/\s+/g, " ").trim();

export function parseBody(body: string): Block[] {
  return blocksOf(body).map((block): Block => {
    if (block.startsWith("## ")) return { type: "heading", text: heading(block) };
    const lines = linesOf(block);
    if (isList(lines)) return { type: "list", items: lines.map((l) => inline(l.slice(2).trim())) };
    return { type: "paragraph", text: inline(lines.join(" ")) };
  });
}

/** The text's headings and passages (a paragraph, a list item) as written. */
export type Passage = { heading: boolean; text: string };

export function passages(body: string): Passage[] {
  return blocksOf(body).flatMap((block): Passage[] => {
    if (block.startsWith("## ")) return [{ heading: true, text: heading(block) }];
    const lines = linesOf(block);
    if (isList(lines)) return lines.map((l) => ({ heading: false, text: l.slice(2).trim() }));
    return [{ heading: false, text: lines.join(" ") }];
  });
}
