// The research behind an X post. A post on its own is not news for the site (the module takes X posts over,
// server.ts takesXPosts: they stay out of every list and edition); its subject is. Each relevant post of the
// last days is read once: the identifiers in its text and in the post it quotes (a DOI, a PubMed or PMC
// address, "PMID: …"), then the pages it links (a journal's article page names its DOI or PMID in its
// citation tags; a press release or a news page whose paper links all lead to one paper names it; a page
// that only gives the paper's title is looked up in PubMed by that exact title). Pages are asked for once, as
// the site's crawler, with no login and no way around a refusal, like the free copies (access.ts). A post
// with no identifier to follow is read by the model (industry/prompts/apuracao.md) for what it is about and
// what to search: PubMed is searched with it, and only the one record found that has every name and term the
// post gives is taken, never a guess. The paper found takes the path of any paper of the module (takePaper:
// the full text when its licence allows it, else the site's own article, from the full text when a legal open
// copy is readable, else from the abstract), with the post credited at the end. A post about a guideline, a
// congress or an event, with no paper, is written up from the official page it links when the model finds the
// page is the primary source (industry/prompts/materia-fonte.md), naming the organisation and the page and
// crediting the post. A paper or page the module already took is not written again. A post with neither
// stays out of the editions: nothing is published from its text alone. A post whose paper waits (PMC,
// Unpaywall, the model) is taken again from that paper, and one whose DOI PubMed does not have yet is asked
// about again by that DOI while the post is in its window, with no page asked for again; a paper's page is
// never written up as an official page.
import * as cheerio from "cheerio";
import { z } from "zod";
import { config } from "@aihot/backend/config";
import { readable } from "@aihot/backend/content/extract";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { sanitizeBody } from "@aihot/backend/content/sanitize";
import { sql } from "@aihot/backend/db";
import { modelFor } from "@aihot/backend/editorial/models";
import { promptText, promptVersion } from "@aihot/backend/editorial/prompts";
import { queueProcessing } from "@aihot/backend/jobs/content";
import { guardedFetch } from "@aihot/backend/lib/http-fetch";
import { identityKeyForUrl } from "@aihot/backend/lib/url";
import { chatJson } from "@aihot/backend/providers/llm";
import { completeReceipt } from "@aihot/backend/providers/receipts";
import { earlier } from "./adicionar.ts";
import { blockText, lookupPmid } from "./access.ts";
import { enabledSources, MATERIA_SOURCE, MAX_ATTEMPTS, settings, takePaper } from "./collect.ts";
import { MATERIA_STEP, renderFonteMateria, writeFonteMateria, type PrimaryPage, type XCredit } from "./materia.ts";
import { fetchPapers, pmidsForDoi, pmidsForTitle, searchPmids, type Paper } from "./pubmed.ts";

export const APURACAO_PURPOSE = "apuracao_x";

/** Posts are researched while they are this many days old (a paper waiting for PMC or Unpaywall included). */
export const X_WINDOW_DAYS = 7;
/** Posts researched per run; the rest wait for the next one. */
const PER_RUN = 20;
/** Linked pages read per post. */
const MAX_PAGES = 3;
/** Distinct paper links past which a page is a roundup, not the page of one paper. */
const MAX_LINKED = 6;
/** How far back, in days of PubMed entry, the study a post describes is searched for. */
const SUBJECT_DAYS = 180;
/** Below this many characters, a linked page has too little to write an article from. */
const MIN_PAGE_TEXT = 600;

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

interface Page {
  html: string;
  url: string;
}

const empty = (r: Refs) => !r.dois.length && !r.pmids.length && !r.pmcids.length;

/** Addresses in the post that may lead to the paper: not X's own (the post, a quoted post, its media). */
export function postLinks(text: string): string[] {
  return uniq([...text.matchAll(/https?:\/\/[^\s<>"]+/gi)].map((m) => m[0].replace(/[.,;:!)\]}>'"…]+$/, "")))
    .filter((u) => !/^https?:\/\/(?:[\w-]+\.)*(?:x\.com|twitter\.com|t\.co)\//i.test(u));
}

/**
 * What a page says about the paper: its citation tags (citation_doi, citation_pmid, Dublin Core, PRISM)
 * and the DOI in its own address; the identifiers of each of its links (a press release or a news story
 * links the paper at doi.org, PubMed, PMC or the journal's own DOI page); and the article's title
 * (citation_title) for a search in PubMed.
 */
export function pageRefs(html: string, url: string): { own: Refs; links: Refs[]; title: string | null } {
  const $ = cheerio.load(html);
  const meta = (names: string[]) => $("meta").toArray()
    .filter((m) => names.includes(($(m).attr("name") ?? $(m).attr("property") ?? "").toLowerCase()))
    .map((m) => ($(m).attr("content") ?? "").trim()).filter(Boolean);
  const tagged = refsIn([...meta(["citation_doi", "dc.identifier", "prism.doi", "bepress_citation_doi"]).map((v) => v.replace(/^doi:\s*/i, "")), url].join(" "));
  const pmids = meta(["citation_pmid"]).filter((v) => /^\d{1,9}$/.test(v));
  const title = meta(["citation_title"])[0] ?? null;
  const own: Refs = { ...tagged, pmids: uniq([...tagged.pmids, ...pmids]) };
  const links = new Map<string, Refs>();
  for (const a of $("a[href]").toArray()) {
    const refs = refsIn($(a).attr("href") ?? "");
    if (!empty(refs)) links.set(JSON.stringify(refs), refs);
  }
  return { own, links: [...links.values()], title };
}

/** A linked page asked for once; null when it refuses the crawler, is not HTML or fails. */
async function readPage(url: string): Promise<Page | null> {
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
async function paperOf(refs: Refs): Promise<Paper | null> {
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
  return null;
}

/** The one record with exactly this title. */
async function paperByTitle(title: string): Promise<Paper | null> {
  if (normTitle(title).length < 20) return null;
  const found = await pmidsForTitle(title);
  if (found.length !== 1) return null;
  return (await fetchPapers(found)).find((p) => normTitle(p.title) === normTitle(title)) ?? null;
}

/** The paper a page's links lead to when they all lead to the same one; null when none, several or too many. */
async function onlyLinkedPaper(links: Refs[]): Promise<Paper | null> {
  if (links.length > MAX_LINKED) return null;
  let found: Paper | null = null;
  for (const refs of links) {
    const paper = await paperOf(refs);
    if (!paper) continue;
    if (found && found.pmid !== paper.pmid) return null;
    found = paper;
  }
  return found;
}

/**
 * The paper the post is about, from its own text first and then from the pages it links (an address that is
 * itself an identifier is not asked for: the identifier says it all); or the one DOI it points to that PubMed
 * does not have yet; or, with neither, the pages read that are not a paper's page, for the official page path.
 */
export async function findPostPaper(text: string): Promise<{ paper: Paper | null; doi: string | null; pages: Page[] }> {
  const own = refsIn(text);
  if (!empty(own)) {
    const paper = await paperOf(own);
    if (paper) return { paper, doi: null, pages: [] };
    if (own.dois.length === 1) return { paper: null, doi: own.dois[0]!, pages: [] };
  }
  const pages: Page[] = [];
  for (const link of postLinks(text).filter((l) => empty(refsIn(l))).slice(0, MAX_PAGES)) {
    const page = await readPage(link);
    if (!page) continue;
    const refs = pageRefs(page.html, page.url);
    const paper = (!empty(refs.own) ? await paperOf(refs.own) : await onlyLinkedPaper(refs.links)) ?? (refs.title ? await paperByTitle(refs.title) : null);
    if (paper) return { paper, doi: null, pages: [] };
    const named = !empty(refs.own) ? refs.own.dois : refs.links.length === 1 ? refs.links[0]!.dois : [];
    if (named.length === 1) return { paper: null, doi: named[0]!, pages: [] };
    if (empty(refs.own) && !refs.title) pages.push(page);
  }
  return { paper: null, doi: null, pages };
}

const Subject = z.object({
  assunto: z.enum(["artigo", "diretriz", "congresso", "evento", "outro"]),
  revista: z.string().nullish().transform((v) => v?.trim() ?? ""),
  tituloDoEstudo: z.string().nullish().transform((v) => v?.trim() ?? ""),
  primeiroAutor: z.string().nullish().transform((v) => v?.trim() ?? ""),
  nomeDoEnsaio: z.string().nullish().transform((v) => v?.trim() ?? ""),
  termos: z.array(z.string()).nullish().transform((v) => (v ?? []).map((t) => t.trim()).filter(Boolean).slice(0, 4)),
});
export type Subject = z.infer<typeof Subject>;

/** What the post is about and what to look for in PubMed, as the model reads it from the post (industry/prompts/apuracao.md). */
async function readSubject(articleId: string, text: string): Promise<Subject> {
  const res = await chatJson({
    model: await modelFor(MATERIA_STEP),
    purpose: APURACAO_PURPOSE,
    subject: `x:${articleId}`,
    promptVersion: promptVersion("apuracao"),
    system: promptText("apuracao"),
    user: `Post:\n${text}`,
    schema: Subject,
    temperature: 0,
    maxTokens: 600,
    timeoutMs: 60_000,
  });
  await completeReceipt(sql, res.receiptId);
  return res.data;
}

const phrase = (s: string) => `"${s.replace(/["\[\]]/g, " ").replace(/\s+/g, " ").trim()}"`;

/**
 * Whether a record is the study the post describes: every name and term the post gives is in it (the journal,
 * the first author, the trial in the title or abstract, each term in the title or abstract).
 */
export function matchesSubject(paper: Paper, s: Subject): boolean {
  const has = (hay: string, needle: string) => !normTitle(needle) || ` ${normTitle(hay)} `.includes(` ${normTitle(needle)} `);
  const text = [paper.title, ...paper.abstract.map((a) => a.text)].join(" ");
  const journal = !s.revista || [paper.journal, paper.journalAbbrev ?? ""].some((j) => has(j, s.revista) || (!!normTitle(j) && has(s.revista, j)));
  const author = !s.primeiroAutor || has(paper.authors[0]?.split(" ").slice(0, -1).join(" ") || paper.authors[0] || "", s.primeiroAutor);
  return journal && author && has(text, s.nomeDoEnsaio) && s.termos.every((t) => has(text, t));
}

/**
 * The study a post describes without naming an identifier, searched in PubMed among the records of the last
 * months: by its exact title when the post gives it, else by its terms anchored to the journal, the first
 * author or the trial the post names. Only one record found, and one that has all of them, is taken.
 */
export async function searchSubject(s: Subject): Promise<Paper | null> {
  if (s.tituloDoEstudo) return paperByTitle(s.tituloDoEstudo);
  if (!s.revista && !s.primeiroAutor && !s.nomeDoEnsaio) return null;
  if (s.termos.length < 2 && !s.nomeDoEnsaio) return null;
  const term = [
    ...s.termos.map((t) => `${phrase(t)}[tiab]`),
    s.revista ? `${phrase(s.revista)}[ta]` : "",
    s.primeiroAutor ? `${phrase(s.primeiroAutor)}[1au]` : "",
    s.nomeDoEnsaio ? `${phrase(s.nomeDoEnsaio)}[tiab]` : "",
  ].filter(Boolean).join(" AND ");
  const found = await searchPmids(term, SUBJECT_DAYS, 2);
  if (found.length !== 1) return null;
  const paper = (await fetchPapers(found)).find((p) => p.pmid === found[0]);
  return paper && matchesSubject(paper, s) ? paper : null;
}

interface PostRow {
  id: string;
  url: string;
  /** The paper an earlier run found for the post, still waiting (PMC, Unpaywall, the model). */
  pmid: string | null;
  /** The DOI an earlier run found for the post, waiting for PubMed to have it. */
  doi: string | null;
  x_post: { tweetId?: string; handle?: string; authorName?: string; text?: string; quoted?: { text?: string; url?: string } | null };
  x_article: { title?: string; text?: string } | null;
}

/** All the post's own words: its text, the post it quotes and its X Article. */
const postText = (r: PostRow) => [r.x_post.text, r.x_post.quoted?.text, r.x_article?.title, r.x_article?.text].filter(Boolean).join("\n\n");

/** Statuses a later run takes again: the paper waits for PMC, Unpaywall, the model or its source. */
const RETRY = ["aguardando-pubmed", "aguardando-pmc", "aguardando-unpaywall", "aguardando-modelo", "fonte-pausada", "erro"];

export interface XOutcome { articleId: string; status: string; pmid: string | null; materiaId?: string }

/**
 * One post: its paper, taken unless the module took it before; without a paper, the official page it links,
 * written up when the model finds it is the primary source. A post an earlier run found the paper of is
 * taken again from that paper, with no page asked for again.
 */
export async function researchPost(row: PostRow, now = new Date(), sources?: { integral: boolean; materia: boolean }): Promise<XOutcome> {
  const credit: XCredit = { handle: row.x_post.handle ?? "", authorName: row.x_post.authorName ?? "", url: row.url };
  const text = postText(row);
  const known = row.pmid ? (await fetchPapers([row.pmid])).find((p) => p.pmid === row.pmid) ?? null
    : row.doi ? await paperOf({ dois: [row.doi], pmids: [], pmcids: [] }) : null;
  if (!known && !row.pmid && row.doi) return recordPost(row.id, "aguardando-pubmed", null, undefined, row.doi);
  const { paper: linked, doi, pages } = known ? { paper: known, doi: null, pages: [] } : await findPostPaper(text);
  if (!linked && doi) return recordPost(row.id, "aguardando-pubmed", null, undefined, doi);
  const subject = linked ? null : await readSubject(row.id, text);
  const paper = linked ?? (subject && subject.assunto !== "outro" ? await searchSubject(subject) : null);
  if (paper) {
    const before = await earlier(paper.pmid);
    if (before) return recordPost(row.id, "ja-coberto", paper.pmid, before.articleId ?? undefined);
    const langs = new Set(settings().languages);
    if (langs.size && paper.languages.length && !paper.languages.some((l) => langs.has(l))) return recordPost(row.id, "idioma", paper.pmid);
    const out = await takePaper(paper, now, sources ?? (await enabledSources()), credit);
    return recordPost(row.id, out.status, paper.pmid, out.articleId);
  }
  if (subject && subject.assunto !== "outro") {
    for (const page of pages) {
      const out = await takePage(row.id, page, text, credit, now);
      if (out) return out;
    }
  }
  return recordPost(row.id, "sem-fonte", null);
}

/**
 * The site's article from an official page a post links, when the page has text and the model finds it is
 * the primary source; null otherwise. A page another post already led to is not written again.
 */
async function takePage(articleId: string, page: Page, post: string, credit: XCredit, now: Date): Promise<XOutcome | null> {
  const key = identityKeyForUrl(page.url);
  if (!key) return null;
  const [taken] = await sql<{ id: string }[]>`SELECT id FROM articles WHERE identity_key = ${key}`;
  if (taken) return recordPost(articleId, "ja-coberto", null, taken.id);
  const body = readable(page.html, page.url);
  const text = body ? blockText(body.html) : "";
  if (text.length < MIN_PAGE_TEXT) return null;
  const primary: PrimaryPage = { url: page.url, title: cheerio.load(page.html)("title").first().text().replace(/\s+/g, " ").trim(), text };
  const { materia, receiptId } = await writeFonteMateria(primary, post);
  if (!materia) {
    await completeReceipt(sql, receiptId);
    return null;
  }
  const html = sanitizeBody(renderFonteMateria(materia, primary, credit), page.url);
  return sql.begin(async (tx) => {
    const res = await upsertMaterial({
      sourceId: MATERIA_SOURCE, url: page.url, title: materia.titulo.trim(), author: materia.organizacao.trim() || null, language: "pt",
      publishedAt: now, excerpt: materia.linhaFina.trim() || null, bodyHtml: html, bodyText: blockText(html), bodyStatus: "ok",
      raw: { basis: "pagina", organization: materia.organizacao.trim(), pageTitle: primary.title, xPost: credit.url }, via: "literatura", staleOnDiscovery: false,
    }, tx);
    await completeReceipt(tx, receiptId);
    await tx`INSERT INTO literatura_x_posts (article_id, status, pmid) VALUES (${articleId}, 'materia-pagina', NULL)
      ON CONFLICT (article_id) DO UPDATE SET status = EXCLUDED.status, pmid = NULL, updated_at = now()`;
    if (res.created || res.revised || res.processingNeeded) await queueProcessing(res.articleId, { db: tx });
    return { articleId, status: "materia-pagina", pmid: null, materiaId: res.articleId };
  });
}

async function recordPost(articleId: string, status: string, pmid: string | null, materiaId?: string, doi: string | null = null): Promise<XOutcome> {
  await sql`INSERT INTO literatura_x_posts (article_id, status, pmid, doi) VALUES (${articleId}, ${status}, ${pmid}, ${doi})
    ON CONFLICT (article_id) DO UPDATE SET status = EXCLUDED.status, pmid = EXCLUDED.pmid, doi = EXCLUDED.doi, updated_at = now()`;
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
 * yet (oldest first) and then those waiting for their paper (the longest waiting first), up to the run's
 * share. Nothing is researched while the article source is paused or model calls are off: the posts wait.
 */
export async function researchXPosts(opts: { now?: Date; budgetMs?: number } = {}): Promise<Record<string, unknown>> {
  const started = Date.now();
  const now = opts.now ?? new Date();
  const sources = await enabledSources();
  if (!sources.materia) return { posts: 0, waiting: "fonte-pausada" };
  if (!config.modelCallsEnabled) return { posts: 0, waiting: "aguardando-modelo" };
  const rows = await sql<PostRow[]>`
    SELECT a.id, a.url, x.pmid, x.doi, a.x_post, a.x_article FROM articles a
    JOIN sources s ON s.id = a.source_id
    LEFT JOIN literatura_x_posts x ON x.article_id = a.id
    WHERE s.kind = 'x_search' AND s.participation_mode = 'editorial' AND a.x_post IS NOT NULL AND NOT a.backfill
      AND a.discovered_at > ${now}::timestamptz - make_interval(days => ${X_WINDOW_DAYS})
      AND (x.article_id IS NULL OR x.status = ANY(${RETRY}))
      AND (SELECT an.relevance FROM analyses an WHERE an.article_id = a.id ORDER BY an.input_revision DESC, an.id DESC LIMIT 1) = 'pass'
    ORDER BY x.article_id IS NOT NULL, coalesce(x.updated_at, a.discovered_at), a.id LIMIT ${PER_RUN}`;
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
