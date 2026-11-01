// Item detail and Markdown export, both behind the same visibility and licence rules.
import type { OutlineEntry, SiteItemDetail, StoryRef } from "@aihot/contracts/site";
import { OWN_TEXT_SOURCES } from "@aihot/industry/taxonomy";
import { ITEM_COPY, SITE } from "@aihot/site";
import { bodyToMarkdown } from "../content/markdown.ts";
import { sql } from "../db.ts";
import { stripTagMarkup } from "../lib/text.ts";
import { proxyBodyImages } from "../media/imgproxy.ts";
import { textToHtml } from "../content/sanitize.ts";
import { exportTranslation, isChineseBody, ITEM_COLUMNS, ITEM_FROM, seatHolders, showsPost, toItemSummary, xView, type ItemRow } from "./items.ts";
import { evidenceCondition, listedCondition } from "./scope.ts";
import { itemUrl, siteUrl } from "./links.ts";
import { hasItemPage, publicSourceName } from "./rules.ts";
import { topicLinks, topicMembership } from "./topics.ts";
import { weeklyOf } from "./reports.ts";
import { serverModules, type ItemExit } from "../modules.ts";

interface DetailRow extends ItemRow {
  body_html: string | null;
  body_text: string | null;
  body_status: string;
  tr_html: string | null;
  tr_complete: boolean | null;
  topics: string[];
}

export type DetailResult =
  | { kind: "found"; item: SiteItemDetail; row: DetailRow }
  | { kind: "not_found" };

/** Adds stable ids to h2–h4 and returns the outline. */
function withOutline(html: string): { html: string; outline: OutlineEntry[] } {
  const outline: OutlineEntry[] = [];
  let n = 0;
  const out = html.replace(/<h([2-4])(?: id="sec-\d+")?>([\s\S]*?)<\/h\1>/gi, (_m, level: string, inner: string) => {
    n += 1;
    const id = `sec-${n}`;
    const text = stripTagMarkup(inner, "").trim();
    if (text) outline.push({ id, text: text.slice(0, 80), level: Number(level) });
    return `<h${level} id="${id}">${inner}</h${level}>`;
  });
  return { html: out, outline };
}

/** An article's stored body as readers get it (ServerModule.items.shownBody). */
export function shownBody(html: string): string {
  return serverModules().reduce((out, m) => m.items?.shownBody?.(out) ?? out, html);
}

async function loadRow(id: string): Promise<DetailRow | null> {
  const [row] = await sql<DetailRow[]>`
    SELECT ${ITEM_COLUMNS}, a.body_html, a.body_text, a.body_status, tr.body_html AS tr_html, tr.complete AS tr_complete,
      ${topicMembership()} AS topics
    ${ITEM_FROM}
    WHERE p.article_id = ${id}`;
  return row ? { ...row, body_html: row.body_html && shownBody(row.body_html) } : null;
}

/**
 * The body a page reads in `language` when it has it, else in the other: "zh" (the field's historical name)
 * is the site's language, the article's own text
 * or a translation (shown even before it is complete), the original only the article's own. `page` turns
 * the HTML shown into what is sent, with its outline.
 */
function readingBody(
  language: "zh" | "original",
  zh: { html: string; kind: "translation" | "original" } | null,
  original: string | null,
  complete: boolean,
  page: (html: string) => { html: string; outline: OutlineEntry[] },
): Pick<SiteItemDetail, "body" | "outline" | "hasTranslation" | "bodyLanguage"> {
  const bodyLanguage = language === "original" && original ? "original" : zh?.html ? "zh" : "original";
  const shown = bodyLanguage === "zh" ? zh!.html : original;
  const sent = shown ? page(shown) : { html: shown, outline: [] };
  return {
    body: { zh: bodyLanguage === "zh" ? sent.html : null, original: bodyLanguage === "original" ? sent.html : null, zhKind: zh?.kind ?? null, complete },
    outline: sent.outline,
    hasTranslation: zh?.kind === "translation" && !!zh.html && !!original,
    bodyLanguage,
  };
}

/**
 * The installed modules' parts of these articles as they are now (ServerModule.items), by article id and then
 * by module name: on the article's page and under the article in an e-mail. Articles none has a part of are left out.
 */
export async function itemParts(ids: readonly string[]): Promise<Map<string, Record<string, unknown>>> {
  const out = new Map<string, Record<string, unknown>>();
  if (!ids.length) return out;
  for (const m of serverModules()) {
    if (!m.items) continue;
    for (const [id, part] of await m.items.parts(ids)) out.set(id, { ...out.get(id), [m.name]: part });
  }
  return out;
}

/** What the installed modules add around these articles' bodies in the exits without their page (ServerModule.items.exit). */
export async function itemExits(ids: readonly string[]): Promise<Map<string, ItemExit>> {
  const out = new Map<string, ItemExit>();
  for (const [id, parts] of await itemParts(ids)) {
    for (const m of serverModules()) {
      const exit = m.name in parts ? m.items?.exit?.(parts[m.name]) : null;
      if (!exit) continue;
      const seen = out.get(id);
      out.set(id, { before: `${seen?.before ?? ""}${exit.before}`, after: `${seen?.after ?? ""}${exit.after}`, hasSummary: !!seen?.hasSummary || exit.hasSummary });
    }
  }
  return out;
}

/**
 * Public detail (rules.hasItemPage) in one language, the site's unless the original is asked for: items the
 * lists leave out (low relevance, merged duplicates, no summary yet) keep a noindex page;
 * withdrawn and hot_signal items are a 404.
 */
export async function loadItemDetail(id: string, language: "zh" | "original" = "zh", now = new Date()): Promise<DetailResult> {
  const row = await loadRow(id);
  if (!row || !hasItemPage({ visibility: row.visibility, sourceMode: row.source_mode })) return { kind: "not_found" };

  const summary = toItemSummary(row);
  if (row.visibility === "summary-only") {
    const item: SiteItemDetail = {
      ...summary,
      ownText: OWN_TEXT_SOURCES.includes(row.source_id),
      selected: false,
      score: null,
      category: null,
      story: null,
      reason: null,
      tags: [],
      x: null,
      readingMode: "summary-only",
      author: null,
      body: null,
      outline: [],
      relatedStories: [],
      topics: [],
      indexable: false,
      markdownAvailable: false,
      group: null,
      hasTranslation: false,
      bodyLanguage: "original",
      weekly: await weeklyOf(id),
      ...(await modulesOf(id)),
    };
    return { kind: "found", item, row };
  }

  const related = await sql<StoryRef[]>`
    SELECT DISTINCT st.public_id::text AS "publicId", st.title
    FROM fact_articles fa JOIN facts f ON f.id = fa.fact_id JOIN stories st ON st.id = f.story_id
    WHERE fa.article_id = ${id} AND fa.role <> 'mention' AND st.merged_into IS NULL
    ORDER BY "publicId" LIMIT 6`;

  let x: SiteItemDetail["x"] = null;
  let reading: Pick<SiteItemDetail, "body" | "outline" | "hasTranslation" | "bodyLanguage"> = { body: null, outline: [], hasTranslation: false, bodyLanguage: "original" };
  if (showsPost(row)) {
    const post = xView(row, false, true);
    const text = String(row.x_post?.text ?? row.body_text ?? "");
    // A post's text is sent as written: its headings make the outline, without anchors.
    if (post?.translation || text.trim()) reading = readingBody(language, post?.translation ? { html: textToHtml(post.translation), kind: "translation" } : null, text.trim() ? textToHtml(text) : null, true,
      (html) => ({ html, outline: withOutline(html).outline }));
    if (post) {
      const { text: _text, translation: _translation, ...shown } = post;
      x = shown;
    }
  } else if (row.body_mode === "full" && row.body_html) {
    const chinese = isChineseBody(row);
    const zh = chinese ? { html: row.body_html, kind: "original" as const } : row.tr_html ? { html: row.tr_html, kind: "translation" as const } : null;
    reading = readingBody(language, zh, chinese ? null : row.body_html, chinese ? true : row.tr_complete ?? false, (html) => withOutline(proxyBodyImages(html)));
  }

  let group: SiteItemDetail["group"] = null;
  if (row.fact_id) {
    const [g] = await sql<{ public_id: string; reports: number; sources: number }[]>`
      SELECT f.public_id, count(p.article_id) AS reports, count(DISTINCT p.source_id) AS sources
      FROM facts f JOIN fact_articles fa ON fa.fact_id = f.id JOIN publications p ON p.article_id = fa.article_id
      WHERE f.id = ${row.fact_id} AND ${evidenceCondition()} AND ${listedCondition(now)}
      GROUP BY f.public_id`;
    if (g) {
      group = {
        factId: g.public_id,
        reportCount: Number(g.reports),
        additionalSourceCount: Math.max(0, Number(g.sources) - 1),
      };
    }
  }

  // The reason goes with the seat; a report yielding it points to the one holding it.
  const sameEvent = (await seatHolders([row], now)).get(row.id) ?? null;
  const item: SiteItemDetail = {
    ...summary,
    ownText: OWN_TEXT_SOURCES.includes(row.source_id),
    x,
    ...(sameEvent ? { reason: null, sameEvent } : {}),
    readingMode: "full",
    author: row.author,
    body: reading.body,
    outline: reading.outline,
    relatedStories: related,
    topics: topicLinks(row.topics),
    indexable: row.indexable,
    markdownAvailable: markdownAvailable(row),
    group,
    hasTranslation: reading.hasTranslation,
    bodyLanguage: reading.bodyLanguage,
    weekly: await weeklyOf(id),
    ...(await modulesOf(id)),
  };
  return { kind: "found", item, row };
}

async function modulesOf(id: string): Promise<Pick<SiteItemDetail, "modules">> {
  const parts = (await itemParts([id])).get(id);
  return parts ? { modules: parts } : {};
}

/**
 * Same predicate for the export button and the export route: a public page with something to export
 * (a summary, the post where pages show it, or a full-text body).
 */
export function markdownAvailable(row: {
  visibility: string; source_mode: string; summary: string | null; body_mode: string; body_html?: string | null; channel: string; x_post: Record<string, any> | null;
}): boolean {
  if (row.visibility !== "public" || !hasItemPage({ visibility: row.visibility, sourceMode: row.source_mode })) return false;
  return !!row.summary || (showsPost(row) && (!!row.x_post?.text || !!row.x_post?.media?.length || !!row.x_post?.quoted?.text)) || (row.body_mode === "full" && !!row.body_html);
}

export async function exportMarkdown(id: string): Promise<{ filename: string; body: string } | null> {
  const row = await loadRow(id);
  if (!row || !markdownAvailable(row)) return null;
  const lines: string[] = [];
  lines.push(`# ${row.title}`, "");
  if (row.original_title) lines.push(`> Título original: ${row.original_title}`, "");
  lines.push(`- Fonte: ${publicSourceName(row.source_name, row.journal)}`);
  // Without a reliable date from the original, the time it was collected says so.
  lines.push(row.published_at ? `- Publicado em: ${row.published_at.toISOString()}` : `- Coletado em: ${row.discovered_at.toISOString()}`);
  lines.push(`- ${SITE.name}: ${itemUrl(row.id)}`);
  lines.push(`- Original: ${row.url}`, "");
  const exit = (await itemExits([id])).get(id);
  if (row.summary && !exit?.hasSummary) lines.push("## Resumo", "", row.summary, "");
  if (exit?.before) lines.push(bodyToMarkdown(exit.before, row.url), "");
  if (row.selected && row.seat && row.reason) lines.push(`## ${ITEM_COPY.reasonLabel}`, "", row.reason, "");
  if (showsPost(row) && row.x_post) {
    const post = xView(row);
    if (post?.text) lines.push("## Texto", "", post.text, "");
    if (post?.translation) lines.push("## Tradução", "", post.translation, "");
    for (const media of post?.media ?? []) {
      const url = media.url.startsWith("/") ? siteUrl(media.url) : media.url;
      lines.push(media.kind === "image" ? `![${media.alt ?? ""}](${url})` : `[Vídeo](${url})`, "");
    }
    const q = post?.quoted;
    if (q?.text) lines.push(`## Citando @${q.handle ?? ""}`, "", ...String(q.text).split("\n").map((l) => `> ${l}`), "", ...(q.url ? [q.url, ""] : []));
    if (q?.text && q.translation) lines.push("### Tradução da citação", "", ...q.translation.split("\n").map((l) => `> ${l}`), "");
  } else if (row.body_mode === "full" && row.body_html) {
    const translation = exportTranslation(row);
    if (translation) lines.push("## Texto · Tradução", "", bodyToMarkdown(translation, row.url), "");
    lines.push(isChineseBody(row) ? "## Texto" : "## Texto · Original", "", bodyToMarkdown(row.body_html, row.url), "");
  }
  if (exit?.after) lines.push(bodyToMarkdown(exit.after, row.url), "");
  return { filename: `${SITE.mcpPrefix}-${row.id}.md`, body: lines.join("\n").replace(/\n{3,}/g, "\n\n") };
}
