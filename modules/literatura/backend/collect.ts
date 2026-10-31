// The literature run: the saved PubMed searches, each new paper once. A paper whose licence URL lets the site
// republish a translation enters as its full text (source literatura-integral, translated by the engine once
// it is selected); every other paper enters as the site's own article about it (source literatura-materia),
// written from the full text when a legal open copy is readable (PMC's, else the free copy Unpaywall points
// to at the publisher or a repository), else from the abstract. Both sources show
// their full text on the site; the engine judges, selects and groups them like any other material. A paper
// found days after entering PubMed is still news for the week's edition: the engine's 48-hour rule
// (content/materials.ts) that archives late material as history does not apply to these two sources.
// A paper that fails (a service down, an unusable answer) is tried again on later runs, up to MAX_ATTEMPTS.
// The watched journals (backend/revistas.ts) add their PubMed search and their tables of contents to the run, and
// the leads (backend/pistas.ts) the papers that children's hospitals' news is about.
import { readFileSync } from "node:fs";
import path from "node:path";
import { sql } from "@aihot/backend/db";
import { config, REPO_ROOT } from "@aihot/backend/config";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { sanitizeBody } from "@aihot/backend/content/sanitize";
import { queueProcessing } from "@aihot/backend/jobs/content";
import { completeReceipt } from "@aihot/backend/providers/receipts";
import { SITE_UTC_OFFSET } from "@aihot/contracts/time";
import { fetchPapers, pmidsForDoi, searchPmids, skippable, authorLine, isPreprint, type Paper } from "./pubmed.ts";
import { onSubject, paperFromItem, pubmedTerm, readSumario, type Revistas } from "./revistas.ts";
import { papersOfPost, readPosts, type Pista, type Post } from "./pistas.ts";
import { blockText, fetchFullText, findOpenCopy, LICENSE_NAMES, lookupPmcid, readOpenCopy, republishable, type Access, type FullText } from "./access.ts";
import { confiancaDaMateria, confiancaDaTraducao, creditBlock, preprintNote, referenceBlock, renderMateria, textoLido, writeMateria, type XCredit } from "./materia.ts";
import { saveConfianca } from "./confianca.ts";

export const INTEGRAL_SOURCE = "literatura-integral";
export const MATERIA_SOURCE = "literatura-materia";
/** Below this many characters of body (the abstract not counted), what Europe PMC returned is not a full text. */
export const MIN_FULL_TEXT = 1500;
/** Runs a failing paper is tried on before it is given up. */
export const MAX_ATTEMPTS = 3;
/**
 * A paper Unpaywall reports open under a republishable licence, with no PMC copy yet, waits this many days
 * after entering PubMed for PMC to have it before it is written up instead.
 */
export const PMC_WAIT_DAYS = 1.5;
/**
 * Unpaywall takes in a new DOI a day or two after it is registered and answers 404 until then: a paper whose
 * DOI it does not know yet is asked about again on later runs for this many days after entering PubMed,
 * before it is written up without knowing whether a free copy exists.
 */
export const UNPAYWALL_WAIT_DAYS = 3;
/** The engine translates about this much of a body (editorial/translate.ts); longer texts are only partly translated. */
const TRANSLATED_CHARS = 55_000;

interface Settings {
  queries: Array<{ id: string; name: string; term: string }>;
  /** How far back each search looks, in days of PubMed entry. */
  days: number;
  /** Papers written per run; the rest wait for the next one. */
  perRun: number;
  /** Languages PubMed must list for a paper (eng, por, spa…). */
  languages: string[];
}

export function settings(): Settings {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "industry/literatura.json"), "utf8")) as Settings;
}

/** A PubMed entry day as the start of that day in the site's zone: never in the future, so never held back. */
export function entryTime(day: string | null, now = new Date()): Date | null {
  if (!day) return null;
  const at = new Date(`${day}T00:00:00${SITE_UTC_OFFSET}`);
  if (!Number.isFinite(at.getTime())) return null;
  return at > now ? now : at;
}

/** PubMed's language codes as the site's (the engine skips translating a body already in its language). */
const LANGUAGES: Record<string, string> = { eng: "en", por: "pt", spa: "es", chi: "zh", fre: "fr", ger: "de", ita: "it", jpn: "ja" };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** A republished full text: a credit line with the licence, the text, and the reference. */
export function integralBody(paper: Paper, full: FullText, access: Access, pmcid: string): string {
  const license = full.license!;
  const name = LICENSE_NAMES[license];
  const licenseLink = full.licenseUrl && /^https?:\/\//.test(full.licenseUrl) ? `<a href="${esc(full.licenseUrl)}">${esc(name)}</a>` : esc(name);
  const credit = [
    `Tradução do artigo de ${esc(authorLine(paper.authors))}, publicado em ${esc(paper.journal)}${paper.year ? ` (${esc(paper.year)})` : ""} sob a licença ${licenseLink}.`,
    license === "cc-by-sa" || license === "cc-by-nc-sa" ? ` Esta tradução é distribuída sob a mesma licença (${esc(name)}).` : "",
    full.omittedFigures ? ` ${full.omittedFigures === 1 ? "Uma figura reproduzida de terceiros foi omitida" : `${full.omittedFigures} figuras reproduzidas de terceiros foram omitidas`}; veja o original.` : "",
    full.html.length > TRANSLATED_CHARS ? " Por causa do tamanho, só a parte inicial do texto é traduzida; o restante aparece no original." : "",
    " Em caso de divergência, vale o original.",
  ].join("");
  return `${isPreprint(paper) ? preprintNote() : ""}<p><em>${credit}</em></p>${full.html}${referenceBlock(paper, access, pmcid, "integral")}`;
}

/**
 * A paper's row in literatura_papers: its PMID, or its DOI while PubMed does not have it, or the address of
 * a table-of-contents paper that has no DOI.
 */
const keyOf = (paper: Paper) => paper.pmid ?? (paper.doi ? `doi:${paper.doi}` : `url:${paper.url}`);

interface Outcome { pmid: string; status: string; articleId?: string }

/** Which of the two sources take material now: one paused in the admin takes none. */
export async function enabledSources(): Promise<{ integral: boolean; materia: boolean }> {
  const rows = await sql<{ id: string }[]>`SELECT id FROM sources WHERE id IN (${INTEGRAL_SOURCE}, ${MATERIA_SOURCE}) AND enabled`;
  const ids = new Set(rows.map((r) => r.id));
  return { integral: ids.has(INTEGRAL_SOURCE), materia: ids.has(MATERIA_SOURCE) };
}

/**
 * One paper: its access, its body, and its material. A status it returns without recording ("aguardando-…")
 * leaves it for a later run; a thrown error counts as a failed attempt. A paper found through an X post
 * (backend/apurar.ts) carries the post's credit at the end of its body.
 */
export async function takePaper(paper: Paper, now = new Date(), sources = { integral: true, materia: true }, credit?: XCredit): Promise<Outcome> {
  const skip = skippable(paper);
  if (skip) return record(paper, skip);
  const access: Access = paper.doi ? await findOpenCopy(paper.doi) : { kind: "unknown" };
  const pmcid = paper.pmcid ?? (paper.pmid ? await lookupPmcid(paper.pmid) : null);
  const full = pmcid ? await fetchFullText(pmcid) : null;
  const isFull = !!full && full.bodyChars >= MIN_FULL_TEXT;
  const url = paper.doi ? `https://doi.org/${paper.doi}` : paper.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${paper.pmid}/` : paper.url!;
  const publishedAt = entryTime(paper.enteredOn, now);
  const language = LANGUAGES[paper.languages[0] ?? "eng"] ?? null;
  const raw = { pmid: paper.pmid, doi: paper.doi, pmcid, journal: paper.journal, publicationTypes: paper.publicationTypes, access, license: full?.license ?? null, ...(credit ? { xPost: credit.url } : {}) };
  const credited = credit ? creditBlock(credit) : "";

  if (sources.integral && isFull && republishable(full!.license)) {
    const html = sanitizeBody(integralBody(paper, full!, access, pmcid!) + credited, url);
    const articleId = await sql.begin(async (tx) => {
      const res = await upsertMaterial({
        sourceId: INTEGRAL_SOURCE, url, title: paper.title, author: authorLine(paper.authors) || null, language,
        publishedAt, excerpt: paper.abstract.map((s) => s.text).join(" ").slice(0, 1000) || null,
        bodyHtml: html, bodyText: blockText(html), bodyStatus: "ok", raw, via: "literatura", staleOnDiscovery: false,
      }, tx);
      await saveConfianca(tx, res.articleId, confiancaDaTraducao(paper, now));
      if (res.created || res.revised || res.processingNeeded) await queueProcessing(res.articleId, { db: tx });
      return res.articleId;
    });
    return record(paper, "integral", articleId);
  }

  // An open copy under a licence that allows republishing, not in PMC yet: give PMC a few days.
  const entered = publishedAt ? (now.getTime() - publishedAt.getTime()) / 86_400_000 : Infinity;
  if (sources.integral && !isFull && access.kind === "open" && republishable(access.copy.license) && entered < PMC_WAIT_DAYS) {
    return { pmid: keyOf(paper), status: "aguardando-pmc" };
  }
  // A DOI Unpaywall has not taken in yet: ask it again on later runs.
  if (!isFull && paper.doi && process.env.LITERATURA_EMAIL && access.kind === "unknown" && entered < UNPAYWALL_WAIT_DAYS) {
    return { pmid: keyOf(paper), status: "aguardando-unpaywall" };
  }

  if (!sources.materia) return { pmid: keyOf(paper), status: "fonte-pausada" };
  if (!config.modelCallsEnabled) return { pmid: keyOf(paper), status: "aguardando-modelo" };
  const abstractChars = paper.abstract.reduce((n, s) => n + s.text.length, 0);
  const copy = !isFull && access.kind === "open" ? await readOpenCopy(access.copy.url, abstractChars) : null;
  const fullText = isFull ? full!.text : copy && copy.bodyChars >= MIN_FULL_TEXT ? copy.text : null;
  const basis = fullText ? "full" : "abstract";
  if (basis === "abstract" && !paper.abstract.length) return record(paper, "sem-texto");
  const { materia, receiptId } = await writeMateria(paper, fullText);
  const html = sanitizeBody(renderMateria(materia, paper, access, full ? pmcid : null, basis) + credited, url);
  return sql.begin(async (tx) => {
    const res = await upsertMaterial({
      sourceId: MATERIA_SOURCE, url, title: materia.titulo.trim(), author: authorLine(paper.authors) || null, language: "pt",
      publishedAt, excerpt: materia.linhaFina.trim() || null, bodyHtml: html, bodyText: blockText(html), bodyStatus: "ok",
      raw: { ...raw, originalTitle: paper.title, basis, ...(fullText ? { fullTextFrom: isFull ? "pmc" : "copy" } : {}) }, via: "literatura", staleOnDiscovery: false,
    }, tx);
    await completeReceipt(tx, receiptId);
    await saveConfianca(tx, res.articleId, confiancaDaMateria(materia, paper, textoLido(basis, access), now));
    await tx`INSERT INTO literatura_papers (pmid, doi, status, article_id) VALUES (${keyOf(paper)}, ${paper.doi}, ${`materia-${basis}`}, ${res.articleId})
      ON CONFLICT (pmid) DO UPDATE SET status = EXCLUDED.status, doi = EXCLUDED.doi, article_id = EXCLUDED.article_id, updated_at = now()`;
    if (res.created || res.revised || res.processingNeeded) await queueProcessing(res.articleId, { db: tx });
    return { pmid: keyOf(paper), status: `materia-${basis}`, articleId: res.articleId };
  });
}

async function record(paper: Paper, status: string, articleId?: string): Promise<Outcome> {
  await sql`INSERT INTO literatura_papers (pmid, doi, status, article_id) VALUES (${keyOf(paper)}, ${paper.doi}, ${status}, ${articleId ?? null})
    ON CONFLICT (pmid) DO UPDATE SET status = EXCLUDED.status, doi = EXCLUDED.doi, article_id = EXCLUDED.article_id, updated_at = now()`;
  return { pmid: keyOf(paper), status, articleId };
}

/** A failed attempt; the last one allowed gives the paper up. */
export async function recordFailure(pmid: string, doi: string | null = null): Promise<Outcome> {
  const [row] = await sql<{ attempts: number }[]>`
    INSERT INTO literatura_papers (pmid, doi, status, attempts) VALUES (${pmid}, ${doi}, 'erro', 1)
    ON CONFLICT (pmid) DO UPDATE SET attempts = literatura_papers.attempts + 1, updated_at = now()
    RETURNING attempts`;
  if (row!.attempts >= MAX_ATTEMPTS) {
    await sql`UPDATE literatura_papers SET status = 'falhou' WHERE pmid = ${pmid}`;
    return { pmid, status: "falhou" };
  }
  return { pmid, status: "erro" };
}

/**
 * The watched journals' tables of contents: the papers on the site's subjects not taken yet, as PMIDs when
 * PubMed already has their DOI, else as papers of their own. A paper of a journal PubMed indexes whose table
 * of contents gives no abstract is left to the journal's PubMed search, which brings the abstract.
 */
async function readSumarios(cfg: Revistas, since: Date): Promise<{ pmids: string[]; papers: Paper[]; read: number; failed: string[] }> {
  const out = { pmids: [] as string[], papers: [] as Paper[], read: 0, failed: [] as string[] };
  const candidates = new Map<string, Paper>();
  for (const revista of cfg.revistas.filter((r) => r.sumario)) {
    try {
      for (const item of await readSumario(revista, since)) {
        if (!/^https?:\/\//.test(item.url) || !onSubject(cfg, `${item.title} ${item.abstract}`)) continue;
        const paper = paperFromItem(revista, item);
        if (!candidates.has(keyOf(paper))) candidates.set(keyOf(paper), paper);
      }
      out.read++;
    } catch (error) {
      out.failed.push(revista.id);
      console.error(`literatura: sumário ${revista.id}: ${(error as Error).message}`);
    }
  }
  if (!candidates.size) return out;
  const dois = [...candidates.values()].flatMap((p) => (p.doi ? [p.doi] : []));
  const taken = new Set((await sql<{ pmid: string; doi: string | null }[]>`
    SELECT pmid, doi FROM literatura_papers WHERE (pmid = ANY(${[...candidates.keys()]}) OR doi = ANY(${dois})) AND status <> 'erro'`).flatMap((r) => [r.pmid, r.doi]));
  for (const [key, paper] of candidates) {
    if (taken.has(key) || (paper.doi && taken.has(paper.doi))) continue;
    const [pmid] = paper.doi ? await pmidsForDoi(paper.doi) : [];
    if (pmid) out.pmids.push(pmid);
    else if (paper.abstract.length || !paper.journalAbbrev) out.papers.push(paper);
  }
  return out;
}

/**
 * The leads' new posts, each with the papers it names that the run is to take. A post that fails to open is left
 * to the next run; one already done with (collectLiterature records it) is not opened again.
 */
async function readLeads(list: Pista[], cfg: Revistas, since: Date): Promise<{ posts: Array<Post & { pmids: string[] }>; read: number; failed: string[] }> {
  const out = { posts: [] as Array<Post & { pmids: string[] }>, read: 0, failed: [] as string[] };
  const posts = new Map<string, Post>();
  for (const pista of list) {
    try {
      for (const post of await readPosts(pista, since)) if (!posts.has(post.key)) posts.set(post.key, post);
      out.read++;
    } catch (error) {
      out.failed.push(pista.id);
      console.error(`literatura: pista ${pista.id}: ${(error as Error).message}`);
    }
  }
  if (!posts.size) return out;
  const seen = new Set((await sql<{ pmid: string }[]>`SELECT pmid FROM literatura_papers WHERE pmid = ANY(${[...posts.keys()]})`).map((r) => r.pmid));
  for (const post of posts.values()) {
    if (seen.has(post.key)) continue;
    try {
      out.posts.push({ ...post, pmids: await papersOfPost(post, cfg) });
    } catch (error) {
      console.error(`literatura: pista ${post.url}: ${(error as Error).message}`);
    }
  }
  return out;
}

/**
 * Every saved search (with the watched journals' search and tables of contents when `revistas` is given, and
 * the papers the leads' posts name when `pistas` is given too), then the papers not taken yet (and the failed
 * ones still within their attempts), up to the run's share.
 */
export async function collectLiterature(opts: { budgetMs?: number; now?: Date; revistas?: Revistas; pistas?: Pista[] } = {}): Promise<Record<string, unknown>> {
  const started = Date.now();
  const now = opts.now ?? new Date();
  const s = settings();
  const journalsTerm = opts.revistas ? pubmedTerm(opts.revistas) : null;
  const queries = journalsTerm ? [...s.queries, { id: "revistas-vigiadas", name: "Revistas vigiadas", term: journalsTerm }] : s.queries;
  const found = new Set<string>();
  const failedQueries: string[] = [];
  for (const q of queries) {
    try {
      for (const id of await searchPmids(q.term, s.days)) found.add(id);
    } catch (error) {
      failedQueries.push(q.id);
      console.error(`literatura: busca ${q.id}: ${(error as Error).message}`);
    }
  }
  const since = new Date(now.getTime() - s.days * 86_400_000);
  const sumarios = opts.revistas ? await readSumarios(opts.revistas, since) : null;
  for (const id of sumarios?.pmids ?? []) found.add(id);
  const leads = opts.revistas && opts.pistas ? await readLeads(opts.pistas, opts.revistas, since) : null;
  for (const post of leads?.posts ?? []) for (const id of post.pmids) found.add(id);
  const done = new Set((await sql<{ pmid: string }[]>`SELECT pmid FROM literatura_papers WHERE pmid = ANY(${[...found]}) AND status <> 'erro'`).map((r) => r.pmid));
  const retrying = new Set((await sql<{ pmid: string }[]>`SELECT pmid FROM literatura_papers WHERE pmid = ANY(${[...found]}) AND status = 'erro'`).map((r) => r.pmid));
  // New papers first; papers that failed before take what is left of the run's share; then the papers only a
  // table of contents has.
  const pending = [...[...found].filter((id) => !done.has(id) && !retrying.has(id)), ...retrying].slice(0, s.perRun);
  const fromSumarios = (sumarios?.papers ?? []).slice(0, Math.max(0, s.perRun - pending.length));
  const sources = await enabledSources();
  const langs = new Set(s.languages);
  const counts: Record<string, number> = {};
  const take = async (paper: Paper) => {
    try {
      return await takePaper(paper, now, sources);
    } catch (error) {
      console.error(`literatura: ${keyOf(paper)}: ${(error as Error).message}`);
      return recordFailure(keyOf(paper), paper.doi);
    }
  };
  outer: for (let i = 0; i < pending.length; i += 100) {
    const papers = await fetchPapers(pending.slice(i, i + 100));
    // A paper first taken from a journal's table of contents: its PubMed record joins that article.
    const dois = papers.flatMap((p) => (p.doi ? [p.doi] : []));
    const early = new Map((await sql<{ doi: string; article_id: string }[]>`
      SELECT doi, article_id FROM literatura_papers WHERE doi = ANY(${dois}) AND pmid LIKE 'doi:%' AND article_id IS NOT NULL`).map((r) => [r.doi, r.article_id]));
    for (const paper of papers) {
      if (opts.budgetMs && Date.now() - started > opts.budgetMs) break outer;
      let out: Outcome;
      if (paper.doi && early.has(paper.doi)) out = await record(paper, "sumario", early.get(paper.doi));
      else if (langs.size && paper.languages.length && !paper.languages.some((l) => langs.has(l))) out = await record(paper, "idioma");
      else out = await take(paper);
      counts[out.status] = (counts[out.status] ?? 0) + 1;
    }
  }
  for (const paper of fromSumarios) {
    if (opts.budgetMs && Date.now() - started > opts.budgetMs) break;
    const out = await take(paper);
    counts[out.status] = (counts[out.status] ?? 0) + 1;
  }
  // A lead's post is done with once each paper it names is (taken, or given up after its attempts); until then
  // later runs open it again, so a paper left for later or failed is not lost with it.
  if (leads?.posts.length) {
    const named = leads.posts.flatMap((p) => p.pmids);
    const handled = new Set((await sql<{ pmid: string }[]>`SELECT pmid FROM literatura_papers WHERE pmid = ANY(${named}) AND status <> 'erro'`).map((r) => r.pmid));
    for (const post of leads.posts.filter((p) => p.pmids.every((id) => handled.has(id)))) {
      await sql`INSERT INTO literatura_papers (pmid, status) VALUES (${post.key}, ${post.pmids.length ? "pista" : "pista-sem-artigo"}) ON CONFLICT (pmid) DO NOTHING`;
    }
  }
  // Like the ingest API: the two sources report in, so their health shows the run, not a missing fetch.
  if (failedQueries.length < queries.length) await sql`UPDATE sources SET last_fetch_at = now(), last_ok_at = now() WHERE id IN (${INTEGRAL_SOURCE}, ${MATERIA_SOURCE})`;
  return {
    searched: queries.length, failedQueries, found: found.size, new: pending.length + fromSumarios.length,
    ...(sumarios ? { revistasLidas: sumarios.read, revistasFalharam: sumarios.failed } : {}),
    ...(leads ? { pistasLidas: leads.read, pistasFalharam: leads.failed, pistasPosts: leads.posts.length, pistasArtigos: new Set(leads.posts.flatMap((p) => p.pmids)).size } : {}), ...counts,
  };
}
