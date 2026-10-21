// The site's own article about a paper (industry/prompts/materia.md): written by the model from the abstract
// or from a full text that may be read but not republished, and rendered here as the item's body. The
// fields come back as plain text and are escaped here, so the model never writes HTML.
import { z } from "zod";
import { chatJson } from "@aihot/backend/providers/llm";
import { modelFor } from "@aihot/backend/editorial/models";
import { promptText, promptVersion } from "@aihot/backend/editorial/prompts";
import { authorLine, type Paper } from "./pubmed.ts";
import { LICENSE_NAMES, type OpenCopy } from "./access.ts";

export const MATERIA_STEP = "materia";
export const MATERIA_PURPOSE = "materia_article";
const VERSION = () => promptVersion("materia");
/** Full texts longer than this reach the model cut at a paragraph. */
const MAX_INPUT = 60_000;

const Output = z.object({
  titulo: z.string().min(10),
  linhaFina: z.string().default(""),
  lide: z.string().min(20),
  contexto: z.string().default(""),
  metodos: z.string().default(""),
  resultados: z.string().min(10),
  limitacoes: z.string().default(""),
  paraOPediatra: z.string().default(""),
  paraOEspecialista: z.string().default(""),
});
export type Materia = z.infer<typeof Output>;

/** What the model reads: the record's data and the text, the full one when there is one. */
export function materiaInput(paper: Paper, fullText: string | null): string {
  const abstract = paper.abstract.map((s) => (s.label ? `${s.label}: ${s.text}` : s.text)).join("\n");
  let text = fullText ?? abstract;
  if (text.length > MAX_INPUT) text = `${text.slice(0, text.lastIndexOf(" ", MAX_INPUT))} […]`;
  return [
    `Título original: ${paper.title}`,
    `Revista: ${paper.journal}${paper.year ? ` (${paper.year})` : ""}`,
    `Tipo de publicação: ${paper.publicationTypes.join(", ") || "não informado"}`,
    `Autores: ${authorLine(paper.authors, 6) || "não informado"}`,
    `Texto disponível: ${fullText ? "texto completo" : "somente o resumo"}`,
    "",
    text,
  ].join("\n");
}

export async function writeMateria(paper: Paper, fullText: string | null): Promise<{ materia: Materia; receiptId: number }> {
  const res = await chatJson({
    model: await modelFor(MATERIA_STEP),
    purpose: MATERIA_PURPOSE,
    subject: `pubmed:${paper.pmid}${fullText ? ":full" : ":abstract"}`,
    promptVersion: VERSION(),
    system: promptText("materia"),
    user: materiaInput(paper, fullText),
    schema: Output,
    temperature: 0.3,
    maxTokens: 4000,
    timeoutMs: 240_000,
  });
  return { materia: res.data, receiptId: res.receiptId };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const paragraphs = (s: string) => s.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join("");

function section(title: string, body: string): string {
  const html = paragraphs(body);
  return html ? `<h2>${esc(title)}</h2>${html}` : "";
}

/** The reference and where to read the paper, at the foot of every article. */
export function referenceBlock(paper: Paper, open: OpenCopy | null, basis: "full" | "abstract"): string {
  const cite = [esc(authorLine(paper.authors)), esc(paper.title) + ".", `<em>${esc(paper.journalAbbrev ?? paper.journal)}</em>${paper.year ? ` ${esc(paper.year)}` : ""}.`].filter(Boolean).join(" ");
  const links = [
    paper.doi ? `DOI: <a href="https://doi.org/${esc(paper.doi)}">${esc(paper.doi)}</a>` : "",
    `PubMed: <a href="https://pubmed.ncbi.nlm.nih.gov/${paper.pmid}/">${paper.pmid}</a>`,
  ].filter(Boolean).join(" · ");
  const access = open
    ? `<p><strong>Texto completo gratuito:</strong> <a href="${esc(open.url)}">${esc(open.url.replace(/^https?:\/\//, "").split("/")[0]!)}</a>${open.version === "submittedVersion" ? " (preprint, versão anterior à revisão por pares)" : open.version === "acceptedVersion" ? " (manuscrito aceito pelos autores)" : ""}${open.license ? `, licença ${LICENSE_NAMES[open.license]}` : ""}.</p>`
    : "<p><strong>Acesso:</strong> o artigo completo é pago na editora. Autores costumam enviar uma cópia a quem pede pelo e-mail de correspondência indicado no artigo.</p>";
  const note = basis === "abstract"
    ? "<p><em>Matéria escrita pelo Carina a partir do resumo publicado; o texto completo não estava disponível em acesso aberto.</em></p>"
    : "<p><em>Matéria escrita pelo Carina a partir do texto completo em acesso aberto.</em></p>";
  return `<h2>Referência</h2><p>${cite}</p><p>${links}</p>${access}${note}`;
}

export function renderMateria(m: Materia, paper: Paper, open: OpenCopy | null, basis: "full" | "abstract"): string {
  return [
    m.linhaFina.trim() ? `<p><strong>${esc(m.linhaFina.trim())}</strong></p>` : "",
    paragraphs(m.lide),
    section("Contexto", m.contexto),
    section("Como foi feito", m.metodos),
    section("O que encontraram", m.resultados),
    section("Limitações", m.limitacoes),
    section("Para o pediatra", m.paraOPediatra),
    section("Para o especialista", m.paraOEspecialista),
    referenceBlock(paper, open, basis),
  ].join("");
}
