// The site's calendar helpers shared by web and backend. The site runs on Brasília time
// (America/Sao_Paulo, fixed UTC−3: Brazil has had no daylight saving since 2019). The helpers keep their
// historical beijing* names from the upstream engine; they all read the site's zone below.

/** IANA zone of the site's calendar: publishing schedules, report windows, dates shown to readers. */
export const SITE_TIME_ZONE = "America/Sao_Paulo";
/** The fixed UTC offset of SITE_TIME_ZONE, as ISO 8601 writes it. */
export const SITE_UTC_OFFSET = "-03:00";

const OFFSET_MS = -3 * 3600 * 1000;

/** YYYY-MM-DD of the instant in the site's time. */
export function beijingDate(instant: Date | string | number): string {
  const d = new Date(new Date(instant).getTime() + OFFSET_MS);
  return d.toISOString().slice(0, 10);
}

/** HH:mm of the instant in the site's time. */
export function beijingTime(instant: Date | string | number): string {
  const d = new Date(new Date(instant).getTime() + OFFSET_MS);
  return d.toISOString().slice(11, 16);
}

/** UTC instant of 00:00 site time on the given calendar day. */
export function beijingMidnight(date: string): Date {
  return new Date(Date.parse(`${date}T00:00:00${SITE_UTC_OFFSET}`));
}

/** UTC instant of an HH:mm site time on the given calendar day. */
export function beijingAt(date: string, time: string): Date {
  return new Date(Date.parse(`${date}T${time}:00${SITE_UTC_OFFSET}`));
}

export function addDays(date: string, days: number): string {
  const t = Date.parse(`${date}T00:00:00Z`) + days * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

const WEEKDAYS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

export function beijingWeekday(date: string): string {
  return WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]!;
}

/** ISO week label (e.g. 2026-W38) of a calendar date. */
export function isoWeekLabel(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - day + 3); // Thursday of this week
  const year = d.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(year, 0, 4));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86400000));
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** Monday..Sunday calendar dates of an ISO week label. */
export function isoWeekRange(label: string): { start: string; end: string } | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(label);
  if (!m) return null;
  const year = Number(m[1]);
  const week = Number(m[2]);
  if (week < 1 || week > 53) return null;
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const mondayWeek1 = new Date(jan4);
  mondayWeek1.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7));
  const start = new Date(mondayWeek1);
  start.setUTCDate(mondayWeek1.getUTCDate() + (week - 1) * 7);
  const startDate = start.toISOString().slice(0, 10);
  if (isoWeekLabel(startDate) !== label) return null;
  return { start: startDate, end: addDays(startDate, 6) };
}

/** First and last day (YYYY-MM-DD) of a calendar month label such as 2026-09; null for anything else. */
export function monthRange(label: string): { start: string; end: string } | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(label);
  if (!m) return null;
  const next = Number(m[2]) === 12 ? `${Number(m[1]) + 1}-01-01` : `${m[1]}-${String(Number(m[2]) + 1).padStart(2, "0")}-01`;
  return { start: `${label}-01`, end: addDays(next, -1) };
}

export function isValidDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const t = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === date;
}
