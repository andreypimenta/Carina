// The literature run: the saved PubMed searches, each new paper once. A paper whose full text the licence
// lets the site republish enters as that text (source literatura-integral, translated by the engine once it
// is selected); every other paper enters as the site's own article about it (source literatura-materia),
// written from the full text when a legal open copy is readable, else from the abstract. Both sources show
// their full text on the site; the engine judges, selects and groups them like any other material.
import { readFileSync } from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";
import { sql } from "@aihot/backend/db";
import { config, REPO_ROOT } from "@aihot/backend/config";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { sanitizeBody } from "@aihot/backend/content/sanitize";
import { queueProcessing } from "@aihot/backend/jobs/content";
import { completeReceipt } from "@aihot/backend/providers/receipts";
import { SITE_UTC_OFFSET } from "@aihot/contracts/time";
import { fetchPapers, searchPmids, skippable, authorLine, type Paper } from "./pubmed.ts";
import { fetchFullText, findOpenCopy, LICENSE_NAMES, republishable, type FullText, type OpenCopy } from "./access.ts";
import { referenceBlock, renderMateria, writeMateria } from "./materia.ts";

export const INTEGRAL_SOURCE = "literatura-integral";
export const MATERIA_SOURCE = "literatura-materia";
/** Below this, what Europe PMC returned is not a full text (an abstract, a letter): the article is written from it instead. */
export const MIN_FULL_TEXT = 1500;

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

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const textOf = (html: string) => cheerio.load(html, null, false).root().text().replace(/\s+/g, " ").trim();

/** A republished full text: a credit line, the text, and the reference. */
export function integralBody(paper: Paper, full: FullText, open: OpenCopy | null): string {
  const license = full.license ? LICENSE_NAMES[full.license] : "aberta";
  const licenseLink = full.licenseUrl && /^https?:\/\//.test(full.licenseUrl) ? `<a href="${esc(full.licenseUrl)}">${esc(license)}</a>` : esc(license);
  const credit = `<p><em>Tradução integral do artigo de ${esc(authorLine(paper.authors))}, publicado em ${esc(paper.journal)}${paper.year ? ` (${esc(paper.year)})` : ""} sob a licença ${licenseLink}. Figuras e tabelas são dos autores. Em caso de divergência, vale o original.</em></p>`;
  return `${credit}${full.html}${referenceBlock(paper, open, "full")}`;
}

interface Outcome { pmid: string; status: string; articleId?: string }

/** One paper: its access, its body, and its material. Recorded once it is in, so a failure retries next run. */
export async function takePaper(paper: Paper): Promise<Outcome> {
  const skip = skippable(paper);
  if (skip) return record(paper, skip);
  const open = paper.doi ? await findOpenCopy(paper.doi).catch(() => null) : null;
  const full = paper.pmcid ? await fetchFullText(paper.pmcid).catch(() => null) : null;
  const url = paper.doi ? `https://doi.org/${paper.doi}` : `https://pubmed.ncbi.nlm.nih.gov/${paper.pmid}/`;
  const publishedAt = entryTime(paper.enteredOn);
  const raw = { pmid: paper.pmid, doi: paper.doi, pmcid: paper.pmcid, journal: paper.journal, publicationTypes: paper.publicationTypes, openCopy: open, license: full?.license ?? open?.license ?? null };

  const license = full?.license ?? null;
  if (full && full.text.length >= MIN_FULL_TEXT && republishable(license)) {
    const html = sanitizeBody(integralBody(paper, full, open), url);
    const res = await upsertMaterial({
      sourceId: INTEGRAL_SOURCE, url, title: paper.title, author: authorLine(paper.authors) || null, language: "en",
      publishedAt, excerpt: paper.abstract.map((s) => s.text).join(" ").slice(0, 1000) || null,
      bodyHtml: html, bodyText: textOf(html), bodyStatus: "ok", raw, via: "literatura",
    });
    if (res.created || res.revised || res.processingNeeded) await queueProcessing(res.articleId);
    return record(paper, "integral", res.articleId);
  }

  const basis = full && full.text.length >= MIN_FULL_TEXT ? "full" : "abstract";
  if (basis === "abstract" && !paper.abstract.length) return record(paper, "sem-texto");
  if (!config.modelCallsEnabled) return { pmid: paper.pmid, status: "aguardando-modelo" };
  const { materia, receiptId } = await writeMateria(paper, basis === "full" ? full!.text : null);
  const html = sanitizeBody(renderMateria(materia, paper, open, basis), url);
  return sql.begin(async (tx) => {
    const res = await upsertMaterial({
      sourceId: MATERIA_SOURCE, url, title: materia.titulo.trim(), author: authorLine(paper.authors) || null, language: "pt",
      publishedAt, excerpt: materia.linhaFina.trim() || null, bodyHtml: html, bodyText: textOf(html), bodyStatus: "ok",
      raw: { ...raw, originalTitle: paper.title, basis }, via: "literatura",
    }, tx);
    await completeReceipt(tx, receiptId);
    await tx`INSERT INTO literatura_papers (pmid, status, article_id) VALUES (${paper.pmid}, ${`materia-${basis}`}, ${res.articleId})
      ON CONFLICT (pmid) DO UPDATE SET status = EXCLUDED.status, article_id = EXCLUDED.article_id, updated_at = now()`;
    if (res.created || res.revised || res.processingNeeded) await queueProcessing(res.articleId, { db: tx });
    return { pmid: paper.pmid, status: `materia-${basis}`, articleId: res.articleId };
  });
}

async function record(paper: Paper, status: string, articleId?: string): Promise<Outcome> {
  await sql`INSERT INTO literatura_papers (pmid, status, article_id) VALUES (${paper.pmid}, ${status}, ${articleId ?? null})
    ON CONFLICT (pmid) DO UPDATE SET status = EXCLUDED.status, article_id = EXCLUDED.article_id, updated_at = now()`;
  return { pmid: paper.pmid, status, articleId };
}

/** Every saved search, then the papers not taken yet, up to the run's share. */
export async function collectLiterature(opts: { budgetMs?: number } = {}): Promise<Record<string, unknown>> {
  const started = Date.now();
  const s = settings();
  const found = new Set<string>();
  const failedQueries: string[] = [];
  for (const q of s.queries) {
    try {
      for (const id of await searchPmids(q.term, s.days)) found.add(id);
    } catch {
      failedQueries.push(q.id);
    }
  }
  const known = new Set((await sql<{ pmid: string }[]>`SELECT pmid FROM literatura_papers WHERE pmid = ANY(${[...found]})`).map((r) => r.pmid));
  const pending = [...found].filter((id) => !known.has(id)).slice(0, s.perRun);
  const langs = new Set(s.languages);
  const counts: Record<string, number> = {};
  for (let i = 0; i < pending.length; i += 100) {
    for (const paper of await fetchPapers(pending.slice(i, i + 100))) {
      if (opts.budgetMs && Date.now() - started > opts.budgetMs) break;
      let out: Outcome;
      if (langs.size && paper.languages.length && !paper.languages.some((l) => langs.has(l))) out = await record(paper, "idioma");
      else {
        try {
          out = await takePaper(paper);
        } catch (error) {
          out = { pmid: paper.pmid, status: "erro" };
          console.error(`literatura: PMID ${paper.pmid}: ${(error as Error).message}`);
        }
      }
      counts[out.status] = (counts[out.status] ?? 0) + 1;
    }
  }
  // Like the ingest API: the two sources report in, so their health shows the run, not a missing fetch.
  if (failedQueries.length < s.queries.length) await sql`UPDATE sources SET last_fetch_at = now(), last_ok_at = now() WHERE id IN (${INTEGRAL_SOURCE}, ${MATERIA_SOURCE})`;
  return { searched: s.queries.length, failedQueries, found: found.size, new: pending.length, ...counts };
}
