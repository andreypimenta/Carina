// PubMed through NCBI E-utilities: the saved searches (industry/literatura.json) by the date each record
// entered PubMed, and the records themselves (efetch XML). Free and public; NCBI asks for a tool name and a
// contact address, and allows 3 requests a second (10 with NCBI_API_KEY), so calls go one at a time.
import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";
import { guardedFetch } from "@aihot/backend/lib/http-fetch";

export interface Paper {
  pmid: string;
  doi: string | null;
  pmcid: string | null;
  title: string;
  /** The abstract as labelled sections ("Background", "Methods"…); one unlabelled section when it has none. */
  abstract: Array<{ label: string | null; text: string }>;
  journal: string;
  journalAbbrev: string | null;
  year: string | null;
  authors: string[];
  publicationTypes: string[];
  languages: string[];
  /** The day the record entered PubMed (PubStatus "entrez"), YYYY-MM-DD. */
  enteredOn: string | null;
}

const BASE = () => (process.env.PUBMED_BASE_URL ?? "https://eutils.ncbi.nlm.nih.gov/entrez/eutils").replace(/\/$/, "");

/** NCBI allows 3 requests a second, 10 with an API key: every call waits its turn. */
let nextCall = 0;
async function turn() {
  const gap = process.env.NCBI_API_KEY ? 110 : 350;
  const wait = nextCall - Date.now();
  nextCall = Math.max(Date.now(), nextCall) + gap;
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
}

function common(): string {
  const params = new URLSearchParams({ tool: "folego" });
  if (process.env.LITERATURA_EMAIL) params.set("email", process.env.LITERATURA_EMAIL);
  if (process.env.NCBI_API_KEY) params.set("api_key", process.env.NCBI_API_KEY);
  return params.toString();
}

/** One esearch: the PMIDs it returns and how many records the search finds in all. */
async function esearch(params: Record<string, string>): Promise<{ count: number; pmids: string[] }> {
  const query = new URLSearchParams({ db: "pubmed", retmode: "json", ...params });
  await turn();
  const res = await guardedFetch(`${BASE()}/esearch.fcgi?${query}&${common()}`, { timeoutMs: 30_000 });
  if (res.status !== 200) throw new Error(`PubMed esearch HTTP ${res.status}`);
  const data = JSON.parse(res.text()) as { esearchresult?: { count?: string; idlist?: string[]; ERROR?: string } };
  if (data.esearchresult?.ERROR) throw new Error(`PubMed esearch: ${data.esearchresult.ERROR}`);
  return { count: Number(data.esearchresult?.count ?? 0) || 0, pmids: (data.esearchresult?.idlist ?? []).filter((id) => /^\d+$/.test(id)) };
}

/** PMIDs a search found among the records that entered PubMed in the last `days` days. */
export async function searchPmids(term: string, days: number, max = 500): Promise<string[]> {
  return (await esearch({ term, datetype: "edat", reldate: String(days), retmax: String(max), sort: "pub_date" })).pmids;
}

/**
 * Up to `max` PMIDs of a search over all of PubMed from position `start`, best match first ("relevance") or
 * newest first ("pub_date"), with how many records it finds in all.
 */
export async function searchAll(term: string, sort: "relevance" | "pub_date", max: number, start = 0): Promise<{ count: number; pmids: string[] }> {
  return esearch({ term, sort, retmax: String(max), retstart: String(start) });
}

/** PMIDs of the records carrying a DOI (PubMed's article identifier field). */
export async function pmidsForDoi(doi: string): Promise<string[]> {
  return (await esearch({ term: `"${doi.replace(/"/g, "")}"[aid]`, retmax: "5" })).pmids;
}

/** PMIDs of the records whose title is exactly this phrase (at most a few). */
export async function pmidsForTitle(title: string): Promise<string[]> {
  return (await esearch({ term: `"${title.replace(/["\[\]]/g, " ").replace(/\s+/g, " ").trim()}"[ti]`, retmax: "3" })).pmids;
}

/** The records of up to 200 PMIDs. */
export async function fetchPapers(pmids: string[]): Promise<Paper[]> {
  if (!pmids.length) return [];
  const params = new URLSearchParams({ db: "pubmed", id: pmids.join(","), retmode: "xml" });
  await turn();
  const res = await guardedFetch(`${BASE()}/efetch.fcgi?${params}&${common()}`, { timeoutMs: 60_000, maxBytes: 32 * 1024 * 1024 });
  if (res.status !== 200) throw new Error(`PubMed efetch HTTP ${res.status}`);
  return parsePubmedXml(res.text());
}

/**
 * Text of an element with its inline markup flattened and whitespace collapsed. Superscripts keep a caret
 * (10^9/L, p<10^-3) so exponents never merge into the number before them; formulas keep one rendering.
 */
function plain($: cheerio.CheerioAPI, el: cheerio.Cheerio<AnyNode>): string {
  const copy = $(el).clone();
  copy.find("sup").each((_i, sup) => { $(sup).replaceWith(`^${$(sup).text()}`); });
  copy.find("mml\\:math, math").each((_i, m) => { $(m).replaceWith(` ${$(m).text()} `); });
  return copy.text().replace(/\s+/g, " ").trim();
}

const pad = (n: string | undefined) => (n ? n.padStart(2, "0") : "");

export function parsePubmedXml(xml: string): Paper[] {
  const $ = cheerio.load(xml, { xml: true });
  const papers: Paper[] = [];
  $("PubmedArticle").each((_i, node) => {
    const a = $(node);
    const citation = a.children("MedlineCitation");
    const pmid = plain($, citation.children("PMID").first());
    if (!/^\d+$/.test(pmid)) return;
    const article = citation.children("Article");
    const ids = new Map<string, string>();
    a.find("PubmedData > ArticleIdList > ArticleId").each((_j, id) => {
      const type = $(id).attr("IdType");
      if (type && !ids.has(type)) ids.set(type, plain($, $(id)));
    });
    const doi = ids.get("doi") || article.children("ELocationID[EIdType='doi']").first().text().trim() || null;
    const pmc = ids.get("pmc") ?? null;
    const abstract: Paper["abstract"] = [];
    article.find("Abstract > AbstractText").each((_j, t) => {
      const text = plain($, $(t));
      if (text) abstract.push({ label: $(t).attr("Label") ?? null, text });
    });
    const authors: string[] = [];
    article.find("AuthorList > Author").each((_j, au) => {
      const el = $(au);
      const collective = plain($, el.children("CollectiveName"));
      const last = plain($, el.children("LastName"));
      const initials = plain($, el.children("Initials"));
      if (collective) authors.push(collective);
      else if (last) authors.push(initials ? `${last} ${initials}` : last);
    });
    const entrez = a.find("PubmedData > History > PubMedPubDate[PubStatus='entrez']").first();
    const year = entrez.children("Year").text().trim();
    const enteredOn = year ? `${year}-${pad(entrez.children("Month").text().trim())}-${pad(entrez.children("Day").text().trim())}` : null;
    const pubDate = article.find("Journal > JournalIssue > PubDate").first();
    const pubYear = pubDate.children("Year").text().trim() || (pubDate.children("MedlineDate").text().match(/\d{4}/)?.[0] ?? "");
    papers.push({
      pmid,
      doi: doi ? doi.toLowerCase() : null,
      pmcid: pmc && /^PMC\d+$/i.test(pmc) ? pmc.toUpperCase() : null,
      title: plain($, article.children("ArticleTitle")).replace(/\.$/, "") || plain($, article.children("VernacularTitle")),
      abstract,
      journal: plain($, article.find("Journal > Title").first()),
      journalAbbrev: plain($, article.find("Journal > ISOAbbreviation").first()) || null,
      year: pubYear || null,
      authors,
      publicationTypes: article.find("PublicationTypeList > PublicationType").toArray().map((t: Element) => plain($, $(t))),
      languages: article.children("Language").toArray().map((t: Element) => plain($, $(t))),
      enteredOn: /^\d{4}-\d{2}-\d{2}$/.test(enteredOn ?? "") ? enteredOn : null,
    });
  });
  return papers;
}

/** "Silva A, Souza B, Costa C, et al." */
export function authorLine(authors: string[], max = 3): string {
  if (!authors.length) return "";
  return authors.length > max ? `${authors.slice(0, max).join(", ")} et al.` : authors.join(", ");
}

/** Records that are not papers to report on. */
export function skippable(paper: Paper): string | null {
  const types = paper.publicationTypes.map((t) => t.toLowerCase());
  if (types.includes("published erratum")) return "erratum";
  if (!paper.title) return "sem título";
  return null;
}
