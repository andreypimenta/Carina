// A classification correction moves the same frozen entry; it never composes another issue or pays
// a writer. The override, publication, report revisions and audit commit in the caller's transaction.
// A text correction (correctPeriodCitations) changes the same frozen entries' words, and pays the writer
// once for the overview that quotes them. Neither sends anything: a send is planned once per edition.
import { RELEASE } from "@aihot/industry/taxonomy";
import { audit } from "../audit.ts";
import { sql, type Tx } from "../db.ts";
import { isRelease } from "../editorial/vocabulary.ts";
import { emit } from "../modules.ts";
import { completeReceipt } from "../providers/receipts.ts";
import { askPeriodWriter, periodTexts, REPORT_VERSION, type PeriodGroup } from "./compose.ts";
import { ROLE_OFFICIAL, ROLE_OFFICIAL_X, SECTION_ORDER, sectionOf } from "./edition.ts";

interface Entry { itemId: string; followUp?: string; firstParty?: boolean; role?: string; [key: string]: unknown }
interface Group { label?: string; heading?: string; summary?: unknown; items?: Entry[]; storyRefs?: Entry[]; [key: string]: unknown }
interface Content { sections?: Group[]; themes?: Group[]; metrics?: Record<string, number>; [key: string]: unknown }

/** Moves the item to its new section (abas, by its section or tags) in every issue that carries it; says whether any issue changed. */
export async function correctReportClassification(tx: Tx, articleId: string, reason: string): Promise<boolean> {
  const [item] = await tx<{ area: string | null; tags: string[] }[]>`SELECT area,tags FROM publications WHERE article_id=${articleId}`;
  if (!item) return false;
  const reports = await tx<{ id: number; kind: string; content: Content; revision: number; generated_at: Date }[]>`
    SELECT id,kind,content,revision,generated_at FROM reports
    WHERE content @> ${tx.json({ sections: [{ items: [{ itemId: articleId }] }] })}
       OR content @> ${tx.json({ themes: [{ storyRefs: [{ itemId: articleId }] }] })}
    ORDER BY id FOR UPDATE`;
  let changed = false;
  for (const report of reports) {
    const content = structuredClone(report.content);
    const daily = report.kind === "daily";
    const groups = (daily ? content.sections : content.themes) ?? [];
    const labelKey = daily ? "label" : "heading";
    const entriesKey = daily ? "items" : "storyRefs";
    const from = groups.find(g => g[entriesKey]?.some(e => e.itemId === articleId));
    // Older headings (hand-written themes, the category sections before abas) are not sections now; leave them.
    if (!from || !SECTION_ORDER.includes(from[labelKey] ?? "")) continue;
    const label = sectionOf(item.area, item.tags);
    if (from[labelKey] !== label) {
      const moving = from[entriesKey]!.filter(e => e.itemId === articleId);
      from[entriesKey] = from[entriesKey]!.filter(e => e.itemId !== articleId);
      let target = groups.find(g => g[labelKey] === label);
      if (!target) { target = { [labelKey]: label, [entriesKey]: [] }; groups.push(target); }
      target[entriesKey]!.push(...moving);
      if (!daily) { from.summary = null; target.summary = null; }
    }
    const arranged = groups.filter(g => g[entriesKey]?.length).sort((a, b) => SECTION_ORDER.indexOf(a[labelKey]!) - SECTION_ORDER.indexOf(b[labelKey]!));
    if (daily) {
      content.sections = arranged;
      // The release figure (dailyMetrics) follows the new classification; without a RELEASE kind there is none.
      if (RELEASE) {
        const entries = arranged.flatMap(g => g.items ?? []);
        const rows = await tx<{ article_id: string; category: string | null; tags: string[] }[]>`
          SELECT article_id,category,tags FROM publications WHERE article_id IN ${tx(entries.map(e => e.itemId))}`;
        const byId = new Map(rows.map(r => [r.article_id, r]));
        content.metrics = { ...content.metrics, modelsReleased: entries.filter(e => {
          const p = byId.get(e.itemId);
          return p && isRelease(p.category, p.tags) && !e.followUp && (e.firstParty || e.role === ROLE_OFFICIAL || e.role === ROLE_OFFICIAL_X);
        }).length };
      }
    } else content.themes = arranged;
    if (JSON.stringify(content) === JSON.stringify(report.content)) continue;
    await tx`INSERT INTO report_revisions (report_id,revision,content,generated_at,reason)
      VALUES (${report.id},${report.revision},${tx.json(report.content as never)},${report.generated_at},${`classification ${articleId}: ${reason}`})`;
    await tx`UPDATE reports SET content=${tx.json(content as never)},revision=revision+1,updated_at=now() WHERE id=${report.id}`;
    changed = true;
  }
  if (changed) await emit("reportsChanged", { reason: `report classification ${articleId}` }, tx);
  return changed;
}

/**
 * Brings a published weekly's or monthly's frozen entries for these items to their current public title and
 * summary, and has its overview and introductions written again from them, since they may quote what changed.
 * Text the writer's rule does not accept leaves the plain overview, as in a new issue. The issue keeps its date
 * and the edition it replaces is kept as a revision. A writer that fails changes nothing, so a later run tries
 * again. Returns how many entries changed; 0 pays nothing.
 */
export async function correctPeriodCitations(kind: "weekly" | "monthly", key: string, ids: readonly string[], reason: string, actor: string): Promise<{ changed: number; overview: string | null }> {
  const [report] = await sql<{ revision: number; content: Content & { overview?: string | null; generator?: Record<string, unknown>; leadItemId?: string; headline?: string; periodStart: string; periodEnd: string } }[]>`
    SELECT revision, content FROM reports WHERE kind = ${kind} AND key = ${key}`;
  if (!report) throw new Error(`no ${kind} ${key}`);
  const rows = await sql<{ article_id: string; title: string; summary: string | null }[]>`SELECT article_id, title, summary FROM publications WHERE article_id = ANY(${[...ids]})`;
  const current = new Map(rows.map((r) => [r.article_id, r]));
  const content = structuredClone(report.content);
  let changed = 0;
  for (const ref of (content.themes ?? []).flatMap((t) => t.storyRefs ?? [])) {
    const now = current.get(ref.itemId);
    if (!now || (ref.title === now.title && ref.summary === now.summary)) continue;
    ref.title = now.title;
    ref.summary = now.summary;
    changed++;
  }
  if (!changed) return { changed, overview: report.content.overview ?? null };
  const lead = current.get(content.leadItemId ?? "");
  if (lead) content.headline = lead.title;

  const themes = content.themes ?? [];
  const groups: PeriodGroup[] = themes.map((t) => ({ label: t.heading ?? "", items: (t.storyRefs ?? []).map((e) => ({ title: String(e.title ?? ""), summary: String(e.summary ?? "") })) }));
  const res = await askPeriodWriter(kind, key, content.periodStart, content.periodEnd, { title: content.headline ?? "" }, groups);
  const { overview, intro } = periodTexts(kind, content.periodStart, content.periodEnd, groups, res.data);
  content.overview = overview;
  themes.forEach((t, i) => { t.summary = intro(groups[i]!); });
  content.generator = { ...content.generator, version: REPORT_VERSION, model: res.model, written: overview !== null };

  await sql.begin(async (tx) => {
    const [locked] = await tx<{ id: number; revision: number; generated_at: Date }[]>`SELECT id, revision, generated_at FROM reports WHERE kind = ${kind} AND key = ${key} FOR UPDATE`;
    if (locked!.revision !== report.revision) throw new Error(`${kind} ${key} changed while its text was corrected`);
    await tx`INSERT INTO report_revisions (report_id, revision, content, generated_at, reason)
      VALUES (${locked!.id}, ${locked!.revision}, ${tx.json(report.content as never)}, ${locked!.generated_at}, ${`text correction: ${reason}`})`;
    await tx`UPDATE reports SET content = ${tx.json(content as never)}, revision = revision + 1, updated_at = now() WHERE id = ${locked!.id}`;
    await completeReceipt(tx, res.receiptId);
    await audit(actor, "report.correct-text", `report:${kind}:${key}`, reason, { revision: locked!.revision }, { revision: locked!.revision + 1, entries: changed }, { db: tx });
    await emit("reportsChanged", { reason: `${kind} ${key} text correction` }, tx);
  });
  return { changed, overview };
}
