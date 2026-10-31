// The leads (industry/pistas.json): the news of children's hospitals, read only to find the papers they are
// about. A post never enters the site itself. The run opens each new post once, takes the DOIs and PubMed links
// in it, and the papers PubMed has that are recent and on the site's subjects (the watched journals' filter)
// join the run like any paper (collect.ts); a post that names none is let go.
import { readFileSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "@aihot/backend/config";
import { guardedFetch } from "@aihot/backend/lib/http-fetch";
import { admitListing } from "@aihot/backend/sources/filters";
import { fetchRss } from "@aihot/backend/sources/rss";
import type { SourceRow } from "@aihot/backend/sources/types";
import { fetchWebList } from "@aihot/backend/sources/web-list";
import { fetchPapers, pmidsForDoi } from "./pubmed.ts";
import { onSubject, type Revistas } from "./revistas.ts";

/** A lead page: its listing read like a source of that kind (the config keys of docs/sources.md). */
export interface Pista {
  id: string;
  name: string;
  kind: "rss" | "web_list";
  config: Record<string, unknown>;
}

export function pistas(): Pista[] {
  return (JSON.parse(readFileSync(path.join(REPO_ROOT, "industry/pistas.json"), "utf8")) as { paginas: Pista[] }).paginas;
}

/** A post names the paper it is about among others (the older work it cites, the hospital's other news): it is looked up only if it entered PubMed within this many days before the post. */
export const PAPER_DAYS = 365;
/** References looked up per post: a page that names more is a list of references, not news of one paper. */
export const MAX_REFS = 10;

export interface Post {
  /** Its row in literatura_papers once it is done with. */
  key: string;
  url: string;
  date: Date;
}

/** A lead page's posts since `since`, kept as the engine keeps a source's listing; a post with no date is not news (an old page linked from the list). */
export async function readPosts(pista: Pista, since: Date): Promise<Post[]> {
  const row = { id: pista.id, name: pista.name, kind: pista.kind, config: pista.config, tier: "T2", participation_mode: "editorial", first_party: false, interval_minutes: 360, enabled: true, cursor: null, fail_count: 0 } satisfies SourceRow;
  const listed = pista.kind === "rss" ? (await fetchRss(row, { force: true })).candidates : await fetchWebList(row);
  return admitListing(listed, row)
    .flatMap((c) => (c.publishedAt && c.publishedAt >= since ? [{ key: `pista:${c.url}`, url: c.url, date: c.publishedAt }] : []));
}

const DOI = /\b10\.\d{4,9}\/[^\s"'<>?#&]+/g;
const DOI_TAIL = /\/(?:full|abstract|pdf|epdf|fulltext|meta)\/?$/i;

/** A DOI as a page writes it, without what its link adds after it (a trailing stop, a closing bracket the DOI did not open, /full). */
function cleanDoi(raw: string): string {
  let doi = raw.replace(/[.,;:]+$/, "").replace(DOI_TAIL, "");
  while (doi.endsWith(")") && (doi.match(/\(/g)?.length ?? 0) < (doi.match(/\)/g)?.length ?? 0)) doi = doi.slice(0, -1);
  return doi.replace(/[.,;:]+$/, "").toLowerCase();
}

/** The DOIs and PubMed IDs a page names, in the order it names them. */
export function referencesIn(html: string): { dois: string[]; pmids: string[] } {
  const text = html.replace(/%2F/gi, "/").replace(/%3F/gi, "?").replace(/%23/g, "#").replace(/&amp;/g, "&");
  const dois = [...new Set([...text.matchAll(DOI)].map((m) => cleanDoi(m[0])))];
  const pmids = [...new Set([...text.matchAll(/(?:pubmed\.ncbi\.nlm\.nih\.gov\/|ncbi\.nlm\.nih\.gov\/pubmed\/)(\d{1,9})\b/g)].map((m) => m[1]!))];
  return { dois, pmids };
}

/** The PMIDs of a DOI; a DOI a link carried more path after (10.1182/blood.123/568832/Title) is tried without it. */
async function pmidsOf(doi: string): Promise<string[]> {
  const found = await pmidsForDoi(doi);
  const short = doi.split("/").slice(0, 2).join("/");
  return found.length || short === doi ? found : pmidsForDoi(short);
}

/** A post's page: the PMIDs of the papers it names that are recent and on the site's subjects. */
export async function papersOfPost(post: Post, cfg: Revistas): Promise<string[]> {
  const res = await guardedFetch(post.url, { timeoutMs: 30_000, maxBytes: 8 * 1024 * 1024 });
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  const refs = referencesIn(res.text());
  const pmids = new Set(refs.pmids.slice(0, MAX_REFS));
  for (const doi of refs.dois.slice(0, Math.max(0, MAX_REFS - pmids.size))) for (const id of await pmidsOf(doi)) pmids.add(id);
  if (!pmids.size) return [];
  const from = new Date(post.date.getTime() - PAPER_DAYS * 86_400_000).toISOString().slice(0, 10);
  return (await fetchPapers([...pmids]))
    .filter((p) => p.enteredOn && p.enteredOn >= from && onSubject(cfg, `${p.title} ${p.abstract.map((a) => a.text).join(" ")}`))
    .map((p) => p.pmid);
}
