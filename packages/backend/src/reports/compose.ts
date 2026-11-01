// Daily, weekly and monthly reports. Windows are Beijing calendar based and written into the report;
// missed schedule points are caught up; regeneration creates a revision. What every issue carries is
// decided by rule: a daily from edition.ts without a model; a weekly or monthly is compiled from its
// dailies and a model only writes its overview and introductions, from the brief in the industry pack
// (industry/prompts/report-period*.md).
import { z } from "zod";
import { EDITION_TIMES, REPORTS, SITE } from "@aihot/site";
import { PLAIN_TERMS, RELEASE } from "@aihot/industry/taxonomy";
import { promptText, promptVersion } from "../editorial/prompts.ts";
import { modelFor } from "../editorial/models.ts";
import { areaOf, ENTITIES, isRelease } from "../editorial/vocabulary.ts";
import { addDays, beijingAt, beijingDate, beijingTime, isoWeekLabel, isoWeekRange, monthRange } from "@aihot/contracts/time";
import { sql } from "../db.ts";
import { logError } from "../lib/log-error.ts";
import { chatJson } from "../providers/llm.ts";
import { completeReceipt } from "../providers/receipts.ts";
import { shutdownSignal } from "../jobs/queue.ts";
import { emit, serverModules } from "../modules.ts";
import { PERIOD_ISSUE_NAMES } from "../publication/reports.ts";
import { arrangeDaily, candidates, dailyEdition, periodEntries, sectionOf, SECTION_ORDER, takeBySection, type Candidate, type EditionEntry } from "./edition.ts";

export const REPORT_VERSION = promptVersion("report-period", "report-period-sections", "report-period-no-sections");

/**
 * The masthead's figures, counted in events: sources over every report its entries cite; releases
 * (`modelsReleased`, its public name) are the entries of the pack's headline launch kind (RELEASE: its
 * category and its tag, so not a ranking or a test) that a maker announced itself, new that day. An
 * industry without such a kind has no release figure.
 */
export function dailyMetrics(main: EditionEntry[]) {
  return {
    totalEvents: main.length,
    sourcesCount: new Set(main.flatMap((e) => [e.entry.sourceId, ...(e.entry.related ?? []).map((r) => r.sourceId)])).size,
    ...(RELEASE ? { modelsReleased: main.filter((e) => isRelease(e.category, e.tags) && !e.previous && e.authority < 3).length } : {}),
    firstPartyEvents: main.filter((e) => e.entry.firstParty).length,
  };
}

type ReportKind = "daily" | "weekly" | "monthly";

/** How many events an issue already published carries; nothing when it does not exist yet. */
async function savedReport(kind: ReportKind, key: string) {
  const [row] = await sql<{ entries: number }[]>`
    SELECT coalesce(CASE WHEN kind = 'daily' THEN (content->'metrics'->>'totalEvents')::int ELSE jsonb_array_length(content->'storyOrder') END, 0) AS entries
    FROM reports WHERE kind = ${kind} AND key = ${key}`;
  return row;
}

/**
 * Without a reason (the scheduled run) only a missing issue is written: one already published stays as
 * it is. With a reason (an explicit regeneration) the issue is replaced and the edition it replaces is
 * kept as a revision. Says whether the issue was written.
 */
async function saveReport(kind: ReportKind, key: string, start: Date, end: Date, content: Record<string, unknown>, reason: string | undefined, model: string | null, receiptIds: number[]): Promise<boolean> {
  return sql.begin(async (tx) => {
    const insert = async () => (await tx`INSERT INTO reports (kind, key, window_start, window_end, content, generated_at, model, origin)
      VALUES (${kind}, ${key}, ${start}, ${end}, ${tx.json(content as never)}, now(), ${model}, 'model') ON CONFLICT (kind, key) DO NOTHING`).count > 0;
    let written: boolean;
    if (reason === undefined) written = await insert();
    else {
      const [existing] = await tx<{ id: number; revision: number; content: unknown; generated_at: Date }[]>`
        SELECT id, revision, content, generated_at FROM reports WHERE kind = ${kind} AND key = ${key} FOR UPDATE`;
      if (existing) {
        await tx`INSERT INTO report_revisions (report_id, revision, content, generated_at, reason)
                 VALUES (${existing.id}, ${existing.revision}, ${tx.json(existing.content as never)}, ${existing.generated_at}, ${reason}) ON CONFLICT DO NOTHING`;
        await tx`UPDATE reports SET content = ${tx.json(content as never)}, window_start = ${start}, window_end = ${end}, generated_at = now(),
                   model = ${model}, revision = revision + 1, origin = 'model', updated_at = now() WHERE id = ${existing.id}`;
        written = true;
      } else written = await insert();
    }
    if (written) {
      // The modules' parts are taken only by an issue that is written, so nothing is spent on one that is not.
      const parts: Record<string, unknown> = {};
      for (const m of serverModules()) {
        const part = await m.reports?.compose?.({ kind, key }, tx);
        if (part !== undefined && part !== null) parts[m.name] = part;
      }
      if (Object.keys(parts).length) await tx`UPDATE reports SET content = content || ${tx.json({ modules: parts } as never)} WHERE kind = ${kind} AND key = ${key}`;
      // A new issue changes the latest page, the archive, its neighbours' navigation and the report feeds.
      await emit("reportsChanged", { reason: `${kind} ${key} published` }, tx);
    }
    for (const id of receiptIds) await completeReceipt(tx, id);
    return written;
  });
}

/** "04/10 08:00": one end of a quiet issue's window, as its lead paragraph names it. */
function windowPoint(at: Date): string {
  const day = beijingDate(at);
  return `${day.slice(8, 10)}/${day.slice(5, 7)} ${beijingTime(at)}`;
}

/**
 * Daily report for Beijing date D covers the 24 hours up to the site's edition time on D (EDITION_TIMES).
 * Its most important entry leads, in its own words, and the next three are today's highlights. A window
 * the editors judged with nothing new in it still has its issue: no entries, and a lead that says so
 * (REPORTS.quiet).
 */
export async function composeDaily(date: string, reason?: string): Promise<{ key: string; entries: number }> {
  const previous = await savedReport("daily", date);
  if (previous && reason === undefined) return { key: date, entries: previous.entries };
  const end = beijingAt(date, EDITION_TIMES.daily);
  const start = new Date(end.getTime() - 86400000);
  const edition = await dailyEdition(date, start, end);
  // Nothing judged in the window is a failure upstream, not a quiet day: the run fails and is caught up later.
  if (edition.entries.length === 0 && edition.stats.judgedReports === 0) throw new Error(`daily ${date}: nothing judged in its window`);
  const issue = arrangeDaily(edition.entries);
  const [lead, ...rest] = issue.main;
  const content = {
    date,
    lead: lead
      ? { title: lead.entry.title, leadParagraph: lead.entry.summary }
      : { title: REPORTS.quiet.title, leadParagraph: REPORTS.quiet.paragraph.replace("{start}", windowPoint(start)).replace("{end}", windowPoint(end)) },
    leadItemId: lead?.entry.itemId ?? null,
    highlights: rest.slice(0, 3).map((e) => e.entry.itemId),
    sections: SECTION_ORDER
      .map((label) => ({ label, items: issue.main.filter((e) => sectionOf(e.area, e.tags) === label).map((e) => e.entry) }))
      .filter((s) => s.items.length > 0),
    flashes: issue.flashes.map((e) => e.entry),
    metrics: dailyMetrics(issue.main),
    windowStart: start.toISOString(),
    windowEnd: end.toISOString(),
    generator: { version: REPORT_VERSION, ...edition.stats, ...issue.stats },
  };
  await saveReport("daily", date, start, end, content, reason, null, []);
  return { key: date, entries: issue.main.length };
}

/** A weekly's or monthly's size: the events it carries, chosen and ordered by rule, each section held to its share. */
const PERIOD_EVENTS = { weekly: 20, monthly: 30 } as const;
/** A section is introduced once it carries this many events; one or two are read faster than introduced. */
const INTRO_EVENTS = 3;
/** The longest overview and introduction an issue prints; the brief asks for less, writers overshoot. */
const OVERVIEW_CHARS = { weekly: 650, monthly: 900 } as const;
const INTRO_CHARS = 220;
/** The brief's values for each kind: its name, its span and how long its overview should be. */
const BRIEF = {
  weekly: { kindName: PERIOD_ISSUE_NAMES.weekly, span: "nesta semana", sentences: "três frases", chars: "450" },
  monthly: { kindName: PERIOD_ISSUE_NAMES.monthly, span: "neste mês", sentences: "três a quatro frases", chars: "650" },
} as const;

export const PeriodSchema = z.object({
  overview: z.string().max(4000).catch(""),
  sections: z.record(z.string(), z.string().max(1500)).catch({}),
});

/**
 * The writer's brief for a week or month: its events as chosen, ordered and grouped by rule. It writes
 * the overview and the introductions of the sections large enough for one, and decides nothing about
 * what the issue carries. The lead is named because the sections' order does not show it, and the overview
 * printed under it must not repeat it.
 */
export function periodPrompt(kind: "weekly" | "monthly", startDate: string, endDateInclusive: string, lead: Candidate, groups: Array<{ label: string; items: Candidate[] }>) {
  const list = groups.map((g) => [`【${g.label}】`, ...g.items.map((e) => `- ${e.title} | ${e.summary.slice(0, 350)}`)].join("\n")).join("\n");
  const introduced = groups.filter((g) => g.items.length >= INTRO_EVENTS).map((g) => g.label);
  return {
    system: promptText("report-period", {
      ...BRIEF[kind],
      sections: introduced.length ? promptText("report-period-sections", { columns: introduced.map((l) => `"${l}"`).join(", ") }) : promptText("report-period-no-sections"),
      sectionsExample: introduced.length ? `{"${introduced[0]}": "..."}` : "{}",
    }),
    user: `Esta edição: ${startDate} a ${endDateInclusive}\nMatéria principal: ${lead.title}\n${list}`,
  };
}

const COMPANY_NAMES = Object.values(ENTITIES).map((e) => [e.name, ...e.aliases, ...(e.otherNames ?? [])].map((n) => n.toLowerCase()));
/** Words a writer may use that name nothing in particular: the pack's plain terms and the site's name. */
const PLAIN = new Set([...PLAIN_TERMS, SITE.name.toLowerCase(), SITE.bareName.toLowerCase()]);

/** A vocabulary name as a whole word, in the case the vocabulary writes it ("Clara" the product, not "clara"). */
const COMPANY_PATTERNS = Object.values(ENTITIES).map((e) => [e.name, ...e.aliases, ...(e.otherNames ?? [])]
  .map((n) => new RegExp(`(?<![\\p{L}\\p{N}])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "u")));

/**
 * What written text names that the listed items do not: every name-like token (a capitalised word inside
 * a sentence, or any word with a digit or a second capital: Acme, Nova-2.5, X1, FDA), every figure of
 * three or more digits or with a decimal separator or percent (845, 129,3, 1.200, 40%) and every company
 * of the vocabulary must appear in the items' own words. A plain capitalised word opening a sentence
 * ("Na semana…") is an ordinary word; a company there is still caught by the vocabulary.
 */
export function ungrounded(text: string, corpus: string): string[] {
  const known = corpus.toLowerCase();
  const companies = COMPANY_NAMES.filter((names) => names.some((n) => known.includes(n)));
  const named = (word: string) => PLAIN.has(word) || known.includes(word) || companies.some((names) => names.includes(word));
  const words = [...text.matchAll(/[\p{L}][\p{L}\p{N}.+-]*/gu)]
    .map((m) => ({ word: m[0].replace(/[.+-]+$/, ""), opens: /(?:^|[.!?。！？:]["”’)]*\s+)$/u.test(text.slice(0, m.index)) }))
    .filter(({ word, opens }) => /\p{N}/u.test(word) || /^.+\p{Lu}/u.test(word) || (!opens && /^\p{Lu}/u.test(word)))
    .map(({ word }) => word);
  const figures = (text.match(/\d+(?:[.,]\d+)*%?/g) ?? []).filter((f) => f.length >= 3 || /[.,%]/.test(f));
  const mentioned = COMPANY_NAMES.flatMap((names, i) => (COMPANY_PATTERNS[i]!.some((re) => re.test(text)) ? [names] : []));
  return [...new Set([
    ...words.filter((w) => !named(w.toLowerCase())),
    ...figures.filter((f) => !known.includes(f)),
    ...mentioned.filter((names) => !companies.includes(names)).map((names) => names[0]!),
  ])];
}

/** Whether written text names only what the listed items name (ungrounded). */
export function grounded(text: string, corpus: string): boolean {
  return ungrounded(text, corpus).length === 0;
}

/** The leading whole sentences of a text that fit in `max` characters; null when not even the first does. */
export function fitted(text: string, max: number): string | null {
  let out = "";
  for (const sentence of text.trim().match(/[^]+?(?:[.!?。！？]+["”’)」）]*(?=\s|$)|$)/gu) ?? []) {
    if ([...out + sentence].length > max) break;
    out += sentence;
  }
  return out.trim() || null;
}

/**
 * A weekly or monthly, compiled from the dailies dated in the period. Its events, their order and their
 * sections are decided by rule: the first event leads and the next three are the highlights. A model
 * only writes the overview and the introductions of sections with three or more events; text naming
 * anything the events do not name is not used, and overlong text keeps the leading sentences that fit.
 * Without a usable overview the issue is saved with none (see periodOverview).
 * An automatic run skips a complete period of quiet dailies without publishing an empty issue.
 */
async function composePeriod(kind: "weekly" | "monthly", key: string, startDate: string, endDateInclusive: string, reason: string | undefined) {
  const previous = await savedReport(kind, key);
  if (previous && reason === undefined) return { key, entries: previous.entries };
  // The dailies' windows run from the edition time the day before the first to that time on the last.
  const start = beijingAt(addDays(startDate, -1), EDITION_TIMES.daily);
  const end = beijingAt(endDateInclusive, EDITION_TIMES.daily);
  const { entries, issues, hasEntries } = await periodEntries(startDate, endDateInclusive);
  const top = takeBySection(entries, PERIOD_EVENTS[kind], kind, (e) => areaOf(e.area, e.tags)).taken;
  if (!top.length) {
    if (reason === undefined && !hasEntries && issues > 0) {
      // Before the site's first daily there was nothing to publish; missing later dailies are still a failure.
      const [{ first }] = await sql<{ first: string | null }[]>`SELECT min(key) AS first FROM reports WHERE kind = 'daily'`;
      const firstDate = first && first > startDate ? first : startDate;
      const days = (Date.parse(endDateInclusive) - Date.parse(firstDate)) / 86400000 + 1;
      if (issues === days) return null;
    }
    throw new Error(`${kind} ${key}: no daily entries in the period`);
  }
  const selected = await candidates(start, end);
  const groups = SECTION_ORDER
    .map((label) => ({ label, items: top.filter((e) => sectionOf(e.area, e.tags) === label) }))
    .filter((g) => g.items.length > 0);
  const corpus = [`${startDate} ${endDateInclusive}`, ...top.map((e) => `${e.title} ${e.summary}`)].join("\n");
  const [lead] = top as [Candidate, ...Candidate[]];
  const model = await modelFor("report");
  let written: z.infer<typeof PeriodSchema> = { overview: "", sections: {} };
  let receiptId: number | null = null;
  try {
    const res = await chatJson({
      model, purpose: `report_${kind}`, subject: `report:${kind}:${key}`, promptVersion: REPORT_VERSION,
      ...periodPrompt(kind, startDate, endDateInclusive, lead, groups), schema: PeriodSchema, temperature: 0.3, maxTokens: 2500,
    });
    written = res.data;
    receiptId = res.receiptId;
  } catch (error) {
    if (shutdownSignal.signal.aborted) throw error;
    console.error(JSON.stringify({ level: "warn", msg: "period writer failed; the issue goes out with its plain overview", report: `${kind}:${key}`, error: logError(error) }));
  }
  const usable = (text: string | undefined, max: number) => {
    const fit = fitted(text ?? "", max);
    return fit && grounded(fit, corpus) ? fit : null;
  };
  // Without a usable one the read layer says what the issue carries, naming only what is still public.
  const overview = usable(written.overview, OVERVIEW_CHARS[kind]);
  const intro = (g: { label: string; items: Candidate[] }) => g.items.length >= INTRO_EVENTS ? usable(written.sections[g.label], INTRO_CHARS) : null;
  const content = {
    kind,
    title: kind === "weekly" ? `${SITE.name} · ${PERIOD_ISSUE_NAMES.weekly} · ${key}` : `${SITE.name} · ${PERIOD_ISSUE_NAMES.monthly} · ${key}`,
    ...(kind === "weekly" ? { isoLabel: key } : { monthLabel: key }),
    periodStart: startDate,
    periodEnd: endDateInclusive,
    headline: lead.title,
    leadItemId: lead.itemId,
    highlights: top.slice(1, 4).map((e) => e.itemId),
    overview,
    themes: groups.map((g) => ({ heading: g.label, summary: intro(g), storyRefs: g.items.map(({ category: _c, area: _a, tags: _t, factKey: _f, ...e }) => e) })),
    storyOrder: top.map((e) => e.itemId),
    metrics: { totalStories: top.length, selectedCount: selected.length, reportsCovered: issues },
    generator: { version: REPORT_VERSION, model, written: overview !== null },
  };
  await saveReport(kind, key, start, end, content, reason, model, receiptId === null ? [] : [receiptId]);
  return { key, entries: top.length };
}

export async function composeWeekly(label: string, reason?: string) {
  const range = isoWeekRange(label);
  if (!range) throw new Error(`bad week label ${label}`);
  return composePeriod("weekly", label, range.start, range.end, reason);
}

export async function composeMonthly(label: string, reason?: string) {
  const range = monthRange(label);
  if (!range) throw new Error(`bad month label ${label}`);
  return composePeriod("monthly", label, range.start, range.end, reason);
}

/** The newest daily due by `now`: today's from its edition time (Beijing), yesterday's before. */
export function dueDaily(now = new Date()): string {
  const today = beijingDate(now);
  return beijingTime(now) >= EDITION_TIMES.daily ? today : addDays(today, -1);
}

/** The newest weekly due by `now`: the last complete ISO week from its edition time on Monday, the one before until then. */
export function dueWeekly(now = new Date()): string {
  const today = beijingDate(now);
  const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  const due = dow > 0 || beijingTime(now) >= EDITION_TIMES.weekly;
  return isoWeekLabel(addDays(today, -dow - (due ? 7 : 14)));
}

/** The newest monthly due by `now`: the last complete month from its edition time on the 1st, the one before until then. */
export function dueMonthly(now = new Date()): string {
  const [y, m, d] = beijingDate(now).split("-").map(Number) as [number, number, number];
  const due = d > 1 || beijingTime(now) >= EDITION_TIMES.monthly;
  const back = due ? 1 : 2;
  const month = (y * 12 + (m - 1) - back);
  return `${Math.floor(month / 12)}-${String((month % 12) + 1).padStart(2, "0")}`;
}

const nextWeek = (label: string) => isoWeekLabel(addDays(isoWeekRange(label)!.start, 7));
const nextMonth = (label: string) => {
  const [y, m] = label.split("-").map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};

/**
 * The scheduled run (every half hour): every issue due by `now` that does not exist yet, oldest first.
 * The newest one appears at the first run after it falls due (above); a long stop or an older gap is
 * filled too. A kind with no issue yet only gets its latest due one. An issue that fails does not hold
 * up the others; at most `limit` issues are written per run, the next run continues.
 */
export async function composeDueReports(now = new Date(), limit = 8): Promise<{ generated: string[]; failed: string[] }> {
  const generated: string[] = [];
  const failed: string[] = [];
  const kinds: Array<{ kind: ReportKind; due: string; next: (k: string) => string; end: (k: string) => string; compose: (k: string) => Promise<unknown> }> = [
    { kind: "daily", due: dueDaily(now), next: (k) => addDays(k, 1), end: (k) => k, compose: composeDaily },
    { kind: "weekly", due: dueWeekly(now), next: nextWeek, end: (k) => isoWeekRange(k)!.end, compose: composeWeekly },
    { kind: "monthly", due: dueMonthly(now), next: nextMonth, end: (k) => monthRange(k)!.end, compose: composeMonthly },
  ];
  // Weeklies and monthlies sum up dailies: a period that ended before the site's first daily has nothing to sum
  // up and is not due (a site started mid-month would otherwise fail that month's issue on every run).
  const [{ first: firstDaily }] = await sql<{ first: string | null }[]>`SELECT min(key) AS first FROM reports WHERE kind = 'daily'`;
  kinds: for (const k of kinds) {
    const have = new Set((await sql<{ key: string }[]>`SELECT key FROM reports WHERE kind = ${k.kind}`).map((r) => r.key));
    const first = [...have].sort()[0] ?? k.due;
    for (let key = first; key <= k.due; key = k.next(key)) {
      if (have.has(key)) continue;
      if (k.kind !== "daily" && (!firstDaily || k.end(key) < firstDaily)) continue;
      if (shutdownSignal.signal.aborted || generated.length >= limit) break kinds;
      try {
        if (await k.compose(key) !== null) generated.push(`${k.kind}:${key}`);
      } catch (error) {
        failed.push(`${k.kind}:${key}`);
        console.error(JSON.stringify({ level: "error", msg: "report failed", report: `${k.kind}:${key}`, error: logError(error) }));
      }
    }
  }
  if (failed.length) throw new Error(`reports: ${failed.join(", ")} failed${generated.length ? `; ${generated.join(", ")} written` : ""}`);
  return { generated, failed };
}
