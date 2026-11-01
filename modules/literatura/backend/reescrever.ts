// One edition rewritten in the matéria's single structure (scripts/edicao-reescrever.ts): the journal's own items
// a weekly carries, each from its paper's source text and through the writer new papers go through (materia.ts).
// A matéria, from PubMed or from its publisher's page, gets a new title, summary and body; a matéria from an official
// page goes through the page's writer; a translated full text keeps its body and gets the record the writer gives a
// translation; a third party's item, or one whose source cannot be read, is listed and left as it is. An editor's
// override is never cleared: an item it still covers is reported as such.
//
// This is not a new revision of the material on purpose. A revision (content/materials.ts) starts over everything
// decided on the old text, so the item would leave the edition until judged again, and could stay out. The words
// change here; the analysis, the section, the selection and the grouping stand. What the row held goes into the
// audit log first, and restoreItems puts it back.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { beijingDate } from "@aihot/contracts/time";
import { OWN_TEXT_SOURCES } from "@aihot/industry/taxonomy";
import { audit } from "@aihot/backend/audit";
import { sql, type Tx } from "@aihot/backend/db";
import { contentHash } from "@aihot/backend/content/materials";
import { sanitizeBody } from "@aihot/backend/content/sanitize";
import { promptText } from "@aihot/backend/editorial/prompts";
import { collapseWhitespace } from "@aihot/backend/lib/text";
import { emit } from "@aihot/backend/modules";
import { completeReceipt, rejectReceivedResponse } from "@aihot/backend/providers/receipts";
import { publishArticleTx } from "@aihot/backend/publication/publish";
import { correctPeriodCitations } from "@aihot/backend/reports/correct";
import { periodPrompt } from "@aihot/backend/reports/compose";
import { MATERIA_SOURCE, type Confianca } from "../confianca.ts";
import { blockText, type Access } from "./access.ts";
import { postCredit, postText, primaryPageOf, publisherPaper, readPage } from "./apurar.ts";
import { INTEGRAL_SOURCE, materiaFullText, paperAccess } from "./collect.ts";
import { saveConfianca } from "./confianca.ts";
import { estudoDoPaper, saveEstudo, saveRegistroPage, type Estudo } from "./estudos.ts";
import { confiancaDaMateria, confiancaDaPagina, confiancaDaTraducao, fonteInput, limitePalavras, materiaInput, materiaText, readTrust, renderFonteMateria, renderMateria, textoLido, writeFonteMateria, writeMateria, type FonteMateria, type Materia, type PrimaryPage, type Trust, type XCredit } from "./materia.ts";
import { fetchPapers, pmidsForDoi, skippable, trialIdsIn, type Paper, type PubmedPaper } from "./pubmed.ts";

const AUDIT_ACTION = "literatura.reescrever";
const AUDIT_RESTORE = "literatura.reescrever.restaurar";

/** plan: no model call. generate: the model writes, the preview shows it and nothing published changes; --apply reuses those answers (receipts). apply: writes. */
export type Mode = "plan" | "generate" | "apply";

interface Row {
  id: string; source_id: string; url: string; title: string; excerpt: string | null; body_html: string | null; body_text: string | null; content_hash: string | null;
  raw: Record<string, unknown> | null; confianca: Confianca | null; estudo: Record<string, unknown> | null; pub_title: string | null; pub_summary: string | null;
  paper_statuses: Array<{ pmid: string; status: string }> | null; overrides: Record<string, unknown> | null; timeline_at: Date;
}

export interface ItemResult {
  id: string;
  type: "materia" | "pagina" | "traducao" | "terceiros" | "sem-fonte";
  /** would-write: planned. written/generated: done in this run. done: from an earlier run. overridden: written, but an editor's override still shows instead of the new text. kept: left on purpose. refused: the model's text failed a check. failed: a service or the model failed. */
  status: "would-write" | "generated" | "written" | "done" | "overridden" | "kept" | "refused" | "failed";
  why: string | null;
  oldTitle: string;
  newTitle: string | null;
  oldWords: number;
  newWords: number | null;
  /** About what the matéria may have (materia.ts limitePalavras), against the model's own fields; the preview and the log flag one over it. */
  limit: number | null;
  mainNumber: string | null;
  tokens: number;
  newText: string | null;
}

/** An item of the journal's own that stayed in the old form, whole or in what its cards show. */
export const stayedOld = (i: ItemResult) => i.status === "refused" || i.status === "failed" || i.status === "overridden" || (i.status === "kept" && i.type !== "terceiros");

export interface RewriteResult { items: ItemResult[]; modelCalls: number; tokens: number; report: { changed: number; overview: string | null } | "not-run" | { error: string } }

const words = (s: string | null | undefined) => (s ?? "").split(/\s+/).filter(Boolean).length;
/** A rough count: about four characters a token, in both languages. */
const tokensOf = (chars: number) => Math.ceil(chars / 4);

/** Thousands written "3.667" or "3,667"; anything else with a separator is a decimal. */
const isThousands = (f: string) => /^\d{1,3}(?:[.,]\d{3})+$/.test(f);
const valueOf = (f: string) => Number(isThousands(f) ? f.replace(/[.,]/g, "") : f.replace(",", "."));
const decimalsOf = (f: string) => (isThousands(f) ? 0 : f.split(/[.,]/)[1]?.length ?? 0);
/** The same figure in either's precision: 70,8 and 71, 3.667 and 3,667. */
const sameFigure = (a: string, b: string) => {
  const d = Math.min(decimalsOf(a), decimalsOf(b));
  return valueOf(a).toFixed(d) === valueOf(b).toFixed(d);
};

/** The figures of a text that can be a study's number: not a confidence level, a year, a bare single digit or digits in a name (COVID-19, T21, 22q11). Percentages first, then decimals. */
function figures(text: string): string[] {
  const found = [...text.replace(/\b(?:IC|CI)\s*(?:de\s*)?95\s*%|95\s*%\s*(?:IC|CI)\b/gi, " ").matchAll(/(?<!\d)(?<!\p{L}[-–]?)(\d+(?:[.,]\d+)*)(?!\d|\p{L}\d)(\s*%)?/gu)]
    .map((m) => ({ f: m[1]!, percent: !!m[2] }))
    .filter(({ f, percent }) => percent || decimalsOf(f) > 0 || (valueOf(f) >= 10 && !(valueOf(f) >= 1900 && valueOf(f) <= 2099)));
  const rank = (x: { f: string; percent: boolean }) => (x.percent ? 0 : decimalsOf(x.f) > 0 ? 1 : 2);
  return found.toSorted((a, b) => rank(a) - rank(b)).map((x) => x.f);
}

/**
 * The figures of the line the old matéria led with that its source also has, the study's main number first. None
 * when that line has no such figure: not every paper has one (a technique, a narrative review).
 */
export function mainNumbers(headline: string, source: string): string[] {
  const inSource = figures(source);
  return figures(headline).filter((f) => inSource.some((s) => sameFigure(f, s)));
}

export const hasNumber = (text: string, number: string) => figures(text).some((f) => sameFigure(f, number));

/** A paper's abstract or full text, named as such; a congress abstract or a guideline's executive summary is another thing. */
const READ_TEXT = String.raw`(?:resumo(?!\s+(?:executivo|(?:de|do|em)\s+(?:congresso|conferência|evento)))|abstract|(?:texto|artigo)\s+(?:completo|integral|na\s+[ií]ntegra)|full[- ]text)(?!\p{L})`;
/**
 * Words that tell the reader what the journal read: that text as the journal's source, or what it says or lacks. The
 * site never says it (industry/prompts/materia.md). A study's own methods (reviewers screening abstracts and reading
 * full texts) are the study's, and stay.
 */
const SAYS_WHAT_WAS_READ = new RegExp([
  String.raw`\b(?:segundo|conforme|de\s+acordo\s+com|(?:apenas|somente|só)(?:\s+com)?|a\s+partir(?:\s+de)?|com\s+base(?:\s+em)?|basead[oa](?:\s+em)?)\s+(?:(?:o|um|este|esse|seu|do|no|deste|desse|neste|nesse)\s+)?${READ_TEXT}`,
  String.raw`\b(?:neste|nesse|deste|desse|este|esse|seu)\s+${READ_TEXT}`,
  String.raw`(?<!\be\s)\bno\s+${READ_TEXT}`,
  String.raw`\bo\s+${READ_TEXT}\s+(?:não|informa|relata|diz|traz|descreve|menciona|cita|indica|mostra|aponta|apresenta|afirma|(?:estava|está|foi)\s+(?:disponível|consultado|lido|acessado|obtido))\b`,
  String.raw`\b(?:lemos|consultamos|tivemos\s+acesso\s+ao?)\s+(?:o\s+)?${READ_TEXT}`,
  String.raw`\bresumo\s+(?:publicado|do\s+artigo|do\s+estudo)\b`,
].join("|"), "iu");

/** All the model's text a reader sees. */
function trustWords(t: Trust): string[] {
  return [t.perguntaClinica, t.achado, t.diretriz, t.conflitos, t.populacaoIdade, t.populacaoDoenca, t.populacaoCenario, t.desenhoDetalhe, t.limitacaoPrincipal, t.naPratica];
}
function materiaWords(m: Materia): string[] {
  return [m.titulo, ...trustWords(m), m.oQueFizeram, ...m.resultados.flatMap((r) => [r.desfecho, r.resultado, r.efeito]), ...m.aFavor, ...m.sinaisDeAlerta.map((f) => f.detalhe), ...m.naoInformado, m.contexto];
}

function fonteWords(m: FonteMateria): string[] {
  return [m.titulo, m.organizacao, m.lide, m.corpo, m.achado, m.paraQuem, m.diretriz, m.conflitos, m.aplicabilidadeBrasil];
}

/** Why the model's text cannot stand in for what is published; null when it can. "Em um minuto" (`achado`) has one of the old line's figures, "Na prática" (`noFigures`) has none. */
export function refusal(parts: { required: Record<string, string>; text: string[]; achado: string; numbers: string[]; noFigures?: string }): string | null {
  const blank = Object.entries(parts.required).filter(([, v]) => !v.trim()).map(([k]) => k);
  if (blank.length) return `model output failed validation: ${blank.join(", ")} empty`;
  const text = parts.text.join("\n");
  const says = SAYS_WHAT_WAS_READ.exec(text);
  if (says) return `model output failed validation: says what was read ("${says[0]}")`;
  if (parts.numbers.length && !parts.numbers.some((n) => hasNumber(parts.achado, n))) return `main number ${parts.numbers.join(" or ")} is missing from achado`;
  const inPractice = figures(parts.noFigures ?? "");
  if (inPractice.length) return `model output failed validation: naPratica has figures (${inPractice.join(", ")})`;
  return null;
}

/** The items a weekly carries, in its order. */
async function editionIds(key: string): Promise<string[]> {
  const [report] = await sql<{ themes: Array<{ storyRefs?: Array<{ itemId?: string }> }> | null }[]>`SELECT content->'themes' AS themes FROM reports WHERE kind = 'weekly' AND key = ${key}`;
  if (!report) throw new Error(`no weekly edition ${key}`);
  return [...new Set((report.themes ?? []).flatMap((t) => t.storyRefs ?? []).flatMap((r) => (r.itemId ? [r.itemId] : [])))];
}

const COLUMNS = sql`a.id, a.source_id, a.url, a.title, a.excerpt, a.body_html, a.body_text, a.content_hash, a.raw, c.data AS confianca, to_jsonb(e) AS estudo, p.title AS pub_title, p.summary AS pub_summary, p.timeline_at, o.fields AS overrides,
  (SELECT json_agg(json_build_object('pmid', lp.pmid, 'status', lp.status)) FROM literatura_papers lp WHERE lp.article_id = a.id) AS paper_statuses`;

async function readItems(ids: string[]): Promise<Row[]> {
  const rows = await sql<Row[]>`SELECT ${COLUMNS} FROM articles a
    LEFT JOIN literatura_confianca c ON c.article_id = a.id LEFT JOIN literatura_estudos e ON e.article_id = a.id LEFT JOIN publications p ON p.article_id = a.id LEFT JOIN editorial_overrides o ON o.article_id = a.id
    WHERE a.id = ANY(${ids})`;
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}

/** What the row holds, as the audit log keeps it for restoreItems. */
const snapshot = (r: Row) => ({ title: r.title, excerpt: r.excerpt, bodyHtml: r.body_html, bodyText: r.body_text, contentHash: r.content_hash, raw: r.raw, confianca: r.confianca, estudo: r.estudo, publicationTitle: r.pub_title, publicationSummary: r.pub_summary, paperStatuses: r.paper_statuses });

const doiOf = (r: Row) => (typeof r.raw?.doi === "string" && r.raw.doi ? r.raw.doi : null);
/** A matéria written from an official page (apurar.ts takePage). */
const fromPage = (r: Row) => r.source_id === MATERIA_SOURCE && r.raw?.basis === "pagina";

/** Each item's paper in PubMed by the PMID it was written from, else its DOI. One PubMed does not have, or an official page's, has none. */
async function papersOf(rows: Row[]): Promise<Map<string, PubmedPaper>> {
  const pmids = new Map<string, string>();
  for (const r of rows) {
    const pmid = typeof r.raw?.pmid === "string" && r.raw.pmid ? r.raw.pmid : doiOf(r) ? (await pmidsForDoi(doiOf(r)!))[0] : undefined;
    if (pmid) pmids.set(r.id, pmid);
  }
  const papers = new Map((await fetchPapers([...new Set(pmids.values())])).map((p) => [p.pmid, p]));
  return new Map([...pmids].flatMap(([id, pmid]) => (papers.get(pmid) ? [[id, papers.get(pmid)!] as const] : [])));
}

/** The credit of the X post that led to the paper, as the body has it: the post is not read again. */
const creditIn = (html: string | null) => html?.match(/<p><em>Pauta:.*?<\/em><\/p>/)?.[0] ?? "";

async function commit(r: Row, write: (tx: Tx) => Promise<void>, reason: string, actor: string, after: Record<string, unknown>) {
  await sql.begin(async (tx) => {
    const [locked] = await tx<{ content_hash: string | null }[]>`SELECT content_hash FROM articles WHERE id = ${r.id} FOR UPDATE`;
    if (locked!.content_hash !== r.content_hash) throw new Error("the item changed while it was being rewritten");
    await audit(actor, AUDIT_ACTION, `content:${r.id}`, reason, snapshot(r), after, { db: tx });
    await write(tx);
    const published = await publishArticleTx(tx, r.id);
    await emit("articleChanged", { id: r.id, kind: "content", reduced: published?.reduced, reason: "edition rewritten in the single structure" }, tx);
  });
}

interface Prepared { paper: Paper; access: Access; pmcid: string | null; pmcText: boolean; fullText: string | null; from: "pmc" | "copy" | "publisher" | null; estudo: Estudo }

async function prepare(r: Row, paper: PubmedPaper): Promise<Prepared | string> {
  const skip = skippable(paper);
  if (skip) return `paper is not rewritten: ${skip}`;
  const { access, pmcid, full, isFull } = await paperAccess(paper);
  const integral = r.source_id === INTEGRAL_SOURCE;
  if (integral && !isFull) return "the translated full text cannot be read again";
  const { fullText, from } = integral ? { fullText: full!.text, from: "pmc" as const } : await materiaFullText(paper, access, isFull ? full : null);
  if (!fullText && !paper.abstract.length) return "the paper has neither a full text nor an abstract";
  return { paper, access, pmcid, pmcText: !!full, fullText, from, estudo: await estudoOf(r, paper) };
}

/** A matéria whose paper PubMed does not have: its publisher's page, read again at the address the item stores, as apurar.ts takePublisherPage reads it. */
async function preparePublisher(r: Row, doi: string): Promise<Prepared | string> {
  const page = await readPage(r.url);
  if (!page) return "the publisher's page cannot be read again";
  const read = await publisherPaper(page, doi);
  if (!read) return "the publisher's page has no title or no text to write from";
  return { ...read, pmcid: null, pmcText: false, from: read.fullText ? "publisher" : null, estudo: await estudoOf(r, read.paper) };
}

interface PreparedPage { page: PrimaryPage; post: string; credit: XCredit }

/** A matéria from an official page: the page read again at the address the item stores, and the post the item names, which the writer reads with it. */
async function preparePage(r: Row): Promise<PreparedPage | string> {
  const read = await readPage(r.url);
  const page = read && primaryPageOf(read);
  if (!page) return "the official page cannot be read again";
  const [post] = await sql<{ url: string; x_post: { handle?: string; authorName?: string; text?: string; quoted?: { text?: string } | null }; x_article: { title?: string; text?: string } | null }[]>`
    SELECT url, x_post, x_article FROM articles WHERE url = ${String(r.raw?.xPost ?? "")} AND x_post IS NOT NULL`;
  if (!post) return "the X post that led to the official page is not stored";
  return { page, post: postText(post), credit: postCredit(post) };
}

/** The study the paper belongs to; only what came out before the item, as for a new one, is an earlier version of it. */
async function estudoOf(r: Row, paper: Paper): Promise<Estudo> {
  const estudo = await estudoDoPaper(paper);
  const day = beijingDate(r.timeline_at);
  return { ...estudo, anteriores: estudo.anteriores.filter((a) => a.data < day) };
}

/** A matéria: the writer's text in the row, under its own record; refused text leaves the row as it is. */
async function rewriteMateria(r: Row, p: Prepared, numbers: string[], result: ItemResult, mode: Exclude<Mode, "plan">, reason: string, actor: string, now: Date) {
  const { materia, receiptId } = await writeMateria(p.paper, p.fullText, p.estudo.anteriores);
  const why = refusal({ required: { perguntaClinica: materia.perguntaClinica, achado: materia.achado, oQueFizeram: materia.oQueFizeram, naPratica: materia.naPratica }, text: materiaWords(materia), achado: materia.achado, numbers, noFigures: materia.naPratica });
  if (why) {
    await rejectReceivedResponse(receiptId, why);
    return Object.assign(result, { status: "refused", why });
  }
  const html = sanitizeBody(renderMateria(materia, p.paper, p.access, p.pmcText ? p.pmcid : null) + creditIn(r.body_html), r.url);
  const bodyText = materiaText(materia, html);
  const title = collapseWhitespace(materia.titulo).slice(0, 1000);
  const excerpt = materia.achado.trim();
  Object.assign(result, { newTitle: title, newWords: words(materiaWords(materia).join(" ")), newText: `${title}\n\n${materia.perguntaClinica}\n\n${excerpt}\n\n${blockText(html)}` });
  if (mode === "generate") return Object.assign(result, { status: "generated" });
  const basis = p.fullText ? "full" : "abstract";
  const { fullTextFrom: _from, ...raw } = r.raw ?? {};
  await commit(r, async (tx) => {
    await tx`UPDATE articles SET title = ${title}, excerpt = ${excerpt}, body_html = ${html}, body_text = ${bodyText}, content_hash = ${contentHash({ title, bodyText, excerpt })},
      raw = ${tx.json({ ...raw, access: p.access, originalTitle: p.paper.title, basis, ...(p.from ? { fullTextFrom: p.from } : {}) } as never)}, updated_at = now() WHERE id = ${r.id}`;
    await completeReceipt(tx, receiptId);
    await saveConfianca(tx, r.id, confiancaDaMateria(materia, p.paper, textoLido(p.from, p.access), now));
    await saveEstudo(tx, r.id, p.paper, p.estudo);
    await tx`UPDATE literatura_papers SET status = ${`materia-${basis}`}, updated_at = now() WHERE article_id = ${r.id}`;
  }, reason, actor, { title, excerpt, words: result.newWords, receiptId });
  return Object.assign(result, { status: "written" });
}

/** A matéria from an official page: the page's writer, as for a new one (apurar.ts takePage). Its record has no "estrutura", so `raw.reescrita` says it is done. */
async function rewritePage(r: Row, p: PreparedPage, numbers: string[], result: ItemResult, mode: Exclude<Mode, "plan">, reason: string, actor: string, now: Date) {
  const { materia, receiptId } = await writeFonteMateria(p.page, p.post);
  const why = materia ? refusal({ required: { achado: materia.achado }, text: fonteWords(materia), achado: materia.achado, numbers }) : "model output failed validation: not the primary source, or too short";
  if (!materia || why) {
    await rejectReceivedResponse(receiptId, why!);
    return Object.assign(result, { status: "refused", why });
  }
  const html = sanitizeBody(renderFonteMateria(materia, p.page, p.credit), p.page.url);
  const excerpt = materia.achado.trim();
  const bodyText = `${excerpt} ${blockText(html)}`.trim();
  const title = collapseWhitespace(materia.titulo).slice(0, 1000);
  Object.assign(result, { newTitle: title, newWords: words(fonteWords(materia).join(" ")), newText: `${title}\n\n${excerpt}\n\n${blockText(html)}` });
  if (mode === "generate") return Object.assign(result, { status: "generated" });
  const registro = trialIdsIn(p.page.url).length > 0;
  await commit(r, async (tx) => {
    await tx`UPDATE articles SET title = ${title}, excerpt = ${excerpt}, body_html = ${html}, body_text = ${bodyText}, content_hash = ${contentHash({ title, bodyText, excerpt })},
      raw = ${tx.json({ ...r.raw, organization: materia.organizacao.trim(), pageTitle: p.page.title, reescrita: true } as never)}, updated_at = now() WHERE id = ${r.id}`;
    await completeReceipt(tx, receiptId);
    await saveConfianca(tx, r.id, confiancaDaPagina(materia, p.page, now, registro));
    if (registro) await saveRegistroPage(tx, r.id, p.page.url);
  }, reason, actor, { title, excerpt, words: result.newWords, receiptId });
  return Object.assign(result, { status: "written" });
}

/**
 * A translated full text: the body is the paper's and stays, with every number; the writer gives it its record, as
 * for a new one (collect.ts).
 */
async function rewriteTraducao(r: Row, p: Prepared, numbers: string[], result: ItemResult, mode: Exclude<Mode, "plan">, reason: string, actor: string, now: Date) {
  const { trust, receiptId } = await readTrust(p.paper, p.fullText!, p.estudo.anteriores);
  const why = refusal({ required: { perguntaClinica: trust.perguntaClinica, achado: trust.achado }, text: trustWords(trust), achado: trust.achado, numbers });
  if (why) {
    await rejectReceivedResponse(receiptId, why);
    return Object.assign(result, { status: "refused", why });
  }
  Object.assign(result, { newTitle: r.pub_title, newWords: result.oldWords, newText: `${trust.perguntaClinica}\n\n${trust.achado}\n\n${trust.naPratica}` });
  if (mode === "generate") return Object.assign(result, { status: "generated" });
  await commit(r, async (tx) => {
    await completeReceipt(tx, receiptId);
    await saveConfianca(tx, r.id, confiancaDaTraducao(trust, p.paper, now));
    await saveEstudo(tx, r.id, p.paper, p.estudo);
  }, reason, actor, { achado: trust.achado, receiptId });
  return Object.assign(result, { status: "written" });
}

const overLimit = (i: ItemResult) => (i.limit && i.newWords && i.newWords > i.limit ? ` (acima do limite de ${i.limit})` : "");

/** What of an editor's override would still show instead of this item's new text (publish.ts). */
function overriddenFields(r: Row, type: ItemResult["type"]): string[] {
  return (type === "traducao" ? ["summary"] : ["title", "summary"]).filter((k) => typeof r.overrides?.[k] === "string" && (r.overrides[k] as string).trim());
}

function previewText(key: string, mode: Mode, out: RewriteResult): string {
  const lines = [`# Edição ${key}: reescrita na estrutura única (${mode})`, "", `Chamadas de modelo: ${out.modelCalls}. Tokens estimados: ${out.tokens}, à razão de 4 caracteres por token, entrada e saída.`, ""];
  for (const i of out.items) {
    lines.push(`## ${i.id}: ${i.type}, ${i.status}`, "", `- Título antigo: ${i.oldTitle}`, `- Título novo: ${i.newTitle ?? "sem mudança"}`, `- Palavras: ${i.oldWords} → ${i.newWords ?? "?"}${overLimit(i)}`, `- Número principal: ${i.mainNumber ?? "não identificado"}`);
    if (i.why) lines.push(`- Motivo: ${i.why}`);
    if (i.newText) lines.push("", i.newText);
    lines.push("");
  }
  return lines.join("\n");
}

/**
 * Takes the edition's items in turn. An item already in the single structure is not written again, so a stopped
 * run continues where it stopped and an item that failed is tried again. Applying ends with the edition's frozen
 * text brought to its items'; nothing is sent.
 */
export async function rewriteEdition(key: string, opts: { mode: Mode; reason: string; actor: string; previewPath: string; now?: Date; log?: (line: string) => void }): Promise<RewriteResult> {
  const { mode, reason, actor } = opts;
  const now = opts.now ?? new Date();
  const log = opts.log ?? (() => {});
  const rows = await readItems(await editionIds(key));
  const own = (r: Row) => OWN_TEXT_SOURCES.includes(r.source_id);
  const done = (r: Row) => r.confianca?.estrutura === "unica" || r.raw?.reescrita === true;
  const papers = await papersOf(rows.filter((r) => own(r) && !done(r)));
  const system = promptText("materia").length;
  const out: RewriteResult = { items: [], modelCalls: 0, tokens: 0, report: "not-run" };
  let writesItems = false;

  for (const r of rows) {
    const result: ItemResult = { id: r.id, type: !own(r) ? "terceiros" : fromPage(r) ? "pagina" : r.source_id === MATERIA_SOURCE ? "materia" : "traducao", status: "kept", why: null, oldTitle: r.pub_title ?? r.title, newTitle: null, oldWords: words(r.body_text), newWords: null, limit: null, mainNumber: null, tokens: 0, newText: null };
    out.items.push(result);
    if (!own(r)) result.why = "third party's item: the journal has no text of its own to write";
    else if (done(r)) Object.assign(result, { status: "done", why: "already in the single structure" });
    else {
      try {
        const p = fromPage(r) ? await preparePage(r)
          : papers.has(r.id) ? await prepare(r, papers.get(r.id)!)
          : r.source_id === MATERIA_SOURCE && doiOf(r) ? await preparePublisher(r, doiOf(r)!)
          : "no source to rewrite from: no paper in PubMed under its PMID or DOI, and no page of its own";
        if (typeof p === "string") Object.assign(result, { type: "sem-fonte", why: p });
        else {
          const page = "page" in p;
          const source = page ? p.page.text : p.fullText ?? p.paper.abstract.map((s) => s.text).join(" ");
          const numbers = mainNumbers([r.source_id === MATERIA_SOURCE ? r.excerpt : r.pub_summary, r.title].filter(Boolean).join(" "), source);
          result.mainNumber = numbers[0] ?? null;
          const limit = page ? null : limitePalavras(p.paper, p.fullText);
          if (result.type === "materia") result.limit = limit;
          // The prompt and input going in; about two tokens a word coming out, as JSON, up to the writer's limit.
          result.tokens = page
            ? tokensOf(promptText("materia-fonte").length + fonteInput(p.page, p.post).length) + 3000
            : tokensOf(system + materiaInput(p.paper, p.fullText, p.estudo.anteriores).length) + Math.min(4000, limit! * 2);
          out.modelCalls++;
          out.tokens += result.tokens;
          if (mode === "plan") result.status = "would-write";
          else if (page) await rewritePage(r, p, numbers, result, mode, reason, actor, now);
          else if (r.source_id === MATERIA_SOURCE) await rewriteMateria(r, p, numbers, result, mode, reason, actor, now);
          else await rewriteTraducao(r, p, numbers, result, mode, reason, actor, now);
        }
      } catch (error) {
        Object.assign(result, { status: "failed", why: (error as Error).message });
      }
    }
    if (["would-write", "generated", "written"].includes(result.status)) writesItems = true;
    const hidden = overriddenFields(r, result.type);
    if (hidden.length && ["would-write", "generated", "written", "done"].includes(result.status)) {
      result.why = `an editor's override of ${hidden.join(" and ")} still shows instead of the new text`;
      if (result.status === "written" || result.status === "done") result.status = "overridden";
    }
    log(`${result.status}  ${r.id}  ${result.type}  "${result.oldTitle}" → "${result.newTitle ?? "sem mudança"}"  ${result.oldWords} → ${result.newWords ?? "?"} palavras${overLimit(result)}${result.why ? `  ${result.why}` : ""}`);
  }

  // The edition's overview is written again once anything of it changed: one call more.
  const [report] = await sql<{ content: { periodStart: string; periodEnd: string; headline: string; themes: Array<{ heading: string; storyRefs: Array<{ title?: string; summary?: string | null }> }> } }[]>`SELECT content FROM reports WHERE kind = 'weekly' AND key = ${key}`;
  if (writesItems) {
    const c = report!.content;
    const prompt = periodPrompt("weekly", c.periodStart, c.periodEnd, { title: c.headline }, c.themes.map((t) => ({ label: t.heading, items: t.storyRefs.map((e) => ({ title: e.title ?? "", summary: e.summary ?? "" })) })));
    const tokens = tokensOf(prompt.system.length + prompt.user.length) + 500;
    out.modelCalls++;
    out.tokens += tokens;
  }
  if (mode === "apply") {
    const rewritten = (await readItems(rows.map((r) => r.id))).filter((r) => own(r) && done(r)).map((r) => r.id);
    try {
      out.report = await correctPeriodCitations(key, rewritten, reason, actor);
    } catch (error) {
      out.report = { error: (error as Error).message };
    }
  }
  const file = path.resolve(opts.previewPath);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, previewText(key, mode, out));
  return out;
}

/**
 * Puts back what the row held before its last rewrite, from the audit log, and the edition's frozen text with it.
 * The writer's answer is marked unusable, so rewriting the item again pays for a new one instead of reusing it.
 */
export async function restoreItems(key: string, ids: string[], opts: { reason: string; actor: string; log?: (line: string) => void }): Promise<RewriteResult["report"]> {
  const edition = new Set(await editionIds(key));
  const outside = ids.filter((id) => !edition.has(id));
  if (outside.length) throw new Error(`not in edition ${key}, nothing changed: ${outside.join(", ")}`);
  const log = opts.log ?? (() => {});
  type Saved = ReturnType<typeof snapshot>;
  const restored: string[] = [];
  for (const id of ids) {
    const [last] = await sql<{ before: Saved; after: { receiptId?: number } }[]>`SELECT before, after FROM audit_log WHERE subject = ${`content:${id}`} AND action = ${AUDIT_ACTION} ORDER BY id DESC LIMIT 1`;
    if (!last) {
      log(`not rewritten  ${id}  nothing to restore`);
      continue;
    }
    const s = last.before;
    await sql.begin(async (tx) => {
      await tx`SELECT 1 FROM articles WHERE id = ${id} FOR UPDATE`;
      await tx`UPDATE articles SET title = ${s.title}, excerpt = ${s.excerpt}, body_html = ${s.bodyHtml}, body_text = ${s.bodyText}, content_hash = ${s.contentHash},
        raw = ${s.raw ? tx.json(s.raw as never) : null}, updated_at = now() WHERE id = ${id}`;
      if (s.confianca) await saveConfianca(tx, id, s.confianca);
      else await tx`DELETE FROM literatura_confianca WHERE article_id = ${id}`;
      if (!s.estudo) await tx`DELETE FROM literatura_estudos WHERE article_id = ${id}`;
      else await tx`UPDATE literatura_estudos SET ids = ${s.estudo.ids as string[]}, estado = ${s.estudo.estado as string}, titulo = ${s.estudo.titulo as string | null}, autor = ${s.estudo.autor as string | null} WHERE article_id = ${id}`;
      for (const p of s.paperStatuses ?? []) await tx`UPDATE literatura_papers SET status = ${p.status}, updated_at = now() WHERE pmid = ${p.pmid}`;
      await audit(opts.actor, AUDIT_RESTORE, `content:${id}`, opts.reason, null, { title: s.title }, { db: tx });
      const published = await publishArticleTx(tx, id);
      await emit("articleChanged", { id, kind: "content", reduced: published?.reduced, reason: "edition rewrite restored" }, tx);
    });
    if (last.after.receiptId) await rejectReceivedResponse(last.after.receiptId, "restored by the editor");
    restored.push(id);
    log(`restored  ${id}  "${s.title}"`);
  }
  return correctPeriodCitations(key, restored, opts.reason, opts.actor);
}
