// A taxonomia do Fôlego (cirurgia torácica pediátrica, via aérea adulto e pediátrica, pneumologia pediátrica): categorias,
// vocabulário de tags, cadastro de sociedades e órgãos, e o dicionário de identidade.
// O modelo escolhe tags deste vocabulário; os tópicos (topics.json) se agrupam pelas tags; a barra de filtros agrupa por categoria.
// Depois de publicado, não mude a key das categorias (ela aparece na URL: /all?category=…); tags e cadastro podem mudar.

/**
 * Categorias do site (barra de filtros, selo nos cartões, RSS por categoria). A key é a identidade na URL e na API: não mude depois de publicar.
 * section é o título da seção nas edições (várias categorias podem dividir uma seção, na ordem desta lista); guide diz ao
 * modelo de estruturação o que entra nesta categoria e onde fica a fronteira com as vizinhas (os princípios gerais estão em prompts/structure.md).
 * commentary marca as categorias de comentário: quando a edição já cobriu um fato e chega uma continuação
 * desse tipo, ela ocupa só uma linha de nota curta (salvo quando muitas fontes cobrem).
 * O que não couber em nenhuma categoria vai para a seção da categoria de key industry (ou para a última seção, se não houver).
 * feedLabel é o nome no título do RSS por categoria (se omitido, usa label).
 */
export const CATEGORIES = [
  { key: "evidence", label: "Estudos", feedLabel: "Estudos clínicos", section: "Estudos clínicos", guide: "Estudos com pacientes que medem desfecho: ensaios clínicos, coortes prospectivas ou retrospectivas, séries de casos com mais de cinco pacientes, estudos comparativos, registros multicêntricos, estudos diagnósticos, revisões sistemáticas e metanálises. Uma série de até cinco pacientes ou um relato de caso vai para cases; a descrição de como fazer um procedimento, sem resultados comparados, vai para technique." },
  { key: "guidelines", label: "Diretrizes", feedLabel: "Diretrizes, consensos e regulação", section: "Diretrizes e regulação", guide: "Diretrizes clínicas, consensos de especialistas, posicionamentos oficiais de sociedades (SBCT, SBPT, SBP, ABORL-CCF, APSA, ESTS, ATS, ERS, AAO-HNS), atos de reguladores sobre dispositivos e medicamentos da área (aprovação, recall, alerta de segurança de stents, cânulas de traqueostomia, ventiladores, válvulas endobrônquicas), normas do Ministério da Saúde, do SUS, da ANS e do CFM. A revisão narrativa de um grupo de autores sem processo formal de consenso vai para reviews." },
  { key: "technique", label: "Técnica", feedLabel: "Técnica e inovação", section: "Técnica e inovação", guide: "Como fazer: descrição ou modificação de técnica cirúrgica ou endoscópica, notas técnicas, vídeos cirúrgicos, novos dispositivos e materiais (stents, enxertos, impressão 3D, bioengenharia de via aérea), modelos de simulação e treinamento. Se o texto compara resultados de grupos de pacientes de forma estruturada, vai para evidence." },
  { key: "cases", label: "Casos", feedLabel: "Casos curiosos", section: "Casos curiosos", guide: "Relatos de caso e séries de até cinco pacientes, imagens clínicas, achados inesperados, cartas sobre um caso. Doenças raras e complicações inesperadas costumam aparecer aqui." },
  { key: "reviews", label: "Revisões", feedLabel: "Fundamentos", section: "Fundamentos", guide: "Revisões narrativas e conceituais que nivelam o conhecimento (inclusive do pediatra geral): estado da arte, capítulos e textos de ensino, artigos de atualização. Uma revisão com busca sistemática e critérios explícitos vai para evidence." },
  { key: "opinion", label: "Opinião", feedLabel: "Opinião e debate", section: "Opinião e debate", guide: "Editoriais, comentários de especialistas sobre um artigo, debates pró e contra, cartas ao editor que discutem condutas, entrevistas. O foco é a interpretação ou a posição do autor.", commentary: true },
  { key: "industry", label: "Notícias", feedLabel: "Sociedades, eventos e ensaios em andamento", section: "Sociedades e eventos", guide: "Notícias de sociedades e instituições, congressos, cursos e programas de formação, prêmios, ensaios clínicos registrados ou iniciados, financiamento de pesquisa, notícias de imprensa sobre a área. O registro de um ensaio ainda sem resultados fica aqui, não em evidence." },
] as const satisfies ReadonlyArray<{ key: string; label: string; feedLabel?: string; section: string; guide: string; commentary?: true }>;

/**
 * Seções por tag: um item com a tag vai para esta seção em vez da seção da sua categoria, e assim aparece uma vez só
 * na edição. Vêm antes das seções por categoria, na ordem desta lista. A tag tem de estar no vocabulário abaixo.
 */
export const TAG_SECTIONS: ReadonlyArray<{ tag: string; section: string }> = [
  { tag: "Brasil", section: "Do Brasil" },
];

/**
 * Fontes sem o teto de duas entradas por fonte no corpo da nota diária: as duas fontes de artigos do PubMed
 * (modules/literatura), em que cada item é um artigo diferente e não a mesma redação repetida.
 */
export const UNCAPPED_SOURCES: readonly string[] = ["literatura-materia", "literatura-integral"];

/**
 * O tipo de publicação mais acompanhado neste setor (aqui, diretrizes e consensos): o número no cabeçalho das edições.
 * Só conta quando categoria e tag batem; unit vem logo depois do número. Setores sem esse tipo usam null.
 */
export const RELEASE: { category: string; tag: string; unit: string } | null = { category: "guidelines", tag: "Diretriz/consenso", unit: " diretrizes e consensos" };

/** Termos comuns do setor que a visão geral da edição semanal/mensal pode usar sem achar a origem nas notas (minúsculas). O nome do site já conta. */
export const PLAIN_TERMS: readonly string[] = ["sus", "uti", "utip", "orl", "ecmo", "vats", "cpam", "rct", "fc", "ltp", "fda", "anvisa"];

/**
 * O tipo de conteúdo que a etapa de compreensão atribui a cada item (definido em prompts/content-understanding.md; mudou aqui, mude lá).
 * O prompt de pontuação (prompts/selection-score.md) dá pesos diferentes aos cinco eixos conforme o tipo.
 */
export const ITEM_TYPES = ["clinical_study", "systematic_review", "guideline", "technique", "case_report", "narrative_review", "opinion", "news"] as const;

// ── Vocabulário de tags ─────────────────────────────────────────────────────────────────

/** A primeira tag de cada item tem de ser uma destas "tags de categoria". A última é o padrão quando nenhuma serve. */
export const CATEGORY_TAGS = [
  "Ensaio clínico", "Estudo observacional", "Revisão sistemática", "Diretriz/consenso", "Regulação", "Técnica cirúrgica", "Dispositivo",
  "Relato de caso", "Revisão narrativa", "Opinião", "Sociedades/eventos", "Ensaio registrado", "Fora do tema", "Outros",
] as const;

/** Tags de tema opcionais: doenças, procedimentos, áreas e a origem brasileira (TAG_SECTIONS). */
export const TOPIC_TAGS = [
  // Via aérea
  "Estenose subglótica", "Estenose traqueal", "Laringotraqueoplastia", "Ressecção cricotraqueal", "Traqueostomia", "Decanulação",
  "Laringomalácia", "Traqueobroncomalácia", "Paralisia de pregas vocais", "Fenda laríngea", "Papilomatose respiratória", "Corpo estranho",
  "Fístula traqueoesofágica", "Atresia de esôfago", "Broncoscopia", "Stents de via aérea", "Via aérea difícil", "Via aérea adulto",
  // Cirurgia torácica pediátrica
  "Malformações pulmonares", "Hérnia diafragmática", "Pectus", "Empiema", "Pneumotórax", "Tumores torácicos", "Mediastino",
  "Cirurgia minimamente invasiva",
  // Pneumologia pediátrica e cuidados intensivos
  "Fibrose cística", "Bronquiectasias", "Discinesia ciliar", "Displasia broncopulmonar", "Transplante pulmonar", "ECMO",
  "Ventilação mecânica", "Neonatologia",
  // Origem
  "Brasil",
] as const;

/** Tags opcionais de entidade (sociedades e órgãos). */
export const ENTITY_TAGS = ["SBCT", "SBPT", "SBP", "ABORL-CCF", "APSA", "ESTS", "ATS", "ERS", "FDA", "ANVISA"] as const;

/** Sinônimos que o modelo costuma escrever, normalizados para a forma do vocabulário. */
export const TAG_SYNONYMS: Readonly<Record<string, string>> = {
  rct: "Ensaio clínico", "ensaio randomizado": "Ensaio clínico", "ensaio clínico randomizado": "Ensaio clínico", "clinical trial": "Ensaio clínico", ensaio: "Ensaio clínico",
  coorte: "Estudo observacional", "estudo retrospectivo": "Estudo observacional", "estudo prospectivo": "Estudo observacional", "série de casos": "Estudo observacional", "estudo comparativo": "Estudo observacional", registro: "Estudo observacional", "estudo diagnóstico": "Estudo observacional", estudo: "Estudo observacional",
  metanálise: "Revisão sistemática", "meta-análise": "Revisão sistemática", "revisão sistemática e metanálise": "Revisão sistemática",
  diretriz: "Diretriz/consenso", consenso: "Diretriz/consenso", guideline: "Diretriz/consenso", posicionamento: "Diretriz/consenso", recomendação: "Diretriz/consenso",
  regulação: "Regulação", recall: "Regulação", "alerta de segurança": "Regulação", aprovação: "Regulação", norma: "Regulação", política: "Regulação",
  técnica: "Técnica cirúrgica", "nota técnica": "Técnica cirúrgica", "vídeo cirúrgico": "Técnica cirúrgica", simulação: "Técnica cirúrgica",
  dispositivo: "Dispositivo", stent: "Dispositivo", "impressão 3d": "Dispositivo", enxerto: "Dispositivo",
  "relato de caso": "Relato de caso", caso: "Relato de caso", "case report": "Relato de caso",
  revisão: "Revisão narrativa", "estado da arte": "Revisão narrativa", atualização: "Revisão narrativa", ensino: "Revisão narrativa",
  opinião: "Opinião", editorial: "Opinião", comentário: "Opinião", carta: "Opinião", debate: "Opinião",
  congresso: "Sociedades/eventos", evento: "Sociedades/eventos", curso: "Sociedades/eventos", sociedade: "Sociedades/eventos", notícia: "Sociedades/eventos",
  "ensaio em andamento": "Ensaio registrado", "protocolo de estudo": "Ensaio registrado",
  "fora do tema": "Fora do tema", outros: "Outros", outro: "Outros",
  "estenose laringotraqueal": "Estenose subglótica", "estenose subglótica adquirida": "Estenose subglótica", "estenose subglótica congênita": "Estenose subglótica",
  ltp: "Laringotraqueoplastia", "reconstrução laringotraqueal": "Laringotraqueoplastia", "enxerto de cartilagem costal": "Laringotraqueoplastia",
  "ressecção traqueal": "Estenose traqueal", "anastomose traqueal": "Estenose traqueal", "traqueoplastia por deslizamento": "Estenose traqueal", "slide tracheoplasty": "Estenose traqueal",
  crt: "Ressecção cricotraqueal", "ressecção cricotraqueal parcial": "Ressecção cricotraqueal",
  traqueomalácia: "Traqueobroncomalácia", broncomalácia: "Traqueobroncomalácia", aortopexia: "Traqueobroncomalácia", traqueopexia: "Traqueobroncomalácia",
  "paralisia de corda vocal": "Paralisia de pregas vocais", "paralisia bilateral de pregas vocais": "Paralisia de pregas vocais",
  "fenda laringotraqueal": "Fenda laríngea", "papilomatose respiratória recorrente": "Papilomatose respiratória",
  "aspiração de corpo estranho": "Corpo estranho", "fístula traqueoesofágica": "Fístula traqueoesofágica",
  broncoscopia: "Broncoscopia", "broncoscopia rígida": "Broncoscopia", "broncoscopia flexível": "Broncoscopia", endoscopia: "Broncoscopia", "pneumologia intervencionista": "Broncoscopia",
  intubação: "Via aérea difícil", "intubação difícil": "Via aérea difícil",
  cpam: "Malformações pulmonares", "malformação adenomatoide cística": "Malformações pulmonares", sequestro: "Malformações pulmonares", "sequestro pulmonar": "Malformações pulmonares", "enfisema lobar congênito": "Malformações pulmonares", "cisto broncogênico": "Malformações pulmonares",
  "hérnia diafragmática congênita": "Hérnia diafragmática", hdc: "Hérnia diafragmática", cdh: "Hérnia diafragmática",
  "pectus excavatum": "Pectus", "pectus carinatum": "Pectus", nuss: "Pectus",
  "derrame parapneumônico": "Empiema", "pneumonia necrotizante": "Empiema",
  "tumor de mediastino": "Mediastino", neuroblastoma: "Tumores torácicos", "tumor pulmonar": "Tumores torácicos",
  vats: "Cirurgia minimamente invasiva", toracoscopia: "Cirurgia minimamente invasiva", robótica: "Cirurgia minimamente invasiva", "cirurgia robótica": "Cirurgia minimamente invasiva",
  fc: "Fibrose cística", mucoviscidose: "Fibrose cística", "discinesia ciliar primária": "Discinesia ciliar",
  dbp: "Displasia broncopulmonar", ventilação: "Ventilação mecânica", "ventilação domiciliar": "Ventilação mecânica", uti: "Ventilação mecânica",
  brasil: "Brasil", brasileiro: "Brasil", "do brasil": "Brasil",
  "recém-nascido": "Neonatologia", neonatal: "Neonatologia", prematuridade: "Neonatologia",
};

// ── Sociedades e órgãos ─────────────────────────────────────────────────────────────────

/**
 * Tópicos de sociedade/instituição: id → nome exibido, tag no cartão (null = só agrupa por entity:<id>), apelidos.
 * aliases servem ao modelo de estruturação; otherNames são outros nomes da própria organização (contas oficiais,
 * submarcas), também aceitos ao ligar o sujeito de uma notícia à organização.
 */
export const ENTITIES: Record<string, { name: string; displayTag: string | null; aliases: string[]; otherNames?: string[] }> = {
  sbct: { name: "SBCT", displayTag: "SBCT", aliases: ["SBCT", "Sociedade Brasileira de Cirurgia Torácica"] },
  sbpt: { name: "SBPT", displayTag: "SBPT", aliases: ["SBPT", "Sociedade Brasileira de Pneumologia e Tisiologia", "Jornal Brasileiro de Pneumologia"] },
  sbp: { name: "SBP", displayTag: "SBP", aliases: ["SBP", "Sociedade Brasileira de Pediatria"] },
  aborl: { name: "ABORL-CCF", displayTag: "ABORL-CCF", aliases: ["ABORL-CCF", "ABORL", "Associação Brasileira de Otorrinolaringologia e Cirurgia Cérvico-Facial"] },
  cipe: { name: "CIPE", displayTag: null, aliases: ["CIPE", "Associação Brasileira de Cirurgia Pediátrica"] },
  apsa: { name: "APSA", displayTag: "APSA", aliases: ["APSA", "American Pediatric Surgical Association"] },
  ests: { name: "ESTS", displayTag: "ESTS", aliases: ["ESTS", "European Society of Thoracic Surgeons"] },
  sts: { name: "STS", displayTag: null, aliases: ["STS", "Society of Thoracic Surgeons"] },
  aats: { name: "AATS", displayTag: null, aliases: ["AATS", "American Association for Thoracic Surgery"] },
  ats: { name: "ATS", displayTag: "ATS", aliases: ["ATS", "American Thoracic Society"] },
  ers: { name: "ERS", displayTag: "ERS", aliases: ["ERS", "European Respiratory Society"] },
  chest: { name: "CHEST", displayTag: null, aliases: ["CHEST", "American College of Chest Physicians", "ACCP"] },
  aaohns: { name: "AAO-HNS", displayTag: null, aliases: ["AAO-HNS", "American Academy of Otolaryngology–Head and Neck Surgery"] },
  aspo: { name: "ASPO", displayTag: null, aliases: ["ASPO", "American Society of Pediatric Otolaryngology"] },
  espo: { name: "ESPO", displayTag: null, aliases: ["ESPO", "European Society of Pediatric Otorhinolaryngology"] },
  fda: { name: "FDA", displayTag: "FDA", aliases: ["FDA", "Food and Drug Administration"], otherNames: ["U.S. FDA", "US FDA", "CDRH"] },
  anvisa: { name: "ANVISA", displayTag: "ANVISA", aliases: ["ANVISA", "Anvisa", "Agência Nacional de Vigilância Sanitária"] },
  "ministerio-saude": { name: "Ministério da Saúde", displayTag: null, aliases: ["Ministério da Saúde", "SUS", "Conitec"] },
  cff: { name: "Cystic Fibrosis Foundation", displayTag: null, aliases: ["Cystic Fibrosis Foundation", "CF Foundation"] },
};

/**
 * Dicionário de identidade: uma organização citada no título ou no resumo precisa aparecer também no original;
 * se não aparecer, volta-se ao título original e descarta-se o resumo (evita atribuir um texto à sociedade errada).
 * Só siglas inequívocas e nomes por extenso: ATS, ERS e STS são curtas demais para um padrão seguro.
 */
export const IDENTITY_LEXICON: ReadonlyArray<{ id: string; name: string; patterns: RegExp[] }> = [
  { id: "sbct", name: "SBCT", patterns: [/\bSBCT\b/, /sociedade brasileira de cirurgia tor[áa]cica/i] },
  { id: "sbpt", name: "SBPT", patterns: [/\bSBPT\b/, /sociedade brasileira de pneumologia/i] },
  { id: "aborl", name: "ABORL-CCF", patterns: [/\bABORL\b/, /associa[çc][ãa]o brasileira de otorrinolaringologia/i] },
  { id: "apsa", name: "APSA", patterns: [/\bAPSA\b/, /american pediatric surgical association/i] },
  { id: "ests", name: "ESTS", patterns: [/\bESTS\b/, /european society of thoracic surgeons/i] },
  { id: "fda", name: "FDA", patterns: [/\bFDA\b/, /food and drug administration/i] },
  { id: "anvisa", name: "ANVISA", patterns: [/\banvisa\b/i] },
];

/** Artigos nestes domínios têm como publicador a organização correspondente. */
export const PUBLISHER_DOMAINS: ReadonlyArray<{ entityId: string; domains: readonly string[] }> = [
  { entityId: "sbct", domains: ["sbct.com.br"] },
  { entityId: "sbpt", domains: ["sbpt.org.br", "jornaldepneumologia.com.br"] },
  { entityId: "sbp", domains: ["sbp.com.br"] },
  { entityId: "aborl", domains: ["aborlccf.org.br"] },
  { entityId: "apsa", domains: ["eapsa.org"] },
  { entityId: "ests", domains: ["ests.org"] },
  { entityId: "sts", domains: ["sts.org"] },
  { entityId: "aats", domains: ["aats.org"] },
  { entityId: "ats", domains: ["thoracic.org"] },
  { entityId: "ers", domains: ["ersnet.org"] },
  { entityId: "chest", domains: ["chestnet.org"] },
  { entityId: "aaohns", domains: ["entnet.org"] },
  { entityId: "fda", domains: ["fda.gov"] },
  { entityId: "anvisa", domains: ["anvisa.gov.br"] },
  { entityId: "cff", domains: ["cff.org"] },
];

/** Estas formas no original também contam como menção à organização. */
export const IDENTITY_CONTEXT_ALIASES: ReadonlyArray<{ entityId: string; pattern: RegExp }> = [
  { entityId: "fda", pattern: /\bU\.?S\.? Food and Drug Administration\b/i },
  { entityId: "anvisa", pattern: /vigil[âa]ncia sanit[áa]ria/i },
];
