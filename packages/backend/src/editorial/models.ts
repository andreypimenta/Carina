// Model per capability: the code default (the site's choice in site/models.ts, else `default`, the deployment's
// own model), an environment override, and an admin switch kept in settings (every switch is audited).
// Read at call time and cached for a minute, so a switch applies to the next call without a restart; a
// changed model only affects work done from then on (history is not re-judged).
import { DEFAULTS } from "@aihot/site/models";
import { sql } from "../db.ts";
import { serverModules } from "../modules.ts";
import { MODELS } from "../providers/llm.ts";

export interface Capability {
  /** The step's name on the admin page, with an explanation in brackets, " (…)" (or full-width "（…）"), if it needs one; alerts use the name alone. */
  label: string;
  env: string;
  default: string;
  /** Receipt purposes this capability produces (for the admin statistics). */
  purposes: string[];
  /** The step needs a model that reads images. */
  vision?: boolean;
}

export const CAPABILITIES = {
  prefilter: { label: "Pré-filtro da Seleção (o material é do setor? recall amplo)", env: "PREFILTER_MODEL", default: DEFAULTS.prefilter ?? "default", purposes: ["prefilter_article"] },
  score: { label: "Nota da Seleção (duas notas independentes, contra o limiar do nível da fonte)", env: "SCORE_MODEL", default: DEFAULTS.score ?? "default", purposes: ["score_article"] },
  understand: { label: "Compreensão do conteúdo (título, resumo e \"por que ler\" dos selecionados e quase selecionados; vê a primeira imagem quando o modelo lê imagens)", env: "UNDERSTAND_MODEL", default: DEFAULTS.understand ?? "default", purposes: ["understand_article"] },
  summarize: { label: "Título e resumo (título e resumo em português dos demais artigos)", env: "SUMMARIZE_MODEL", default: DEFAULTS.summarize ?? "default", purposes: ["summarize_article"] },
  structure: { label: "Extração estruturada (categoria, tags, empresas envolvidas, fato do evento; não escreve texto para o leitor)", env: "STRUCTURE_MODEL", default: DEFAULTS.structure ?? "default", purposes: ["structure_article"] },
  group: { label: "Agrupamento em eventos (relação da matéria nova com os fatos candidatos: mesma ocorrência, desdobramento do mesmo evento ou sem relação; se dois eventos ligados por uma mesma matéria são um só)", env: "GROUP_MODEL", default: DEFAULTS.group ?? "default", purposes: ["group_article", "group_signal", "group_story"] },
  groupReview: { label: "Revisão do agrupamento (fusões com similaridade baixa e fusões de dois eventos, relidas antes de gravar; de preferência com outro fornecedor de modelo)", env: "GROUP_REVIEW_MODEL", default: DEFAULTS.groupReview ?? "default", purposes: ["group_review", "group_story_review"] },
  digest: { label: "Panorama do evento", env: "DIGEST_MODEL", default: DEFAULTS.digest ?? "default", purposes: ["story_digest"] },
  // Dailies are computed by rule; report_lead and report_daily remain for their older receipts.
  report: { label: "Apresentação e seções dos briefings semanal e mensal (o Briefing diário é calculado por regra, sem modelo)", env: "REPORT_MODEL", default: DEFAULTS.report ?? "default", purposes: ["report_weekly", "report_monthly", "report_lead", "report_daily"] },
  translate: { label: "Tradução do texto integral da Seleção (inclui posts citados)", env: "TRANSLATE_MODEL", default: DEFAULTS.translate ?? "default", purposes: ["translate_body", "translate_quoted"] },
} satisfies Record<string, Capability>;

export type CapabilityKey = keyof typeof CAPABILITIES;

/** Every step: the engine's, then the installed modules' (their defaults also from site/models.ts). */
export function capabilities(): Record<string, Capability> {
  const all: Record<string, Capability> = { ...CAPABILITIES };
  for (const m of serverModules()) for (const [key, step] of Object.entries(m.models ?? {})) all[key] = { ...step, default: DEFAULTS[key] ?? "default" };
  return all;
}

/** Names of the steps whose default model belongs to a service: what stops when that service refuses us. */
export function stepsOnService(service: string): string[] {
  return Object.values(capabilities())
    .filter((c) => MODELS[c.default]?.service === service)
    .map((c) => c.label.split(/ \(|（/)[0]!);
}

let cache: { at: number; overrides: Record<string, string> } | null = null;

async function overrides(): Promise<Record<string, string>> {
  if (cache && Date.now() - cache.at < 60_000) return cache.overrides;
  const rows = await sql<{ key: string; value: { model?: string } }[]>`SELECT key, value FROM settings WHERE key LIKE 'models.%'`;
  const map: Record<string, string> = {};
  for (const r of rows) if (r.value?.model && MODELS[r.value.model]) map[r.key.slice("models.".length)] = r.value.model;
  cache = { at: Date.now(), overrides: map };
  return map;
}

export function invalidateModelCache() {
  cache = null;
}

/** Whether a registered model explicitly declares image input support. Unspecified means text-only. */
export function modelSupportsVision(model: string): boolean {
  return MODELS[model]?.vision === true;
}

/** Whether a step can use a registered model. A model that reads images writes text as well. */
export function capabilityAcceptsModel(capability: Capability, model: { vision?: boolean }): boolean {
  return !capability.vision || model.vision === true;
}

/** The model a capability uses now: admin switch, else environment, else the code default. */
export async function modelFor(capability: CapabilityKey | (string & {})): Promise<string> {
  const c = capabilities()[capability];
  if (!c) throw new Error(`unknown model step: ${capability}`);
  const chosen = (await overrides())[capability] ?? process.env[c.env] ?? c.default;
  return MODELS[chosen] ? chosen : c.default;
}

/** Where the current choice comes from, for the admin page. */
export async function modelSources(): Promise<Record<string, { model: string; source: "admin" | "env" | "default" }>> {
  const o = await overrides();
  const out: Record<string, { model: string; source: "admin" | "env" | "default" }> = {};
  for (const [key, c] of Object.entries(capabilities())) {
    if (o[key]) out[key] = { model: o[key]!, source: "admin" };
    else if (process.env[c.env] && MODELS[process.env[c.env]!]) out[key] = { model: process.env[c.env]!, source: "env" };
    else out[key] = { model: c.default, source: "default" };
  }
  return out;
}
