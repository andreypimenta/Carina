// The watched journals (industry/revistas.json): the thoracic surgery, pediatric, airway and respiratory journals
// the owner listed, read for the site's subjects only (a child or newborn, and the airway, the lungs or the chest). Each journal is searched in
// PubMed by its NLM abbreviation; a journal with an open table of contents (its publisher's feed, or the
// Crossref listing of its ISSN) is also read there, so a paper enters before PubMed has it and a journal PubMed
// does not index still enters. A paper from a table of contents is written up like a PubMed paper (collect.ts):
// from its PubMed record when PubMed already has its DOI, else from what the table of contents says, and once
// PubMed has it too, the PubMed record joins the same article by DOI.
import { readFileSync } from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";
import { REPO_ROOT } from "@aihot/backend/config";
import { guardedFetch } from "@aihot/backend/lib/http-fetch";
import { beijingDate } from "@aihot/contracts/time";
import type { Paper } from "./pubmed.ts";

export interface Revista {
  id: string;
  /** The journal's name, shown as the source of its papers that PubMed does not have yet. */
  name: string;
  /** NLM title abbreviation, for the PubMed search by [ta]; absent when PubMed does not index the journal. */
  nlm?: string;
  /** The open table of contents: the publisher's RSS or Atom feed, or the Crossref listing of an ISSN. */
  sumario?: { rss: string } | { crossref: string };
}

export interface Revistas {
  /**
   * What a paper must be about: a word of each list in its title or abstract. `*` ends a word stem
   * (child* is child, children, childhood); words with a space are phrases.
   */
  filtro: { idade: string[]; tema: string[] };
  revistas: Revista[];
}

export function revistas(): Revistas {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "industry/revistas.json"), "utf8")) as Revistas;
}

const tiab = (words: string[]) => `(${words.map((w) => (w.includes(" ") ? `"${w}"[tiab]` : `${w}[tiab]`)).join(" OR ")})`;

/** The PubMed search of every indexed journal, with the subject filter; null when no journal is indexed. */
export function pubmedTerm(cfg: Revistas): string | null {
  const journals = cfg.revistas.flatMap((r) => (r.nlm ? [`"${r.nlm}"[ta]`] : []));
  if (!journals.length) return null;
  return `((${journals.join(" OR ")}) AND ${tiab(cfg.filtro.idade)} AND ${tiab(cfg.filtro.tema)}) NOT "Published Erratum"[pt]`;
}

const pattern = (words: string[]) =>
  new RegExp(`\\b(?:${words.map((w) => w.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*$/, "\\w*").replace(/ /g, "[\\s-]+")).join("|")})\\b`, "i");

/** Whether a title and abstract meet the subject filter, as the PubMed search reads it. */
export function onSubject(cfg: Revistas, text: string): boolean {
  return pattern(cfg.filtro.idade).test(text) && pattern(cfg.filtro.tema).test(text);
}

export interface SumarioItem {
  doi: string | null;
  url: string;
  title: string;
  abstract: string;
  authors: string[];
  date: Date | null;
}

const DOI = /\b(10\.\d{4,9}\/[^\s"'<>?#&]+)/;
const decoded = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };
const plain = (html: string) => cheerio.load(`<div>${html}</div>`, null, false).root().text().replace(/\s+/g, " ").trim();
const dated = (s: string | undefined) => {
  const d = s ? new Date(s.trim()) : null;
  return d && Number.isFinite(d.getTime()) ? d : null;
};

/** The items of an RSS or Atom table of contents; the DOI from prism:doi, dc:identifier or the link. */
export function parseFeed(xml: string): SumarioItem[] {
  const $ = cheerio.load(xml, { xml: true });
  return $("item, entry").toArray().map((node) => {
    const el = $(node);
    const first = (...names: string[]) => names.map((n) => el.children(n.replace(":", "\\:")).first().text().trim()).find(Boolean) ?? "";
    const link = first("link") || el.children("link").first().attr("href") || "";
    const doi = [first("prism:doi"), first("dc:identifier"), link, first("guid", "id")].map((s) => DOI.exec(decoded(s))?.[1]).find(Boolean) ?? null;
    return {
      doi: doi ? doi.replace(/[.,;]$/, "").toLowerCase() : null,
      url: link,
      title: plain(first("title")),
      abstract: plain(first("content:encoded", "description", "summary", "content")),
      authors: el.children("dc\\:creator, author").toArray().map((a) => plain($(a).children("name").text() || $(a).text())).filter(Boolean),
      date: dated(first("prism:coverDate", "dc:date", "pubDate", "published", "updated", "prism:publicationDate")),
    };
  });
}

interface CrossrefWork { DOI?: string; title?: string[]; abstract?: string; author?: Array<{ given?: string; family?: string; name?: string }>; created?: { "date-time"?: string } }

/** The items of a Crossref works listing; the abstract, when the publisher deposited one, is JATS. */
export function parseCrossref(json: string): SumarioItem[] {
  const items = (JSON.parse(json) as { message?: { items?: CrossrefWork[] } }).message?.items ?? [];
  return items.map((w) => ({
    doi: w.DOI ? w.DOI.toLowerCase() : null,
    url: w.DOI ? `https://doi.org/${w.DOI}` : "",
    title: plain(w.title?.[0] ?? ""),
    abstract: plain((w.abstract ?? "").replace(/<jats:title>[^<]*<\/jats:title>/g, "")),
    authors: (w.author ?? []).map((a) => a.family ? `${a.family}${a.given ? ` ${a.given.split(/[\s-]+/).map((g) => g[0]).join("")}` : ""}` : a.name ?? "").filter(Boolean),
    date: dated(w.created?.["date-time"]),
  }));
}

const CROSSREF = () => (process.env.CROSSREF_BASE_URL ?? "https://api.crossref.org").replace(/\/$/, "");

/** Crossref answers 429 to reads in quick succession from one address: one listing a second. */
let nextCrossref = 0;
async function crossrefTurn() {
  const wait = nextCrossref - Date.now();
  nextCrossref = Math.max(Date.now(), nextCrossref) + 1000;
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
}

/** A journal's table of contents: the items listed since `since`; an RSS item with no date is kept. */
export async function readSumario(revista: Revista, since: Date): Promise<SumarioItem[]> {
  const sumario = revista.sumario;
  if (!sumario) return [];
  let items: SumarioItem[];
  if ("rss" in sumario) {
    const res = await guardedFetch(sumario.rss, { timeoutMs: 30_000, maxBytes: 16 * 1024 * 1024 });
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    items = parseFeed(res.text());
  } else {
    const params = new URLSearchParams({
      filter: `issn:${sumario.crossref},type:journal-article,from-created-date:${since.toISOString().slice(0, 10)}`,
      sort: "created", order: "desc", rows: "200", select: "DOI,title,abstract,author,created",
    });
    if (process.env.LITERATURA_EMAIL) params.set("mailto", process.env.LITERATURA_EMAIL);
    await crossrefTurn();
    const res = await guardedFetch(`${CROSSREF()}/works?${params}`, { timeoutMs: 30_000, maxBytes: 16 * 1024 * 1024 });
    if (res.status !== 200) throw new Error(`Crossref HTTP ${res.status}`);
    items = parseCrossref(res.text());
  }
  return items.filter((i) => i.title && (!i.date || i.date >= since));
}

const ERRATUM = /^(?:erratum|corrigendum|correction|retraction|retracted|expression of concern)\b/i;

/** A table-of-contents item as a paper, for a journal PubMed does not have it from yet. */
export function paperFromItem(revista: Revista, item: SumarioItem): Paper {
  return {
    pmid: null, doi: item.doi, url: item.url, pmcid: null, title: item.title.replace(/\.$/, ""),
    abstract: item.abstract ? [{ label: null, text: item.abstract }] : [],
    journal: revista.name, journalAbbrev: revista.nlm ?? null, year: item.date ? String(item.date.getUTCFullYear()) : null,
    authors: item.authors, publicationTypes: ERRATUM.test(item.title) ? ["Published Erratum"] : [], languages: [],
    enteredOn: item.date ? beijingDate(item.date) : null,
  };
}
