// The site's own article about a paper (industry/prompts/materia.md): written by the model from the abstract
// or from a full text that may be read but not republished, and rendered here as the item's body. The
// fields come back as plain text and are escaped here, so the model never writes HTML.
import { z } from "zod";
import { SITE } from "@aihot/site";
import { chatJson } from "@aihot/backend/providers/llm";
import { modelFor } from "@aihot/backend/editorial/models";
import { promptText, promptVersion } from "@aihot/backend/editorial/prompts";
import { authorLine, type Paper } from "./pubmed.ts";
import { LICENSE_NAMES, type Access } from "./access.ts";

export const MATERIA_STEP = "materia";
export const MATERIA_PURPOSE = "materia_article";
const VERSION = () => promptVersion("materia");
/** Full texts longer than this reach the model cut at a paragraph. */
const MAX_INPUT = 60_000;

/** Optional sections: models often answer null or leave them out when the paper does not support them. */
const optional = z.string().nullish().transform((v) => v ?? "");
const Output = z.object({
  titulo: z.string().min(10),
  linhaFina: optional,
  lide: z.string().min(20),
  contexto: optional,
  metodos: optional,
  resultados: z.string().min(10),
  limitacoes: optional,
  paraOPediatra: optional,
  paraOEspecialista: optional,
});
export type Materia = z.infer<typeof Output>;

/** What the model reads: the record's data and the text, the full one when there is one, and whether it was cut. */
export function materiaInput(paper: Paper, fullText: string | null): string {
  const abstract = paper.abstract.map((s) => (s.label ? `${s.label}: ${s.text}` : s.text)).join("\n");
  let text = fullText ?? abstract;
  const cut = text.length > MAX_INPUT;
  if (cut) text = `${text.slice(0, text.lastIndexOf(" ", MAX_INPUT))} […]`;
  const available = !fullText ? "somente o resumo" : cut ? "texto completo, cortado no fim por tamanho (o que falta pode incluir parte da discussão; não afirme que algo não foi informado só porque não aparece aqui)" : "texto completo";
  return [
    `Título original: ${paper.title}`,
    `Revista: ${paper.journal}${paper.year ? ` (${paper.year})` : ""}`,
    `Tipo de publicação: ${paper.publicationTypes.join(", ") || "não informado"}`,
    `Autores: ${authorLine(paper.authors, 6) || "não informado"}`,
    `Texto disponível: ${available}`,
    "",
    text,
  ].join("\n");
}

export async function writeMateria(paper: Paper, fullText: string | null): Promise<{ materia: Materia; receiptId: number }> {
  const res = await chatJson({
    model: await modelFor(MATERIA_STEP),
    purpose: MATERIA_PURPOSE,
    subject: `${paper.pmid ? `pubmed:${paper.pmid}` : paper.doi ? `doi:${paper.doi}` : `url:${paper.url}`}${fullText ? ":full" : ":abstract"}`,
    promptVersion: VERSION(),
    system: promptText("materia"),
    user: materiaInput(paper, fullText),
    schema: Output,
    temperature: 0.3,
    maxTokens: 4000,
    // Inside the worker's shutdown drain (jobs/queue.ts), so a stop never leaves the receipt unknown.
    timeoutMs: 180_000,
  });
  return { materia: res.data, receiptId: res.receiptId };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const paragraphs = (s: string) => s.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join("");

function section(title: string, body: string): string {
  const html = paragraphs(body);
  return html ? `<h2>${esc(title)}</h2>${html}` : "";
}

/**
 * The reference and where to read the paper, at the foot of every article. Only what is known is said:
 * a free copy Unpaywall or PMC has, "paid" only when Unpaywall says there is no open copy, nothing otherwise.
 */
export function referenceBlock(paper: Paper, access: Access, pmcid: string | null, basis: "full" | "abstract" | "integral"): string {
  const authors = authorLine(paper.authors);
  const cite = [authors ? `${esc(authors)}.` : "", esc(paper.title) + ".", `<em>${esc(paper.journalAbbrev ?? paper.journal)}</em>${paper.year ? ` ${esc(paper.year)}` : ""}.`].filter(Boolean).join(" ");
  const links = [
    paper.doi ? `DOI: <a href="https://doi.org/${esc(paper.doi)}">${esc(paper.doi)}</a>` : "",
    paper.pmid ? `PubMed: <a href="https://pubmed.ncbi.nlm.nih.gov/${paper.pmid}/">${paper.pmid}</a>` : "",
    !paper.doi && !paper.pmid && paper.url ? `Artigo: <a href="${esc(paper.url)}">${esc(paper.url.replace(/^https?:\/\//, "").split("/")[0]!)}</a>` : "",
  ].filter(Boolean).join(" · ");
  const copy = access.kind === "open" ? access.copy : pmcid ? { url: `https://europepmc.org/article/PMC/${pmcid}`, license: null, host: "repository", version: null } : null;
  const accessLine = copy
    ? `<p><strong>Texto completo gratuito:</strong> <a href="${esc(copy.url)}">${esc(copy.url.replace(/^https?:\/\//, "").split("/")[0]!)}</a>${copy.version === "submittedVersion" ? " (preprint, versão anterior à revisão por pares)" : copy.version === "acceptedVersion" ? " (manuscrito aceito pelos autores)" : ""}${copy.license ? `, licença ${LICENSE_NAMES[copy.license]}` : ""}.</p>`
    : access.kind === "closed"
      ? "<p><strong>Acesso:</strong> o artigo completo é pago na editora. Autores costumam enviar uma cópia a quem pede pelo e-mail de correspondência indicado no artigo.</p>"
      : "";
  const note = basis === "integral" ? ""
    : basis === "full" ? `<p><em>Matéria escrita pelo ${esc(SITE.bareName)} a partir do texto completo em acesso aberto.</em></p>`
    : `<p><em>Matéria escrita pelo ${esc(SITE.bareName)} a partir do resumo publicado.</em></p>`;
  return `<h2>Referência</h2><p>${cite}</p><p>${links}</p>${accessLine}${note}`;
}

export function renderMateria(m: Materia, paper: Paper, access: Access, pmcid: string | null, basis: "full" | "abstract"): string {
  return [
    m.linhaFina.trim() ? `<p><strong>${esc(m.linhaFina.trim())}</strong></p>` : "",
    paragraphs(m.lide),
    section("Contexto", m.contexto),
    section("Como foi feito", m.metodos),
    section("O que encontraram", m.resultados),
    section("Limitações", m.limitacoes),
    section("Para o pediatra", m.paraOPediatra),
    section("Para o especialista", m.paraOEspecialista),
    referenceBlock(paper, access, pmcid, basis),
  ].join("");
}
