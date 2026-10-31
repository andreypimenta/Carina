// Sitemap from the same public metadata as pages. Process and HTTP caches share one five-minute
// deadline; a saved copy may bridge a restart only for the remainder of that original lifetime.
import { mkdir, readFile, stat, utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.ts";
import { sql } from "../db.ts";
import { cached, SHARED_ONLY } from "../lib/cache.ts";
import { escapeXml } from "../lib/text.ts";
import { siteUrl } from "./links.ts";
import { evidenceCondition, listedCondition, storyReportCondition } from "./scope.ts";
import { topicPageCounts } from "./topics.ts";
import { serverModules, type SitemapEntry } from "../modules.ts";

const MAX_URLS = 45_000;
const TTL_MS = 5 * 60 * 1000;
const CACHE_FILE = path.join(config.dataDir, "sitemap-last.xml");

interface SitemapDocument { xml: string; expiresAt: number }

let lastGood: SitemapDocument | null = null;

type Entry = SitemapEntry;

export async function loadSitemapEntries(at = new Date()): Promise<Entry[]> {
  const entries: Entry[] = [];
  // An issue is dated by its rewrite or correction, unless material it cites changed later.
  const reports = await sql<{ kind: string; key: string; t: Date | null }[]>`
    SELECT r.kind, r.key,
      CASE WHEN citations.changed_at > greatest(r.updated_at, r.generated_at) THEN NULL
           ELSE greatest(r.updated_at, r.generated_at) END AS t
    FROM reports r LEFT JOIN LATERAL (
      SELECT max(p.updated_at) AS changed_at
      FROM publications p WHERE p.article_id IN (
        SELECT value #>> '{}' FROM jsonb_path_query(r.content, '$.**.itemId') AS cited(value))
    ) citations ON true ORDER BY r.kind, r.key DESC`;
  const topics = await topicPageCounts(at);
  entries.push(
    { loc: "/", changefreq: "hourly", priority: 1 },
    { loc: "/all", changefreq: "hourly", priority: 0.9 },
    { loc: "/daily", changefreq: "daily", priority: 0.9 },
    { loc: "/hot", changefreq: "hourly", priority: 0.9 },
    { loc: "/daily/archive", changefreq: "daily", priority: 0.7 },
    { loc: "/weekly", changefreq: "weekly", priority: 0.7 },
    { loc: "/monthly", changefreq: "monthly", priority: 0.6 },
    { loc: "/topics", changefreq: "daily", priority: 0.7 },
    // The modules' pages, between the content pages and the site's own.
    ...serverModules().flatMap((m) => m.sitemap?.pages ?? []),
    { loc: "/agent", changefreq: "weekly", priority: 0.7 },
    { loc: "/about", changefreq: "monthly", priority: 0.5 },
    { loc: "/terms", changefreq: "monthly", priority: 0.4 },
    { loc: "/privacy", changefreq: "monthly", priority: 0.4 },
    { loc: "/changelog", changefreq: "weekly", priority: 0.5 },
  );
  for (const r of reports) entries.push({ loc: `/${r.kind}/${r.key}`, lastmod: r.t, changefreq: "monthly", priority: 0.6 });
  for (const t of topics) {
    if (!t.indexable) continue;
    entries.push({ loc: `/topics/${t.slug}`, lastmod: t.changedAt, changefreq: "daily", priority: 0.6 });
    for (let p = 2; p <= t.pages; p++) entries.push({ loc: `/topics/${t.slug}/page/${p}`, lastmod: t.changedAt, changefreq: "weekly", priority: 0.3 });
  }
  // A story needs listed evidence of its own; pages that only gather reports grouped elsewhere or only
  // mention facts are reachable but not listed. Neither stories nor items have a public modification
  // clock (a correction need not advance latest_at; a retry or repair moves updated_at), so no lastmod.
  const stories = await sql<{ public_id: string }[]>`
    SELECT public_id::text FROM stories WHERE merged_into IS NULL AND EXISTS (
      SELECT 1 FROM facts f JOIN fact_articles fa ON fa.fact_id = f.id JOIN publications p ON p.article_id = fa.article_id
      WHERE f.story_id = stories.id AND ${evidenceCondition()} AND ${listedCondition(at)})
    ORDER BY latest_at DESC NULLS LAST, id DESC LIMIT 500`;
  for (const s of stories) entries.push({ loc: `/story/${s.public_id}`, changefreq: "daily", priority: 0.5 });
  for (const m of serverModules()) if (m.sitemap?.entries) entries.push(...(await m.sitemap.entries()));
  const items = await sql<{ id: string }[]>`
    SELECT p.article_id AS id FROM publications p JOIN sources s ON s.id = p.source_id
    WHERE ${storyReportCondition(at)} AND p.indexable
    ORDER BY p.timeline_at DESC, p.article_id DESC LIMIT ${Math.max(0, MAX_URLS - entries.length)}`;
  for (const it of items) entries.push({ loc: `/items/${it.id}`, changefreq: "monthly", priority: 0.5 });
  return entries.slice(0, MAX_URLS);
}

async function build(at: Date): Promise<string> {
  const body = (await loadSitemapEntries(at))
    .map((e) => {
      const parts = [`<loc>${escapeXml(siteUrl(e.loc))}</loc>`];
      if (e.lastmod) parts.push(`<lastmod>${e.lastmod.toISOString()}</lastmod>`);
      if (e.changefreq) parts.push(`<changefreq>${e.changefreq}</changefreq>`);
      if (e.priority !== undefined) parts.push(`<priority>${e.priority}</priority>`);
      return `<url>\n${parts.join("\n")}\n</url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

const rebuilding = cached(refreshSitemap, SHARED_ONLY);

export function loadSitemap(): Promise<SitemapDocument> {
  if (lastGood && lastGood.expiresAt > Date.now()) return Promise.resolve(lastGood);
  return rebuilding.get();
}

async function refreshSitemap(): Promise<SitemapDocument> {
  try {
    const at = Date.now();
    const xml = await build(new Date(at));
    lastGood = { xml, expiresAt: at + TTL_MS };
    await mkdir(path.dirname(CACHE_FILE), { recursive: true });
    // The file's timestamp preserves the same deadline when another process loads it after restart.
    await writeFile(CACHE_FILE, xml).then(() => utimes(CACHE_FILE, new Date(at), new Date(at))).catch(() => {});
    return lastGood;
  } catch (error) {
    if (lastGood && lastGood.expiresAt > Date.now()) return lastGood;
    const saved = await Promise.all([readFile(CACHE_FILE, "utf8"), stat(CACHE_FILE)]).catch(() => null);
    if (saved && saved[1].mtimeMs + TTL_MS > Date.now()) {
      return (lastGood = { xml: saved[0], expiresAt: saved[1].mtimeMs + TTL_MS });
    }
    throw error;
  }
}
