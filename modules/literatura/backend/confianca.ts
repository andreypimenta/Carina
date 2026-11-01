// Each new matéria's trust record (../confianca.ts), written with the matéria in its transaction, and the
// article's part of its page and of the weekly e-mail (ServerModule.items): that record, where its study stands
// and the study's other versions and other papers of its trial (backend/estudos.ts), and the corrections the editor added (backend/correcoes.ts).
// The card and the transparency line also go with the text in the exits without the page (ServerModule.items.exit).
// A preprint's or a registry entry's public title starts with its stage's label (ServerModule.titleLabel).
import { sql, type Db } from "@aihot/backend/db";
import { EXPEDIENTE } from "@aihot/site";
import { alertaTitleLabel, ESTADO_LABEL, estadoTitleLabel, fichaRows, fichaTitulo, IMPLICACAO_LABEL, linhaTransparencia, minutoCompacto, minutoEmLinha, type Confianca, type Correcao, type EmUmMinuto, type Estado, type MateriaPart } from "../confianca.ts";
import { estudosOf, REGISTRO_TAG } from "./estudos.ts";

const MATERIA_SOURCE = "literatura-materia";

export async function saveConfianca(tx: Db, articleId: string, data: Confianca): Promise<void> {
  await tx`INSERT INTO literatura_confianca (article_id, data) VALUES (${articleId}, ${tx.json(data as never)})
    ON CONFLICT (article_id) DO UPDATE SET data = EXCLUDED.data`;
}

/** The parts of these articles: those with a trust record, a study's stage or a correction. */
export async function materiaParts(ids: readonly string[]): Promise<Map<string, MateriaPart>> {
  const out = new Map<string, MateriaPart>();
  const list = [...ids];
  const empty = (): MateriaPart => ({ confianca: null, estado: null, versoes: [], mesmoEnsaio: [], correcoes: [] });
  const records = await sql<{ article_id: string; data: Confianca }[]>`SELECT article_id, data FROM literatura_confianca WHERE article_id = ANY(${list})`;
  for (const r of records) out.set(r.article_id, { ...empty(), confianca: r.data, estado: r.data.preprint ? "preprint" : null });
  for (const [id, e] of await estudosOf(list)) {
    const part = out.get(id) ?? empty();
    out.set(id, { ...part, estado: e.estado ?? part.estado, versoes: e.versoes, mesmoEnsaio: e.mesmoEnsaio });
  }
  const fixes = await sql<{ id: string; article_id: string; corrected_on: string; what: string; why: string }[]>`
    SELECT id, article_id, to_char(corrected_on, 'YYYY-MM-DD') AS corrected_on, what, why FROM literatura_correcoes
    WHERE article_id = ANY(${list}) ORDER BY corrected_on, id`;
  for (const f of fixes) {
    const part = out.get(f.article_id) ?? empty();
    part.correcoes.push({ id: Number(f.id), data: f.corrected_on, oQueMudou: f.what, porque: f.why } satisfies Correcao);
    out.set(f.article_id, part);
  }
  return out;
}

/**
 * A regulatory act's label, else the stage's: the study's recorded stage, else a preprint's, else a registry
 * source's item is registered.
 */
export async function titleLabel(articleId: string, tx: Db): Promise<string | null> {
  const [row] = await tx<{ estado: Estado | null; preprint: boolean | null; registro: boolean; alerta: Confianca["alerta"] }[]>`
    SELECT e.estado, (c.data->>'preprint')::boolean AS preprint, ${REGISTRO_TAG} = ANY(s.tags) AS registro, c.data->'alerta' AS alerta
    FROM articles a JOIN sources s ON s.id = a.source_id
    LEFT JOIN literatura_estudos e ON e.article_id = a.id LEFT JOIN literatura_confianca c ON c.article_id = a.id
    WHERE a.id = ${articleId}`;
  if (!row) return null;
  if (row.alerta) return alertaTitleLabel(row.alerta);
  return estadoTitleLabel(row.estado ?? (row.preprint ? "preprint" : row.registro ? "registrado" : null));
}

/**
 * The public summary of the journal's own text (the engine's "Resumo por IA" is not shown on it): "Em um minuto"
 * and its grade, what cards, editions and feeds carry; else a matéria's own stored line under its title; else
 * nothing, and a translation without a record keeps the engine's summary for its card.
 */
export async function ownSummary(articleId: string, tx: Db): Promise<string | null> {
  const [row] = await tx<{ minuto: EmUmMinuto | null; excerpt: string | null; source_id: string }[]>`
    SELECT c.data->'minuto' AS minuto, a.excerpt, a.source_id FROM articles a LEFT JOIN literatura_confianca c ON c.article_id = a.id WHERE a.id = ${articleId}`;
  if (row?.minuto) return minutoEmLinha(row.minuto);
  return row?.source_id === MATERIA_SOURCE ? row.excerpt?.trim() || null : null;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Under the matéria in the weekly e-mail: "Em um minuto" and "Muda algo agora?", in place of its summary; nothing for a piece without one. */
export function materiaMail(part: unknown): { html: string; text: string } | null {
  const p = part as MateriaPart | null;
  const line = p ? minutoCompacto(p) : null;
  const m = p?.confianca?.minuto;
  if (!m || !line) return null;
  const html = `<div style="margin:8px 0 0;padding:10px 12px;background:#f4f2ec;border-radius:8px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:#3b4649">
<div><b style="color:#0f766e">Em um minuto</b> ${esc(m.achado)}</div>
<div><b>Muda algo agora?</b> ${esc(IMPLICACAO_LABEL[m.mudaAlgo])}${m.diretriz ? ` (${esc(m.diretriz)})` : ""}</div></div>`;
  return { html, text: line };
}

/** The card before the text and the transparency line after it, where the text goes without the page (Markdown, RSS); nothing for a piece without a record. */
export function materiaExit(part: unknown): { before: string; after: string } | null {
  const { confianca: c, estado } = part as MateriaPart;
  if (!c) return null;
  const rows = fichaRows({ confianca: c, estado }).map((r) => `<li><strong>${esc(r.label)}:</strong> ${esc(r.estado ? ESTADO_LABEL[r.estado] : r.text ?? "")}${r.note ? `. ${esc(r.note)}` : ""}</li>`);
  return {
    before: rows.length ? `<h2>${esc(fichaTitulo(c))}</h2><ul>${rows.join("")}</ul>` : "",
    after: `<p>${esc(linhaTransparencia(c, EXPEDIENTE.editor.name))}</p>`,
  };
}
