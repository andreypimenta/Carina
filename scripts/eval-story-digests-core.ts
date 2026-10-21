// Story-digest evaluation cases, one event per JSONL line, written by hand or exported from the database
// (scripts/eval-story-digests.ts --stories); the site's digest input made from a case; and the comparison
// a run writes, as Markdown for reading.
import { z } from "zod";
import { byReportTime } from "@aihot/backend/events/digest";
import type { DigestReport } from "@aihot/backend/publication/story-evidence";

const ReportSchema = z.strictObject({
  id: z.string().min(1),
  publishedAt: z.iso.datetime({ offset: true }),
  source: z.string().min(1),
  firstParty: z.boolean().default(false),
  title: z.string().min(1),
  summary: z.string().nullable().default(null),
  fact: z.strictObject({
    id: z.number().int().positive(),
    subject: z.string().nullable().default(null),
    action: z.string().nullable().default(null),
    object: z.string().nullable().default(null),
    conditions: z.string().nullable().default(null),
    evidence: z.string().nullable().default(null),
    /** The analysis's structured fact: its conditions with source quotes, and its evidence. */
    structured: z.unknown().default(null),
  }),
});

const CaseSchema = z.strictObject({
  caseId: z.string().min(1),
  story: z.strictObject({ title: z.string().min(1), previousDigest: z.string().nullable().default(null) }),
  /**
   * incremental: the site's update, with previousDigest (if any) and the reports not in knownArticleIds
   * marked new; with neither, an event's first digest. corrected: rewritten from the reports as they are
   * now, without the previous digest, as after a correction.
   */
  inputMode: z.enum(["incremental", "corrected"]).default("incremental"),
  knownArticleIds: z.array(z.string().min(1)).default([]),
  reports: z.array(ReportSchema).min(1),
});

export type DigestEvalCase = z.infer<typeof CaseSchema>;

/** Blank lines and lines starting with // are skipped. */
export function parseDigestEvalJsonl(text: string): DigestEvalCase[] {
  const rows: DigestEvalCase[] = [];
  const ids = new Set<string>();
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    const line = index + 1;
    if (!raw.trim() || raw.trim().startsWith("//")) continue;
    let row: DigestEvalCase;
    try {
      row = CaseSchema.parse(JSON.parse(raw));
    } catch (error) {
      throw new Error(`line ${line}: ${error instanceof z.ZodError ? z.prettifyError(error) : String(error)}`);
    }
    if (ids.has(row.caseId)) throw new Error(`line ${line}: duplicate caseId ${row.caseId}`);
    ids.add(row.caseId);
    rows.push(row);
  }
  return rows;
}

/**
 * An event as the site rewrites its digest from its current reports (digestReports): without the
 * previous digest when it has saved one, the way a correction is rewritten; as a first digest otherwise.
 */
export function caseFromStory(story: { publicId: string; title: string; hasDigest: boolean }, reports: DigestReport[]): DigestEvalCase {
  return {
    caseId: story.publicId,
    story: { title: story.title, previousDigest: null },
    inputMode: story.hasDigest ? "corrected" : "incremental",
    knownArticleIds: [],
    reports: [...reports].sort(byReportTime).map((report) => ({
      id: report.id,
      publishedAt: report.at.toISOString(),
      source: report.source_name,
      firstParty: report.first_party,
      title: report.title,
      summary: report.summary,
      fact: {
        id: report.fact_id,
        subject: report.fact_subject,
        action: report.fact_action,
        object: report.fact_object,
        conditions: report.fact_conditions,
        evidence: report.evidence,
        structured: report.structured_fact ?? null,
      },
    })),
  };
}

/** The case as buildStoryDigestInput's arguments. */
export function toDigestInput(row: DigestEvalCase) {
  return {
    story: { title: row.story.title, digest: row.story.previousDigest },
    reports: row.reports.map((report): Omit<DigestReport, "story_id"> => ({
      id: report.id,
      title: report.title,
      summary: report.summary,
      source_name: report.source,
      first_party: report.firstParty,
      at: new Date(report.publishedAt),
      fact_id: report.fact.id,
      fact_subject: report.fact.subject,
      fact_action: report.fact.action,
      fact_object: report.fact.object,
      fact_conditions: report.fact.conditions,
      evidence: report.fact.evidence,
      structured_fact: report.fact.structured,
    })).sort(byReportTime),
    corrected: row.inputMode === "corrected",
    knownArticleIds: row.knownArticleIds,
  };
}

export function inputForm(row: DigestEvalCase): string {
  if (row.inputMode === "corrected") return "reescrita após correção (sem o panorama anterior)";
  return row.story.previousDigest ? "atualização incremental (com o panorama anterior)" : "primeira redação";
}

export interface DigestCall {
  title: string | null;
  digest: string | null;
  receiptId: number | null;
  reused: boolean;
  tokensIn: number;
  tokensOut: number;
  avgLatencyMs: number;
  error: string | null;
}

export interface DigestPromptSummary {
  calls: number;
  succeeded: number;
  errors: number;
  reused: number;
  tokensIn: number;
  tokensOut: number;
  avgLatencyMs: number;
}

/** What a run writes: per model, each case's call with the site's prompt beside the candidate's. */
export interface DigestEvalReport {
  meta: {
    createdAt: string;
    cases: string;
    calls: number;
    prompts: { live: { version: string }; candidate?: { file: string; version: string } };
  };
  models: Record<string, {
    summary: { live: DigestPromptSummary; candidate?: DigestPromptSummary; wallSeconds: number };
    cases: Array<{ caseId: string; storyTitle: string; input: string; reports: number; live: DigestCall; candidate?: DigestCall }>;
  }>;
}

const PROMPTS = [["live", "prompt em produção"], ["candidate", "prompt candidato"]] as const;

const usage = (call: { receiptId: number | null; reused: boolean; tokensIn: number; tokensOut: number }) =>
  `${call.receiptId === null ? "sem recibo" : `recibo #${call.receiptId}`} · entrada ${call.tokensIn} tokens · saída ${call.tokensOut} tokens${call.reused ? " · resultado já recebido reaproveitado" : ""}`;

/** The report for reading: every case's answers one after another, line breaks kept. */
export function digestComparisonMarkdown(report: DigestEvalReport): string {
  const { meta } = report;
  const lines = [
    "# Comparação de prompts do panorama de eventos",
    "",
    `- Gerado em: ${meta.createdAt}`,
    `- Casos: ${meta.cases}`,
    `- Prompt em produção: ${meta.prompts.live.version}`,
    ...(meta.prompts.candidate ? [`- Prompt candidato: ${meta.prompts.candidate.file} (${meta.prompts.candidate.version})`] : []),
    `- Chamadas ao modelo: ${meta.calls}`,
  ];
  for (const [model, run] of Object.entries(report.models)) {
    for (const [key, label] of PROMPTS) {
      const summary = run.summary[key];
      if (summary) lines.push(`- ${model} · ${label}: sucesso ${summary.succeeded}/${summary.calls}, entrada ${summary.tokensIn} tokens, saída ${summary.tokensOut} tokens, ${summary.reused} resultados já recebidos reaproveitados`);
    }
  }
  const runs = Object.entries(report.models);
  for (const [index, item] of (runs[0]?.[1].cases ?? []).entries()) {
    lines.push("", `## ${index + 1}. ${item.storyTitle}`, "", `Caso \`${item.caseId}\` · ${item.reports} matérias · ${item.input}`);
    for (const [model, run] of runs) {
      for (const [key, label] of PROMPTS) {
        const call = run.cases[index]![key];
        if (!call) continue;
        lines.push("", `### ${label} · ${model}`, "");
        if (call.error !== null || call.digest === null) lines.push(`Falha ao gerar: ${call.error}`);
        else lines.push(`**${call.title || "(mantém o título do evento)"}**`, "", ...call.digest.split("\n").map((line) => (line ? `> ${line}  ` : ">")));
        lines.push("", usage(call));
      }
    }
  }
  return `${lines.join("\n")}\n`;
}
