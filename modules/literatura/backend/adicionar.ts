// A paper the editor adds by PMID or DOI, outside the saved searches (one older than their window, or one they
// miss). It takes the path of a paper they find (takePaper: the full text when its licence allows it, else the
// site's own article, paid through a receipt within the budget), once per PMID: one already in
// literatura_papers is not taken again. Like every paper of the module it enters as news, its timeline at the
// moment it is added, so the next daily and the weekly edition can carry it. Selecting it (Seleção = sim) is the
// admin's manual correction, with its audit. The admin asks for it and the worker does it (ADICIONAR_QUEUE), so
// the model is only called in the worker; scripts/literatura-adicionar.ts does it at once, from the worker.
import { z } from "zod";
import { audit } from "@aihot/backend/audit";
import { overrideFields } from "@aihot/backend/admin/content";
import { sql } from "@aihot/backend/db";
import { enqueueOn } from "@aihot/backend/jobs/queue";
import { logError } from "@aihot/backend/lib/log-error";
import { defineQueue } from "@aihot/backend/modules";
import type { Adicionado, AdicionarPedido } from "../adicionar.ts";
import { enabledSources, takePaper } from "./collect.ts";
import { fetchPapers, pmidsForDoi, type Paper } from "./pubmed.ts";

const AUDIT_ACTION = "literatura.adicionar";

/** The audit's reason when the editor gives none. */
export const defaultReason = (pmid: string) => `artigo acrescentado pelo editor (PMID ${pmid})`;

const invalid = (message: string) => Object.assign(new Error(message), { statusCode: 400 });

/** "42215001", "PMID: 42215001", "10.1016/…", "doi:10.1016/…" or "https://doi.org/10.1016/…". */
export function parseId(input: string): { pmid: string } | { doi: string } | null {
  const s = input.trim();
  const pmid = s.match(/^(?:pmid:?\s*)?(\d{1,9})$/i)?.[1];
  if (pmid) return { pmid };
  const doi = s.replace(/^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)/i, "");
  return /^10\.\d{4,9}\/\S+$/.test(doi) ? { doi: decodeURIComponent(doi).toLowerCase() } : null;
}

/** The PubMed record of a PMID or a DOI. */
export async function findPaper(input: string): Promise<Paper> {
  const id = parseId(input);
  if (!id) throw invalid("Informe um PMID (só números) ou um DOI (10.xxxx/…)");
  if ("pmid" in id) {
    const paper = (await fetchPapers([id.pmid])).find((p) => p.pmid === id.pmid);
    if (!paper) throw invalid(`O PMID ${id.pmid} não está no PubMed`);
    return paper;
  }
  const paper = (await fetchPapers(await pmidsForDoi(id.doi))).find((p) => p.doi === id.doi);
  if (!paper) throw invalid(`O DOI ${id.doi} não está no PubMed`);
  return paper;
}

/** The paper's earlier outcome; one that failed ('erro') is taken again, as the run does. */
export async function earlier(pmid: string): Promise<{ status: string; articleId: string | null } | null> {
  const [row] = await sql<{ status: string; article_id: string | null }[]>`SELECT status, article_id FROM literatura_papers WHERE pmid = ${pmid}`;
  return row && row.status !== "erro" ? { status: row.status, articleId: row.article_id } : null;
}

/** Seleção = sim, as the admin's manual correction does it. */
async function select(articleId: string, reason: string, actor: string) {
  const [o] = await sql<{ version: number }[]>`SELECT version FROM editorial_overrides WHERE article_id = ${articleId}`;
  await overrideFields(articleId, { fields: { selected: true }, reason, version: o?.version ?? 0 }, actor);
}

/** Takes the paper (unless taken before) and, asked to, selects its article; the outcome is audited. */
export async function addPaper(paper: Paper, opts: { select: boolean; reason: string; actor: string; now?: Date }): Promise<Omit<Adicionado, "at" | "actor">> {
  const before = await earlier(paper.pmid);
  const out = before ?? (await takePaper(paper, opts.now ?? new Date(), await enabledSources()));
  const articleId = out.articleId ?? null;
  if (opts.select && articleId) await select(articleId, opts.reason, opts.actor);
  const result = { pmid: paper.pmid, title: paper.title, status: out.status, articleId, existing: !!before, selected: opts.select && !!articleId, error: null };
  await audit(opts.actor, AUDIT_ACTION, `pmid:${paper.pmid}`, opts.reason, null, result);
  return result;
}

type Pedido = { pmid: string; select: boolean; reason: string; actor: string };

export const ADICIONAR_QUEUE = defineQueue<Pedido>({
  name: "literatura.adicionar",
  // No retry: a failure is audited for the editor, who asks again.
  options: { policy: "standard", retryLimit: 0, expireInSeconds: 900 },
  worker: { batchSize: 1 },
  run: async ([job]) => {
    if (!job) return null;
    try {
      const paper = (await fetchPapers([job.pmid])).find((p) => p.pmid === job.pmid);
      if (!paper) throw new Error(`O PMID ${job.pmid} não está no PubMed`);
      return await addPaper(paper, job);
    } catch (error) {
      console.error(JSON.stringify({ level: "warn", msg: "literatura addition failed", pmid: job.pmid, error: logError(error) }));
      const failed = { pmid: job.pmid, title: "", status: "falhou", articleId: null, existing: false, selected: false, error: (error as Error).message.slice(0, 300) };
      await audit(job.actor, AUDIT_ACTION, `pmid:${job.pmid}`, job.reason, null, failed);
      return failed;
    }
  },
});

const Request = z.object({ id: z.string().trim().min(1).max(300), select: z.boolean().default(false), reason: z.string().trim().max(500).optional() });

/** The admin's request: the paper found now, and taken by the worker unless it was taken before. */
export async function requestAdd(input: unknown, actor: string): Promise<AdicionarPedido> {
  const b = Request.parse(input);
  const paper = await findPaper(b.id);
  const existing = await earlier(paper.pmid);
  // A paper taken before is still selected when asked; that is quick and calls no model.
  if (existing) {
    if (b.select) await addPaper(paper, { select: true, reason: b.reason || defaultReason(paper.pmid), actor });
    return { pmid: paper.pmid, title: paper.title, existing, queued: false };
  }
  await enqueueOn(ADICIONAR_QUEUE, { pmid: paper.pmid, select: b.select, reason: b.reason || defaultReason(paper.pmid), actor }, { singletonKey: `literatura.adicionar:${paper.pmid}` });
  return { pmid: paper.pmid, title: paper.title, existing: null, queued: true };
}

/** The latest additions, newest first. */
export async function listAdded(limit = 30): Promise<Adicionado[]> {
  const rows = await sql<{ created_at: Date; actor: string; after: Omit<Adicionado, "at" | "actor"> }[]>`
    SELECT created_at, actor, after FROM audit_log WHERE action = ${AUDIT_ACTION} ORDER BY created_at DESC LIMIT ${limit}`;
  return rows.map((r) => ({ ...r.after, at: r.created_at.toISOString(), actor: r.actor }));
}
