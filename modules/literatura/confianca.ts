// Why a matéria can be trusted, as the site shows it (web/item-part.tsx, the weekly e-mail): "Em um minuto"
// (the finding, who it matters to, and whether it changes anything now, graded from what the material itself
// supports and never the journal's own recommendation), the population, the study design and its main
// limitation, the declared conflicts and what carries over to Brazil as the model read them (backend/materia.ts);
// the text the pipeline actually read; preprints; the dates of a guideline or consensus; where the study stands
// (registered, recruiting, results deposited, preprint, reviewed article) and its other versions the site has
// (backend/estudos.ts); and the public corrections the editor added (backend/correcoes.ts).
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

/**
 * How the piece was made: written by the model from a paper or an official page, a paper's text translated in
 * full, a regulatory act summed up by the model (backend/alertas.ts), or a notice of a guideline's new version
 * written without reading the document (backend/elso.ts).
 */
export type Feitura = "materia" | "pagina" | "traducao" | "alerta" | "aviso";

/** What a regulatory act is (backend/alertas.ts). */
export const CATEGORIAS_ALERTA = ["recolhimento", "comunicacao-seguranca", "autorizacao", "rotulagem"] as const;
export type CategoriaAlerta = (typeof CATEGORIAS_ALERTA)[number];
export const CATEGORIA_ALERTA_LABEL: Record<CategoriaAlerta, string> = {
  recolhimento: "Recolhimento ou ação de campo",
  "comunicacao-seguranca": "Comunicação de segurança",
  autorizacao: "Autorização ou registro",
  rotulagem: "Mudança de rotulagem",
};
const CATEGORIA_CURTA: Record<CategoriaAlerta, string> = {
  recolhimento: "recolhimento", "comunicacao-seguranca": "comunicação de segurança", autorizacao: "autorização", rotulagem: "rotulagem",
};

/** A regulatory act's title label, so no list or edition reads it as evidence: "Alerta regulatório (FDA) – recolhimento". */
export function alertaTitleLabel(a: { orgao: string; categoria: CategoriaAlerta }): string {
  return `Alerta regulatório (${a.orgao}) – ${CATEGORIA_CURTA[a.categoria]}`;
}

export const PREPRINT_LABEL = "Preprint – não revisado por pares";

/**
 * Where a study stands (backend/estudos.ts): a registry entry (registered, recruiting, or with results deposited
 * in the registry), a preprint, or an article a journal reviewed. A registry entry is a plan or raw numbers, never
 * a result that changes practice.
 */
export const ESTADOS = ["registrado", "recrutando", "resultados-depositados", "preprint", "artigo-revisado"] as const;
export type Estado = (typeof ESTADOS)[number];
export const ESTADO_LABEL: Record<Estado, string> = {
  registrado: "Registrado",
  recrutando: "Recrutando",
  "resultados-depositados": "Resultados depositados",
  preprint: "Preprint",
  "artigo-revisado": "Artigo revisado",
};
export const ESTADO_NOTA: Record<Estado, string> = {
  registrado: "Estudo registrado: o plano do estudo, sem resultados.",
  recrutando: "Estudo registrado, ainda recrutando participantes: sem resultados.",
  "resultados-depositados": "Resultados depositados no registro pelos pesquisadores, sem revisão por pares.",
  preprint: "Versão preliminar, ainda não revisada por pares.",
  "artigo-revisado": "Artigo publicado em revista, após revisão por pares.",
};
export const isRegistro = (e: Estado | null | undefined): boolean => e === "registrado" || e === "recrutando" || e === "resultados-depositados";

/** The label a public title starts with for this stage, so no list or edition reads it as a reviewed result. */
export function estadoTitleLabel(e: Estado | null | undefined): string | null {
  if (e === "preprint") return PREPRINT_LABEL;
  if (e === "registrado") return "Estudo registrado";
  if (e === "recrutando") return "Estudo registrado – recrutando";
  if (e === "resultados-depositados") return "Estudo registrado – resultados depositados";
  return null;
}

/** Another version of the same study the site published (backend/estudos.ts). */
export interface Versao {
  id: string;
  title: string;
  estado: Estado | null;
  /** When the site published it, YYYY-MM-DD. */
  data: string;
}

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
  /** Declared conflicts of interest and funding, from the text read; "não informado" when it gives none. Absent on older records. */
  conflitos?: string | null;
  /** "O que se transfere ao contexto brasileiro": cautious, never a recommendation. Absent on older records. */
  aplicabilidade?: string | null;
  /** A regulatory act's agency and category (feitura "alerta"). */
  alerta?: { orgao: string; categoria: CategoriaAlerta } | null;
  textoLido: TextoLido;
  preprint: boolean;
  /**
   * A guideline's or consensus's dates, so an old document is not read as news: published and revised as the
   * source's metadata gives them (null when it does not), and the day the journal verified it.
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

/**
 * An article's part of its page (ServerModule.items): what it is trusted by, where its study stands and the
 * study's other versions, and its corrections.
 */
export interface MateriaPart {
  confianca: Confianca | null;
  estado: Estado | null;
  versoes: Versao[];
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
  const and = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} e ${xs.at(-1)}` : xs.join(""));
  const fichas = `extraiu ${and(["população", "desenho", "principal limitação", ...(c.conflitos ? ["conflitos declarados"] : [])])}`;
  const acts = (...first: string[]) => and([...first, "graduou se ele muda algo agora", ...(c.aplicabilidade ? ["apontou o que se transfere ao contexto brasileiro"] : [])]);
  const ia = {
    materia: `Matéria redigida com auxílio de inteligência artificial (IA) a partir da fonte original (o texto indicado em “Texto lido”) e selecionada automaticamente: a IA ${acts("resumiu o estudo", fichas)}.`,
    pagina: `Matéria redigida com auxílio de inteligência artificial (IA) a partir da página oficial indicada na fonte e selecionada automaticamente: a IA ${acts("resumiu o conteúdo")}.`,
    traducao: `Artigo traduzido na íntegra com inteligência artificial (IA) e selecionado automaticamente: a IA ${acts("traduziu o texto", fichas)}; em caso de divergência, vale o original.`,
    alerta: "Alerta redigido com auxílio de inteligência artificial (IA) a partir do ato oficial indicado na fonte e selecionado automaticamente: a IA resumiu o ato, classificou sua categoria e verificou se envolve dispositivos de via aérea ou respiratórios usados em crianças. Um ato regulatório não é evidência de eficácia nem de segurança clínica do produto.",
    aviso: "Aviso gerado automaticamente a partir da página oficial indicada na fonte, sem leitura do documento: diz apenas o que a página informa (o título e a data de atualização).",
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
