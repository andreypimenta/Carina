// The research behind an X post. A post on its own is not news for the site (the module takes X posts over,
// server.ts takesXPosts: they stay out of every list and edition); the paper it points to is. Each relevant
// post of the last days is read once: the identifiers in its text and in the post it quotes (a DOI, a PubMed
// or PMC address, "PMID: …"), then the pages it links (a journal's article page names its DOI or PMID in its
// citation tags; a press release or a news page that links one single paper names it in its links; a page
// that only gives the paper's title is looked up in PubMed by that exact title). Pages are asked for once, as
// the site's crawler, with no login and no way around a refusal, like the free copies (access.ts). The paper
// found takes the path of any paper of the module (takePaper: the full text when its licence allows it, else
// the site's own article, from the full text when a legal open copy is readable, else from the abstract),
// with the post credited at the end. A paper the module already took is not written again. A post with no
// paper found stays out of the editions: nothing is published from its text alone.
import * as cheerio from "cheerio";
import { sql } from "@aihot/backend/db";
import { guardedFetch } from "@aihot/backend/lib/http-fetch";
import { earlier } from "./adicionar.ts";
import { lookupPmid } from "./access.ts";
import { enabledSources, MAX_ATTEMPTS, settings, takePaper } from "./collect.ts";
import type { XCredit } from "./materia.ts";
import { fetchPapers, pmidsForDoi, pmidsForTitle, type Paper } from "./pubmed.ts";

/** Posts are researched while they are this many days old (a paper waiting for PMC or Unpaywall included). */
export const X_WINDOW_DAYS = 7;
/** Posts researched per run; the rest wait for the next one. */
const PER_RUN = 20;
/** Linked pages read per post. */
const MAX_PAGES = 3;

export interface Refs {
  dois: string[];
  pmids: string[];
  pmcids: string[];
}

const DOI = /\b10\.\d{4,9}\/[^\s"'<>]+/g;
/** What a journal's address adds after the DOI: the view of the page, not part of the DOI. */
const DOI_VIEW = /\/(?:full|abstract|pdf|epdf|fulltext|html|epub|suppl_file)$/i;

/** A DOI as PubMed stores it: decoded, lower case, without trailing punctuation, query, anchor or view. */
export function cleanDoi(raw: string): string | null {
  let doi = raw.replace(/[?#].*$/, "");
  try {
    doi = decodeURIComponent(doi);
  } catch { /* kept as written */ }
  doi = doi.replace(/[.,;:!)\]}>'"…]+$/, "").replace(DOI_VIEW, "").toLowerCase();
  return /^10\.\d{4,9}\/\S+$/.test(doi) ? doi : null;
}

const uniq = (xs: string[]) => [...new Set(xs)];

/** The identifiers a text names: DOIs (bare or in an address), PubMed addresses or "PMID: …", PMC ids. */
export function refsIn(text: string): Refs {
  const dois = uniq([...text.matchAll(DOI)].map((m) => cleanDoi(m[0])).filter((d): d is string => !!d));
  const pmids = uniq([
    ...[...text.matchAll(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d{1,9})\b/gi)].map((m) => m[1]!),
    ...[...text.matchAll(/ncbi\.nlm\.nih\.gov\/pubmed\/(\d{1,9})\b/gi)].map((m) => m[1]!),
    ...[...text.matchAll(/\bPMID:?\s*(\d{1,9})\b/gi)].map((m) => m[1]!),
  ]);
  const pmcids = uniq([...text.matchAll(/\bPMC(\d{4,9})\b/g)].map((m) => `PMC${m[1]}`));
  return { dois, pmids, pmcids };
}

const empty = (r: Refs) => !r.dois.length && !r.pmids.length && !r.pmcids.length;

/** Addresses in the post that may lead to the paper: not X's own (the post, a quoted post, its media). */
export function postLinks(text: string): string[] {
  return uniq([...text.matchAll(/https?:\/\/[^\s<>"]+/gi)].map((m) => m[0].replace(/[.,;:!)\]}>'"…]+$/, "")))
    .filter((u) => !/^https?:\/\/(?:[\w-]+\.)*(?:x\.com|twitter\.com|t\.co)\//i.test(u));
}

/**
 * What a page says about the paper: its citation tags (citation_doi, citation_pmid, Dublin Core, PRISM)
 * and the DOI in its own address; without them, the paper it links when it links exactly one; and the
 * article's title (citation_title) for a search in PubMed.
 */
export function pageRefs(html: string, url: string): Refs & { title: string | null } {
  const $ = cheerio.load(html);
  const meta = (names: string[]) => $("meta").toArray()
    .filter((m) => names.includes(($(m).attr("name") ?? $(m).attr("property") ?? "").toLowerCase()))
    .map((m) => ($(m).attr("content") ?? "").trim()).filter(Boolean);
  const tagged = refsIn([...meta(["citation_doi", "dc.identifier", "prism.doi", "bepress_citation_doi"]).map((v) => v.replace(/^doi:\s*/i, "")), url].join(" "));
  const pmids = meta(["citation_pmid"]).filter((v) => /^\d{1,9}$/.test(v));
  const title = meta(["citation_title"])[0] ?? null;
  const own: Refs = { ...tagged, pmids: uniq([...tagged.pmids, ...pmids]) };
  if (!empty(own)) return { ...own, title };
  // A press release or a news story: the one paper it links.
  const linked = refsIn($("a[href]").toArray().map((a) => $(a).attr("href") ?? "").filter((h) => /doi\.org\/10\.|pubmed\.ncbi\.nlm\.nih\.gov\/\d|ncbi\.nlm\.nih\.gov\/pmc\/articles\/PMC|pmc\.ncbi\.nlm\.nih\.gov\/articles\/PMC/i.test(h)).join(" "));
  const count = linked.dois.length + linked.pmids.length + linked.pmcids.length;
  return count === 1 ? { ...linked, title } : { dois: [], pmids: [], pmcids: [], title };
}

/** A linked page asked for once; null when it refuses the crawler, is not HTML or fails. */
async function readPage(url: string): Promise<{ html: string; url: string } | null> {
  try {
    const res = await guardedFetch(url, { timeoutMs: 20_000, maxBytes: 4 * 1024 * 1024 });
    if (res.status !== 200 || !/html/.test(res.headers.get("content-type") ?? "")) return null;
    return { html: res.text(), url: res.url };
  } catch (error) {
    console.error(`literatura: página do post ${url}: ${(error as Error).message}`);
    return null;
  }
}

const normTitle = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** The PubMed record of the first identifier that has one. */
async function paperOf(refs: Refs, title: string | null = null): Promise<Paper | null> {
  const pmids = [...refs.pmids];
  for (const pmcid of refs.pmcids) {
    const pmid = await lookupPmid(pmcid);
    if (pmid) pmids.push(pmid);
  }
  for (const pmid of uniq(pmids)) {
    const paper = (await fetchPapers([pmid])).find((p) => p.pmid === pmid);
    if (paper) return paper;
  }
  for (const doi of refs.dois) {
    const paper = (await fetchPapers(await pmidsForDoi(doi))).find((p) => p.doi === doi);
    if (paper) return paper;
  }
  // Only the title: the one record with exactly that title.
  if (title && normTitle(title).length >= 20) {
    const found = await pmidsForTitle(title);
    if (found.length === 1) {
      const paper = (await fetchPapers(found)).find((p) => normTitle(p.title) === normTitle(title));
      if (paper) return paper;
    }
  }
  return null;
}

/** The paper the post is about, from its own text first and then from the pages it links. */
export async function findPostPaper(text: string): Promise<Paper | null> {
  const own = refsIn(text);
  if (!empty(own)) {
    const paper = await paperOf(own);
    if (paper) return paper;
  }
  for (const link of postLinks(text).slice(0, MAX_PAGES)) {
    const page = await readPage(link);
    if (!page) continue;
    const refs = pageRefs(page.html, page.url);
    const paper = await paperOf(refs, refs.title);
    if (paper) return paper;
  }
  return null;
}

interface PostRow {
  id: string;
  url: string;
  x_post: { tweetId?: string; handle?: string; authorName?: string; text?: string; quoted?: { text?: string; url?: string } | null };
  x_article: { title?: string; text?: string } | null;
}

/** All the post's own words: its text, the post it quotes and its X Article. */
const postText = (r: PostRow) => [r.x_post.text, r.x_post.quoted?.text, r.x_article?.title, r.x_article?.text].filter(Boolean).join("\n\n");

/** Statuses a later run takes again: the paper waits for PMC, Unpaywall, the model or its source. */
const RETRY = ["aguardando-pmc", "aguardando-unpaywall", "aguardando-modelo", "fonte-pausada", "erro"];

export interface XOutcome { articleId: string; status: string; pmid: string | null; materiaId?: string }

/** One post: its paper, taken unless the module took it before. */
export async function researchPost(row: PostRow, now = new Date(), sources?: { integral: boolean; materia: boolean }): Promise<XOutcome> {
  const paper = await findPostPaper(postText(row));
  if (!paper) return recordPost(row.id, "sem-fonte", null);
  const before = await earlier(paper.pmid);
  if (before) return recordPost(row.id, "ja-coberto", paper.pmid, before.articleId ?? undefined);
  const langs = new Set(settings().languages);
  if (langs.size && paper.languages.length && !paper.languages.some((l) => langs.has(l))) return recordPost(row.id, "idioma", paper.pmid);
  const credit: XCredit = { handle: row.x_post.handle ?? "", authorName: row.x_post.authorName ?? "", url: row.url };
  const out = await takePaper(paper, now, sources ?? (await enabledSources()), credit);
  return recordPost(row.id, out.status, paper.pmid, out.articleId);
}

async function recordPost(articleId: string, status: string, pmid: string | null, materiaId?: string): Promise<XOutcome> {
  await sql`INSERT INTO literatura_x_posts (article_id, status, pmid) VALUES (${articleId}, ${status}, ${pmid})
    ON CONFLICT (article_id) DO UPDATE SET status = EXCLUDED.status, pmid = EXCLUDED.pmid, updated_at = now()`;
  return { articleId, status, pmid, materiaId };
}

async function recordPostFailure(articleId: string): Promise<XOutcome> {
  const [row] = await sql<{ attempts: number }[]>`
    INSERT INTO literatura_x_posts (article_id, status, attempts) VALUES (${articleId}, 'erro', 1)
    ON CONFLICT (article_id) DO UPDATE SET status = 'erro', attempts = literatura_x_posts.attempts + 1, updated_at = now()
    RETURNING attempts`;
  if (row!.attempts >= MAX_ATTEMPTS) {
    await sql`UPDATE literatura_x_posts SET status = 'falhou' WHERE article_id = ${articleId}`;
    return { articleId, status: "falhou", pmid: null };
  }
  return { articleId, status: "erro", pmid: null };
}

/**
 * The relevant posts of editorial X sources (the prefilter passed them) from the last days, not researched
 * yet or waiting for their paper, oldest first, up to the run's share.
 */
export async function researchXPosts(opts: { now?: Date; budgetMs?: number } = {}): Promise<Record<string, unknown>> {
  const started = Date.now();
  const now = opts.now ?? new Date();
  const rows = await sql<PostRow[]>`
    SELECT a.id, a.url, a.x_post, a.x_article FROM articles a
    JOIN sources s ON s.id = a.source_id
    LEFT JOIN literatura_x_posts x ON x.article_id = a.id
    WHERE s.kind = 'x_search' AND s.participation_mode = 'editorial' AND a.x_post IS NOT NULL AND NOT a.backfill
      AND a.discovered_at > ${now}::timestamptz - make_interval(days => ${X_WINDOW_DAYS})
      AND (x.article_id IS NULL OR x.status = ANY(${RETRY}))
      AND (SELECT an.relevance FROM analyses an WHERE an.article_id = a.id ORDER BY an.input_revision DESC, an.id DESC LIMIT 1) = 'pass'
    ORDER BY a.discovered_at, a.id LIMIT ${PER_RUN}`;
  const sources = await enabledSources();
  const counts: Record<string, number> = {};
  for (const row of rows) {
    if (opts.budgetMs && Date.now() - started > opts.budgetMs) break;
    let out: XOutcome;
    try {
      out = await researchPost(row, now, sources);
    } catch (error) {
      out = await recordPostFailure(row.id);
      console.error(`literatura: post do X ${row.url}: ${(error as Error).message}`);
    }
    counts[out.status] = (counts[out.status] ?? 0) + 1;
  }
  return { posts: rows.length, ...counts };
}
