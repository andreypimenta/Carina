// Why a matéria can be trusted, as the site shows it (web/item-part.tsx, the weekly e-mail): "Em um minuto"
// (the finding, who it matters to, and whether it changes anything now, graded from what the material itself
// supports and never the journal's own recommendation), the population, the study design and its main
// limitation as the model read them (backend/materia.ts); the text the pipeline actually read; preprints;
// the dates of a guideline or consensus; and the public corrections the editor added (backend/correcoes.ts).
// Shared by the backend and the web, so nothing here imports either.

/** "Muda algo agora?": a grade of what the material supports, not a recommendation of the journal. */
export const IMPLICACOES = ["nao", "pode-informar-discussao", "alinhado-a-diretriz"] as const;
export type Implicacao = (typeof IMPLICACOES)[number];
export const IMPLICACAO_LABEL: Record<Implicacao, string> = {
  nao: "Não",
  "pode-informar-discussao": "Pode informar a discussão",
  "alinhado-a-diretriz": "Alinhado a diretriz",
};

export const DESENHOS = [
  "ensaio-clinico", "meta-analise", "revisao-sistematica", "coorte", "caso-controle", "transversal", "serie-de-casos", "relato-de-caso",
  "revisao-narrativa", "diretriz", "consenso", "estudo-experimental", "outro",
] as const;
export type Desenho = (typeof DESENHOS)[number];
export const DESENHO_LABEL: Record<Desenho, string> = {
  "ensaio-clinico": "Ensaio clínico",
  "meta-analise": "Metanálise",
  "revisao-sistematica": "Revisão sistemática",
  coorte: "Coorte",
  "caso-controle": "Caso-controle",
  transversal: "Estudo transversal",
  "serie-de-casos": "Série de casos",
  "relato-de-caso": "Relato de caso",
  "revisao-narrativa": "Revisão narrativa",
  diretriz: "Diretriz",
  consenso: "Consenso",
  "estudo-experimental": "Estudo experimental (laboratório ou animais)",
  outro: "Outro",
};

/** The text the pipeline gave the model, never the model's own account of it. */
export type TextoLido = "texto-completo" | "manuscrito-aceito" | "resumo" | "pagina-oficial";
export const TEXTO_LIDO_LABEL: Record<TextoLido, string> = {
  "texto-completo": "Texto completo aberto",
  "manuscrito-aceito": "Manuscrito aceito, em cópia legal aberta",
  resumo: "Somente o resumo",
  "pagina-oficial": "Página oficial da organização",
};

/** How the piece was made: written by the model from a paper or an official page, or a paper's text translated in full. */
export type Feitura = "materia" | "pagina" | "traducao";

export const PREPRINT_LABEL = "Preprint – não revisado por pares";

export interface EmUmMinuto {
  achado: string;
  paraQuem: string;
  mudaAlgo: Implicacao;
  /** The guideline or consensus the material names, when the grade is "alinhado-a-diretriz". */
  diretriz: string | null;
}

/** What is stored for each new matéria (literatura_confianca). Old matérias have none and show nothing. */
export interface Confianca {
  feitura: Feitura;
  minuto: EmUmMinuto | null;
  populacao: { idade: string; doenca: string; cenario: string } | null;
  desenho: Desenho | null;
  /** "coorte retrospectiva, centro único": the design in a few words. */
  desenhoDetalhe: string | null;
  limitacao: string | null;
  textoLido: TextoLido;
  preprint: boolean;
  /**
   * A guideline's or consensus's dates, so an old document is not read as news: published and revised as the
   * source's metadata gives them (null when it does not), and the day the journal checked it.
   */
  datas: { publicado: string | null; revisado: string | null; conferido: string } | null;
}

export interface Correcao {
  id: number;
  /** YYYY-MM-DD. */
  data: string;
  oQueMudou: string;
  porque: string;
}

/** A matéria's part of its page (ServerModule.items): what it is trusted by, and its corrections. */
export interface MateriaPart {
  confianca: Confianca | null;
  correcoes: Correcao[];
}

/** "2026-10-31" → "31/10/2026"; "2026-10" → "10/2026"; "2026" stays. */
export function dataBr(day: string): string {
  const [y, m, d] = day.split("-");
  return [d, m, y].filter(Boolean).join("/");
}

/**
 * What the model did and who follows it, for the line at the end of the piece: published without a human review
 * first, so the editor follows what goes live and corrects it; named once the site names one (EXPEDIENTE).
 */
export function linhaRevisao(c: Confianca, editor: string | null): string {
  const ia = {
    materia: "Matéria redigida com auxílio de inteligência artificial (IA) a partir da fonte original (o texto indicado em “Texto lido”) e selecionada automaticamente: a IA resumiu o estudo, extraiu população, desenho e principal limitação e graduou se ele muda algo agora.",
    pagina: "Matéria redigida com auxílio de inteligência artificial (IA) a partir da página oficial indicada na fonte e selecionada automaticamente: a IA resumiu o conteúdo e graduou se ele muda algo agora.",
    traducao: "Artigo traduzido na íntegra com inteligência artificial (IA) e selecionado automaticamente: a IA traduziu o texto, extraiu população, desenho e principal limitação e graduou se ele muda algo agora; em caso de divergência, vale o original.",
  }[c.feitura];
  const who = editor ? `O editor responsável, ${editor},` : "O editor responsável";
  return `${ia} ${who} acompanha o que vai ao ar e corrige quando necessário; correções de substância são registradas no fim da página, com a data, o que mudou e por quê.`;
}

/** The compact "Em um minuto" of the weekly e-mail as one line of plain text, or null for a piece without one. */
export function minutoCompacto(part: MateriaPart): string | null {
  const c = part.confianca;
  if (!c?.minuto) return null;
  return [
    c.preprint ? `${PREPRINT_LABEL}.` : "",
    `Em um minuto: ${c.minuto.achado.replace(/[.\s]+$/, "")}.`,
    `Para quem: ${c.minuto.paraQuem.replace(/[.\s]+$/, "")}.`,
    `Muda algo agora? ${IMPLICACAO_LABEL[c.minuto.mudaAlgo]}.`,
  ].filter(Boolean).join(" ");
}

/** A correction as the admin lists it: the matéria it belongs to, who added it and when. */
export interface AdminCorrecao extends Correcao {
  articleId: string;
  title: string | null;
  actor: string;
  at: string;
}

/**
 * The article a correction is for, from what the editor pastes: its id, or the address of its page
 * (/items/<id>, /items/<id>/original or /assine/<edição>/<id>).
 */
export function articleIdFrom(input: string): string | null {
  const s = input.trim();
  const id = /\/items\/([a-z0-9]{10,40})(?:[/?#]|$)/i.exec(s)?.[1] ?? /\/assine\/\d{4}-W\d{2}\/([a-z0-9]{10,40})(?:[/?#]|$)/i.exec(s)?.[1] ?? (/^[a-z0-9]{10,40}$/i.test(s) ? s : null);
  return id;
}
