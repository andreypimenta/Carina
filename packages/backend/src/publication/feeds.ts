// RSS feeds. GUID = article id (isPermaLink=false), <link> = the site's page, pubDate = source
// publication time (none when it is unknown). Summary feeds never carry content:encoded; full feeds
// inline bodies only for sources that explicitly allow redistribution. Titles come from the site's
// name and categories.
import { feedCategoryLabel, PUBLIC_API_CATEGORY_KEYS, toPublicApiCategory, type PublicApiCategoryKey } from "@aihot/contracts/taxonomy";
import { EDITION_WHEN, FEED_COPY, REPORTS, SITE, subjectAfter } from "@aihot/site";
import { config } from "../config.ts";
import { sql } from "../db.ts";
import { escapeXml, SITE_LANG } from "../lib/text.ts";
import { proxyBodyImages } from "../media/imgproxy.ts";
import { DAILY_ISSUE_NAME, feedIssues, PERIOD_ISSUE_NAMES, type FeedIssue, type ReportKind } from "./reports.ts";
import { textToHtml } from "../content/sanitize.ts";
import type { FeedNotice } from "../modules.ts";
import { publicCategoryCondition, exportTranslation, xView, type ItemRow } from "./items.ts";
import { publicSourceName } from "./rules.ts";
import { listedCondition, seatedCondition } from "./scope.ts";
import { dailyUrl, itemUrl, periodUrl, siteUrl } from "./links.ts";

interface FeedMeta {
  id: string;
  path: string;
  title: string;
  description: string;
  homePath: string;
  pollHintMinutes: number;
  edgeCacheSeconds: number;
}

const CACHE = { edgeCacheSeconds: 300 };

/** What the all feed leaves out: what the site names (FEED_COPY), then what the engine always leaves out. */
const LEFT_OUT = [...FEED_COPY.allLeavesOut, "conteúdo ainda não avaliado", "itens de baixa relevância", "duplicatas já mescladas"];

const FEEDS: FeedMeta[] = [
  { id: "selected", path: "/feed.xml", title: `${SITE.name} — Seleção`, description: `Os 50 itens mais recentes da Seleção do ${SITE.name}, em resumo, com título, link para leitura no site e para o original; para ler o texto completo no leitor de RSS, assine /feed/full.xml.`, homePath: "/", pollHintMinutes: 30, ...CACHE },
  { id: "selected-full", path: "/feed/full.xml", title: `${SITE.name} — Seleção (texto completo)`, description: "Os mesmos 50 itens mais recentes da Seleção; o texto completo vem embutido só para fontes que autorizam explicitamente a redistribuição, as demais trazem resumo e link para leitura.", homePath: "/", pollHintMinutes: 30, ...CACHE },
  { id: "all", path: "/feed/all.xml", title: `${SITE.name} — Todas as notícias`, description: `Todas as notícias públicas dos últimos 7 dias, das mais recentes para as mais antigas pela data real de publicação; não inclui ${LEFT_OUT.slice(0, -1).join(", ")} nem ${LEFT_OUT.at(-1)}.`, homePath: "/all", pollHintMinutes: 30, ...CACHE },
  { id: "daily", path: "/feed/daily.xml", title: `${SITE.name} — Briefing diário`, description: `O Briefing diário do ${SITE.name}, publicado ${EDITION_WHEN.daily} (horário de Brasília); mantém as 30 edições mais recentes.`, homePath: "/daily", pollHintMinutes: 30, ...CACHE },
  { id: "weekly", path: "/feed/weekly.xml", title: `${SITE.name} — Briefing semanal`, description: `O Briefing semanal do ${SITE.name}, publicado ${EDITION_WHEN.weekly} (horário de Brasília): os ${REPORTS.entry.noun} escolhidos dos briefings diários da semana anterior, divididos por seção, com uma apresentação; mantém as 12 edições mais recentes.`, homePath: "/weekly", pollHintMinutes: 180, ...CACHE },
  { id: "monthly", path: "/feed/monthly.xml", title: `${SITE.name} — Briefing mensal`, description: `O Briefing mensal do ${SITE.name}, publicado ${EDITION_WHEN.monthly} (horário de Brasília): os ${REPORTS.entry.noun} escolhidos dos briefings diários do mês anterior, divididos por seção, com uma apresentação; mantém as 12 edições mais recentes.`, homePath: "/monthly", pollHintMinutes: 360, ...CACHE },
];

/** A feed by its id; a category feed shares the poll hint and caching of the feed it narrows. */
export function feedMeta(id: ItemFeedKind | ReportKind): FeedMeta {
  return FEEDS.find((f) => f.id === id)!;
}

export function feedCacheControl(id: ItemFeedKind | ReportKind): string {
  const m = feedMeta(id);
  return `public, max-age=${m.edgeCacheSeconds}, s-maxage=${m.edgeCacheSeconds}, must-revalidate`;
}

/** RSS <author> needs an address: a no-reply one on the site's own domain. */
const AUTHOR = `noreply@${new URL(config.siteUrl).hostname}`;

function cdata(s: string): string {
  return `<![CDATA[${s.replace(/]]>/g, "]]]]><![CDATA[>").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")}]]>`;
}

function rfc822(d: Date): string {
  return d.toUTCString();
}

/** A module's reminder ahead of a feed's items (RequestNotices.feed). */
function noticeXml(n: FeedNotice): string {
  return `    <item>
      <title>${cdata(n.title)}</title>
      <link>${escapeXml(n.link)}</link>
      <description>${cdata(n.description)}</description>
      <pubDate>${rfc822(n.at)}</pubDate>
      <guid isPermaLink="false">${escapeXml(n.guid)}</guid>
      <author>${escapeXml(AUTHOR)} (${escapeXml(SITE.name)})</author>
    </item>`;
}

function channel(meta: { title: string; description: string; homePath: string; selfPath: string; ttl: number }, items: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escapeXml(meta.title)}</title>
    <link>${escapeXml(siteUrl(meta.homePath))}</link>
    <description>${escapeXml(meta.description)}</description>
    <language>${escapeXml(SITE.locale)}</language>
    <atom:link href="${escapeXml(siteUrl(meta.selfPath))}" rel="self" type="application/rss+xml" />
    <ttl>${meta.ttl}</ttl>
    <generator>${escapeXml(`${SITE.name} (${siteUrl("/agent")})`)}</generator>
${items.join("\n")}
  </channel>
</rss>
`;
}

type FeedRow = Pick<ItemRow, "id" | "title" | "summary" | "url" | "category" | "published_at" | "source_name"> &
  Partial<Pick<ItemRow, "channel" | "x_post" | "zh_text" | "quoted_zh" | "language"> & {
    syndicate: boolean; body_text: string | null; body_html: string | null; tr_html: string | null; tr_complete: boolean | null;
  }>;

/** Readers keep feed items for days: body images in full RSS are signed for a week, not a day. */
const FEED_IMAGE_SECONDS = 7 * 86400;

/**
 * The body a full feed carries, in the site's language when the page has it: an X post's translation (with
 * the post it quotes, translated too), else a complete translation of the article, else the original. It
 * ends with an attribution line (also a mark on copies taken from the feed).
 */
function fullContent(r: FeedRow, aihot: string): string | null {
  let html: string | null = null;
  const x = r.channel === "x" ? xView({ x_post: r.x_post ?? null, zh_text: r.zh_text ?? null, quoted_zh: r.quoted_zh ?? null }) : null;
  if (x) {
    html = textToHtml(x.translation ?? x.text);
    if (x.quoted?.text) {
      html += `<blockquote><p>Citando @${escapeXml(x.quoted.handle)}:</p>${textToHtml(x.quoted.translation ?? x.quoted.text)}${x.quoted.url ? `<p><a href="${escapeXml(x.quoted.url)}">${escapeXml(x.quoted.url)}</a></p>` : ""}</blockquote>`;
    }
    for (const media of r.x_post?.media ?? []) {
      const url = String(media.url ?? "");
      if (!/^https?:\/\//i.test(url)) continue;
      html += media.kind === "video"
        ? `<p><a href="${escapeXml(url)}">Vídeo</a></p>`
        : `<p><img src="${escapeXml(url)}" alt="${escapeXml(String(media.alt ?? ""))}"></p>`;
    }
  } else if (r.body_html) {
    html = exportTranslation(r) ?? r.body_html;
  }
  if (!html) return null;
  return `${proxyBodyImages(html, true, FEED_IMAGE_SECONDS)}<p>— Reunido e organizado pelo ${escapeXml(SITE.name)}; a versão completa e ${escapeXml(subjectAfter("mais", "notícias"))} em <a href="${aihot}">${aihot}</a></p>`;
}

function itemXml(r: FeedRow, includeContent: boolean): string {
  const aihot = itemUrl(r.id);
  const summary = r.summary ?? "";
  const description = `<p>${escapeXml(summary)}</p>\n<p>🔗 <a href="${escapeXml(r.url)}">Ler o original</a></p>\n<p>via ${escapeXml(SITE.name)} · <a href="${aihot}">${aihot}</a></p>`;
  const publicCategory = toPublicApiCategory(r.category);
  const category = publicCategory ? `\n      <category>${escapeXml(feedCategoryLabel(publicCategory))}</category>` : "";
  let content = "";
  if (includeContent && r.syndicate) {
    const html = fullContent(r, aihot);
    if (html) content = `\n      <content:encoded>${cdata(html)}</content:encoded>`;
  }
  const pubDate = r.published_at ? `\n      <pubDate>${rfc822(r.published_at)}</pubDate>` : "";
  return `    <item>
      <title>${cdata(r.title)}</title>
      <link>${aihot}</link>
      <description>${cdata(description)}</description>${content}${category}${pubDate}
      <guid isPermaLink="false">${escapeXml(r.id)}</guid>
      <author>${escapeXml(AUTHOR)} (${escapeXml(publicSourceName(r.source_name))})</author>
    </item>`;
}

export type ItemFeedKind = "selected" | "selected-full" | "all";

// Items are the newest by their original publish time (the pubDate shown): 50 per feed; a category
// feed holds only its last 7 days (by original publish time).

/** A reminder for the feed at a path, or none (routes/feeds.ts asks the modules). */
type NoticeFor = (feedPath: string) => FeedNotice | null;

export async function itemFeed(kind: ItemFeedKind, category: PublicApiCategoryKey | null, { now = new Date(), notice }: { now?: Date; notice?: NoticeFor } = {}): Promise<string> {
  const includeContent = kind === "selected-full";
  const scope = kind === "all"
    ? sql`${listedCondition(now)} AND coalesce(p.published_at, p.discovered_at) > ${now}::timestamptz - interval '7 days'
        AND coalesce(p.published_at, p.discovered_at) <= ${now}`
    : sql`${seatedCondition(now)} ${publicCategoryCondition(category)}
        ${category ? sql`AND coalesce(p.published_at, p.discovered_at) >= ${new Date(now.getTime() - 7 * 86400_000)}` : sql``}`;
  const rows = await sql<FeedRow[]>`
    WITH page AS MATERIALIZED (
      SELECT p.article_id FROM publications p WHERE ${scope}
      ORDER BY coalesce(p.published_at, p.discovered_at) DESC, p.article_id DESC LIMIT 50
    )
    SELECT p.article_id AS id, p.title, p.summary, p.url, p.category, p.published_at, s.name AS source_name
      ${includeContent ? sql`, p.channel, p.syndicate, a.language, a.x_post,
        CASE WHEN p.channel = 'x' THEN tr.body_text END AS zh_text, qt.text_zh AS quoted_zh,
        left(a.body_text, 400) AS body_text, a.body_html, tr.body_html AS tr_html, tr.complete AS tr_complete` : sql``}
    FROM page JOIN publications p ON p.article_id = page.article_id JOIN sources s ON s.id = p.source_id
    ${includeContent ? sql`LEFT JOIN articles a ON a.id = p.article_id AND p.syndicate
      LEFT JOIN translations tr ON tr.article_id = p.article_id AND tr.lang = ${SITE_LANG} AND tr.revision >= a.revision
      LEFT JOIN quote_translations qt ON p.channel = 'x' AND qt.tweet_id = substring(a.x_post->'quoted'->>'url' from '/status/([0-9]+)')` : sql``}
    ORDER BY coalesce(p.published_at, p.discovered_at) DESC, p.article_id DESC`;
  const m = feedMeta(kind);
  let meta = { title: m.title, description: m.description, homePath: m.homePath, selfPath: m.path, ttl: m.pollHintMinutes };
  if (category) {
    const label = feedCategoryLabel(category);
    meta = {
      title: includeContent ? `${SITE.name} — ${label} (texto completo)` : `${SITE.name} — ${label}`,
      description: includeContent
        ? `Feed com texto completo da categoria "${label}" da Seleção diária do ${SITE.name}. O texto vem embutido só para fontes que autorizam explicitamente a redistribuição.`
        : `Resumos da categoria "${label}" da Seleção diária do ${SITE.name}: assine por categoria, sem receber a Seleção inteira.`,
      homePath: "/",
      selfPath: includeContent ? `/feed/full/category/${category}.xml` : `/feed/category/${category}.xml`,
      ttl: m.pollHintMinutes,
    };
  }
  const items = rows.map((r) => itemXml(r, includeContent));
  const first = notice?.(meta.selfPath);
  if (first) items.unshift(noticeXml(first));
  return channel(meta, items);
}

const ISSUE_NAME: Record<ReportKind, string> = { daily: DAILY_ISSUE_NAME, ...PERIOD_ISSUE_NAMES };
/** Issues each report feed keeps: a month of dailies, a quarter of weeklies, a year of monthlies. */
const ISSUES_KEPT: Record<ReportKind, number> = { daily: 30, weekly: 12, monthly: 12 };

/** One issue: its headline, its lead (a weekly's or monthly's overview) and its contents, each entry linking to its page. */
function issueXml(kind: ReportKind, r: FeedIssue): string {
  const url = kind === "daily" ? dailyUrl(r.key) : periodUrl(kind, r.key);
  const name = `${SITE.name} · ${ISSUE_NAME[kind]}`;
  const title = r.headline ? `${name} · ${r.key} — ${r.headline}` : `${name} · ${r.key}`;
  const contents = r.sections.map((s) => `<p><strong>${escapeXml(s.label)}</strong></p>\n<ul>${s.items.map((i) => `<li><a href="${escapeXml(i.link)}">${escapeXml(i.title)}</a></li>`).join("")}</ul>`);
  const description = [`<p>${escapeXml(r.leadParagraph ?? r.headline ?? "")}</p>`, ...contents, `<p>via ${escapeXml(SITE.name)} · <a href="${url}">${url}</a></p>`].join("\n");
  return `    <item>
      <title>${cdata(title)}</title>
      <link>${url}</link>
      <description>${cdata(description)}</description>
      <pubDate>${rfc822(r.generatedAt)}</pubDate>
      <guid isPermaLink="false">${kind}-${escapeXml(r.key)}</guid>
      <author>${escapeXml(AUTHOR)} (${escapeXml(SITE.name)})</author>
    </item>`;
}

/** The daily, weekly or monthly feed: one item per issue, newest first. */
export async function reportFeed(kind: ReportKind, notice?: NoticeFor): Promise<string> {
  const m = feedMeta(kind);
  const meta = { title: m.title, description: m.description, homePath: m.homePath, selfPath: m.path, ttl: m.pollHintMinutes };
  const items = (await feedIssues(kind, ISSUES_KEPT[kind])).map((r) => issueXml(kind, r));
  const first = notice?.(meta.selfPath);
  if (first) items.unshift(noticeXml(first));
  return channel(meta, items);
}

export function isFeedCategory(v: string): v is PublicApiCategoryKey {
  return (PUBLIC_API_CATEGORY_KEYS as readonly string[]).includes(v);
}
