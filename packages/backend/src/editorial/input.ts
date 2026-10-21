// What the judging steps read about an article: loaded once per analysis and rendered per step.
import { beijingDate, beijingTime } from "@aihot/contracts/time";
import { sql } from "../db.ts";
import { collapseWhitespace, SITE_LANG, truncate } from "../lib/text.ts";
import { produceImage, rasterImage, SVG_PASSTHROUGH_MAX_BYTES } from "../media/images.ts";
import type { ContentPart } from "../providers/llm.ts";
import { MAX_BODY_CHARS } from "./writing.ts";

export interface AnalyzeInputArticle {
  id: string;
  revision: number;
  title: string;
  url: string;
  author: string | null;
  publishedAt: Date | null;
  /** When the site first saw it; never evidence of when the source published it. */
  discoveredAt?: Date | null;
  bodyText: string | null;
  excerpt: string | null;
  /** pending: no body fetched yet; ok; unconfirmed: fetching failed; none. */
  bodyStatus?: string;
  xPost: Record<string, any> | null;
  media: Array<Record<string, any>>;
  source: {
    name: string;
    kind: string;
    tier: string;
    firstParty: boolean;
    tags?: string[];
    ownerEntityId?: string | null;
    /** The source asks for the article page (fetchPublicContent, detail pages, web listings). */
    fetchesBody?: boolean;
  };
  /** Stored site-language translation of the body (e.g. a full post whose original was truncated). */
  translationZh?: string | null;
}

/**
 * The post as the judging steps read it: an X Article it published joins its text, so every step sees
 * the article rather than a bare link.
 */
export function withXArticle(xPost: Record<string, any> | null, article: { title?: string; text?: string } | null): Record<string, any> | null {
  if (!xPost || !article?.text) return xPost;
  const parts = [String(xPost.text ?? "").trim(), article.title ? `【X Article】${article.title}` : "【X Article】", article.text];
  return { ...xPost, text: parts.filter(Boolean).join("\n\n") };
}

export async function loadAnalyzeInput(articleId: string): Promise<AnalyzeInputArticle | null> {
  const [row] = await sql<{
    id: string; revision: number; title: string; url: string; author: string | null; published_at: Date | null; discovered_at: Date;
    body_text: string | null; excerpt: string | null; body_status: string; x_post: Record<string, any> | null; x_article: { title?: string; text?: string } | null;
    media: Array<Record<string, any>>; source_name: string; source_kind: string; tier: string; first_party: boolean; source_tags: string[]; owner_entity_id: string | null;
    config: Record<string, any>; translation_zh: string | null;
  }[]>`
    SELECT a.id, a.revision, a.title, a.url, a.author, a.published_at, a.discovered_at, a.body_text, a.excerpt, a.body_status, a.x_post, a.x_article, a.media,
           s.name AS source_name, s.kind AS source_kind, s.tier, s.first_party, s.tags AS source_tags, s.owner_entity_id, s.config,
           tr.body_text AS translation_zh
    FROM articles a JOIN sources s ON s.id = a.source_id
    LEFT JOIN translations tr ON tr.article_id = a.id AND tr.lang = ${SITE_LANG} AND tr.revision >= a.revision
    WHERE a.id = ${articleId}`;
  if (!row) return null;
  return {
    id: row.id, revision: row.revision, title: row.title, url: row.url, author: row.author, publishedAt: row.published_at, discoveredAt: row.discovered_at,
    bodyText: row.body_text, excerpt: row.excerpt, bodyStatus: row.body_status, xPost: withXArticle(row.x_post, row.x_article), media: row.media,
    source: {
      name: row.source_name, kind: row.source_kind, tier: row.tier, firstParty: row.tier === "T1", tags: row.source_tags, ownerEntityId: row.owner_entity_id,
      fetchesBody: row.config?.fetchPublicContent === true || !!row.config?.detail || row.source_kind === "web_list",
    },
    translationZh: row.translation_zh,
  };
}

const KIND_LABEL: Record<string, string> = {
  rss: "RSS", web_list: "página web", json_list: "API de página web", x_search: "post do X", mp_account: "conta do WeChat", external: "envio externo",
};

/** The material as the structure step reads it (source facts, text, link). */
export function buildMaterial(a: AnalyzeInputArticle): string {
  // Conditions often occur at the end of an announcement. Use the existing body budget instead of
  // only its lead; beyond it, state the missing tail so it is not mistaken for complete evidence.
  const body = (text: string) => text.length <= MAX_BODY_CHARS ? text : `${text.slice(0, MAX_BODY_CHARS)}\n【o original passa de ${MAX_BODY_CHARS} caracteres; o restante não foi fornecido】`;
  const lines: string[] = [];
  lines.push("<source>");
  lines.push(`Nome: ${a.source.name}`);
  lines.push(`Tipo: ${KIND_LABEL[a.source.kind] ?? a.source.kind}; nível: ${a.source.tier}; fonte primária: ${a.source.firstParty ? "sim" : "não"}`);
  lines.push("</source>");
  lines.push("<material>");
  if (a.publishedAt) lines.push(`Data de publicação: ${beijingDate(a.publishedAt)} ${beijingTime(a.publishedAt)} (horário de Brasília)`);
  if (a.author) lines.push(`Autor: ${a.author}`);
  if (a.xPost) {
    lines.push(`Autor: ${a.xPost.authorName ?? ""} (@${a.xPost.handle ?? ""})`);
    lines.push(`Post:\n${body(String(a.xPost.text ?? a.title))}`);
    if (a.xPost.quoted?.text) lines.push(`Post citado (@${a.xPost.quoted.handle ?? ""}):\n${body(String(a.xPost.quoted.text))}`);
    if (a.translationZh) lines.push(`Tradução do post para o português:\n${truncate(a.translationZh, 4000)}`);
  } else {
    lines.push(`Título: ${collapseWhitespace(a.title)}`);
    const original = a.bodyText ?? a.excerpt ?? "";
    lines.push(original ? `Corpo:\n${body(original)}` : "Corpo: (nenhum)");
    if (a.translationZh && !a.bodyText) lines.push(`Tradução do corpo para o português:\n${truncate(a.translationZh, 5000)}`);
  }
  lines.push(`Link do original: ${a.url}`);
  lines.push("</material>");
  return lines.join("\n");
}

/**
 * The article's first image, inlined: models often cannot reach the original hosts, so they get the
 * site's cached thumbnail. None when it cannot be fetched.
 * A post without its own image shows the quoted post's (a reaction to a chart or a launch card).
 */
export async function firstImagePart(a: Pick<AnalyzeInputArticle, "media"> & Partial<Pick<AnalyzeInputArticle, "xPost">>): Promise<ContentPart | null> {
  const image = [...(a.xPost?.media ?? []), ...(a.xPost?.quoted?.media ?? []), ...(a.media ?? [])].find((m: any) => m.kind === "image" && m.url);
  if (!image) return null;
  try {
    let { body, type } = await produceImage(String(image.url), "thumb");
    // The display can retain a large vector to save transfer; the model still needs the bitmap
    // thumbnail it received before that optimization. Compact SVGs keep their existing omission.
    if (type === "image/svg+xml" && body.length > SVG_PASSTHROUGH_MAX_BYTES) {
      ({ body, type } = await rasterImage(body, type, "thumb"));
    }
    return /^image\/(jpeg|png|webp)$/.test(type) ? { type: "image_url", image_url: { url: `data:${type};base64,${body.toString("base64")}` } } : null;
  } catch {
    return null;
  }
}
