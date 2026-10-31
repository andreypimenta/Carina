// The public corrections of a matéria: the editor adds one (the day, what changed and why) from the admin, and
// it shows at the end of the matéria (backend/confianca.ts materiaParts), for good; a correction added by
// mistake can be deleted. Each change is audited like the admin's others.
import { z } from "zod";
import { beijingDate } from "@aihot/contracts/time";
import { audit } from "@aihot/backend/audit";
import { sql } from "@aihot/backend/db";
import { emit } from "@aihot/backend/modules";
import { articleIdFrom, type AdminCorrecao } from "../confianca.ts";

const AUDIT_ACTION = "literatura.correcao";

const invalid = (message: string) => Object.assign(new Error(message), { statusCode: 400 });

const Input = z.object({
  item: z.string().trim().min(1).max(500),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  oQueMudou: z.string().trim().min(3).max(1000),
  porque: z.string().trim().min(3).max(1000),
});

export async function addCorrection(input: unknown, actor: string, now = new Date()): Promise<{ id: number; articleId: string }> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) throw invalid("Informe a matéria, o que mudou e por quê");
  const { item, oQueMudou, porque } = parsed.data;
  const data = parsed.data.data ?? beijingDate(now);
  if (data > beijingDate(now)) throw invalid("A data da correção não pode estar no futuro");
  const articleId = articleIdFrom(item);
  if (!articleId) throw invalid("Informe o endereço da matéria (…/items/<id>) ou o id");
  return sql.begin(async (tx) => {
    const [article] = await tx<{ id: string }[]>`SELECT id FROM articles WHERE id = ${articleId}`;
    if (!article) throw invalid(`A matéria ${articleId} não existe`);
    const [row] = await tx<{ id: string }[]>`
      INSERT INTO literatura_correcoes (article_id, corrected_on, what, why, created_by) VALUES (${articleId}, ${data}, ${oQueMudou}, ${porque}, ${actor}) RETURNING id`;
    await audit(actor, AUDIT_ACTION, `content:${articleId}`, porque, null, { data, oQueMudou, porque }, { db: tx });
    await emit("articleChanged", { id: articleId, kind: "detail", reason: "public correction" }, tx);
    return { id: Number(row!.id), articleId };
  });
}

export async function deleteCorrection(id: number, actor: string): Promise<{ deleted: boolean }> {
  return sql.begin(async (tx) => {
    const [row] = await tx<{ article_id: string; corrected_on: string; what: string; why: string }[]>`
      DELETE FROM literatura_correcoes WHERE id = ${id} RETURNING article_id, to_char(corrected_on, 'YYYY-MM-DD') AS corrected_on, what, why`;
    if (!row) return { deleted: false };
    await audit(actor, `${AUDIT_ACTION}.apagar`, `content:${row.article_id}`, "correção apagada", { data: row.corrected_on, oQueMudou: row.what, porque: row.why }, null, { db: tx });
    await emit("articleChanged", { id: row.article_id, kind: "detail", reason: "public correction deleted" }, tx);
    return { deleted: true };
  });
}

/** The latest corrections, newest first, with their matéria's title as published. */
export async function listCorrections(limit = 100): Promise<AdminCorrecao[]> {
  const rows = await sql<{ id: string; article_id: string; corrected_on: string; what: string; why: string; created_by: string; created_at: Date; title: string | null }[]>`
    SELECT c.id, c.article_id, to_char(c.corrected_on, 'YYYY-MM-DD') AS corrected_on, c.what, c.why, c.created_by, c.created_at, coalesce(p.title, a.title) AS title
    FROM literatura_correcoes c LEFT JOIN articles a ON a.id = c.article_id LEFT JOIN publications p ON p.article_id = c.article_id
    ORDER BY c.created_at DESC, c.id DESC LIMIT ${limit}`;
  return rows.map((r) => ({ id: Number(r.id), articleId: r.article_id, data: r.corrected_on, oQueMudou: r.what, porque: r.why, title: r.title, actor: r.created_by, at: r.created_at.toISOString() }));
}
