// The site's own article about a paper (industry/prompts/materia.md): written by the model from the abstract
// or from a full text that may be read but not republished, and rendered here as the item's body. The
// fields come back as plain text and are escaped here, so the model never writes HTML.
import { z } from "zod";
import { chatJson } from "@aihot/backend/providers/llm";
import { modelFor } from "@aihot/backend/editorial/models";
import { promptText, promptVersion } from "@aihot/backend/editorial/prompts";
import { beijingDate } from "@aihot/contracts/time";
import { authorLine, isGuideline, isPreprint, type Paper } from "./pubmed.ts";
import { blockText, LICENSE_NAMES, type Access } from "./access.ts";
import { dataBr, DESENHOS, ESTADO_LABEL, IMPLICACOES, NAO_INFORMADO, PREPRINT_LABEL, type Confianca, type Desenho, type EmUmMinuto, type Implicacao, type TextoLido } from "../confianca.ts";
import type { Anterior } from "./estudos.ts";

export const MATERIA_STEP = "materia";
export const MATERIA_PURPOSE = "materia_article";
const VERSION = () => promptVersion("materia");
/** Full texts longer than this reach the model cut at a paragraph. */
const MAX_INPUT = 60_000;

/** Optional sections: models often answer null or leave them out when the paper does not support them. */
const optional = z.string().nullish().transform((v) => v ?? "");
/** An answer outside the list counts as the most cautious grade, "nao". */
const grade = z.string().nullish().transform((v): Implicacao => ((IMPLICACOES as readonly string[]).includes(v?.trim() ?? "") ? (v!.trim() as Implicacao) : "nao"));
/** An answer outside the list, or none, counts as "outro": every matéria shows a design. */
const design = z.string().nullish().transform((v): Desenho => ((DESENHOS as readonly string[]).includes(v?.trim() ?? "") ? (v!.trim() as Desenho) : "outro"));
const list = z.array(z.string()).nullish().transform((v) => (v ?? []).map((x) => x.trim()).filter(Boolean));

/** The red flags the model checks before writing (industry/prompts/materia.md), as "Quanto confiar" names them; only those present are shown. */
const SINAIS = {
  "sem-randomizacao": "Sem randomização",
  "sem-mascaramento": "Sem mascaramento",
  "interrupcao-precoce": "Interrupção precoce",
  "desfecho-substituto": "Desfecho substituto",
  "so-risco-relativo": "Só risco relativo",
  subgrupo: "Conclusão em subgrupo",
  "centro-unico": "Centro único",
  retrospectivo: "Retrospectivo",
  "n-pequeno": "Poucos pacientes",
  "conflito-fabricante": "Ligação com o fabricante",
} as const;
type Sinal = keyof typeof SINAIS;
const flags = z.array(z.object({ sinal: z.string(), detalhe: optional })).nullish()
  .transform((v) => (v ?? []).filter((f): f is { sinal: Sinal; detalhe: string } => f.sinal in SINAIS));

/** "Em um minuto" and the conflicts (industry/prompts/materia.md, materia-fonte.md). */
const minuto = { achado: optional, mudaAlgo: grade, diretriz: optional, conflitos: optional };
/** Why the piece can be trusted: what a matéria and a translated full text both store (confiancaDaMateria). */
const trust = {
  ...minuto,
  perguntaClinica: optional,
  populacaoIdade: optional,
  populacaoDoenca: optional,
  populacaoCenario: optional,
  desenho: design,
  desenhoDetalhe: optional,
  limitacaoPrincipal: optional,
  naPratica: optional,
};
const TrustOutput = z.object(trust);
export type Trust = z.infer<typeof TrustOutput>;
const Output = z.object({
  ...trust,
  titulo: z.string().min(10),
  achado: z.string().min(20),
  sinaisDeAlerta: flags,
  oQueFizeram: optional,
  resultados: z.array(z.object({ desfecho: z.string(), resultado: z.string(), efeito: optional }))
    .refine((rows) => rows.some((r) => r.desfecho.trim() || r.resultado.trim()), "a matéria sem nenhum resultado"),
  aFavor: list,
  naoInformado: list,
  contexto: optional,
});
export type Materia = z.infer<typeof Output>;

/**
 * The grade the site shows: a preprint or a registry entry never changes anything yet (`naoMuda`), and
 * "alinhado a diretriz" needs the guideline the material names; without it the grade drops to "pode informar a discussão".
 */
export function emUmMinuto(m: { achado: string; paraQuem?: string; mudaAlgo: Implicacao; diretriz: string }, naoMuda: boolean): EmUmMinuto | null {
  const achado = m.achado.trim();
  const paraQuem = m.paraQuem?.trim() || null;
  if (!achado) return null;
  const diretriz = m.diretriz.trim() || null;
  const mudaAlgo: Implicacao = naoMuda ? "nao" : m.mudaAlgo === "alinhado-a-diretriz" && !diretriz ? "pode-informar-discussao" : m.mudaAlgo;
  return { achado, paraQuem, mudaAlgo, diretriz: mudaAlgo === "alinhado-a-diretriz" ? diretriz : null };
}

/** Where the full text the model read came from: PMC, the free copy Unpaywall points to, or the publisher's page that is that copy. */
export type FullTextFrom = "pmc" | "copy" | "publisher";

/**
 * What the pipeline gave the model: the abstract (no full text), or a full text, which is the authors' accepted
 * manuscript only when it was read from the open copy Unpaywall says is that version (never PMC's text).
 */
export function textoLido(from: FullTextFrom | null, access: Access): TextoLido {
  if (!from) return "resumo";
  return from !== "pmc" && access.kind === "open" && access.copy.version === "acceptedVersion" ? "manuscrito-aceito" : "texto-completo";
}

/** A guideline's dates: published as its record says, revised when the source gives it, checked today. */
function datas(publicado: string | null, revisado: string | null, now: Date): Confianca["datas"] {
  return { publicado, revisado, conferido: beijingDate(now) };
}


/**
 * Why the matéria about a paper can be trusted, as stored for its page (backend/confianca.ts). The declared
 * conflicts come from a full text the model read or the conflicts statement of the paper's record; from an
 * abstract alone they are "não informado", whatever the model says.
 */
export function confiancaDaMateria(m: Trust, paper: Paper, lido: TextoLido, now: Date): Confianca {
  const preprint = isPreprint(paper);
  const field = (v: string, missing: string) => v.trim() || missing;
  const declared = lido !== "resumo" || !!paper.coiStatement;
  return {
    feitura: "materia",
    estrutura: "unica",
    perguntaClinica: m.perguntaClinica.trim() || null,
    minuto: emUmMinuto(m, preprint),
    populacao: { idade: field(m.populacaoIdade, "não informada"), doenca: field(m.populacaoDoenca, "não informada"), cenario: field(m.populacaoCenario, "não informado") },
    desenho: m.desenho,
    desenhoDetalhe: m.desenhoDetalhe.trim() || null,
    limitacao: field(m.limitacaoPrincipal, "não informada"),
    conflitos: declared ? field(m.conflitos, NAO_INFORMADO) : NAO_INFORMADO,
    textoLido: lido,
    preprint,
    datas: isGuideline(paper) || m.desenho === "diretriz" || m.desenho === "consenso" ? datas(paper.publishedOn ?? paper.year, null, now) : null,
  };
}

/**
 * A paper's text republished in full and translated: the same record as a matéria's, from the full text the
 * model read. Its body is the paper's, so "Na prática" stays on its card.
 */
export function confiancaDaTraducao(m: Trust, paper: Paper, now: Date): Confianca {
  return { ...confiancaDaMateria(m, paper, "texto-completo", now), feitura: "traducao", aplicabilidade: m.naPratica.trim() || null };
}

/** The line that opens a preprint's body, in every exit that carries the body. */
export function preprintNote(): string {
  return `<p><strong>${esc(PREPRINT_LABEL)}.</strong> Este estudo ainda não passou pela revisão por pares de uma revista: os resultados são preliminares, podem mudar e não devem orientar a prática.</p>`;
}

/** How much longer than the abstract a matéria written only from it may be, and the cap from a full text. */
const CAP_FROM_ABSTRACT = 1.2;
const CAP_FROM_FULL_TEXT = 900;
const countWords = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** The most words this matéria may have (industry/prompts/materia.md): about 1.2x the abstract it was written from, or 900 from a full text. */
export function limitePalavras(paper: Pick<Paper, "abstract">, fullText: string | null): number {
  if (fullText) return CAP_FROM_FULL_TEXT;
  return Math.ceil(paper.abstract.reduce((n, s) => n + countWords(s.text), 0) * CAP_FROM_ABSTRACT);
}

/**
 * The text the engine reads and groups by (articles.body_text): the body and what the page shows above it. The
 * population, the design and the sample live only there, and selection scores on them.
 */
export function materiaText(m: Materia, html: string): string {
  return [m.perguntaClinica, m.achado, m.populacaoIdade, m.populacaoDoenca, m.populacaoCenario, m.desenhoDetalhe, m.limitacaoPrincipal, blockText(html)]
    .map((x) => x.trim()).filter(Boolean).join(" ");
}

/**
 * What the model reads: the record's data (its conflicts statement included), the versions of the study and the
 * other papers of its trial the site already published, and the text, the full one when there is one, and whether
 * it was cut.
 */
export function materiaInput(paper: Paper, fullText: string | null, anteriores: Anterior[] = []): string {
  const abstract = paper.abstract.map((s) => (s.label ? `${s.label}: ${s.text}` : s.text)).join("\n");
  let text = fullText ?? abstract;
  const cut = text.length > MAX_INPUT;
  if (cut) text = `${text.slice(0, text.lastIndexOf(" ", MAX_INPUT))} […]`;
  const listed = (as: Anterior[]) => as.map((a) => `“${a.title}” (${a.estado ? ESTADO_LABEL[a.estado].toLowerCase() : "matéria"}, ${dataBr(a.data)})`).join("; ");
  const versoes = anteriores.filter((a) => !a.mesmoEnsaio);
  const ensaio = anteriores.filter((a) => a.mesmoEnsaio);
  const available = !fullText ? "somente o resumo" : cut ? "texto completo, cortado no fim por tamanho (o que falta pode incluir parte da discussão; não afirme que algo não foi informado só porque não aparece aqui)" : "texto completo";
  return [
    `Título original: ${paper.title}`,
    `Revista: ${paper.journal}${paper.year ? ` (${paper.year})` : ""}`,
    `Tipo de publicação: ${paper.publicationTypes.join(", ") || "não informado"}`,
    `Preprint: ${isPreprint(paper) ? "sim (ainda não revisado por pares)" : "não"}`,
    `Autores: ${authorLine(paper.authors, 6) || "não informado"}`,
    ...(paper.coiStatement ? [`Declaração de conflitos de interesse (registro do PubMed): ${paper.coiStatement}`] : []),
    ...(versoes.length ? [`Outras versões deste estudo já publicadas pelo jornal: ${listed(versoes)}`] : []),
    ...(ensaio.length ? [`Outras publicações do mesmo ensaio já publicadas pelo jornal: ${listed(ensaio)}`] : []),
    `Texto disponível: ${available}`,
    `Limite desta matéria: cerca de ${limitePalavras(paper, fullText)} palavras, somando todos os campos`,
    "",
    text,
  ].join("\n");
}

export async function writeMateria(paper: Paper, fullText: string | null, anteriores: Anterior[] = []): Promise<{ materia: Materia; receiptId: number }> {
  const res = await askMateria(paper, fullText, Output, anteriores);
  return { materia: res.data, receiptId: res.receiptId };
}

/**
 * The same call as writeMateria on a full text republished in full, kept only for its trust fields: an answer
 * without the matéria's own sections still gives the translation its record.
 */
export async function readTrust(paper: Paper, fullText: string, anteriores: Anterior[] = []): Promise<{ trust: Trust; receiptId: number }> {
  const res = await askMateria(paper, fullText, TrustOutput, anteriores);
  return { trust: res.data, receiptId: res.receiptId };
}

async function askMateria<S extends z.ZodType>(paper: Paper, fullText: string | null, schema: S, anteriores: Anterior[]) {
  return chatJson({
    model: await modelFor(MATERIA_STEP),
    purpose: MATERIA_PURPOSE,
    subject: `${paper.pmid ? `pubmed:${paper.pmid}` : paper.doi ? `doi:${paper.doi}` : `url:${paper.url}`}${fullText ? ":full" : ":abstract"}`,
    promptVersion: VERSION(),
    system: promptText("materia"),
    user: materiaInput(paper, fullText, anteriores),
    schema,
    temperature: 0.3,
    maxTokens: 4000,
    // Inside the worker's shutdown drain (jobs/queue.ts), so a stop never leaves the receipt unknown.
    timeoutMs: 180_000,
  });
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
export function referenceBlock(paper: Paper, access: Access, pmcid: string | null): string {
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
  return `<h2>Referência</h2><p>${cite}</p><p>${links}</p>${accessLine}`;
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
  paraQuem: optional,
  aplicabilidadeBrasil: optional,
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

/**
 * Why the matéria from an official page can be trusted: its "Em um minuto" (never more than "não" for a trial
 * register's page), the conflicts the page declares, what carries over to Brazil, the page as what was read, a
 * guideline's dates.
 */
export function confiancaDaPagina(m: FonteMateria, page: PrimaryPage, now: Date, registro = false): Confianca {
  const guideline = m.tipo === "diretriz" || m.tipo === "consenso";
  return {
    feitura: "pagina", minuto: emUmMinuto(m, registro), populacao: null, desenho: guideline ? m.tipo as Desenho : null, desenhoDetalhe: null, limitacao: null,
    conflitos: m.conflitos.trim() || NAO_INFORMADO, aplicabilidade: m.aplicabilidadeBrasil.trim() || null,
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
    paragraphs(m.lide),
    paragraphs(m.corpo),
    `<h2>Fonte</h2><p>${esc(m.organizacao.trim())}: <a href="${esc(page.url)}">${esc(page.title || host)}</a></p>`,
    creditBlock(credit, "o assunto"),
  ].join("");
}

/** The columns of "O que encontraram": what each column holds changes with the study's design (industry/prompts/materia.md). */
function colunas(desenho: Desenho): [string, string, string] {
  switch (desenho) {
    case "ensaio-clinico": return ["Desfecho", "Por grupo", "Diferença"];
    case "coorte": case "caso-controle": case "transversal": return ["Desfecho", "Por grupo", "Associação"];
    case "meta-analise": case "revisao-sistematica": return ["Desfecho", "Efeito combinado", "Estudos e certeza"];
    case "diretriz": case "consenso": return ["Recomendação", "Força", "Observação"];
    default: return ["Desfecho", "Resultado", "Observação"];
  }
}

/** "O que encontraram": a table by outcome, the only place with the numbers; a column nothing fills is left out. */
function resultadosTable(m: Pick<Materia, "resultados" | "desenho">): string {
  const rows = m.resultados.map((r) => ({ desfecho: r.desfecho.trim(), resultado: r.resultado.trim(), efeito: r.efeito.trim() })).filter((r) => r.desfecho || r.resultado);
  const [a, b, c] = colunas(m.desenho);
  const third = rows.some((r) => r.efeito);
  const cell = (tag: "th" | "td", text: string) => `<${tag}>${esc(text)}</${tag}>`;
  const heading = m.desenho === "diretriz" || m.desenho === "consenso" ? "O que recomendam" : "O que encontraram";
  return `<h2>${heading}</h2><table><thead><tr>${cell("th", a)}${cell("th", b)}${third ? cell("th", c) : ""}</tr></thead><tbody>${rows.map((r) => `<tr>${cell("td", r.desfecho)}${cell("td", r.resultado)}${third ? cell("td", r.efeito) : ""}</tr>`).join("")}</tbody></table>`;
}

/** "Quanto confiar": what strengthens the study, the red flags present, and what the text read does not report. */
function quantoConfiar(m: Pick<Materia, "aFavor" | "sinaisDeAlerta" | "naoInformado">): string {
  const items = [
    ...m.aFavor.map((x) => `<li><strong>A favor:</strong> ${esc(x)}</li>`),
    ...m.sinaisDeAlerta.map((f) => `<li><strong>${esc(SINAIS[f.sinal])}:</strong> ${esc(f.detalhe.trim())}</li>`),
    ...m.naoInformado.map((x) => `<li><strong>Não informado:</strong> ${esc(x)}</li>`),
  ];
  return items.length ? `<h2>Quanto confiar</h2><ul>${items.join("")}</ul>` : "";
}

/**
 * The stored body, what the page shows after the question, "Em um minuto" and the card (web/item-part.tsx): each
 * section says only what the others do not, and the origin of the text is said once, on the card.
 */
export function renderMateria(m: Pick<Materia, "oQueFizeram" | "resultados" | "desenho" | "aFavor" | "sinaisDeAlerta" | "naoInformado" | "naPratica" | "contexto">, paper: Paper, access: Access, pmcid: string | null): string {
  return [
    isPreprint(paper) ? preprintNote() : "",
    section("O que fizeram", m.oQueFizeram),
    resultadosTable(m),
    quantoConfiar(m),
    section("Na prática", m.naPratica),
    section("Contexto", m.contexto),
    referenceBlock(paper, access, pmcid),
  ].join("");
}
