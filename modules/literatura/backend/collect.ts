// The literature run: the saved PubMed searches, each new paper once. A paper whose licence URL lets the site
// republish a translation enters as its full text (source literatura-integral, translated by the engine once
// it is selected); every other paper enters as the site's own article about it (source literatura-materia),
// written from the full text when a legal open copy is readable, else from the abstract. Both sources show
// their full text on the site; the engine judges, selects and groups them like any other material. A paper
// found days after entering PubMed is still news for the week's edition: the engine's 48-hour rule
// (content/materials.ts) that archives late material as history does not apply to these two sources.
// A paper that fails (a service down, an unusable answer) is tried again on later runs, up to MAX_ATTEMPTS.
import { readFileSync } from "node:fs";
import path from "node:path";
import { sql } from "@aihot/backend/db";
import { config, REPO_ROOT } from "@aihot/backend/config";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { sanitizeBody } from "@aihot/backend/content/sanitize";
import { queueProcessing } from "@aihot/backend/jobs/content";
import { completeReceipt } from "@aihot/backend/providers/receipts";
import { SITE_UTC_OFFSET } from "@aihot/contracts/time";
import { fetchPapers, searchPmids, skippable, authorLine, type Paper } from "./pubmed.ts";
import { blockText, fetchFullText, findOpenCopy, LICENSE_NAMES, lookupPmcid, republishable, type Access, type FullText } from "./access.ts";
import { referenceBlock, renderMateria, writeMateria } from "./materia.ts";

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
  return `<p><em>${credit}</em></p>${full.html}${referenceBlock(paper, access, pmcid, "integral")}`;
}

interface Outcome { pmid: string; status: string; articleId?: string }

/** Which of the two sources take material now: one paused in the admin takes none. */
export async function enabledSources(): Promise<{ integral: boolean; materia: boolean }> {
  const rows = await sql<{ id: string }[]>`SELECT id FROM sources WHERE id IN (${INTEGRAL_SOURCE}, ${MATERIA_SOURCE}) AND enabled`;
  const ids = new Set(rows.map((r) => r.id));
  return { integral: ids.has(INTEGRAL_SOURCE), materia: ids.has(MATERIA_SOURCE) };
}

/**
 * One paper: its access, its body, and its material. A status it returns without recording ("aguardando-…")
 * leaves it for a later run; a thrown error counts as a failed attempt.
 */
export async function takePaper(paper: Paper, now = new Date(), sources = { integral: true, materia: true }): Promise<Outcome> {
  const skip = skippable(paper);
  if (skip) return record(paper, skip);
  const access: Access = paper.doi ? await findOpenCopy(paper.doi) : { kind: "unknown" };
  const pmcid = paper.pmcid ?? (await lookupPmcid(paper.pmid));
  const full = pmcid ? await fetchFullText(pmcid) : null;
  const isFull = !!full && full.bodyChars >= MIN_FULL_TEXT;
  const url = paper.doi ? `https://doi.org/${paper.doi}` : `https://pubmed.ncbi.nlm.nih.gov/${paper.pmid}/`;
  const publishedAt = entryTime(paper.enteredOn, now);
  const language = LANGUAGES[paper.languages[0] ?? "eng"] ?? null;
  const raw = { pmid: paper.pmid, doi: paper.doi, pmcid, journal: paper.journal, publicationTypes: paper.publicationTypes, access, license: full?.license ?? null };

  if (sources.integral && isFull && republishable(full!.license)) {
    const html = sanitizeBody(integralBody(paper, full!, access, pmcid!), url);
    const res = await upsertMaterial({
      sourceId: INTEGRAL_SOURCE, url, title: paper.title, author: authorLine(paper.authors) || null, language,
      publishedAt, excerpt: paper.abstract.map((s) => s.text).join(" ").slice(0, 1000) || null,
      bodyHtml: html, bodyText: blockText(html), bodyStatus: "ok", raw, via: "literatura", staleOnDiscovery: false,
    });
    if (res.created || res.revised || res.processingNeeded) await queueProcessing(res.articleId);
    return record(paper, "integral", res.articleId);
  }

  // An open copy under a licence that allows republishing, not in PMC yet: give PMC a few days.
  const entered = publishedAt ? (now.getTime() - publishedAt.getTime()) / 86_400_000 : Infinity;
  if (sources.integral && !isFull && access.kind === "open" && republishable(access.copy.license) && entered < PMC_WAIT_DAYS) {
    return { pmid: paper.pmid, status: "aguardando-pmc" };
  }

  if (!sources.materia) return { pmid: paper.pmid, status: "fonte-pausada" };
  const basis = isFull ? "full" : "abstract";
  if (basis === "abstract" && !paper.abstract.length) return record(paper, "sem-texto");
  if (!config.modelCallsEnabled) return { pmid: paper.pmid, status: "aguardando-modelo" };
  const { materia, receiptId } = await writeMateria(paper, basis === "full" ? full!.text : null);
  const html = sanitizeBody(renderMateria(materia, paper, access, full ? pmcid : null, basis), url);
  return sql.begin(async (tx) => {
    const res = await upsertMaterial({
      sourceId: MATERIA_SOURCE, url, title: materia.titulo.trim(), author: authorLine(paper.authors) || null, language: "pt",
      publishedAt, excerpt: materia.linhaFina.trim() || null, bodyHtml: html, bodyText: blockText(html), bodyStatus: "ok",
      raw: { ...raw, originalTitle: paper.title, basis }, via: "literatura", staleOnDiscovery: false,
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

/** A failed attempt; the last one allowed gives the paper up. */
export async function recordFailure(pmid: string): Promise<Outcome> {
  const [row] = await sql<{ attempts: number }[]>`
    INSERT INTO literatura_papers (pmid, status, attempts) VALUES (${pmid}, 'erro', 1)
    ON CONFLICT (pmid) DO UPDATE SET attempts = literatura_papers.attempts + 1, updated_at = now()
    RETURNING attempts`;
  if (row!.attempts >= MAX_ATTEMPTS) {
    await sql`UPDATE literatura_papers SET status = 'falhou' WHERE pmid = ${pmid}`;
    return { pmid, status: "falhou" };
  }
  return { pmid, status: "erro" };
}

/** Every saved search, then the papers not taken yet (and the failed ones still within their attempts), up to the run's share. */
export async function collectLiterature(opts: { budgetMs?: number; now?: Date } = {}): Promise<Record<string, unknown>> {
  const started = Date.now();
  const s = settings();
  const found = new Set<string>();
  const failedQueries: string[] = [];
  for (const q of s.queries) {
    try {
      for (const id of await searchPmids(q.term, s.days)) found.add(id);
    } catch (error) {
      failedQueries.push(q.id);
      console.error(`literatura: busca ${q.id}: ${(error as Error).message}`);
    }
  }
  const done = new Set((await sql<{ pmid: string }[]>`SELECT pmid FROM literatura_papers WHERE pmid = ANY(${[...found]}) AND status <> 'erro'`).map((r) => r.pmid));
  const retrying = new Set((await sql<{ pmid: string }[]>`SELECT pmid FROM literatura_papers WHERE pmid = ANY(${[...found]}) AND status = 'erro'`).map((r) => r.pmid));
  // New papers first; papers that failed before take what is left of the run's share.
  const pending = [...[...found].filter((id) => !done.has(id) && !retrying.has(id)), ...retrying].slice(0, s.perRun);
  const sources = await enabledSources();
  const langs = new Set(s.languages);
  const counts: Record<string, number> = {};
  outer: for (let i = 0; i < pending.length; i += 100) {
    for (const paper of await fetchPapers(pending.slice(i, i + 100))) {
      if (opts.budgetMs && Date.now() - started > opts.budgetMs) break outer;
      let out: Outcome;
      if (langs.size && paper.languages.length && !paper.languages.some((l) => langs.has(l))) out = await record(paper, "idioma");
      else {
        try {
          out = await takePaper(paper, opts.now ?? new Date(), sources);
        } catch (error) {
          out = await recordFailure(paper.pmid);
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
