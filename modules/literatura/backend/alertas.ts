// Regulatory alerts on pediatric airway and respiratory devices (tracheostomy cannulas, tubes, bronchoscopes,
// home ventilation and its circuits, suction, extracorporeal support, airway obstruction devices), from official
// sources a server can read openly (industry/alertas.json): openFDA's device recalls and 510(k) clearances, and
// Anvisa's news on medical devices (its site's open search). FDA's RSS feeds (its device safety communications
// among them) answer a server with a bot block, Anvisa's technovigilance alerts are a JavaScript app that refuses
// one, and EMA publishes no device alerts: those are left out, not worked around, so safety communications and
// labeling changes reach the site only when openFDA's records or Anvisa's news carry them. An act that names a device of the list is read by
// the model (industry/prompts/alerta.md), which keeps it only when the device is used in children's airway or
// respiratory care and sorts it (recall or field action, safety communication, authorization, labeling change);
// it becomes a short alert linking the official act, labelled as a regulatory act in its title and never
// presented as evidence of efficacy. Each act is read once (literatura_alertas).
import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { SITE } from "@aihot/site";
import { beijingDate } from "@aihot/contracts/time";
import { config, REPO_ROOT } from "@aihot/backend/config";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { sanitizeBody } from "@aihot/backend/content/sanitize";
import { sql } from "@aihot/backend/db";
import { modelFor } from "@aihot/backend/editorial/models";
import { promptText, promptVersion } from "@aihot/backend/editorial/prompts";
import { queueProcessing } from "@aihot/backend/jobs/content";
import { guardedFetch } from "@aihot/backend/lib/http-fetch";
import { chatJson } from "@aihot/backend/providers/llm";
import { completeReceipt } from "@aihot/backend/providers/receipts";
import { blockText } from "./access.ts";
import { entryTime } from "./collect.ts";
import { saveConfianca } from "./confianca.ts";
import { MATERIA_STEP } from "./materia.ts";
import { CATEGORIAS_ALERTA, type CategoriaAlerta, type Confianca } from "../confianca.ts";

export const ALERTA_SOURCE = "alertas-regulatorios";
export const ALERTA_PURPOSE = "alerta_regulatorio";

export interface AlertasSettings {
  days: number;
  perRun: number;
  productCodes: string[];
  fdaTerms: string[];
  anvisaSubject: string;
  devicePatterns: string[];
  elso: { url: string; pediatric: string };
}

export function alertasSettings(): AlertasSettings {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "industry/alertas.json"), "utf8")) as AlertasSettings;
}

const OPENFDA = () => (process.env.OPENFDA_BASE_URL ?? "https://api.fda.gov").replace(/\/$/, "");
const ANVISA = () => (process.env.ANVISA_BASE_URL ?? "https://www.gov.br/anvisa/++api++").replace(/\/$/, "");
const ACCESSDATA = "https://www.accessdata.fda.gov/scripts/cdrh/cfdocs";

/** An official act as the model reads it. */
export interface Ato {
  key: string;
  orgao: "FDA" | "Anvisa";
  /** What the record is, for the model: "recolhimento de dispositivo (openFDA)". */
  tipo: string;
  title: string;
  text: string;
  /** The official page of the act. */
  url: string;
  /** The act's date, YYYY-MM-DD. */
  date: string;
  /** FDA filed it under a product code of the list: the device is on the list whatever its description says. */
  listed?: boolean;
}

const line = (label: string, value: unknown) => (typeof value === "string" && value.trim() ? `${label}: ${value.replace(/\s+/g, " ").trim().slice(0, 1500)}` : "");
const lines = (...xs: string[]) => xs.filter(Boolean).join("\n");
const ymd = (d: string) => d.replaceAll("-", "");

/** One openFDA search: its results, none when it finds nothing (openFDA answers 404 then). */
async function openFda<T>(endpoint: string, search: string, sort: string): Promise<T[]> {
  const res = await guardedFetch(`${OPENFDA()}/device/${endpoint}.json?search=${search}&sort=${sort}:desc&limit=100`, { timeoutMs: 30_000 });
  if (res.status === 404) return [];
  if (res.status !== 200) throw new Error(`openFDA ${endpoint} HTTP ${res.status}`);
  return (JSON.parse(res.text()) as { results?: T[] }).results ?? [];
}

/** "(product_code:BTO+product_code:EOQ+product_description:suction)": openFDA ORs terms joined by "+". */
function anyOf(cfg: AlertasSettings, textField: string): string {
  return `(${[...cfg.productCodes.map((c) => `product_code:${c}`), ...cfg.fdaTerms.map((t) => `${textField}:${encodeURIComponent(t)}`)].join("+")})`;
}

interface FdaRecall {
  product_res_number?: string; cfres_id?: string; res_event_number?: string; recalling_firm?: string; product_description?: string; code_info?: string;
  reason_for_recall?: string; action?: string; recall_status?: string; event_date_initiated?: string; event_date_posted?: string; product_code?: string;
  openfda?: { device_name?: string };
}

/**
 * The device recalls FDA posted in the window, on the listed product codes or naming a listed device: one act per
 * recall event, with the products FDA lists under it (one record per model or size), linked to the first one's page.
 */
export async function fdaRecalls(cfg: AlertasSettings, from: string, to: string): Promise<Ato[]> {
  const rows = await openFda<FdaRecall>("recall", `event_date_posted:[${from}+TO+${to}]+AND+${anyOf(cfg, "product_description")}`, "event_date_posted");
  const events = new Map<string, FdaRecall[]>();
  for (const r of rows.filter((r) => r.product_res_number && r.cfres_id && r.event_date_posted)) {
    const id = r.res_event_number ?? r.product_res_number!;
    events.set(id, [...(events.get(id) ?? []), r]);
  }
  return [...events].map(([id, records]) => {
    const r = records[0]!;
    const products = records.slice(0, 12).map((x) => lines(line("Número do recolhimento", x.product_res_number), line("Produto", x.product_description), line("Lotes e códigos", x.code_info)));
    return {
      key: `fda-recall:${id}`,
      orgao: "FDA",
      tipo: "recolhimento de dispositivo médico (base de recolhimentos da FDA, openFDA)",
      title: (r.product_description ?? "").replace(/\s+/g, " ").trim().slice(0, 200),
      text: lines(
        line("Evento de recolhimento", id), line("Empresa", r.recalling_firm), line("Tipo de dispositivo (FDA)", r.openfda?.device_name), line("Código de produto", r.product_code),
        `Produtos (${records.length}):\n${products.join("\n")}${records.length > 12 ? "\n…" : ""}`,
        line("Motivo", r.reason_for_recall), line("Ação orientada pela empresa", r.action), line("Situação", r.recall_status),
        line("Início do recolhimento", r.event_date_initiated), line("Publicado pela FDA em", r.event_date_posted),
      ),
      url: `${ACCESSDATA}/cfRES/res.cfm?id=${encodeURIComponent(r.cfres_id!)}`,
      date: r.event_date_posted!,
      listed: records.some((x) => cfg.productCodes.includes(x.product_code ?? "")),
    } satisfies Ato;
  });
}

interface Fda510k {
  k_number?: string; applicant?: string; device_name?: string; product_code?: string; decision_date?: string; decision_description?: string;
  clearance_type?: string; statement_or_summary?: string; openfda?: { device_name?: string };
}

/** The 510(k) clearances FDA decided in the window, on the listed product codes or naming a listed device. */
export async function fdaClearances(cfg: AlertasSettings, from: string, to: string): Promise<Ato[]> {
  const rows = await openFda<Fda510k>("510k", `decision_date:[${ymd(from)}+TO+${ymd(to)}]+AND+${anyOf(cfg, "device_name")}`, "decision_date");
  return rows.filter((r) => r.k_number && r.decision_date).map((r) => ({
    key: `fda-510k:${r.k_number}`,
    orgao: "FDA",
    tipo: "autorização de comercialização 510(k) de dispositivo médico (FDA, openFDA)",
    title: (r.device_name ?? "").replace(/\s+/g, " ").trim().slice(0, 200),
    text: lines(
      line("Número", r.k_number), line("Requerente", r.applicant), line("Dispositivo", r.device_name), line("Tipo de dispositivo (FDA)", r.openfda?.device_name),
      line("Código de produto", r.product_code), line("Decisão", r.decision_description), line("Data da decisão", r.decision_date), line("Tipo de autorização", r.clearance_type),
    ),
    url: `${ACCESSDATA}/cfpmn/pmn.cfm?ID=${encodeURIComponent(r.k_number!)}`,
    date: r.decision_date!.length === 8 ? `${r.decision_date!.slice(0, 4)}-${r.decision_date!.slice(4, 6)}-${r.decision_date!.slice(6)}` : r.decision_date!,
    listed: cfg.productCodes.includes(r.product_code ?? ""),
  }));
}

/** JSON from Anvisa's site; its maintenance page is HTML with status 200, so the type is checked. */
async function anvisaJson<T>(url: string): Promise<T> {
  const res = await guardedFetch(url, { timeoutMs: 30_000 });
  if (res.status !== 200 || !/json/i.test(res.headers.get("content-type") ?? "")) throw new Error(`Anvisa HTTP ${res.status} ${res.headers.get("content-type") ?? ""}`);
  return JSON.parse(res.text()) as T;
}

interface AnvisaPage {
  title?: string; description?: string; effective?: string;
  blocks?: Record<string, { plaintext?: string }>; blocks_layout?: { items?: string[] };
}

/** An Anvisa news page's text, its blocks in their order. */
export function anvisaText(page: AnvisaPage): string {
  const order = page.blocks_layout?.items ?? Object.keys(page.blocks ?? {});
  return [page.description ?? "", ...order.map((id) => page.blocks?.[id]?.plaintext ?? "")].map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
}

/** Anvisa's news on medical devices published since `from` (its site's open search), each with its text. */
export async function anvisaNews(cfg: AlertasSettings, from: string, known: Set<string>): Promise<Ato[]> {
  const params = new URLSearchParams({ portal_type: "News Item", Subject: cfg.anvisaSubject, sort_on: "effective", sort_order: "descending", b_size: "25" });
  params.append("metadata_fields", "effective");
  const list = await anvisaJson<{ items?: Array<{ "@id"?: string; title?: string; effective?: string }> }>(`${ANVISA()}/pt-br/@search?${params}`);
  const out: Ato[] = [];
  for (const item of list.items ?? []) {
    const url = item["@id"];
    if (!url || !item.effective || beijingDate(item.effective) < from || known.has(`anvisa:${url}`)) continue;
    const page = await anvisaJson<AnvisaPage>(url.replace(/^https:\/\/www\.gov\.br\/anvisa\//, `${ANVISA()}/`));
    out.push({ key: `anvisa:${url}`, orgao: "Anvisa", tipo: "notícia da Anvisa sobre dispositivos médicos", title: (page.title ?? item.title ?? "").trim(), text: anvisaText(page), url, date: beijingDate(item.effective) });
  }
  return out;
}

/** An act on a listed FDA product code, or that names a device of the list. */
export function namesDevice(cfg: AlertasSettings, ato: Pick<Ato, "title" | "text" | "listed">): boolean {
  return !!ato.listed || cfg.devicePatterns.some((p) => new RegExp(p, "i").test(`${ato.title}\n${ato.text}`));
}

const optional = z.string().nullish().transform((v) => v ?? "");
const AlertaOutput = z.object({
  relevante: z.boolean(),
  categoria: z.string().nullish().transform((v): CategoriaAlerta | null => ((CATEGORIAS_ALERTA as readonly string[]).includes(v?.trim() ?? "") ? (v!.trim() as CategoriaAlerta) : null)),
  titulo: optional,
  linhaFina: optional,
  corpo: optional,
});
export type Alerta = z.infer<typeof AlertaOutput>;

export function alertaInput(ato: Ato): string {
  return [`Órgão: ${ato.orgao}`, `O que é o registro: ${ato.tipo}`, `Data: ${ato.date}`, `Endereço oficial: ${ato.url}`, `Título: ${ato.title || "não informado"}`, "", ato.text].join("\n");
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const paragraphs = (s: string) => s.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join("");
const ORGAO_NOME = { FDA: "FDA (Food and Drug Administration, EUA)", Anvisa: "Anvisa (Agência Nacional de Vigilância Sanitária)" };

/** The alert's body: what the act says, the official act, and that a regulatory act is not evidence of efficacy. */
export function renderAlerta(a: Alerta, ato: Ato): string {
  const [y, m, d] = ato.date.split("-");
  return [
    a.linhaFina.trim() ? `<p><strong>${esc(a.linhaFina.trim())}</strong></p>` : "",
    paragraphs(a.corpo),
    `<h2>Fonte oficial</h2><p>${esc(ORGAO_NOME[ato.orgao])}: <a href="${esc(ato.url)}">${esc(ato.title || ato.url)}</a> (${d}/${m}/${y}).</p>`,
    `<p><em>Ato regulatório, não evidência de eficácia nem de segurança clínica do produto.</em></p>`,
  ].join("");
}

async function record(key: string, status: string, articleId: string | null = null): Promise<void> {
  await sql`INSERT INTO literatura_alertas (key, status, article_id) VALUES (${key}, ${status}, ${articleId}) ON CONFLICT (key) DO UPDATE SET status = EXCLUDED.status, article_id = EXCLUDED.article_id`;
}

/** One act read by the model: an alert article, or recorded as not about a pediatric airway device. */
export async function takeAto(ato: Ato, now = new Date()): Promise<string> {
  const res = await chatJson({
    model: await modelFor(MATERIA_STEP),
    purpose: ALERTA_PURPOSE,
    subject: ato.key,
    promptVersion: promptVersion("alerta"),
    system: promptText("alerta"),
    user: alertaInput(ato),
    schema: AlertaOutput,
    temperature: 0.2,
    maxTokens: 1500,
    timeoutMs: 120_000,
  });
  const a = res.data;
  if (!a.relevante || !a.categoria || a.titulo.trim().length < 10 || a.corpo.trim().length < 20) {
    await completeReceipt(sql, res.receiptId);
    await record(ato.key, "irrelevante");
    return "irrelevante";
  }
  const html = sanitizeBody(renderAlerta(a, ato), ato.url);
  const confianca: Confianca = {
    feitura: "alerta", minuto: null, populacao: null, desenho: null, desenhoDetalhe: null, limitacao: null, textoLido: "pagina-oficial", preprint: false, datas: null,
    alerta: { orgao: ato.orgao, categoria: a.categoria },
  };
  await sql.begin(async (tx) => {
    const m = await upsertMaterial({
      sourceId: ALERTA_SOURCE, url: ato.url, title: a.titulo.trim(), author: ato.orgao, language: "pt", publishedAt: entryTime(ato.date, now),
      excerpt: a.linhaFina.trim() || null, bodyHtml: html, bodyText: blockText(html), bodyStatus: "ok", raw: { alerta: ato.key, orgao: ato.orgao, categoria: a.categoria },
      via: "literatura", staleOnDiscovery: false,
    }, tx);
    await completeReceipt(tx, res.receiptId);
    await saveConfianca(tx, m.articleId, confianca);
    await tx`INSERT INTO literatura_alertas (key, status, article_id) VALUES (${ato.key}, 'alerta', ${m.articleId}) ON CONFLICT (key) DO UPDATE SET status = EXCLUDED.status, article_id = EXCLUDED.article_id`;
    if (m.created || m.revised || m.processingNeeded) await queueProcessing(m.articleId, { db: tx });
  });
  return "alerta";
}

/**
 * The run: each source's acts of the window not read yet, those naming a listed device read by the model up to
 * the run's share (the rest wait for the next run while in the window). A source that fails is left to the next run.
 */
export async function collectAlertas(opts: { now?: Date; cfg?: AlertasSettings } = {}): Promise<Record<string, unknown>> {
  const now = opts.now ?? new Date();
  const cfg = opts.cfg ?? alertasSettings();
  const [source] = await sql<{ enabled: boolean }[]>`SELECT enabled FROM sources WHERE id = ${ALERTA_SOURCE}`;
  if (!source?.enabled) return { paused: true };
  if (!config.modelCallsEnabled) return { waiting: "model" };
  const to = beijingDate(now);
  const from = beijingDate(now.getTime() - cfg.days * 86_400_000);
  const known = new Set((await sql<{ key: string }[]>`SELECT key FROM literatura_alertas WHERE created_at > now() - make_interval(days => ${cfg.days + 7})`).map((r) => r.key));
  const counts: Record<string, number> = {};
  const failed: string[] = [];
  const atos: Ato[] = [];
  for (const [name, read] of [["fda-recall", () => fdaRecalls(cfg, from, to)], ["fda-510k", () => fdaClearances(cfg, from, to)], ["anvisa", () => anvisaNews(cfg, from, known)]] as const) {
    try {
      atos.push(...(await read()));
    } catch (error) {
      failed.push(name);
      console.error(`literatura: alertas ${name}: ${(error as Error).message}`);
    }
  }
  let read = 0;
  for (const ato of atos) {
    if (known.has(ato.key)) continue;
    known.add(ato.key);
    if (!namesDevice(cfg, ato)) {
      await record(ato.key, "sem-dispositivo");
      counts["sem-dispositivo"] = (counts["sem-dispositivo"] ?? 0) + 1;
      continue;
    }
    if (read >= cfg.perRun) break;
    read++;
    try {
      const status = await takeAto(ato, now);
      counts[status] = (counts[status] ?? 0) + 1;
    } catch (error) {
      counts.erro = (counts.erro ?? 0) + 1;
      console.error(`literatura: alerta ${ato.key}: ${(error as Error).message}`);
    }
  }
  if (failed.length < 3) await sql`UPDATE sources SET last_fetch_at = now(), last_ok_at = now() WHERE id = ${ALERTA_SOURCE}`;
  return { found: atos.length, failed, ...counts };
}
