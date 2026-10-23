// What the agenda's page and the weekly issue's block share: a congress as industry/congressos.json lists it, and
// which congresses are near a day.
import { addDays } from "@aihot/contracts/time";

export interface Congresso {
  id: string;
  name: string;
  organizer: string;
  /** First and last day, YYYY-MM-DD; without `end`, the congress is its first day only. */
  start: string;
  end?: string;
  place?: string;
  url: string;
  about?: string;
}

export interface AgendaPage {
  /** Going on or still to come, soonest first. */
  upcoming: Congresso[];
  /** Over, latest first. */
  past: Congresso[];
}

/** How far ahead of an issue a congress is near enough to be in it. */
export const NEAR_DAYS = 30;

export const lastDay = (c: Congresso) => c.end ?? c.start;

/** The congresses going on on `day` or starting within `days` after it, soonest first. */
export function near(list: readonly Congresso[], day: string, days = NEAR_DAYS): Congresso[] {
  const until = addDays(day, days);
  return list.filter((c) => lastDay(c) >= day && c.start <= until).sort((a, b) => a.start.localeCompare(b.start));
}

/** "2 a 5/05/2026", "30/05 a 1/06/2027", "30/12/2026 a 2/01/2027", "1/10/2026". */
export function whenLabel(c: Congresso): string {
  const [y1, m1, d1] = c.start.split("-");
  const day = (d: string) => String(Number(d));
  if (!c.end || c.end === c.start) return `${day(d1!)}/${m1}/${y1}`;
  const [y2, m2, d2] = c.end.split("-");
  if (y1 !== y2) return `${day(d1!)}/${m1}/${y1} a ${day(d2!)}/${m2}/${y2}`;
  if (m1 !== m2) return `${day(d1!)}/${m1} a ${day(d2!)}/${m2}/${y2}`;
  return `${day(d1!)} a ${day(d2!)}/${m2}/${y2}`;
}
