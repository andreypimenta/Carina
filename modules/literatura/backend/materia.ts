// The site's own article about a paper (industry/prompts/materia.md): written by the model from the abstract
// or from a full text that may be read but not republished, and rendered here as the item's body. The
// fields come back as plain text and are escaped here, so the model never writes HTML.
import { z } from "zod";
import { SITE } from "@aihot/site";
import { chatJson } from "@aihot/backend/providers/llm";
import { modelFor } from "@aihot/backend/editorial/models";
import { promptText, promptVersion } from "@aihot/backend/editorial/prompts";
import { beijingDate } from "@aihot/contracts/time";
import { authorLine, isGuideline, isPreprint, type Paper } from "./pubmed.ts";
import { LICENSE_NAMES, type Access } from "./access.ts";
import { DESENHOS, IMPLICACOES, PREPRINT_LABEL, type Confianca, type Desenho, type EmUmMinuto, type Implicacao, type TextoLido } from "../confianca.ts";

export const MATERIA_STEP = "materia";
export const MATERIA_PURPOSE = "materia_article";
const VERSION = () => promptVersion("materia");
/** Full texts longer than this reach the model cut at a paragraph. */
const MAX_INPUT = 60_000;

/** Optional sections: models often answer null or leave them out when the paper does not support them. */
const optional = z.string().nullish().transform((v) => v ?? "");
/** An answer outside the list counts as the most cautious grade, "nao". */
const grade = z.string().nullish().transform((v): Implicacao => ((IMPLICACOES as readonly string[]).includes(v?.trim() ?? "") ? (v!.trim() as Implicacao) : "nao"));
const design = z.string().nullish().transform((v): Desenho | null => ((DESENHOS as readonly string[]).includes(v?.trim() ?? "") ? (v!.trim() as Desenho) : null));
/** "Em um minuto" (industry/prompts/materia.md, materia-fonte.md). */
const minuto = { achado: optional, paraQuem: optional, mudaAlgo: grade, diretriz: optional };
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
  ...minuto,
  populacaoIdade: optional,
  populacaoDoenca: optional,
  populacaoCenario: optional,
  desenho: design,
  desenhoDetalhe: optional,
  limitacaoPrincipal: optional,
});
export type Materia = z.infer<typeof Output>;

/**
 * The grade the site shows: a preprint never changes anything yet, and "alinhado a diretriz" needs the guideline
 * the material names; without it the grade drops to "pode informar a discussão".
 */
export function emUmMinuto(m: { achado: string; paraQuem: string; mudaAlgo: Implicacao; diretriz: string }, preprint: boolean): EmUmMinuto | null {
  const achado = m.achado.trim();
  const paraQuem = m.paraQuem.trim();
  if (!achado || !paraQuem) return null;
  const diretriz = m.diretriz.trim() || null;
  const mudaAlgo: Implicacao = preprint ? "nao" : m.mudaAlgo === "alinhado-a-diretriz" && !diretriz ? "pode-informar-discussao" : m.mudaAlgo;
  return { achado, paraQuem, mudaAlgo, diretriz: mudaAlgo === "alinhado-a-diretriz" ? diretriz : null };
}

/**
 * What the pipeline gave the model, from where the text came: the abstract, or a full text from PMC, a free
 * copy or the publisher's page, which is the authors' accepted manuscript when Unpaywall says the open copy is.
 */
export function textoLido(basis: "full" | "abstract", access: Access): TextoLido {
  if (basis === "abstract") return "resumo";
  return access.kind === "open" && access.copy.version === "acceptedVersion" ? "manuscrito-aceito" : "texto-completo";
}

/** A guideline's dates: published as its record says, revised when the source gives it, checked today. */
function datas(publicado: string | null, revisado: string | null, now: Date): Confianca["datas"] {
  return { publicado, revisado, conferido: beijingDate(now) };
}

/** Why the matéria about a paper can be trusted, as stored for its page (backend/confianca.ts). */
export function confiancaDaMateria(m: Materia, paper: Paper, lido: TextoLido, now: Date): Confianca {
  const preprint = isPreprint(paper);
  const field = (v: string, missing: string) => v.trim() || missing;
  return {
    feitura: "materia",
    minuto: emUmMinuto(m, preprint),
    populacao: { idade: field(m.populacaoIdade, "não informada"), doenca: field(m.populacaoDoenca, "não informada"), cenario: field(m.populacaoCenario, "não informado") },
    desenho: m.desenho,
    desenhoDetalhe: m.desenhoDetalhe.trim() || null,
    limitacao: m.limitacaoPrincipal.trim() || null,
    textoLido: lido,
    preprint,
    datas: isGuideline(paper) || m.desenho === "diretriz" || m.desenho === "consenso" ? datas(paper.publishedOn ?? paper.year, null, now) : null,
  };
}

/** A paper's text republished in full and translated: what was read, whether it is a preprint, a guideline's dates. */
export function confiancaDaTraducao(paper: Paper, now: Date): Confianca {
  return {
    feitura: "traducao", minuto: null, populacao: null, desenho: null, desenhoDetalhe: null, limitacao: null,
    textoLido: "texto-completo", preprint: isPreprint(paper), datas: isGuideline(paper) ? datas(paper.publishedOn ?? paper.year, null, now) : null,
  };
}

/** The line that opens a preprint's body, in every exit that carries the body. */
export function preprintNote(): string {
  return `<p><strong>${esc(PREPRINT_LABEL)}.</strong> Este estudo ainda não passou pela revisão por pares de uma revista: os resultados são preliminares, podem mudar e não devem orientar a prática.</p>`;
}

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
    `Preprint: ${isPreprint(paper) ? "sim (ainda não revisado por pares)" : "não"}`,
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

/** The X post that led the site to the paper (backend/apurar.ts): its account and its address. */
export interface XCredit {
  handle: string;
  authorName: string;
  url: string;
}

/** The line crediting the X post, at the very end: the paper or the page is the source, the post only the lead. */
export function creditBlock(credit: XCredit, what = "o artigo"): string {
  const name = credit.authorName.trim() && credit.authorName.trim() !== credit.handle ? `${esc(credit.authorName.trim())} ` : "";
  return `<p><em>Pauta: ${esc(what)} foi destacado por ${name}<a href="${esc(credit.url)}">@${esc(credit.handle)}</a> no X.</em></p>`;
}

export const FONTE_PURPOSE = "materia_fonte_article";
/** Page texts longer than this reach the model cut at a word. */
const MAX_PAGE_INPUT = 30_000;

const FONTE_TIPOS = ["diretriz", "consenso", "congresso", "anuncio", "outro"] as const;
const FonteOutput = z.object({
  fontePrimaria: z.boolean(),
  organizacao: optional,
  titulo: optional,
  linhaFina: optional,
  lide: optional,
  corpo: optional,
  tipo: z.string().nullish().transform((v) => ((FONTE_TIPOS as readonly string[]).includes(v?.trim() ?? "") ? (v!.trim() as (typeof FONTE_TIPOS)[number]) : "outro")),
  ...minuto,
});
export type FonteMateria = z.infer<typeof FonteOutput>;

/** The official page an X post links (a society's guideline, a congress, an announcement), as the model reads it. */
export interface PrimaryPage {
  url: string;
  title: string;
  text: string;
  /** When the page says it was published and last revised (its metadata), YYYY-MM-DD; null when it does not. */
  publishedOn?: string | null;
  modifiedOn?: string | null;
}

/** Why the matéria from an official page can be trusted: its "Em um minuto", the page as what was read, a guideline's dates. */
export function confiancaDaPagina(m: FonteMateria, page: PrimaryPage, now: Date): Confianca {
  const guideline = m.tipo === "diretriz" || m.tipo === "consenso";
  return {
    feitura: "pagina", minuto: emUmMinuto(m, false), populacao: null, desenho: guideline ? m.tipo as Desenho : null, desenhoDetalhe: null, limitacao: null,
    textoLido: "pagina-oficial", preprint: false, datas: guideline ? datas(page.publishedOn ?? null, page.modifiedOn ?? null, now) : null,
  };
}

export function fonteInput(page: PrimaryPage, post: string): string {
  const text = page.text.length > MAX_PAGE_INPUT ? `${page.text.slice(0, page.text.lastIndexOf(" ", MAX_PAGE_INPUT))} […]` : page.text;
  return [`Endereço da página: ${page.url}`, `Título da página: ${page.title || "não informado"}`, "", "Texto da página:", text, "", "Post que deu a pauta:", post].join("\n");
}

/**
 * The site's article about the subject of an X post from the official page it links; null when the model
 * says the page is not the primary source or leaves the article short. The receipt is returned either way.
 */
export async function writeFonteMateria(page: PrimaryPage, post: string): Promise<{ materia: FonteMateria | null; receiptId: number }> {
  const res = await chatJson({
    model: await modelFor(MATERIA_STEP),
    purpose: FONTE_PURPOSE,
    subject: `pagina:${page.url}`,
    promptVersion: promptVersion("materia-fonte"),
    system: promptText("materia-fonte"),
    user: fonteInput(page, post),
    schema: FonteOutput,
    temperature: 0.3,
    maxTokens: 3000,
    timeoutMs: 180_000,
  });
  const m = res.data;
  const usable = m.fontePrimaria && m.organizacao.trim() && m.titulo.trim().length >= 10 && m.lide.trim().length >= 20 && m.corpo.trim().length >= 10;
  return { materia: usable ? m : null, receiptId: res.receiptId };
}

/** The article from the page, its source (the organisation and the page) and the post's credit. */
export function renderFonteMateria(m: FonteMateria, page: PrimaryPage, credit: XCredit): string {
  const host = page.url.replace(/^https?:\/\//, "").split("/")[0]!;
  return [
    m.linhaFina.trim() ? `<p><strong>${esc(m.linhaFina.trim())}</strong></p>` : "",
    paragraphs(m.lide),
    paragraphs(m.corpo),
    `<h2>Fonte</h2><p>${esc(m.organizacao.trim())}: <a href="${esc(page.url)}">${esc(page.title || host)}</a></p>`,
    `<p><em>Matéria escrita pelo ${esc(SITE.bareName)} a partir da página oficial.</em></p>`,
    creditBlock(credit, "o assunto"),
  ].join("");
}

export function renderMateria(m: Pick<Materia, "titulo" | "linhaFina" | "lide" | "contexto" | "metodos" | "resultados" | "limitacoes" | "paraOPediatra" | "paraOEspecialista">, paper: Paper, access: Access, pmcid: string | null, basis: "full" | "abstract"): string {
  return [
    isPreprint(paper) ? preprintNote() : "",
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
