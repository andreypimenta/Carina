// Names, dates and grouping for daily, weekly and monthly reports.
import type { ReportNavigationEntry, ReportKind } from "@aihot/contracts/site";
import { beijingDate, beijingWeekday, isoWeekLabel, isoWeekRange } from "@aihot/contracts/time";
import { EDITION_WHEN, REPORTS, SITE } from "@aihot/site";
import { RELEASE } from "@aihot/industry/taxonomy";
import { monthDay, monthName, weekdayShort } from "../../lib/format.ts";

export const KINDS: ReportKind[] = ["daily", "weekly", "monthly"];
export const KIND_PATH: Record<ReportKind, string> = { daily: "/daily", weekly: "/weekly", monthly: "/monthly" };
export const KIND_LABEL: Record<ReportKind, string> = { daily: "Notas diárias", weekly: "Edição semanal", monthly: "Balanço mensal" };
/** The kind alone, for the diário / semanal / mensal switch. */
export const KIND_SHORT: Record<ReportKind, string> = { daily: "Diário", weekly: "Semanal", monthly: "Mensal" };

export function kindFromPath(pathname: string): ReportKind {
  if (pathname.startsWith("/weekly")) return "weekly";
  if (pathname.startsWith("/monthly")) return "monthly";
  return "daily";
}

/** The kind's RSS feed, announced in the page head so a reader given the page finds it. */
export const feedLink = (kind: ReportKind) => ({ tagName: "link", rel: "alternate", type: "application/rss+xml", title: `${SITE.name} ${KIND_LABEL[kind]}`, href: `/feed/${kind}.xml` }) as const;

export function reportPath(kind: ReportKind, key: string): string {
  return `${KIND_PATH[kind]}/${key}`;
}

const pad = (n: number) => String(n).padStart(2, "0");

const { measure, noun } = REPORTS.entry;
/** "destaques": what an issue counts its entries in, in the site's words (REPORTS.entry). */
export const ENTRIES_UNIT = measure ? `${measure} ${noun}` : noun;

/** "Os 4 destaques do dia" / "Os 12 destaques da semana" / "Os 20 destaques de agosto" (REPORTS.entry from site/site.ts). */
export function headline(kind: ReportKind, key: string, count: number): string {
  const what = `Os ${count} ${ENTRIES_UNIT}`;
  if (kind === "daily") return `${what} do dia`;
  if (kind === "weekly") return `${what} da semana`;
  return `${what} de ${monthName(Number(key.slice(5, 7)))}`;
}

/** "16/09" for a story inside a week or month. */
export function shortDay(iso: string): string {
  return dm(beijingDate(iso));
}

export interface ArchiveGroup {
  id: string;
  label: string;
  entries: Array<ReportNavigationEntry & { short: string }>;
}

/**
 * The archive column: days grouped by month, weeks by the month their Monday falls in ("2ª sem."),
 * months by year. Newest first, as the index comes.
 */
export function archiveGroups(kind: ReportKind, index: ReportNavigationEntry[]): ArchiveGroup[] {
  const groups: ArchiveGroup[] = [];
  const push = (id: string, label: string, e: ReportNavigationEntry & { short: string }) => {
    const g = groups[groups.length - 1];
    if (g && g.id === id) g.entries.push(e);
    else groups.push({ id, label, entries: [e] });
  };
  if (kind === "weekly") {
    const byMonth = new Map<string, string[]>();
    for (const e of index) {
      const m = isoWeekRange(e.key)!.start.slice(0, 7);
      byMonth.set(m, [...(byMonth.get(m) ?? []), e.key]);
    }
    for (const e of index) {
      const m = isoWeekRange(e.key)!.start.slice(0, 7);
      const weeks = [...byMonth.get(m)!].sort();
      push(m, `${capitalize(monthName(Number(m.slice(5))))} de ${m.slice(0, 4)}`, { ...e, short: `${weeks.indexOf(e.key) + 1}ª sem.` });
    }
    return groups;
  }
  for (const e of index) {
    if (kind === "daily") push(e.key.slice(0, 7), `${capitalize(monthName(Number(e.key.slice(5, 7))))} de ${e.key.slice(0, 4)}`, { ...e, short: `Dia ${Number(e.key.slice(8, 10))}` });
    else push(e.key.slice(0, 4), e.key.slice(0, 4), { ...e, short: capitalize(monthName(Number(e.key.slice(5, 7)))) });
  }
  return groups;
}

/** An issue's mark in the archive column: a large number over a small word, a week's Monday (a month's number stands alone). */
export function archiveMark(kind: ReportKind, key: string): { big: string; small: string | null } {
  if (kind === "daily") return { big: key.slice(8, 10), small: weekdayShort(key) };
  if (kind === "weekly") {
    const { start } = isoWeekRange(key)!;
    return { big: key.slice(6), small: dm(start) };
  }
  return { big: key.slice(5, 7), small: null };
}

/** Short chip label for the phone switcher: "Hoje", "26 de set.", "Set. · 2ª sem.", "Agosto". */
export function chipLabel(kind: ReportKind, key: string, index: ReportNavigationEntry[], today: string): string {
  if (kind === "daily") return key === today ? "Hoje" : monthDay(key, today);
  if (kind === "monthly") return capitalize(monthName(Number(key.slice(5, 7))));
  const group = archiveGroups("weekly", index).find((g) => g.entries.some((e) => e.key === key));
  const entry = group?.entries.find((e) => e.key === key);
  return group && entry ? `${capitalize(monthName(Number(group.id.slice(5))).slice(0, 3))}. · ${entry.short}` : key;
}

/**
 * "Edição nº N": the issue's place in its series as the server counts it over every issue. The navigation
 * index holds only the newest issues, so its length cannot tell.
 */
export function issueNumber(index: ReportNavigationEntry[], key: string): number | null {
  return index.find((e) => e.key === key)?.issueNumber ?? null;
}

/** The masthead's date block: a large figure and two small lines beside it. */
export function dateMark(kind: ReportKind, key: string): { figure: string; top: string; bottom: string } {
  if (kind === "daily") return { figure: key.slice(8, 10), top: `${monthName(Number(key.slice(5, 7)))} de ${key.slice(0, 4)}`, bottom: beijingWeekday(key) };
  if (kind === "weekly") {
    const { start, end } = isoWeekRange(key)!;
    return { figure: key.slice(6), top: `semana ${Number(key.slice(6))} de ${key.slice(0, 4)}`, bottom: `${dm(start)} — ${dm(end)}` };
  }
  return { figure: key.slice(5, 7), top: key.slice(0, 4), bottom: monthName(Number(key.slice(5, 7))) };
}

/** When each kind comes out, for the masthead (the times are the site's, EDITION_WHEN). */
export const EDITION: Record<ReportKind, string> = { daily: `Sai ${EDITION_WHEN.daily}`, weekly: "Sai toda segunda-feira", monthly: "Sai todo dia 1º" };

/**
 * The masthead's figures, in the order a reader wants them, in the site's words (REPORTS). Releases of the
 * pack's headline launch kind (RELEASE, " aprovações regulatórias" here) count only where the pack has one; zero is left out.
 */
const UNITS = REPORTS.metricUnits;
const METRICS: Array<[key: string, unit: string]> = [
  ["totalEvents", ENTRIES_UNIT],
  ["totalStories", ENTRIES_UNIT],
  ["sourcesCount", UNITS.sourcesCount],
  ["firstPartyEvents", UNITS.firstPartyEvents],
  ...(RELEASE ? [["modelsReleased", RELEASE.unit] as [string, string]] : []),
  ["selectedCount", UNITS.selectedCount],
  ["reportsCovered", UNITS.reportsCovered],
];
export function metricItems(metrics: Record<string, number>): Array<{ value: number; unit: string }> {
  return METRICS.filter(([k]) => typeof metrics[k] === "number" && (k !== "modelsReleased" || metrics[k]! > 0)).map(([k, unit]) => ({ value: metrics[k]!, unit }));
}

/** "Dia anterior · 25 de set.", "Edição anterior · semana 37", "Próxima edição · julho". A day of another year than `now` (Brasília) carries its year. */
export function neighbourLabel(kind: ReportKind, key: string, direction: "prev" | "next", now: number = Date.now()): string {
  if (kind === "daily") return `${direction === "prev" ? "Dia anterior" : "Dia seguinte"} · ${monthDay(key, beijingDate(now))}`;
  const which = direction === "prev" ? "Edição anterior" : "Próxima edição";
  return kind === "weekly" ? `${which} · semana ${Number(key.slice(6))}` : `${which} · ${monthName(Number(key.slice(5, 7)))}`;
}

/** "Outubro" from "outubro". */
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "14/09" of a calendar date (YYYY-MM-DD). */
function dm(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

/** The line above the nameplate: "sábado, 26 de setembro de 2026", "semana 38 de 2026 · 14/09 — 20/09", "agosto de 2026". */
export function dateLine(kind: ReportKind, key: string): string {
  const m = dateMark(kind, key);
  if (kind === "daily") return `${m.bottom}, ${Number(key.slice(8, 10))} de ${m.top}`;
  return kind === "weekly" ? `${m.top} · ${m.bottom}` : `${m.bottom} de ${m.top}`;
}

/** What each kind is, under its nameplate. */
export const MOTTO: Record<ReportKind, string> = { daily: `${REPORTS.motto} · Destaques do dia`, weekly: `${REPORTS.motto} · Panorama da semana`, monthly: `${REPORTS.motto} · Balanço do mês` };

export interface PeriodCell {
  key: string | null;
  /** Hover text: "26 de set. · edição nº 158". */
  label: string;
  state: "current" | "issue" | "none" | "pad";
}

/**
 * The dot grid beside the date in the masthead: the days of this issue's month (dailies, Monday first),
 * the weeks of its year (weeklies) or the months of its year (monthlies), each marked as this issue,
 * an issue that exists, or none. This issue's own number (`current`) labels it, also when it is older
 * than the navigation.
 */
export function periodGrid(kind: ReportKind, key: string, index: ReportNavigationEntry[], current: number): { title: string; note: string; columns: number; heads: string[] | null; cells: PeriodCell[] } {
  const exists = new Set(index.map((e) => e.key));
  const cell = (k: string, name: string): PeriodCell => {
    const n = k === key ? current : issueNumber(index, k);
    return { key: k, label: n ? `${name} · edição nº ${n}` : `${name} · sem edição`, state: k === key ? "current" : exists.has(k) ? "issue" : "none" };
  };
  const count = (cells: PeriodCell[]) => cells.filter((c) => c.state === "issue" || c.state === "current").length;
  const year = key.slice(0, 4);
  if (kind === "daily") {
    const m = Number(key.slice(5, 7));
    const days = new Date(Date.UTC(Number(year), m, 0)).getUTCDate();
    const lead = (new Date(Date.UTC(Number(year), m - 1, 1)).getUTCDay() + 6) % 7;
    const cells: PeriodCell[] = [
      ...Array.from({ length: lead }, (): PeriodCell => ({ key: null, label: "", state: "pad" })),
      ...Array.from({ length: days }, (_, i) => {
        const day = `${key.slice(0, 7)}-${pad(i + 1)}`;
        return cell(day, monthDay(day));
      }),
    ];
    return { title: capitalize(monthName(m)), note: editions(count(cells), "no mês"), columns: 7, heads: ["S", "T", "Q", "Q", "S", "S", "D"], cells };
  }
  if (kind === "weekly") {
    // 28 December always falls in its year's last ISO week.
    const weeks = Number(isoWeekLabel(`${year}-12-28`).slice(6));
    const cells = Array.from({ length: weeks }, (_, i) => {
      const k = `${year}-W${pad(i + 1)}`;
      const { start, end } = isoWeekRange(k)!;
      return cell(k, `Semana ${i + 1} (${dm(start)}–${dm(end)})`);
    });
    return { title: year, note: editions(count(cells), "no ano"), columns: 13, heads: null, cells };
  }
  const cells = Array.from({ length: 12 }, (_, i) => cell(`${year}-${pad(i + 1)}`, capitalize(monthName(i + 1))));
  return { title: year, note: editions(count(cells), "no ano"), columns: 6, heads: null, cells };
}

/** "12 edições no ano", "1 edição no mês". */
function editions(n: number, when: string): string {
  return `${n} ${n === 1 ? "edição" : "edições"} ${when}`;
}
