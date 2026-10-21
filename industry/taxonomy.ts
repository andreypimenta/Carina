// A taxonomia deste setor (IA em medicina): categorias, vocabulário de tags, cadastro de empresas e instituições,
// e o dicionário de identidade que impede o modelo de atribuir uma notícia à empresa errada.
// O modelo escolhe tags deste vocabulário; os tópicos (topics.json) se agrupam pelas tags; a barra de filtros agrupa por categoria.
// Depois de publicado, não mude a key das categorias (ela aparece na URL: /all?category=…); tags e cadastro podem mudar.

/**
 * Categorias do site (barra de filtros, selo nos cartões, RSS por categoria). A key é a identidade na URL e na API: não mude depois de publicar.
 * section é o título da seção no jornal diário (várias categorias podem dividir uma seção, na ordem desta lista); guide diz ao
 * modelo de estruturação o que entra nesta categoria e onde fica a fronteira com as vizinhas (os princípios gerais estão em prompts/structure.md).
 * commentary marca as categorias de comentário (prática, opinião): quando o jornal já cobriu um fato e chega uma continuação
 * desse tipo, ela ocupa só uma linha de nota curta (salvo quando muitas fontes cobrem).
 * O que não couber em nenhuma categoria vai para a seção da categoria de key industry (ou para a última seção, se não houver).
 * feedLabel é o nome no título do RSS por categoria (se omitido, usa label).
 */
export const CATEGORIES = [
  { key: "clinical-evidence", label: "Evidência", feedLabel: "Evidência clínica", section: "Estudos e evidência clínica", guide: "Estudos que testam IA em pacientes ou dados clínicos reais e medem desempenho ou desfecho: ensaios clínicos randomizados, validações prospectivas ou retrospectivas, estudos de implementação com desfecho medido, revisões sistemáticas e metanálises. Um novo modelo apresentado só com benchmark técnico vai para research; a notícia de que um hospital adotou uma ferramenta, sem desfecho medido, vai para industry." },
  { key: "regulatory", label: "Regulação", feedLabel: "Regulação e políticas", section: "Regulação e políticas", guide: "Atos de órgãos reguladores e de governo: aprovações e liberações (FDA 510(k), De Novo, PMA, ANVISA, marcação CE), recalls e alertas, normas, leis, resoluções de conselhos profissionais (CFM), reembolso e cobertura, diretrizes e posicionamentos oficiais de sociedades médicas sobre IA. A empresa anunciar a própria aprovação continua sendo regulatory." },
  { key: "products", label: "Produtos", feedLabel: "Produtos e ferramentas", section: "Produtos e ferramentas", guide: "Lançamentos e atualizações de produtos de IA para a saúde que já podem ser usados ou contratados: software como dispositivo médico, escribas e documentação clínica, apoio à decisão, ferramentas para pacientes, recursos de saúde em assistentes gerais (ChatGPT, Claude, Gemini) e plataformas para hospitais. A aprovação regulatória do produto vai para regulatory; um modelo de pesquisa sem produto vai para research." },
  { key: "research", label: "Pesquisa", feedLabel: "Pesquisa e modelos", section: "Pesquisa e modelos", guide: "Novos modelos (incluindo modelos fundacionais médicos), métodos, benchmarks, conjuntos de dados e artigos técnicos cujo foco é a capacidade do sistema, não o efeito em pacientes. Inclui preprints. Se o estudo mede desempenho clínico em pacientes ou dados reais de forma planejada, vai para clinical-evidence." },
  { key: "industry", label: "Mercado", feedLabel: "Mercado e sistemas de saúde", section: "Mercado e sistemas de saúde", guide: "Fatos já ocorridos no negócio e na adoção: investimentos, aquisições, parcerias, contratações de executivos, adoção por hospitais e sistemas de saúde, processos judiciais, incidentes reais de segurança, vazamentos e investigações. Uma empresa que publica a notícia com opinião não a torna opinion." },
  { key: "practice", label: "Prática", feedLabel: "IA na prática clínica", section: "Prática e opinião", guide: "O que o leitor pode aplicar: guias de uso, relatos detalhados de implementação com lições, boas práticas, prompts e fluxos clínicos, explicações técnicas para médicos. O foco é o como fazer; o lançamento de uma ferramenta vai para products; só posição sem método vai para opinion.", commentary: true },
  { key: "opinion", label: "Opinião", feedLabel: "Opinião e análise", section: "Prática e opinião", guide: "O foco é a interpretação, crítica, previsão ou posição do autor: editoriais, comentários de revistas, entrevistas, análises de tendência. Falar de mercado não torna o texto industry; o autor ser famoso não o torna opinion.", commentary: true },
] as const satisfies ReadonlyArray<{ key: string; label: string; feedLabel?: string; section: string; guide: string; commentary?: true }>;

/**
 * O tipo de anúncio mais acompanhado neste setor (aqui, aprovações regulatórias): o número no cabeçalho do jornal diário.
 * Só conta quando categoria e tag batem; unit vem logo depois do número. Setores sem esse tipo usam null.
 */
export const RELEASE: { category: string; tag: string; unit: string } | null = { category: "regulatory", tag: "Aprovação regulatória", unit: " aprovações regulatórias" };

/** Termos comuns do setor que a visão geral do relatório semanal/mensal pode usar sem achar a origem nas notas (minúsculas). O nome do site já conta. */
export const PLAIN_TERMS: readonly string[] = ["ia", "ai", "llm", "fda", "anvisa", "sus", "ehr", "pep", "ceo", "oms"];

/**
 * O tipo de conteúdo que a etapa de compreensão atribui a cada item (definido em prompts/content-understanding.md; mudou aqui, mude lá).
 * O prompt de pontuação (prompts/selection-score.md) dá pesos diferentes aos cinco eixos conforme o tipo.
 */
export const ITEM_TYPES = ["clinical_study", "regulatory_action", "product_launch", "model_or_research", "industry_event", "practice_guide", "opinion_analysis"] as const;

// ── Vocabulário de tags ─────────────────────────────────────────────────────────────────

/** A primeira tag de cada item tem de ser uma destas "tags de categoria". A última é o padrão quando nenhuma serve. */
export const CATEGORY_TAGS = [
  "Ensaio clínico", "Estudo de validação", "Revisão/metanálise", "Aprovação regulatória", "Política/regulação", "Produto/lançamento",
  "Modelo/pesquisa", "Benchmark/avaliação", "Mercado/negócios", "Implementação/adoção", "Segurança/viés", "Guia/prática", "Opinião",
  "Não-IA", "Outros",
] as const;

/** Tags de tema opcionais: especialidades e áreas de aplicação. */
export const TOPIC_TAGS = [
  "Radiologia", "Patologia", "Cardiologia", "Oncologia", "Pneumologia", "Cirurgia", "Dermatologia", "Oftalmologia", "Neurologia",
  "Medicina intensiva", "Emergência", "Atenção primária", "Saúde mental", "Pediatria", "Genômica", "Descoberta de fármacos",
  "Documentação clínica", "IA generativa", "Agentes", "Wearables/monitoramento", "Saúde digital", "Ensino médico",
] as const;

/** Tags opcionais de entidade (órgãos, empresas, plataformas). */
export const ENTITY_TAGS = ["FDA", "ANVISA", "OMS", "Google", "Microsoft", "OpenAI", "Anthropic", "NVIDIA", "Epic"] as const;

/** Sinônimos que o modelo costuma escrever, normalizados para a forma do vocabulário. */
export const TAG_SYNONYMS: Readonly<Record<string, string>> = {
  rct: "Ensaio clínico", "ensaio randomizado": "Ensaio clínico", "ensaio clínico randomizado": "Ensaio clínico", "clinical trial": "Ensaio clínico", ensaio: "Ensaio clínico",
  validação: "Estudo de validação", "estudo retrospectivo": "Estudo de validação", "estudo prospectivo": "Estudo de validação", "estudo clínico": "Estudo de validação", estudo: "Estudo de validação",
  metanálise: "Revisão/metanálise", "meta-análise": "Revisão/metanálise", "revisão sistemática": "Revisão/metanálise", revisão: "Revisão/metanálise",
  aprovação: "Aprovação regulatória", liberação: "Aprovação regulatória", "510(k)": "Aprovação regulatória", "de novo": "Aprovação regulatória", clearance: "Aprovação regulatória", registro: "Aprovação regulatória",
  regulação: "Política/regulação", regulamentação: "Política/regulação", política: "Política/regulação", lei: "Política/regulação", norma: "Política/regulação", diretriz: "Política/regulação", reembolso: "Política/regulação",
  produto: "Produto/lançamento", lançamento: "Produto/lançamento", atualização: "Produto/lançamento", ferramenta: "Produto/lançamento",
  modelo: "Modelo/pesquisa", pesquisa: "Modelo/pesquisa", artigo: "Modelo/pesquisa", preprint: "Modelo/pesquisa", paper: "Modelo/pesquisa",
  benchmark: "Benchmark/avaliação", avaliação: "Benchmark/avaliação",
  mercado: "Mercado/negócios", negócios: "Mercado/negócios", investimento: "Mercado/negócios", aquisição: "Mercado/negócios", parceria: "Mercado/negócios", financiamento: "Mercado/negócios",
  implementação: "Implementação/adoção", adoção: "Implementação/adoção",
  segurança: "Segurança/viés", viés: "Segurança/viés", equidade: "Segurança/viés", privacidade: "Segurança/viés", incidente: "Segurança/viés",
  guia: "Guia/prática", tutorial: "Guia/prática", prática: "Guia/prática", "boas práticas": "Guia/prática",
  opinião: "Opinião", editorial: "Opinião", análise: "Opinião", comentário: "Opinião",
  "não ia": "Não-IA", "non-ai": "Não-IA", outros: "Outros", outro: "Outros",
  radiology: "Radiologia", pathology: "Patologia", cardiology: "Cardiologia", oncology: "Oncologia", câncer: "Oncologia",
  "cirurgia torácica": "Cirurgia", "uti": "Medicina intensiva", "terapia intensiva": "Medicina intensiva",
  scribe: "Documentação clínica", escriba: "Documentação clínica", "escriba ambiental": "Documentação clínica",
  llm: "IA generativa", "ia generativa": "IA generativa", genai: "IA generativa", agente: "Agentes",
  wearable: "Wearables/monitoramento", telessaúde: "Saúde digital", telemedicina: "Saúde digital", educação: "Ensino médico",
};

// ── Empresas e instituições ─────────────────────────────────────────────────────────────

/**
 * Tópicos de empresa/instituição: id → nome exibido, tag no cartão (null = só agrupa por entity:<id>), apelidos.
 * aliases servem ao modelo de estruturação; otherNames são outros nomes da própria organização (contas oficiais,
 * submarcas), também aceitos ao ligar o sujeito de uma notícia à organização.
 */
export const ENTITIES: Record<string, { name: string; displayTag: string | null; aliases: string[]; otherNames?: string[] }> = {
  fda: { name: "FDA", displayTag: "FDA", aliases: ["FDA", "Food and Drug Administration"], otherNames: ["U.S. FDA", "US FDA", "CDRH"] },
  anvisa: { name: "ANVISA", displayTag: "ANVISA", aliases: ["ANVISA", "Anvisa", "Agência Nacional de Vigilância Sanitária"] },
  ema: { name: "EMA", displayTag: null, aliases: ["EMA", "European Medicines Agency", "Agência Europeia de Medicamentos"] },
  who: { name: "OMS", displayTag: "OMS", aliases: ["OMS", "WHO", "World Health Organization", "Organização Mundial da Saúde"] },
  "ministerio-saude": { name: "Ministério da Saúde", displayTag: null, aliases: ["Ministério da Saúde", "SUS"] },
  cfm: { name: "CFM", displayTag: null, aliases: ["CFM", "Conselho Federal de Medicina"] },
  nhs: { name: "NHS", displayTag: null, aliases: ["NHS", "National Health Service"], otherNames: ["NHS England"] },
  google: { name: "Google", displayTag: "Google", aliases: ["Google", "DeepMind", "Gemini", "Med-Gemini", "AMIE"], otherNames: ["Google DeepMind", "Google Research", "Google Health", "Verily"] },
  microsoft: { name: "Microsoft", displayTag: "Microsoft", aliases: ["Microsoft", "Nuance", "DAX Copilot", "Dragon Copilot"], otherNames: ["Microsoft Research", "Microsoft Health"] },
  openai: { name: "OpenAI", displayTag: "OpenAI", aliases: ["OpenAI", "ChatGPT", "GPT", "HealthBench"], otherNames: ["ChatGPT Health"] },
  anthropic: { name: "Anthropic", displayTag: "Anthropic", aliases: ["Anthropic", "Claude"] },
  nvidia: { name: "NVIDIA", displayTag: "NVIDIA", aliases: ["NVIDIA", "Clara"], otherNames: ["NVIDIA Healthcare"] },
  epic: { name: "Epic", displayTag: "Epic", aliases: ["Epic Systems", "Epic"] },
  abridge: { name: "Abridge", displayTag: null, aliases: ["Abridge"] },
  aidoc: { name: "Aidoc", displayTag: null, aliases: ["Aidoc"] },
  "viz-ai": { name: "Viz.ai", displayTag: null, aliases: ["Viz.ai", "Viz"] },
  tempus: { name: "Tempus", displayTag: null, aliases: ["Tempus", "Tempus AI"] },
  paige: { name: "Paige", displayTag: null, aliases: ["Paige", "Paige AI"] },
  pathai: { name: "PathAI", displayTag: null, aliases: ["PathAI"] },
  philips: { name: "Philips", displayTag: null, aliases: ["Philips", "Philips Healthcare"] },
  "siemens-healthineers": { name: "Siemens Healthineers", displayTag: null, aliases: ["Siemens Healthineers", "Siemens"] },
  "ge-healthcare": { name: "GE HealthCare", displayTag: null, aliases: ["GE HealthCare", "GE Healthcare"] },
  "isomorphic-labs": { name: "Isomorphic Labs", displayTag: null, aliases: ["Isomorphic Labs", "Isomorphic"] },
  // China
  nmpa: { name: "NMPA", displayTag: null, aliases: ["NMPA", "国家药品监督管理局", "国家药监局", "National Medical Products Administration"], otherNames: ["CMDE", "医疗器械技术审评中心", "国家药监局器审中心", "CFDA"] },
  "yidu-tech": { name: "Yidu Tech", displayTag: null, aliases: ["医渡科技", "Yidu Tech", "医渡"], otherNames: ["Yidu Technology", "2158.HK"] },
  "united-imaging": { name: "United Imaging", displayTag: null, aliases: ["联影", "联影医疗", "联影智能", "United Imaging", "United Imaging Intelligence"], otherNames: ["uAI", "United Imaging Healthcare", "UIH"] },
  infervision: { name: "Infervision", displayTag: null, aliases: ["推想医疗", "推想科技", "Infervision"] },
  "iflytek-healthcare": { name: "iFlytek Healthcare", displayTag: null, aliases: ["讯飞医疗", "科大讯飞医疗", "iFlytek Healthcare", "智医助理"], otherNames: ["讯飞星火医疗大模型", "iFlytek"] },
  shukun: { name: "Shukun", displayTag: null, aliases: ["数坤科技", "数坤", "Shukun", "Shukun Technology"] },
  deepwise: { name: "Deepwise", displayTag: null, aliases: ["深睿医疗", "Deepwise"] },
  airdoc: { name: "Airdoc", displayTag: null, aliases: ["鹰瞳科技", "鹰瞳", "Airdoc"], otherNames: ["鹰瞳Airdoc", "2251.HK"] },
  "alibaba-health": { name: "Alibaba Health", displayTag: null, aliases: ["阿里健康", "Alibaba Health"], otherNames: ["阿里巴巴达摩院医疗", "DAMO Academy"] },
  "ant-healthcare": { name: "Ant Group (saúde)", displayTag: null, aliases: ["蚂蚁阿福", "安诊儿", "蚂蚁AQ", "Ant Group"], otherNames: ["蚂蚁集团", "蚂蚁医疗大模型"] },
  "ping-an-health": { name: "Ping An Health", displayTag: null, aliases: ["平安健康", "平安好医生", "Ping An Health", "Ping An Good Doctor"] },
  baichuan: { name: "Baichuan", displayTag: null, aliases: ["百川智能", "Baichuan", "Baichuan-M2", "Baichuan-M3"], otherNames: ["百小应", "王小川"] },
  "jd-health": { name: "JD Health", displayTag: null, aliases: ["京东健康", "JD Health", "京医千询"] },
  "baidu-health": { name: "Baidu (saúde)", displayTag: null, aliases: ["百度灵医", "灵医智惠", "Baidu Lingyi"] },
  "tencent-health": { name: "Tencent Health", displayTag: null, aliases: ["腾讯健康", "腾讯觅影", "Tencent Miying", "Tencent Health"] },
};

/**
 * Dicionário de identidade: uma empresa citada no título ou no resumo precisa aparecer também no original;
 * se não aparecer, volta-se ao título original e descarta-se o resumo (evita atribuição errada).
 */
export const IDENTITY_LEXICON: ReadonlyArray<{ id: string; name: string; patterns: RegExp[] }> = [
  { id: "openai", name: "OpenAI", patterns: [/openai|chatgpt|\bgpt-?[o\d]|healthbench/i] },
  { id: "anthropic", name: "Anthropic", patterns: [/anthropic|\bclaude\b/i] },
  { id: "google", name: "Google / DeepMind", patterns: [/google|deepmind|\bgemini\b|\bAMIE\b|\bAlphaFold\b|\bverily\b/i] },
  { id: "microsoft", name: "Microsoft / Nuance", patterns: [/microsoft|\bnuance\b|\bdax\b|dragon\s?copilot/i] },
  { id: "nvidia", name: "NVIDIA", patterns: [/nvidia|\bclara\b/i] },
  { id: "meta", name: "Meta", patterns: [/\bMeta\b/, /\bllama\b/i] },
  { id: "amazon", name: "Amazon / AWS", patterns: [/amazon|\baws\b|one\s?medical/i] },
  { id: "apple", name: "Apple", patterns: [/\bapple\b/i] },
  { id: "epic", name: "Epic", patterns: [/\bepic\s?systems\b|\bEpic\b/] },
  { id: "abridge", name: "Abridge", patterns: [/\babridge\b/i] },
  { id: "aidoc", name: "Aidoc", patterns: [/\baidoc\b/i] },
  { id: "viz-ai", name: "Viz.ai", patterns: [/\bviz\.ai\b/i] },
  { id: "tempus", name: "Tempus", patterns: [/\bTempus\b/] },
  { id: "pathai", name: "PathAI", patterns: [/\bpathai\b/i] },
  { id: "philips", name: "Philips", patterns: [/\bphilips\b/i] },
  { id: "siemens-healthineers", name: "Siemens Healthineers", patterns: [/siemens/i] },
  { id: "ge-healthcare", name: "GE HealthCare", patterns: [/\bGE\s?health\s?care\b/i] },
  { id: "isomorphic-labs", name: "Isomorphic Labs", patterns: [/isomorphic/i] },
];

/** Artigos nestes domínios têm como publicador a organização correspondente (plataformas de hospedagem como GitHub e arXiv não contam). */
export const PUBLISHER_DOMAINS: ReadonlyArray<{ entityId: string; domains: readonly string[] }> = [
  { entityId: "fda", domains: ["fda.gov"] },
  { entityId: "who", domains: ["who.int"] },
  { entityId: "ema", domains: ["ema.europa.eu"] },
  { entityId: "openai", domains: ["openai.com"] },
  { entityId: "anthropic", domains: ["anthropic.com", "claude.com"] },
  { entityId: "google", domains: ["deepmind.google", "research.google", "blog.google", "health.google"] },
  { entityId: "microsoft", domains: ["microsoft.com", "nuance.com"] },
  { entityId: "nvidia", domains: ["nvidia.com"] },
  { entityId: "epic", domains: ["epic.com"] },
];

/** Estas formas no original também contam como menção à organização. */
export const IDENTITY_CONTEXT_ALIASES: ReadonlyArray<{ entityId: string; pattern: RegExp }> = [
  { entityId: "fda", pattern: /\bU\.?S\.? Food and Drug Administration\b/i },
  { entityId: "anvisa", pattern: /vigil[âa]ncia sanit[áa]ria/i },
];
