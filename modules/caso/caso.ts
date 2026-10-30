// The case of the week (caso da semana): a short clinical case the editor writes in the admin for one weekly
// edition, with an optional picture and a question to the reader ("Qual a sua conduta?", optionally with
// choices); the answer and its discussion come out in the next edition. Plain data shared by the backend
// (backend/casos.ts) and the pages (web/): the states, what the api answers and the weeks an edition covers.
import type { AdminAuditEntry } from "@aihot/contracts/admin";
import { addDays, isoWeekLabel, isoWeekRange } from "@aihot/contracts/time";

/** rascunho ⇄ publicado: only a published case shows in its edition; it stays editable, so the answer can come later. */
export type CasoStatus = "rascunho" | "publicado";
export const STATUS_LABEL: Record<CasoStatus, string> = { rascunho: "Rascunho", publicado: "Publicado" };

export const DEFAULT_QUESTION = "Qual a sua conduta?";
export const MAX_OPTIONS = 5;
/** The pictures the editor sends, before they are re-encoded. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const optionLetter = (i: number) => String.fromCharCode(65 + i);

const dm = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

/** The Monday the weekly edition of `week` comes out (the day after the week it covers ends). */
export function editionDay(week: string): string | null {
  const range = isoWeekRange(week);
  return range ? addDays(range.end, 1) : null;
}

/** The week before `week`: the edition whose case `week`'s edition answers. */
export function previousWeek(week: string): string | null {
  const range = isoWeekRange(week);
  return range ? isoWeekLabel(addDays(range.start, -7)) : null;
}

/** The week after `week`. */
export function nextWeek(week: string): string | null {
  const day = editionDay(week);
  return day ? isoWeekLabel(day) : null;
}

/** "segunda, 02/11": when the edition of `week` comes out. */
export function editionLabel(week: string): string {
  const day = editionDay(week);
  return day ? `segunda, ${dm(day)}` : week;
}

/** Paragraphs of a case's text or answer: separated by a blank line. */
export const paragraphs = (text: string) => text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

export interface CasoImagem {
  url: string;
  width: number;
  height: number;
  /** What the picture shows, or its credit. */
  caption: string | null;
}

/** A case as its edition shows it: the case and the question. */
export interface CasoCard {
  week: string;
  title: string;
  body: string;
  image: CasoImagem | null;
  question: string;
  options: string[];
  /** When the answer comes out: "segunda, 02/11". */
  answerOn: string;
}

/** Last week's case answered in this edition: its question again, the right choice and the discussion. */
export interface CasoResposta {
  week: string;
  title: string;
  question: string;
  options: string[];
  correct: number | null;
  answer: string;
}

/** A weekly edition's part: this week's case, last week's answer, either or both. */
export interface CasoPart {
  caso: CasoCard | null;
  resposta: CasoResposta | null;
}

export interface AdminCasoRow {
  id: number;
  week: string;
  title: string;
  status: CasoStatus;
  hasImage: boolean;
  hasAnswer: boolean;
  updatedAt: string;
}

export interface AdminCasos {
  rows: AdminCasoRow[];
  /** The weeks a new case can be for: the edition that comes out next and the following ones, without a case yet. */
  weeks: string[];
}

export interface AdminCaso extends AdminCasoRow {
  body: string;
  image: CasoImagem | null;
  question: string;
  options: string[];
  correct: number | null;
  answer: string | null;
  createdBy: string;
  createdAt: string;
  publishedAt: string | null;
  /** The weeks it can be moved to: its own and the next ones without a case. */
  weeks: string[];
  version: string;
  history: AdminAuditEntry[];
}
