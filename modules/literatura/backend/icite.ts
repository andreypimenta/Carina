// NIH iCite: how many times each PubMed record has been cited by others in PubMed, by PMID. Free and public,
// with no key; a few hundred PMIDs fit in one request (more is refused as too large), so they go in batches.
import { guardedFetch } from "@aihot/backend/lib/http-fetch";

const BASE = () => (process.env.ICITE_BASE_URL ?? "https://icite.od.nih.gov/api").replace(/\/$/, "");
const BATCH = 300;

export interface Influence {
  /** The year iCite gives the record. */
  year: number | null;
  citations: number;
}

/** The influence of the records iCite knows (the newest records may not be there yet). */
export async function influence(pmids: string[]): Promise<Map<string, Influence>> {
  const out = new Map<string, Influence>();
  for (let i = 0; i < pmids.length; i += BATCH) {
    const params = new URLSearchParams({ pmids: pmids.slice(i, i + BATCH).join(","), fl: "pmid,year,citation_count" });
    const res = await guardedFetch(`${BASE()}/pubs?${params}`, { timeoutMs: 30_000 });
    if (res.status !== 200) throw new Error(`iCite HTTP ${res.status}`);
    const data = JSON.parse(res.text()) as { data?: Array<{ pmid?: number | string; year?: number | null; citation_count?: number | null }> };
    for (const r of data.data ?? []) {
      if (r.pmid === undefined) continue;
      out.set(String(r.pmid), { year: typeof r.year === "number" ? r.year : null, citations: r.citation_count ?? 0 });
    }
  }
  return out;
}
