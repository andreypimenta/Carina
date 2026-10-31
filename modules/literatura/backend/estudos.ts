// Where each study the site published stands, and its versions (literatura_estudos). A paper is a preprint or
// an article a journal reviewed (pubmed.ts isPreprint); an item of a trial register's source (tagged
// REGISTRO_TAG in industry/sources.json) is registered until its register says it is recruiting or has its
// results deposited: ClinicalTrials.gov's API is asked about each one for its first months (syncRegistros).
// The registry entry, the congress abstract, the preprint and the article of one study share an identifier:
// a DOI or PMID Crossref or PubMed give as another version of it (Crossref's is-preprint-of / has-preprint /
// has-version, PubMed's "update in" / "update of"), a trial registration the paper's record lists in its data
// banks (linking it to the registry entry only), or, with no identifier, a preprint and an article with the same
// first author and nearly the same title. A later version is written as the next step of the study the site
// already covered (materia.ts materiaInput), and every version's page lists the others (confianca.ts materiaParts),
// so they are not read as separate findings. Two papers that share only a trial registration (a secondary,
// post-hoc or follow-up analysis) are not versions but other publications of the same trial, written and listed
// as such.
import { beijingDate } from "@aihot/contracts/time";
import { sql, type Db } from "@aihot/backend/db";
import { guardedFetch } from "@aihot/backend/lib/http-fetch";
import { emit } from "@aihot/backend/modules";
import { publishArticle } from "@aihot/backend/publication/publish";
import { isPreprint, trialIdsIn, type Paper } from "./pubmed.ts";
import { CROSSREF, crossrefTurn } from "./revistas.ts";
import type { Estado, Versao } from "../confianca.ts";

/** The stages of a registry entry, as stored. */
const REGISTROS = ["registrado", "recrutando", "resultados-depositados"];
const isTrialKey = (id: string) => id.startsWith("trial:");

/** The tag of the sources whose items are trial registry entries (industry/sources.json). */
export const REGISTRO_TAG = "ensaio registrado";
/** A registry entry's status is asked again each day for this long after it was found. */
const REGISTRO_DAYS = 180;
/** Below this share of shared title words, a preprint and an article are not the same work. */
const SAME_TITLE = 0.8;

const CTGOV = () => (process.env.CTGOV_BASE_URL ?? "https://clinicaltrials.gov/api/v2").replace(/\/$/, "");

const uniq = (xs: string[]) => [...new Set(xs)];
const plainDoi = (s: string) => s.trim().toLowerCase().replace(/^https?:\/\/(?:dx\.)?doi\.org\//, "");

/** Crossref relations naming another version of the same work. */
const VERSION_RELATIONS = ["is-preprint-of", "has-preprint", "is-version-of", "has-version"];

/**
 * The DOIs Crossref records as other versions of this one; none when it does not know the DOI or does not
 * answer, so a lookup that fails never holds the paper back.
 */
export async function crossrefVersions(doi: string): Promise<string[]> {
  const mailto = process.env.LITERATURA_EMAIL ? `?mailto=${encodeURIComponent(process.env.LITERATURA_EMAIL)}` : "";
  try {
    await crossrefTurn();
    const res = await guardedFetch(`${CROSSREF()}/works/${encodeURIComponent(doi)}${mailto}`, { timeoutMs: 20_000 });
    if (res.status !== 200) return [];
    const relation = (JSON.parse(res.text()) as { message?: { relation?: Record<string, Array<{ "id-type"?: string; id?: string }>> } }).message?.relation ?? {};
    return uniq(VERSION_RELATIONS.flatMap((k) => relation[k] ?? []).filter((r) => r["id-type"] === "doi" && r.id).map((r) => plainDoi(r.id!))).filter((d) => d !== doi);
  } catch (error) {
    console.error(`literatura: Crossref ${doi}: ${(error as Error).message}`);
    return [];
  }
}

/** The identifiers a paper's versions share: its own, the trials it names and the versions PubMed and Crossref link. */
export function paperIds(paper: Paper, versionDois: string[] = []): string[] {
  return uniq([
    ...(paper.pmid ? [`pmid:${paper.pmid}`] : []),
    ...(paper.doi ? [`doi:${paper.doi}`] : []),
    ...(paper.trialIds ?? []).map((id) => `trial:${id}`),
    ...(paper.versionPmids ?? []).map((id) => `pmid:${id}`),
    ...versionDois.map((d) => `doi:${d}`),
  ]);
}

export const estadoDoPaper = (paper: Paper): Estado => (isPreprint(paper) ? "preprint" : "artigo-revisado");

/** "Lee J" → "lee": the first author's surname without accents, to compare. */
export function surname(authors: string[]): string | null {
  const first = authors[0]?.split(" ")[0];
  return first ? first.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase() : null;
}

const words = (title: string) => new Set(title.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3));

/** Shared words over all words of two titles (0 to 1). */
export function titleSimilarity(a: string, b: string): number {
  const x = words(a);
  const y = words(b);
  if (x.size < 4 || y.size < 4) return 0;
  const shared = [...x].filter((w) => y.has(w)).length;
  return shared / (x.size + y.size - shared);
}

/** A version of the study the site already published, or another publication of its trial, as the writer is told about it. */
export interface Anterior {
  articleId: string;
  title: string;
  estado: Estado | null;
  /** When the site published it, YYYY-MM-DD. */
  data: string;
  /** Another paper of the same trial (sharing only its registration), not a version of this one. */
  mesmoEnsaio: boolean;
}

/** A paper's study as the site knows it before writing: its identifiers and what of it was already published. */
export interface Estudo {
  ids: string[];
  estado: Estado;
  anteriores: Anterior[];
}

/**
 * The study a paper belongs to: its identifiers (Crossref asked for its other versions) and the versions the
 * site already published, by a shared identifier, else a preprint and an article of the same first author and
 * nearly the same title, which then share the earlier one's identifier.
 */
export async function estudoDoPaper(paper: Paper): Promise<Estudo> {
  const ids = paperIds(paper, paper.doi ? await crossrefVersions(paper.doi) : []);
  const estado = estadoDoPaper(paper);
  let anteriores = await versionsOf(ids);
  const autor = surname(paper.authors);
  if (!anteriores.some((a) => !a.mesmoEnsaio) && autor) {
    const other: Estado = estado === "preprint" ? "artigo-revisado" : "preprint";
    const candidates = await sql<{ article_id: string; ids: string[]; titulo: string }[]>`
      SELECT article_id, ids, titulo FROM literatura_estudos WHERE estado = ${other} AND autor = ${autor} AND titulo IS NOT NULL AND created_at > now() - interval '3 years'`;
    const key = candidates.filter((c) => titleSimilarity(c.titulo, paper.title) >= SAME_TITLE).map((c) => c.ids.find((id) => !isTrialKey(id))).find(Boolean);
    if (key) {
      ids.push(key);
      anteriores = await versionsOf(ids);
    }
  }
  return { ids, estado, anteriores };
}

/**
 * The published articles that share one of a paper's identifiers, oldest first: a version when they share one
 * besides a trial registration or are the trial's registry entry, else another paper of the same trial.
 */
async function versionsOf(ids: string[]): Promise<Anterior[]> {
  if (!ids.length) return [];
  const own = ids.filter((id) => !isTrialKey(id));
  const rows = await sql<{ article_id: string; title: string; estado: Estado | null; at: Date; versao: boolean }[]>`
    SELECT e.article_id, p.title, e.estado, p.timeline_at AS at, (e.ids && ${own}::text[] OR coalesce(e.estado = ANY(${REGISTROS}::text[]), false)) AS versao
    FROM literatura_estudos e JOIN publications p ON p.article_id = e.article_id AND p.visibility <> 'withdrawn'
    WHERE e.ids && ${ids}::text[] ORDER BY p.timeline_at, e.article_id`;
  return rows.map((r) => ({ articleId: r.article_id, title: r.title, estado: r.estado, data: beijingDate(r.at), mesmoEnsaio: !r.versao }));
}

/**
 * Records a written paper's study with its article, in its transaction; the pages of the earlier versions and
 * publications of its trial change, as they now list this one.
 */
export async function saveEstudo(tx: Db, articleId: string, paper: Paper, estudo: Estudo): Promise<void> {
  await tx`INSERT INTO literatura_estudos (article_id, ids, estado, titulo, autor) VALUES (${articleId}, ${estudo.ids}, ${estudo.estado}, ${paper.title}, ${surname(paper.authors)})
    ON CONFLICT (article_id) DO UPDATE SET ids = EXCLUDED.ids, estado = EXCLUDED.estado, titulo = EXCLUDED.titulo, autor = EXCLUDED.autor`;
  for (const a of estudo.anteriores) {
    if (a.articleId !== articleId) await emit("articleChanged", { id: a.articleId, kind: "detail", reason: "new version of the study" }, tx);
  }
}

/** A registry page the site wrote up (apurar.ts takePage): registered, under the trials its address names. */
export async function saveRegistroPage(tx: Db, articleId: string, url: string): Promise<void> {
  const ids = trialIdsIn(url).map((id) => `trial:${id}`);
  await tx`INSERT INTO literatura_estudos (article_id, ids, estado) VALUES (${articleId}, ${ids}, 'registrado')
    ON CONFLICT (article_id) DO UPDATE SET ids = EXCLUDED.ids, estado = EXCLUDED.estado`;
}

/** ClinicalTrials.gov's overall status and whether results were posted, as the site's stage. */
export function estadoDoRegistro(status: string | undefined, hasResults: boolean | undefined): Estado {
  if (hasResults) return "resultados-depositados";
  return status === "RECRUITING" || status === "ENROLLING_BY_INVITATION" ? "recrutando" : "registrado";
}

/** Up to 100 NCT numbers asked of ClinicalTrials.gov at once: their stage by number. */
async function ctgovStages(ncts: string[]): Promise<Map<string, Estado>> {
  const params = new URLSearchParams({ "filter.ids": ncts.join(","), fields: "NCTId,OverallStatus,HasResults", pageSize: "100" });
  const res = await guardedFetch(`${CTGOV()}/studies?${params}`, { timeoutMs: 30_000 });
  if (res.status !== 200) throw new Error(`ClinicalTrials.gov HTTP ${res.status}`);
  const data = JSON.parse(res.text()) as { studies?: Array<{ protocolSection?: { identificationModule?: { nctId?: string }; statusModule?: { overallStatus?: string } }; hasResults?: boolean }> };
  const out = new Map<string, Estado>();
  for (const s of data.studies ?? []) {
    const nct = s.protocolSection?.identificationModule?.nctId;
    if (nct) out.set(nct.toUpperCase(), estadoDoRegistro(s.protocolSection?.statusModule?.overallStatus, s.hasResults));
  }
  return out;
}

/**
 * The registry entries of the last months not checked today: their trial numbers (from their address, else
 * their title) and their stage, ClinicalTrials.gov's for an NCT number, else registered. An entry whose stage
 * changed is published again (its title's label) and, when new, the other versions' pages list it.
 */
export async function syncRegistros(): Promise<Record<string, unknown>> {
  const rows = await sql<{ id: string; url: string; title: string; estado: Estado | null; known: boolean; published: boolean }[]>`
    SELECT a.id, a.url, a.title, e.estado, e.article_id IS NOT NULL AS known, EXISTS (SELECT 1 FROM publications p WHERE p.article_id = a.id) AS published
    FROM articles a JOIN sources s ON s.id = a.source_id LEFT JOIN literatura_estudos e ON e.article_id = a.id
    WHERE (${REGISTRO_TAG} = ANY(s.tags) OR e.estado = ANY(${REGISTROS}::text[]))
      AND a.discovered_at > now() - make_interval(days => ${REGISTRO_DAYS})
      AND (e.checked_at IS NULL OR e.checked_at < now() - interval '20 hours')
    ORDER BY a.discovered_at DESC LIMIT 1000`;
  const trials = new Map(rows.map((r) => [r.id, trialIdsIn(r.url).length ? trialIdsIn(r.url) : trialIdsIn(r.title)]));
  const ncts = uniq([...trials.values()].flat().filter((id) => /^NCT/i.test(id)));
  const stages = new Map<string, Estado>();
  for (let i = 0; i < ncts.length; i += 100) for (const [k, v] of await ctgovStages(ncts.slice(i, i + 100))) stages.set(k, v);
  const counts: Record<string, number> = { checked: rows.length, changed: 0 };
  for (const r of rows) {
    const ids = trials.get(r.id)!;
    const estado = ids.map((id) => stages.get(id)).find(Boolean) ?? r.estado ?? "registrado";
    const keys = ids.map((id) => `trial:${id}`);
    await sql.begin(async (tx) => {
      await tx`INSERT INTO literatura_estudos (article_id, ids, estado, checked_at) VALUES (${r.id}, ${keys}, ${estado}, now())
        ON CONFLICT (article_id) DO UPDATE SET ids = EXCLUDED.ids, estado = EXCLUDED.estado, checked_at = now()`;
      if (!r.known && keys.length) {
        const linked = await tx<{ article_id: string }[]>`SELECT article_id FROM literatura_estudos WHERE ids && ${keys}::text[] AND article_id <> ${r.id}`;
        for (const l of linked) await emit("articleChanged", { id: l.article_id, kind: "detail", reason: "registry entry of the study" }, tx);
      }
    });
    // A new entry is published as registered (titleLabel's default for its source); a change of stage relabels it.
    if (r.published && estado !== (r.estado ?? "registrado")) {
      await publishArticle(r.id);
      counts.changed!++;
    }
    counts[estado] = (counts[estado] ?? 0) + 1;
  }
  return counts;
}

/**
 * Where each of these articles' studies stands, its other published versions and the other published papers of
 * its trial, oldest first.
 */
export async function estudosOf(ids: readonly string[]): Promise<Map<string, { estado: Estado | null; versoes: Versao[]; mesmoEnsaio: Versao[] }>> {
  const out = new Map<string, { estado: Estado | null; versoes: Versao[]; mesmoEnsaio: Versao[] }>();
  const list = [...ids];
  const own = await sql<{ id: string; estado: Estado | null; registro: boolean }[]>`
    SELECT a.id, e.estado, ${REGISTRO_TAG} = ANY(s.tags) AS registro FROM articles a JOIN sources s ON s.id = a.source_id
    LEFT JOIN literatura_estudos e ON e.article_id = a.id
    WHERE a.id = ANY(${list}) AND (e.article_id IS NOT NULL OR ${REGISTRO_TAG} = ANY(s.tags))`;
  for (const r of own) out.set(r.id, { estado: r.estado ?? (r.registro ? "registrado" : null), versoes: [], mesmoEnsaio: [] });
  const versions = await sql<{ of: string; id: string; title: string; estado: Estado | null; at: Date; versao: boolean }[]>`
    SELECT e.article_id AS of, o.article_id AS id, p.title, o.estado, p.timeline_at AS at,
      (coalesce(e.estado = ANY(${REGISTROS}::text[]) OR o.estado = ANY(${REGISTROS}::text[]), false)
        OR EXISTS (SELECT 1 FROM unnest(e.ids) k WHERE k NOT LIKE 'trial:%' AND k = ANY(o.ids))) AS versao
    FROM literatura_estudos e
    JOIN literatura_estudos o ON o.ids && e.ids AND o.article_id <> e.article_id
    JOIN publications p ON p.article_id = o.article_id AND p.visibility <> 'withdrawn'
    WHERE e.article_id = ANY(${list}) ORDER BY p.timeline_at, o.article_id`;
  for (const v of versions) {
    const e = out.get(v.of);
    if (e) (v.versao ? e.versoes : e.mesmoEnsaio).push({ id: v.id, title: v.title, estado: v.estado, data: beijingDate(v.at) });
  }
  return out;
}
