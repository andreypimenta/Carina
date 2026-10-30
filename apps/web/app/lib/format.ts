import { beijingDate, beijingTime, beijingWeekday } from "@aihot/contracts/time";

/** Month names as written in Brazilian Portuguese dates ("4 de outubro"). */
export const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
/** Abbreviated month names ("4 de out."). */
export const MONTHS_SHORT = ["jan.", "fev.", "mar.", "abr.", "maio", "jun.", "jul.", "ago.", "set.", "out.", "nov.", "dez."];

/** "outubro" of a month number (1–12). */
export function monthName(month: number): string {
  return MONTHS[month - 1] ?? String(month);
}

/**
 * "28 de set." of a calendar date (YYYY-MM-DD). A day of another year than `today` (YYYY-MM-DD, Brasília) carries
 * its year, so an archived item is not read as this year's: "19 de fev. de 2019".
 */
export function monthDay(date: string, today: string = beijingDate(Date.now())): string {
  const year = date.slice(0, 4) !== today.slice(0, 4) ? ` de ${date.slice(0, 4)}` : "";
  return `${Number(date.slice(8, 10))} de ${MONTHS_SHORT[Number(date.slice(5, 7)) - 1]}${year}`;
}

/** "sáb." of a calendar date (YYYY-MM-DD). */
export function weekdayShort(date: string): string {
  return `${beijingWeekday(date).slice(0, 3)}.`;
}

export function relativeTime(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return "agora";
  const m = Math.round(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  if (d < 30) return `há ${d} ${d === 1 ? "dia" : "dias"}`;
  return dayMonthYear(beijingDate(iso));
}

/** "28/09/2026" of a calendar date (YYYY-MM-DD). */
export function dayMonthYear(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
}

export function fullDateTime(iso: string): string {
  return `${dayMonthYear(beijingDate(iso))} ${beijingTime(iso)}`;
}

/** "24/09 10:51" (Brasília time), for lists that span days; "19/02/2019 12:00" in another year than `now`'s. */
export function monthDayTime(iso: string, now: number = Date.now()): string {
  const date = beijingDate(iso);
  const year = date.slice(0, 4) !== beijingDate(now).slice(0, 4) ? `/${date.slice(0, 4)}` : "";
  return `${date.slice(8, 10)}/${date.slice(5, 7)}${year} ${beijingTime(iso)}`;
}

export function sourceInitial(name: string): string {
  const s = name.replace(/^[^\p{L}\p{N}]+/u, "");
  return (s[0] ?? "A").toUpperCase();
}
