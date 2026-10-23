// The agenda's congresses, read from industry/congressos.json each time they are asked for (a few dozen lines):
// the page's lists, and the weekly issue's part, which names the congresses near the day it comes out and shows
// them as the file has them now (a corrected date or a removed congress shows at once).
import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { addDays, isoWeekRange } from "@aihot/contracts/time";
import { REPO_ROOT } from "@aihot/backend/config";
import type { ReportIssue } from "@aihot/backend/modules";
import { lastDay, near, type AgendaPage, type Congresso } from "../agenda.ts";

const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((d) => new Date(`${d}T00:00:00Z`).toISOString().startsWith(d), "not a calendar day");
const FILE = z.object({
  congressos: z.array(z.object({
    id: z.string().regex(/^[a-z0-9-]{1,80}$/),
    name: z.string().min(1),
    organizer: z.string().min(1),
    start: DAY,
    end: DAY.optional(),
    place: z.string().min(1).optional(),
    url: z.url({ protocol: /^https?$/ }),
    about: z.string().min(1).optional(),
  }).strict().refine((c) => !c.end || c.end >= c.start, "ends before it starts")),
}).refine((f) => new Set(f.congressos.map((c) => c.id)).size === f.congressos.length, "duplicate id");

/** The file's congresses; a malformed file is refused rather than shown in part. */
export function parseCongressos(json: unknown): Congresso[] {
  return FILE.parse(json).congressos;
}

export function congressos(): Congresso[] {
  return parseCongressos(JSON.parse(readFileSync(path.join(REPO_ROOT, "industry/congressos.json"), "utf8")));
}

/** The page on `today` (the site's calendar day). */
export function agendaPage(today: string, list = congressos()): AgendaPage {
  return {
    upcoming: list.filter((c) => lastDay(c) >= today).sort((a, b) => a.start.localeCompare(b.start)),
    past: list.filter((c) => lastDay(c) < today).sort((a, b) => b.start.localeCompare(a.start)),
  };
}

/** A weekly issue's part: the congresses near the Monday it comes out, by id; nothing for the other issues. */
export async function weeklyPart(issue: ReportIssue, list = congressos()): Promise<{ ids: string[] } | null> {
  if (issue.kind !== "weekly") return null;
  const range = isoWeekRange(issue.key);
  if (!range) return null;
  const ids = near(list, addDays(range.end, 1)).map((c) => c.id);
  return ids.length ? { ids } : null;
}

/** The weekly's congresses as the file has them now; nothing when none of them is left. */
export async function weeklyCard(saved: unknown, list = congressos()): Promise<Congresso[] | null> {
  const ids = (saved as { ids?: unknown } | null)?.ids;
  if (!Array.isArray(ids)) return null;
  const found = list.filter((c) => ids.includes(c.id)).sort((a, b) => a.start.localeCompare(b.start));
  return found.length ? found : null;
}
