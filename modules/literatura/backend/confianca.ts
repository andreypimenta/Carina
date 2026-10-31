// Each new matéria's trust record (../confianca.ts), written with the matéria in its transaction, and the
// matéria's part of its page and of the weekly e-mail (ServerModule.items): that record and the corrections
// the editor added (backend/correcoes.ts). A preprint's public title starts with its label (ServerModule.titleLabel).
import { sql, type Db } from "@aihot/backend/db";
import { DESENHO_LABEL, IMPLICACAO_LABEL, minutoCompacto, PREPRINT_LABEL, TEXTO_LIDO_LABEL, type Confianca, type Correcao, type MateriaPart } from "../confianca.ts";

export async function saveConfianca(tx: Db, articleId: string, data: Confianca): Promise<void> {
  await tx`INSERT INTO literatura_confianca (article_id, data) VALUES (${articleId}, ${tx.json(data as never)})
    ON CONFLICT (article_id) DO UPDATE SET data = EXCLUDED.data`;
}

/** The parts of these articles: those with a trust record or a correction. */
export async function materiaParts(ids: readonly string[]): Promise<Map<string, MateriaPart>> {
  const out = new Map<string, MateriaPart>();
  const list = [...ids];
  const records = await sql<{ article_id: string; data: Confianca }[]>`SELECT article_id, data FROM literatura_confianca WHERE article_id = ANY(${list})`;
  for (const r of records) out.set(r.article_id, { confianca: r.data, correcoes: [] });
  const fixes = await sql<{ id: string; article_id: string; corrected_on: string; what: string; why: string }[]>`
    SELECT id, article_id, to_char(corrected_on, 'YYYY-MM-DD') AS corrected_on, what, why FROM literatura_correcoes
    WHERE article_id = ANY(${list}) ORDER BY corrected_on, id`;
  for (const f of fixes) {
    const part = out.get(f.article_id) ?? { confianca: null, correcoes: [] };
    part.correcoes.push({ id: Number(f.id), data: f.corrected_on, oQueMudou: f.what, porque: f.why } satisfies Correcao);
    out.set(f.article_id, part);
  }
  return out;
}

export async function titleLabel(articleId: string, tx: Db): Promise<string | null> {
  const [row] = await tx<{ preprint: boolean | null }[]>`SELECT (data->>'preprint')::boolean AS preprint FROM literatura_confianca WHERE article_id = ${articleId}`;
  return row?.preprint ? PREPRINT_LABEL : null;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** "Em um minuto" under the matéria in the weekly e-mail, with its design and the text read; nothing for a piece without one. */
export function materiaMail(part: unknown): { html: string; text: string } | null {
  const p = part as MateriaPart | null;
  const line = p ? minutoCompacto(p) : null;
  if (!p?.confianca?.minuto || !line) return null;
  const c = p.confianca;
  const m = c.minuto!;
  const ficha = [c.desenho ? DESENHO_LABEL[c.desenho] : null, `Texto lido: ${TEXTO_LIDO_LABEL[c.textoLido].toLowerCase()}`].filter(Boolean).join(" · ");
  const html = `<div style="margin:8px 0 0;padding:10px 12px;background:#f4f2ec;border-radius:8px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:#3b4649">
${c.preprint ? `<div style="font-weight:bold;color:#9a3412">${esc(PREPRINT_LABEL)}</div>` : ""}<div><b style="color:#0f766e">Em um minuto</b> ${esc(m.achado)}</div>
<div><b>Para quem:</b> ${esc(m.paraQuem)} · <b>Muda algo agora?</b> ${esc(IMPLICACAO_LABEL[m.mudaAlgo])}</div>
<div style="color:#6b7478">${esc(ficha)}</div></div>`;
  return { html, text: `${line} (${ficha})` };
}
