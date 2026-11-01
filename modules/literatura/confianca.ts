// Why a matéria can be trusted, as the site shows it (web/item-part.tsx, the cards, the weekly e-mail): the clinical
// question, "Em um minuto" (the finding, and whether it changes anything now, graded from what the material itself
// supports and never the journal's own recommendation), the population, the study design and its main
// limitation and the declared conflicts as the model read them (backend/materia.ts);
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

/** What a trust field says when the text read gives nothing, or when it was not read for it (backend/materia.ts). */
export const NAO_INFORMADO = "Não informado";

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

/** Another version of the same study, or another paper of the same trial, the site published (backend/estudos.ts). */
export interface Versao {
  id: string;
  title: string;
  estado: Estado | null;
  /** When the site published it, YYYY-MM-DD. */
  data: string;
}

export interface EmUmMinuto {
  /** The only summary of the piece: the answer to the clinical question, with its main number. */
  achado: string;
  /** Only on older records and official pages; a paper's matéria says it in "Na prática". */
  paraQuem?: string | null;
  mudaAlgo: Implicacao;
  /** The guideline or consensus the material names, when the grade is "alinhado-a-diretriz". */
  diretriz: string | null;
}

/** What is stored for each new matéria (literatura_confianca). Old matérias have none and show nothing. */
export interface Confianca {
  feitura: Feitura;
  /**
   * "unica": written in the single structure (industry/prompts/materia.md), each fact in one place. Absent on the
   * matérias written before it, whose stored body already says most of the card (`corpoJaDiz`).
   */
  estrutura?: "unica";
  /** The clinical question in one PICO line. */
  perguntaClinica?: string | null;
  minuto: EmUmMinuto | null;
  populacao: { idade: string; doenca: string; cenario: string } | null;
  desenho: Desenho | null;
  /** "coorte retrospectiva, centro único": the design in a few words. */
  desenhoDetalhe: string | null;
  limitacao: string | null;
  /** Declared conflicts of interest and funding, from the text read; NAO_INFORMADO when it gives none or was not read for them. Absent on older records. */
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
 * An article's part of its page (ServerModule.items): what it is trusted by, where its study stands, the study's
 * other versions and the other papers of its trial, and its corrections.
 */
export interface MateriaPart {
  confianca: Confianca | null;
  estado: Estado | null;
  versoes: Versao[];
  /** Other papers of the same trial (secondary, post-hoc, follow-up analyses): not versions of this one. */
  mesmoEnsaio: Versao[];
  correcoes: Correcao[];
}

/** "2026-10-31" → "31/10/2026"; "2026-10" → "10/2026"; "2026" stays. */
export function dataBr(day: string): string {
  const [y, m, d] = day.split("-");
  return [d, m, y].filter(Boolean).join("/");
}

/**
 * A matéria written before the single structure: its stored body, which is never rewritten, already has the
 * finding, the population, the design, the limitation and the text it was written from, so its card leaves them out.
 */
export function corpoJaDiz(c: Confianca): boolean {
  return c.feitura === "materia" && c.estrutura !== "unica";
}

/** A row of the card under "Em um minuto" (web/item-part.tsx). `estado` draws the stage's badge. */
export interface FichaRow {
  label: string;
  text?: string;
  note?: string;
  estado?: Estado;
}

/** The card's name, in every exit that shows it. */
export function fichaTitulo(c: Confianca): string {
  return c.feitura === "materia" || c.feitura === "traducao" ? "Ficha do estudo" : "Sobre a fonte";
}

/** The card: each row says something nothing else on the page does. */
export function fichaRows({ confianca: c, estado }: Pick<MateriaPart, "confianca" | "estado">): FichaRow[] {
  if (!c) return [];
  const antiga = corpoJaDiz(c);
  const study = c.feitura === "materia" || c.feitura === "traducao";
  const rows: Array<FichaRow | null> = [
    c.alerta ? { label: "Ato regulatório", text: `${CATEGORIA_ALERTA_LABEL[c.alerta.categoria]} (${c.alerta.orgao})`, note: "Não é evidência de eficácia nem de segurança clínica do produto." } : null,
    c.populacao && !antiga ? { label: "População", text: [c.populacao.idade, c.populacao.doenca, c.populacao.cenario].join(" · ") } : null,
    c.desenho && !antiga ? { label: study ? "Desenho" : "Documento", text: c.desenhoDetalhe ? `${DESENHO_LABEL[c.desenho]} (${c.desenhoDetalhe})` : DESENHO_LABEL[c.desenho] } : null,
    antiga ? null : { label: "Texto lido", text: TEXTO_LIDO_LABEL[c.textoLido] },
    estado ? { label: "Estágio da evidência", estado, note: ESTADO_NOTA[estado] } : null,
    c.conflitos ? { label: "Conflitos de interesse declarados", text: c.conflitos } : null,
    c.limitacao && !antiga ? { label: "Principal limitação", text: c.limitacao } : null,
    c.aplicabilidade ? { label: c.estrutura === "unica" ? "Na prática" : "O que se transfere ao contexto brasileiro", text: c.aplicabilidade } : null,
    c.datas ? { label: "Datas do documento", text: `Publicado: ${c.datas.publicado ? dataBr(c.datas.publicado) : "não informado"} · Revisado: ${c.datas.revisado ? dataBr(c.datas.revisado) : "não informado pela fonte"} · Verificado pelo jornal em ${dataBr(c.datas.conferido)}` } : null,
  ];
  return rows.filter((r): r is FichaRow => r !== null);
}

/**
 * The one line of transparency at the end of the piece: made with AI and published without a human review first,
 * so the editor follows what goes live and corrects it; named once the site names one (EXPEDIENTE). What it was
 * written from is on the card ("Texto lido").
 */
export function linhaTransparencia(c: Confianca, editor: string | null): string {
  const how = {
    materia: "Matéria escrita com inteligência artificial e publicada automaticamente",
    pagina: "Matéria escrita com inteligência artificial e publicada automaticamente",
    traducao: "Artigo traduzido na íntegra com inteligência artificial e publicado automaticamente",
    alerta: "Alerta escrito com inteligência artificial a partir do ato oficial e publicado automaticamente",
    aviso: "Aviso gerado automaticamente a partir da página oficial, sem leitura do documento",
  }[c.feitura];
  return `${how}; ${editor ? `o editor responsável, ${editor},` : "o editor responsável"} acompanha o que vai ao ar e corrige quando necessário.`;
}

const semPonto = (s: string) => s.replace(/[.\s]+$/, "");

/** "Em um minuto" in one line: the finding, then whether it changes anything now. */
export function minutoEmLinha(m: EmUmMinuto): string {
  return `${semPonto(m.achado)}. Muda algo agora? ${IMPLICACAO_LABEL[m.mudaAlgo]}${m.diretriz ? ` (${m.diretriz})` : ""}.`;
}

/** "Em um minuto" under a piece in the weekly e-mail, as plain text, or null for a piece without one. */
export function minutoCompacto(part: MateriaPart): string | null {
  return part.confianca?.minuto ? `Em um minuto: ${minutoEmLinha(part.confianca.minuto)}` : null;
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
