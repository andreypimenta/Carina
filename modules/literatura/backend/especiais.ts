// The specials' rules (../especiais.ts). The editor creates one in the admin with a theme and a PubMed search;
// the worker writes it (FORMAT_WRITERS) as a draft. Only a draft is edited or written again; nothing reaches
// the site until the editor approves it and then publishes it, both explicitly in the admin, and an approved
// one sent back to draft needs approving again. Any of them can be discarded, a published one leaving the
// site. Every change is audited. A published special has its page (/especiais/<slug>) and is carried by the
// first weekly issue due after it was published, one per issue (weeklyPart).
import { z } from "zod";
import type { BeforeJson } from "@aihot/contracts/admin";
import { addDays, beijingAt, isoWeekRange } from "@aihot/contracts/time";
import { EDITION_TIMES } from "@aihot/site";
import { audit, auditHistory, Conflict } from "@aihot/backend/audit";
import { sql, type Db } from "@aihot/backend/db";
import { defineQueue, type ReportIssue, type SitemapEntry } from "@aihot/backend/modules";
import { enqueueOn, shutdownSignal } from "@aihot/backend/jobs/queue";
import { logError } from "@aihot/backend/lib/log-error";
import { completeReceipt } from "@aihot/backend/providers/receipts";
import { checkText } from "./citacoes.ts";
import { settings } from "./collect.ts";
import { writeLinha } from "./linha-do-tempo.ts";
import {
  citedIn, FORMATS, isFormat, renumberCitations, type AdminEspecial, type AdminEspeciais, type AdminEspecialRow, type EspecialCard, type EspecialFormat, type EspecialPage,
  type EspecialStatus, type EspecialWriting, type Referencia, type ReferenciaLida, type Trecho,
} from "../especiais.ts";

/** How each format is written: the studies it cites and its text, from the theme and the search. */
const FORMAT_WRITERS: Record<EspecialFormat, (id: number, theme: string, query: string) => Promise<{
  title: string; dek: string; body: string; refs: ReferenciaLida[]; discarded: Trecho[]; receiptId: number;
}>> = {
  "linha-do-tempo": writeLinha,
};

interface Row {
  id: number;
  format: EspecialFormat;
  theme: string;
  query: string;
  status: EspecialStatus;
  writing: EspecialWriting;
  error: string | null;
  title: string | null;
  dek: string | null;
  body: string | null;
  refs: ReferenciaLida[];
  discarded: Trecho[];
  slug: string | null;
  issue_key: string | null;
  created_by: string;
  approved_by: string | null;
  approved_at: Date | null;
  published_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

/** A writing asked of a draft as it was then (its version): one asked earlier leaves a later request alone. */
type Writing = { id: number; version: string };

/** A writing whose every attempt was cut short (a stopped worker, the expiry): the draft is marked failed. */
export const ESPECIAL_FAILED_QUEUE = defineQueue<Writing>({
  name: "literatura.especial-falhou",
  options: { policy: "standard", retryLimit: 3, retryDelay: 60, expireInSeconds: 60 },
  worker: { batchSize: 1 },
  run: async ([job]) => (job ? markUnfinished(job.id, job.version) : null),
});

export const ESPECIAL_QUEUE = defineQueue<Writing>({
  name: "literatura.especial",
  // One retry: a writing cut short by a stopped worker is taken again (the receipt keeps what was paid for).
  options: { policy: "short", retryLimit: 1, retryDelay: 60, expireInSeconds: 900, deadLetter: ESPECIAL_FAILED_QUEUE.name },
  worker: { batchSize: 1 },
  run: async ([job]) => (job ? writeEspecial(job.id, job.version) : null),
});

const versionOf = (row: Pick<Row, "updated_at">) => row.updated_at.toISOString();
const subject = (id: number) => `especial:${id}`;
/** The draft's writing, queued once per version asked. */
const askWriting = (tx: Db, row: Row) => {
  const version = versionOf(row);
  return enqueueOn(ESPECIAL_QUEUE, { id: Number(row.id), version }, { singletonKey: `${subject(row.id)}:${version}` }, tx);
};

/** The row to change, locked, if it is as the editor saw it and in a state that allows the change. */
async function lockFor(tx: Db, id: number, version: string, allowed: EspecialStatus[], action: string): Promise<Row | null> {
  const [row] = await tx<Row[]>`SELECT * FROM literatura_especiais WHERE id = ${id} FOR UPDATE`;
  if (!row) return null;
  if (versionOf(row) !== version) throw new Conflict("Este especial foi alterado; atualize a página e tente de novo");
  if (!allowed.includes(row.status)) throw new Conflict(`Um especial ${row.status === "rascunho" ? "em rascunho" : row.status} não pode ser ${action}`);
  return row;
}

/** What the audit keeps of a row: its state and its text, not its studies. */
const snapshot = (row: Row) => ({ status: row.status, writing: row.writing, theme: row.theme, query: row.query, title: row.title, dek: row.dek, body: row.body, slug: row.slug });

async function save(tx: Db, before: Row, change: Partial<Row>, actor: string, action: string, reason: string | null = null): Promise<Row> {
  const [after] = await tx<Row[]>`UPDATE literatura_especiais SET ${tx(change as Record<string, unknown>)}, updated_at = now() WHERE id = ${before.id} RETURNING *`;
  await audit(actor, `especial.${action}`, subject(before.id), reason, snapshot(before), snapshot(after!), { db: tx });
  return after!;
}

const Request = z.object({ theme: z.string().trim().min(3).max(200), query: z.string().trim().min(3).max(4000) });
/** A step from one state to the next, with the editor's optional note for the audit. */
const Step = z.object({ version: z.string(), reason: z.string().trim().max(500).optional() });

export async function createEspecial(input: unknown, actor: string): Promise<{ id: number }> {
  const b = Request.extend({ format: z.string().refine(isFormat, "formato desconhecido") }).parse(input);
  return sql.begin(async (tx) => {
    const [row] = await tx<Row[]>`INSERT INTO literatura_especiais (format, theme, query, created_by)
      VALUES (${b.format}, ${b.theme}, ${b.query}, ${actor}) RETURNING *`;
    await audit(actor, "especial.create", subject(row!.id), null, null, snapshot(row!), { db: tx });
    await askWriting(tx, row!);
    return { id: row!.id };
  });
}

/**
 * A draft written again from its theme and search, which the editor may have changed; the text it has is
 * replaced. A draft still being written can be asked again too (one whose writing never finished); the
 * writing asked before then leaves it alone.
 */
export async function rewriteEspecial(id: number, input: unknown, actor: string): Promise<{ id: number } | null> {
  const b = Request.extend({ version: z.string() }).parse(input);
  return sql.begin(async (tx) => {
    const row = await lockFor(tx, id, b.version, ["rascunho"], "escrito de novo");
    if (!row) return null;
    await askWriting(tx, await save(tx, row, { theme: b.theme, query: b.query, writing: "pendente", error: null }, actor, "rewrite"));
    return { id };
  });
}

/** The editor's changes to a draft's text. */
export async function editEspecial(id: number, input: unknown, actor: string): Promise<{ id: number } | null> {
  const b = z.object({ version: z.string(), title: z.string().trim().min(3).max(300), dek: z.string().trim().max(600), body: z.string().max(100_000) }).parse(input);
  return sql.begin(async (tx) => {
    const row = await lockFor(tx, id, b.version, ["rascunho"], "editado");
    if (!row) return null;
    if (row.writing === "pendente") throw new Conflict("Este especial ainda está sendo escrito");
    await save(tx, row, { title: b.title, dek: b.dek || null, body: b.body.replace(/\r\n/g, "\n").trim() }, actor, "edit");
    return { id };
  });
}

/** The editor's approval of a written draft: its text is now fixed, and it may be published. */
export async function approveEspecial(id: number, input: unknown, actor: string): Promise<{ id: number } | null> {
  const b = Step.parse(input);
  return sql.begin(async (tx) => {
    const row = await lockFor(tx, id, b.version, ["rascunho"], "aprovado");
    if (!row) return null;
    if (row.writing !== "pronto" || !row.title || !row.body?.trim()) throw new Conflict("Só um rascunho escrito, com título e texto, pode ser aprovado");
    await save(tx, row, { status: "aprovado", approved_by: actor, approved_at: new Date() }, actor, "approve", b.reason || null);
    return { id };
  });
}

/** An approved special back to draft, to be edited and approved again. */
export async function reopenEspecial(id: number, input: unknown, actor: string): Promise<{ id: number } | null> {
  const b = Step.parse(input);
  return sql.begin(async (tx) => {
    const row = await lockFor(tx, id, b.version, ["aprovado"], "devolvido ao rascunho");
    if (!row) return null;
    await save(tx, row, { status: "rascunho", approved_by: null, approved_at: null }, actor, "reopen", b.reason || null);
    return { id };
  });
}

/** "Estenose subglótica: da primeira descrição…" → "estenose-subglotica-da-primeira-descricao". */
const slugify = (title: string) => title.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80).replace(/-+$/, "") || "especial";

/** An approved special on the site, at an address of its own. */
export async function publishEspecial(id: number, input: unknown, actor: string): Promise<{ id: number; slug: string } | null> {
  const b = Step.parse(input);
  return sql.begin(async (tx) => {
    const row = await lockFor(tx, id, b.version, ["aprovado"], "publicado");
    if (!row) return null;
    const base = slugify(row.title!);
    const [taken] = await tx`SELECT 1 FROM literatura_especiais WHERE slug = ${base}`;
    const slug = taken ? `${base}-${id}` : base;
    await save(tx, row, { status: "publicado", slug, published_at: new Date() }, actor, "publish", b.reason || null);
    return { id, slug };
  });
}

/** A special set aside; a published one leaves the site, its page and the weekly issue that carried it. */
export async function discardEspecial(id: number, input: unknown, actor: string): Promise<{ id: number } | null> {
  const b = z.object({ version: z.string(), reason: z.string().trim().min(2).max(500) }).parse(input);
  return sql.begin(async (tx) => {
    const row = await lockFor(tx, id, b.version, ["rascunho", "aprovado", "publicado"], "descartado");
    if (!row) return null;
    await save(tx, row, { status: "descartado" }, actor, "discard", b.reason);
    return { id };
  });
}

/** The worker's writing of a draft; a draft discarded, already written or asked again meanwhile is left as it is. */
export async function writeEspecial(id: number, version: string): Promise<{ id: number; result: string }> {
  const [row] = await sql<Row[]>`SELECT * FROM literatura_especiais
    WHERE id = ${id} AND status = 'rascunho' AND writing = 'pendente' AND date_trunc('milliseconds', updated_at) = ${version}::timestamptz`;
  if (!row) return { id, result: "nada a escrever" };
  try {
    if (process.env.COLLECT_ENABLED !== "true") throw new Error("A coleta está desligada (COLLECT_ENABLED não é true) e o especial não consulta o PubMed sem ela; ligue a coleta e peça de novo");
    const draft = await FORMAT_WRITERS[row.format](id, row.theme, row.query);
    const written = await sql.begin(async (tx) => {
      const [done] = await tx`UPDATE literatura_especiais
        SET title = ${draft.title}, dek = ${draft.dek || null}, body = ${draft.body}, refs = ${tx.json(draft.refs as never)},
          discarded = ${tx.json(draft.discarded as never)}, writing = 'pronto', error = NULL, updated_at = now()
        WHERE id = ${id} AND status = 'rascunho' AND writing = 'pendente' AND date_trunc('milliseconds', updated_at) = ${version}::timestamptz RETURNING id`;
      await completeReceipt(tx, draft.receiptId);
      return !!done;
    });
    return { id, result: written ? "escrito" : "descartado ou pedido de novo enquanto era escrito" };
  } catch (error) {
    if (shutdownSignal.signal.aborted) throw error;
    console.error(JSON.stringify({ level: "warn", msg: "especial writing failed", id, error: logError(error) }));
    await sql`UPDATE literatura_especiais SET writing = 'falhou', error = ${String((error as Error).message ?? error).slice(0, 1000)}, updated_at = now()
      WHERE id = ${id} AND status = 'rascunho' AND writing = 'pendente' AND date_trunc('milliseconds', updated_at) = ${version}::timestamptz`;
    return { id, result: "falhou" };
  }
}

async function markUnfinished(id: number, version: string): Promise<{ id: number; result: string }> {
  const [done] = await sql`UPDATE literatura_especiais
    SET writing = 'falhou', error = 'A escrita foi interrompida e não terminou depois de tentar de novo (o worker parou ou passou do tempo); peça para escrever de novo', updated_at = now()
    WHERE id = ${id} AND status = 'rascunho' AND writing = 'pendente' AND date_trunc('milliseconds', updated_at) = ${version}::timestamptz RETURNING id`;
  return { id, result: done ? "falhou" : "nada a marcar" };
}

const adminRow = (r: Row): AdminEspecialRow => ({
  id: Number(r.id), format: r.format, theme: r.theme, status: r.status, writing: r.writing, title: r.title, slug: r.slug, issueKey: r.issue_key,
  createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(), publishedAt: r.published_at?.toISOString() ?? null,
});

export async function listEspeciais(): Promise<AdminEspeciais> {
  const rows = await sql<Row[]>`SELECT * FROM literatura_especiais ORDER BY (status = 'descartado'), updated_at DESC LIMIT 200`;
  return { rows: rows.map(adminRow), searches: settings().queries.map(({ id, name, term }) => ({ id, name, term })) };
}

export async function especialDetail(id: number): Promise<BeforeJson<AdminEspecial> | null> {
  const [r] = await sql<Row[]>`SELECT * FROM literatura_especiais WHERE id = ${id}`;
  if (!r) return null;
  return {
    ...adminRow(r), query: r.query, error: r.error, dek: r.dek, body: r.body, refs: r.refs, discarded: r.discarded,
    warnings: r.body ? checkText({ title: r.title, dek: r.dek, body: r.body }, r.refs, r.theme) : [],
    createdBy: r.created_by, approvedBy: r.approved_by, approvedAt: r.approved_at?.toISOString() ?? null, version: versionOf(r),
    history: await auditHistory(subject(id)),
  };
}

/** Drafts written and waiting for the editor: the admin navigation's badge. */
export async function draftsToReview(): Promise<number> {
  const [row] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM literatura_especiais WHERE status = 'rascunho' AND writing = 'pronto'`;
  return row!.n;
}

// ── On the site ─────────────────────────────────────────────────────────────────────────────────────────

const publicRef = ({ abstract: _abstract, ...ref }: ReferenciaLida): Referencia => ref;

/**
 * The text as the site shows it, beside its references: only the studies it cites, numbered again from 1 in
 * the order of the list (oldest first). The text the editor approved keeps the list's own numbers.
 */
export function asPublished(body: string, refs: ReferenciaLida[]): { body: string; refs: Referencia[] } {
  const cited = new Set(citedIn(body));
  const kept = refs.filter((ref) => cited.has(ref.n));
  const to = new Map(kept.map((ref, i) => [ref.n, i + 1]));
  return { body: renumberCitations(body, to), refs: kept.map((ref) => ({ ...publicRef(ref), n: to.get(ref.n)! })) };
}

const card = (r: Row): EspecialCard => ({
  slug: r.slug!, format: r.format, formatName: FORMATS[r.format].name, title: r.title!, dek: r.dek, publishedAt: r.published_at!.toISOString(),
  refCount: asPublished(r.body!, r.refs).refs.length,
});

export async function publishedEspeciais(): Promise<EspecialCard[]> {
  return (await sql<Row[]>`SELECT * FROM literatura_especiais WHERE status = 'publicado' ORDER BY published_at DESC`).map(card);
}

export async function publishedEspecial(slug: string): Promise<EspecialPage | null> {
  const [r] = await sql<Row[]>`SELECT * FROM literatura_especiais WHERE status = 'publicado' AND slug = ${slug}`;
  return r ? { ...card(r), theme: r.theme, ...asPublished(r.body!, r.refs), issueKey: r.issue_key } : null;
}

export async function especiaisSitemap(): Promise<SitemapEntry[]> {
  const rows = await sql<Pick<Row, "slug" | "updated_at">[]>`SELECT slug, updated_at FROM literatura_especiais WHERE status = 'publicado' ORDER BY published_at DESC`;
  return rows.map((r) => ({ loc: `/especiais/${r.slug}`, lastmod: r.updated_at, changefreq: "monthly", priority: 0.7 }));
}

/**
 * A weekly's special, chosen as the issue is written: the one it carried before when it is written again,
 * else the special published longest ago that no issue has carried, among those published by the time the
 * issue was due (so an older issue filled in late does not take a newer special).
 */
export async function weeklyPart(issue: ReportIssue, tx: Db): Promise<{ id: number } | null> {
  if (issue.kind !== "weekly") return null;
  const range = isoWeekRange(issue.key);
  if (!range) return null;
  const due = beijingAt(addDays(range.end, 1), EDITION_TIMES.weekly);
  const [row] = await tx<{ id: number }[]>`
    UPDATE literatura_especiais SET issue_key = ${issue.key}
    WHERE id = (
      SELECT id FROM literatura_especiais
      WHERE status = 'publicado' AND (issue_key = ${issue.key} OR (issue_key IS NULL AND published_at <= ${due}))
      ORDER BY issue_key IS NULL, published_at, id LIMIT 1 FOR UPDATE)
    RETURNING id`;
  return row ? { id: Number(row.id) } : null;
}

/** The weekly's special as the issue shows it now: nothing once it has left the site. */
export async function weeklyCard(saved: unknown): Promise<EspecialCard | null> {
  const id = (saved as { id?: unknown } | null)?.id;
  if (typeof id !== "number") return null;
  const [r] = await sql<Row[]>`SELECT * FROM literatura_especiais WHERE id = ${id} AND status = 'publicado'`;
  return r ? card(r) : null;
}
