// Published dates as list pages, articles and JSON lists print them, read the same on every host.
import type { SourceRow } from "./types.ts";
import { SITE_UTC_OFFSET } from "@aihot/contracts/time";

/** Which number comes first in a source's "18/09/2026": the day (dmy) or the month (mdy). */
export type DateOrder = "dmy" | "mdy";

/** The offset a source's article pages print their dates in: its detail rules' own, else its listing's. */
export function articleUtcOffset(config: SourceRow["config"]): string | undefined {
  return config.detail?.publishedAtUtcOffset ?? config.publishedAtUtcOffset;
}

/** The order of a source's article pages' numeric dates: its detail rules' own, else its listing's. */
export function articleDateOrder(config: SourceRow["config"]): DateOrder | undefined {
  return config.detail?.publishedAtDateOrder ?? config.publishedAtDateOrder;
}

/** Month names pages write in Portuguese, Spanish and English, full and abbreviated, as English reads them. */
const MONTHS: Record<string, string> = Object.fromEntries([
  ["January", "january janeiro enero jan ene"],
  ["February", "february fevereiro febrero feb fev"],
  ["March", "march março marco marzo mar"],
  ["April", "april abril apr abr"],
  ["May", "may maio mayo mai"],
  ["June", "june junho junio jun"],
  ["July", "july julho julio jul"],
  ["August", "august agosto aug ago"],
  ["September", "september setembro septiembre setiembre sept sep set"],
  ["October", "october outubro octubre oct out"],
  ["November", "november novembro noviembre nov"],
  ["December", "december dezembro diciembre dec dez dic"],
].flatMap(([english, names]) => names!.split(" ").map((name) => [name, english!])));
const MONTH_NAMES = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");
/** A day, a written month and a year: "30 de mayo de 2026", "1º de outubro de 2026", "3 set. 2026", "23-Oct-2026". */
const WRITTEN_DAY_MONTH = new RegExp(`(?<![\\p{L}\\d])(\\d{1,2})[º°]?(?:\\s+de\\s+|\\s+|-)(${MONTH_NAMES})\\.?(?:\\s+del?\\s+|,?\\s+|-)(\\d{4})(?!\\d)`, "iu");
/** The time a written date may be followed by: ", 10:00", " at 10:00 p.m. GMT+0200", " às 14:30". */
const WRITTEN_TIME = /^\s*,?\s*(?:at\s+|às\s+|a las\s+)?(\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(?:\s*([ap])\.?m\.?(?![\p{L}\d]))?(\s*(?:Z|[+-]\d{2}:?\d{2}|(?:GMT|UTC?)(?:[+-]\d{2}:?\d{2})?|[EMPC][SD]T)(?![\p{L}\d]))?/iu;
/** A numeric date with the year last: "18/09/2026", "04.23.2026", "24/09/26". */
const DAY_MONTH_YEAR = /(?<![\d./-])(\d{1,2})([./-])(\d{1,2})\2(\d{4}|\d{2})(?![\d./-])/;

/**
 * The date rewritten in a form read below: a written month in English ("30 May 2026"), a numeric date with the
 * year last as year/month/day. Which of "05/10/2026" is the day only the source can say (dateOrder); without it, a
 * number above 12 decides, and "05/10/2026" is no date. A two-digit year is read only in a declared order.
 */
function normalized(v: string, dateOrder?: DateOrder): string {
  const written = WRITTEN_DAY_MONTH.exec(v);
  if (written) {
    // Only a time right after the date is kept: the words around it ("segunda-feira,", "· 4 min de leitura") are no date.
    const after = v.slice(written.index + written[0].length);
    const time = WRITTEN_TIME.exec(after);
    const clock = time && !/^\s*[A-Z]{2,5}\b/.test(after.slice(time[0].length)) ? ` ${time[1]}${time[2] ? ` ${time[2].toUpperCase()}M` : ""}${time[3] ?? ""}` : "";
    return `${written[1]} ${MONTHS[written[2]!.toLowerCase()]} ${written[3]}${clock}`;
  }
  const m = DAY_MONTH_YEAR.exec(v);
  if (!m) return v;
  const [a, b] = [Number(m[1]), Number(m[3])];
  const year = m[4]!.length === 4 ? m[4] : dateOrder ? `20${m[4]}` : null;
  const order = dateOrder ?? (a > 12 && b <= 12 ? "dmy" : b > 12 && a <= 12 ? "mdy" : null);
  if (!year || !order) return v;
  const [day, month] = order === "dmy" ? [a, b] : [b, a];
  return v.slice(0, m.index) + `${year}/${month}/${day}` + v.slice(m.index + m[0].length);
}

/**
 * A time followed by its zone: "10:00Z", "10:00:00+08:00", "10:00:00 +0000", "10:00 PM GMT", "10:00 EST".
 * CST is no zone here: Date.parse reads US Central, but pages mean different zones by it, so it is read in the source's offset.
 */
const EXPLICIT_ZONE = /\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?\s*(?:[AP]M\s*)?(?:Z|[+-]\d{2}:?\d{2}|GMT|UTC?|[EMP][SD]T|CDT)\b/i;

function calendarDay(y: string | number, mo: string | number, d: string | number): boolean {
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  return date.getUTCFullYear() === Number(y) && date.getUTCMonth() === Number(mo) - 1 && date.getUTCDate() === Number(d);
}

function atOffset(y: string | number, mo: string | number, d: string | number, h: string | number, mi: string | number, s: string | number, utcOffset: string): Date | null {
  if (!calendarDay(y, mo, d) || Number(h) > 23 || Number(mi) > 59 || Number(s) > 59) return null;
  const p = (n: string | number) => String(n).padStart(2, "0");
  const t = Date.parse(`${y}-${p(mo)}-${p(d)}T${p(h)}:${p(mi)}:${p(s)}${utcOffset}`);
  return Number.isFinite(t) ? new Date(t) : null;
}

/**
 * A published date as a source prints it. Date.parse is kept only where it reads the same
 * on every host: a time with its zone, and an ISO date alone (UTC midnight). Anything else it would read
 * in the server's local zone (UTC in Docker), so "2026-09-26 10:00" is read in the source's offset instead.
 */
export function parseLooseDate(value: string | null | undefined, utcOffset = SITE_UTC_OFFSET, dateOrder?: DateOrder): Date | null {
  if (!value) return null;
  const v = normalized(value.trim(), dateOrder);
  if (!v) return null;
  const numeric = /(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?(?:(?:T|\s*)(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(v);
  if (numeric && !calendarDay(numeric[1]!, numeric[2]!, numeric[3]!)) return null;
  const english = /\b([a-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+(\d{4})\b/i.exec(v)
    ?? /\b(\d{1,2})\s+([a-z]{3,9})\s+(\d{4})\b/i.exec(v)?.map((part, i, match) => i === 1 ? match[2]! : i === 2 ? match[1]! : part);
  if (english) {
    const month = Date.parse(`${english[1]} 1, ${english[3]} 00:00:00 GMT`);
    if (!Number.isFinite(month) || !calendarDay(english[3]!, new Date(month).getUTCMonth() + 1, english[2]!)) return null;
  }
  if (!numeric && !english) return null;
  const text = v.replace(/(\d)(st|nd|rd|th)\b/gi, "$1");
  if (EXPLICIT_ZONE.test(v) || /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const direct = Date.parse(text);
    if (Number.isFinite(direct)) return new Date(direct);
    if (!numeric) return null;
  }
  // 2026-09-26 / 2026/09/26 / 2026-09-26T10:00 / 2026年9月26日 (+ optional time), interpreted in the given offset.
  const m = numeric;
  if (m) {
    const [, y, mo, d, h = "00", mi = "00", s = "00"] = m;
    return atOffset(y!, mo!, d!, h, mi, s, utcOffset);
  }
  // Parse English wall-clock fields in UTC so the host's daylight-saving rules cannot shift them.
  const en = Date.parse(`${text} GMT`);
  if (!Number.isFinite(en)) return null;
  const utc = new Date(en);
  return atOffset(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate(), utc.getUTCHours(), utc.getUTCMinutes(), utc.getUTCSeconds(), utcOffset);
}

