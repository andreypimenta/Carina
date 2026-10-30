// 站点身份和读者看得到的文案。换成你的行业时，先改这个文件。
// 网页和后端都读它；改完重新构建（docker compose up --build）即可生效。
// 域名不在这里：部署时用环境变量 SITE_URL 设置。

/**
 * 日报、周报、月报什么时候出（horário de Brasília，HH:mm）：日报收这个时间之前的 24 小时，周报在每个自然周之后的周一出，
 * 月报在每月 1 日出。排程、成刊时间窗口、缺期告警和所有提到时间的文案都读它（public/ 里的文件写占位
 * {{dailyTime}}、{{weeklyTime}}、{{monthlyTime}}）；排程每半小时检查一次，所以写整点或半点。
 */
export const EDITION_TIMES = { daily: "07:00", weekly: "07:00", monthly: "07:30" };

/** "todos os dias às 08:00", "toda segunda-feira às 10:00", "todo dia 1º às 10:30": o horário de publicação dentro de uma frase. */
export const EDITION_WHEN = {
  daily: `todos os dias às ${EDITION_TIMES.daily}`,
  weekly: `toda segunda-feira às ${EDITION_TIMES.weekly}`,
  monthly: `todo dia 1º às ${EDITION_TIMES.monthly}`,
};

export const SITE = {
  /** 站名：导航、页面标题、分享图、RSS、MCP、后台都用它。 */
  name: "O Fôlego",
  /** O nome sem o artigo, para as contrações nas frases: "do Fôlego", "no Fôlego", "pelo Fôlego". */
  bareName: "Fôlego",
  /**
   * 行业词：拼进默认说法里（withSubject / subjectAfter），比如 "Notícias de cirurgia torácica e via aérea"。
   */
  subject: "cirurgia torácica e via aérea",
  /** 首页的完整标题（浏览器标签、搜索结果）。 */
  homeTitle: "O Fôlego — cirurgia torácica pediátrica, via aérea e pneumologia pediátrica: a edição semanal",
  /** 主题目录页（/topics）的标题。 */
  topicsTitle: "Tópicos: doenças, procedimentos, sociedades e formatos de estudo",
  /** 反馈表单输入框里的示例。 */
  feedbackExample: "Por exemplo: ao buscar um termo, aconteceu… e eu esperava…",
  /** 反馈页标题下面的一句话。 */
  feedbackLead: "Encontrou um erro, quer um recurso ou algo não ficou bom? Conte para a gente.",
  /** 反馈表单邮箱框里的提示。 */
  feedbackEmailHint: "Deixe seu e-mail se quiser que a gente responda",
  /** 一句话介绍：搜索引擎、分享卡片、RSS、llms.txt 会用。 */
  description: `Lê a literatura e as notícias de cirurgia torácica pediátrica, via aérea adulto e pediátrica e pneumologia pediátrica, escolhe o que muda a prática e publica matérias completas em português numa edição ${EDITION_WHEN.weekly}.`,
  /** llms.txt 里一句话介绍下面的一段详细介绍（选填）。 */
  llmsIntro: null as string | null,
  /** 一行小字：分享图、海报下方。 */
  tagline: "Cirurgia torácica e via aérea, toda semana",
  /** 搜索引擎读到的关键词（首页结构化数据）。 */
  keywords: ["cirurgia torácica pediátrica", "via aérea pediátrica", "estenose subglótica", "laringotraqueoplastia", "traqueostomia", "broncoscopia", "pneumologia pediátrica", "estenose traqueal"] as string[],
  /** 网站开始收录的年份（结构化数据的时间范围，选填）。 */
  since: null as string | null,
  /** 界面语言（HTML lang、og:locale）。 */
  locale: "pt-BR",
  /** 默认域名，只在没设置 SITE_URL 时使用。 */
  defaultUrl: "http://localhost:3000",
  /** 标准图标（favicon.ico、icon.png、icon-192.png、apple-icon.png、logo.svg）以外也放在网站根目录的图标，site/brand/ 里的文件名（选填）；manifest.webmanifest 或外站引用了它们时用。 */
  rootIcons: [] as string[],
  /**
   * MCP 工具名的前缀（小写字母、数字、下划线），工具会叫 folego_get_latest、folego_search……
   * 已经有人接入后就不要再改。
   */
  mcpPrefix: "folego",
  /**
   * 公开接口（MCP、OpenAPI、llms.txt）的版本号，只升不降。
   * 改了接口里已有的字段或含义时升主版本，并在部署说明里写清。
   */
  interfaceVersion: "1.0.0",
  /** 对外联系邮箱（选填）：llms.txt 和给 Agent 的使用说明里会写。 */
  contactEmail: null as string | null,
  /** 关于页底部的一行小字（选填）。 */
  footerNote: null as string | null,
  /** 中国大陆网站的 ICP 备案号（选填），填了就显示在侧栏底部和“我的”页底部，并链接到工信部备案系统。 */
  icp: null as string | null,
  /** 源码的 GitHub 仓库地址（选填），填了就在侧栏底部和“我的”页底部显示“GitHub 开源”。 */
  github: null as string | null,
  /** 结构化数据里的网站运营者（搜索引擎用）。 */
  organization: {
    name: "O Fôlego",
    /** 创始人（选填）。 */
    founder: null as null | { name: string; alternateName?: string; jobTitle?: string; description?: string; url?: string },
  },
  /** 抓取信源时报上的名字和版本（User-Agent 里用），不要冒用别的站。 */
  crawlerName: "FolegoBot/1.0",
} as const;

/** 使用规则和隐私说明两页（正文在 pages/ 里）。 */
export const POLICY = {
  terms: {
    /** 页面名：导航、页脚、页面标题都用它。 */
    name: "Termos de uso",
    description: "Regras de uso do site, do RSS, da API pública e do MCP.",
    /** llms.txt 里对这一页的一句说明（选填）。 */
    covers: null as string | null,
    /** Agent 接入页的 RSS、API 两栏各自提醒的使用规则（选填）。 */
    notes: null as null | { rss: string; api: string },
    /**
     * 讲清哪些用途要先取得授权的话（选填）：llms 接在 llms.txt“使用说明”的版权说明后面，
     * agent 写在给 Agent 的使用说明“使用规则”一节的开头。
     */
    license: null as null | { llms: string; agent: string },
    /**
     * 公开 API、RSS 和 OpenAPI 文件声明使用规则的响应头（选填）：原样附上，再加一个指向这一页的
     * Link 头（rel="terms-of-service"）；浏览器里的调用方也读得到它们。
     */
    headers: null as null | Record<string, string>,
  },
  privacy: {
    description: "Como o site trata os dados locais do navegador, o conteúdo enviado pelo formulário de feedback e os registros de acesso.",
    /** llms.txt 里对这一页的一句说明（选填）。 */
    covers: null as string | null,
  },
  /**
   * X 帖子本身的文字和图片算不算全文：算的话，只在这篇允许站内全文时显示（信源允许全文、正文也取到了）；
   * 不算的话总是显示，和标题、摘要一样。
   */
  xPostIsFullText: true,
} as const;

/** 条目卡片和详情页上的几处说法和显示。 */
export const ITEM_COPY = {
  /** 模型写的那句理由叫什么：卡片、详情页、Markdown 导出、给 Agent 的回答和群推送都用它。 */
  reasonLabel: "Por que importa",
  /** 读者在网页和分享图上看不看得到 AI 评分。只管显示：公开 API 和 MCP 的数据照样带 score，后台照常显示。 */
  showScore: false,
};

/** 关于页的一张二维码卡片。 */
interface ContactCard {
  kind: string;
  title: string;
  note: string;
  /** 站外链接过的根目录文件名（选填），比如 qr-wechat.jpg：这个地址总是跳到现在的二维码。 */
  alias?: string;
}

/** 关于页的文案。数字（信源数、收录数、精选数、日报期数）来自站内实时统计，不用写在这里。 */
export const ABOUT = {
  kicker: `Sobre ${SITE.name}`,
  /** 页面描述（搜索结果、分享卡片）。 */
  description: `Sobre ${SITE.name}: ${SITE.description}`,
  /** 大标题：第一行正常颜色，第二行强调色。 */
  headline: ["Toda semana saem dezenas de artigos sobre via aérea e cirurgia torácica.", "Alguns mudam o que fazemos na segunda-feira."] as [string, string],
  /** 标题下面的一段话。{sources} 会换成实时的信源数（两边自动加空格，所以 {sources} 两边不写空格）；统计没取到时换成 sourcesFallback。 */
  lead: `${SITE.name} acompanha{sources}fontes por você, entre buscas no PubMed, revistas e sociedades: lê, avalia a evidência, seleciona e publica as matérias completas em português numa edição ${EDITION_WHEN.weekly}. Gratuito e sem cadastro.`,
  sourcesFallback: " dezenas de ",
  /** 信源河动画下面的四个环节。 */
  steps: {
    collect: "Buscas temáticas no PubMed, sociedades de cirurgia torácica, pneumologia, pediatria e otorrinolaringologia, reguladores e registros de ensaios clínicos. Para cada artigo, procuramos a versão de acesso aberto legal.",
    store: "Tudo o que é coletado fica guardado, e as publicações sobre o mesmo estudo ou o mesmo fato são agrupadas.",
    select: `O modelo avalia o desenho do estudo, o tamanho da amostra e o impacto na conduta, e escreve a matéria em português com uma camada para o pediatra e outra para o especialista. Artigos com licença aberta (CC BY) são traduzidos na íntegra.`,
    publish: `A edição semanal sai ${EDITION_WHEN.weekly} (horário de Brasília); o feed é atualizado todos os dias e há um balanço ${EDITION_WHEN.monthly}.`,
  },
  /**
   * 作者块（选填），null 就不显示。
   * avatarSourceId：一个 X 账号信源的 id，头像取它的（选填）。
   * 二维码在后台“设置”里上传，或者放进 site/brand/contact/；没有二维码就不显示那张卡片。
   */
  maker: null as null | {
    name: string;
    avatarSourceId?: string | null;
    greeting: string[];
    wechat?: ContactCard;
    feishu?: ContactCard;
  },
  /** 页面底部的版权与下架说明，中间接“反馈页”的链接。 */
  copyright: [`As matérias do ${SITE.bareName} são textos próprios sobre os estudos citados, com link para o original; artigos de licença aberta são traduzidos e republicados com crédito e a licença indicada. Os direitos dos textos originais pertencem aos autores e editoras. Se você representa uma fonte e quer corrigir, retirar ou mudar a forma de exibição, fale com a gente pela `, "."] as [string, string],
  /** 页面底部“使用规则”链接的锚点 id（选填）：外部文档写死过这个锚点就填上，以后不要改。 */
  termsAnchor: null as string | null,
} as const;

/** 后台页面上给管理员的提示（选填）。 */
export const ADMIN = {
  /** “反馈”页标题下的一行。 */
  feedbackNote: null as string | null,
  /** 确认框里补的一句本站规定：封禁反馈来源时。 */
  banNote: null as string | null,
  /** 确认框里补的一句本站规定：调整付费服务的请求上限时。 */
  budgetNote: null as string | null,
};

/** Agent 接入页的示例。 */
export const AGENT = {
  /** MCP 工具表里“搜索”一行：能搜什么、可以怎么问。 */
  search: { scope: "Busca nos últimos 7 dias por doença, procedimento, revista ou tema", ask: "O que saiu sobre laringotraqueoplastia nesta semana?" },
};

/** 日报、周报、月报版面上的说法。 */
export const REPORTS = {
  /** 报头下面的出版者一行。 */
  imprint: SITE.name.toUpperCase(),
  /** 报头旁边的一个词。 */
  motto: SITE.subject as string,
  /** 每种报告页面的描述（搜索结果、分享卡片），不带句号；llms.txt 介绍周报、月报时也用它。 */
  descriptions: {
    daily: `Notas diárias de ${SITE.subject} do ${SITE.bareName}, atualizadas ${EDITION_WHEN.daily} (horário de Brasília)`,
    weekly: `Edição semanal do ${SITE.bareName}: ${SITE.subject}, publicada ${EDITION_WHEN.weekly}`,
    monthly: `Balanço mensal de ${SITE.subject}`,
  },
  /**
   * 一期里的一条怎么称呼（“4 件大事”）：没有头条时的标题（“这一天的 4 件 AI 大事”）、报头和往期目录的条数、
   * 周报月报没有总述时的那句话，以及订阅说明里的“按栏目分好的大事”都用它。
   */
  entry: { measure: "", noun: "destaques" },
  /** 报头上其余几个数字后面的说法；精选数和日报期数在关于页、主题页也这样写。 */
  metricUnits: { sourcesCount: "fontes", firstPartyEvents: "publicações oficiais", selectedCount: "selecionadas", reportsCovered: "edições" },
  /** 报告分享图上“共几条”的说法。 */
  shareUnit: "destaques",
  /** 日报时段内有资料经过评判、但没有新大事时的标题与导语。 */
  quiet: { title: "Sem novidades relevantes neste dia", paragraph: `Entre {start} e {end} (horário de Brasília), não houve novos destaques de ${SITE.subject}.` },
};

/** 运维告警（只发给站长）里随部署而变的几处说法。 */
export const ALERTS = {
  /** 多少分钟没有收录新文章就告警“网站停止收录新内容”（最多一天）；环境变量 ALERT_QUIET_MINUTES 优先。 */
  quietMinutes: 1440,
  /** 同一条告警里，“没有”后面补一句平时的收录量；null 就不写。 */
  usualFlow: null as string | null,
  /** worker 停了的告警里，怎么看它的日志。 */
  workerLogs: "veja os logs do worker (docker compose logs worker)",
  /** 某家模型服务拒绝服务或额度用完时，告警里说哪些步骤停了；没写的服务用通用说法。 */
  modelStops: {} as Record<string, string>,
};

/** 后台新建信源时的默认设置。 */
export const SOURCE_DEFAULTS = {
  /** 站内展示全文；false 时只显示摘要和原文链接。 */
  siteFulltext: false,
};

/**
 * Fontes de comunidade (ids de fonte): na repercussão, cada autor conta como uma fonte independente, em vez de a fonte inteira contar uma vez.
 * dev é o feed de artigos do dev.to, hn o do Hacker News (autor em dc:creator) e reddit os feeds Atom de subreddits (autor "/u/nome").
 */
export const COMMUNITY_FEEDS: { dev: string[]; hn: string[]; reddit: string[] } = {
  dev: [],
  hn: [],
  reddit: [],
};

/** 各页分享图（/og/pages/*.png）上的文字。主题目录页的那张按主题数自动生成。 */
export const CARDS: Record<string, { kicker: string; title: string; subtitle: string; accent?: "hot" | "amber" }> = {
  site: { kicker: `Edição semanal · ${SITE.subject}`, title: SITE.tagline, subtitle: SITE.description },
  all: { kicker: "Todas as notícias", title: "As últimas notícias de todas as fontes, num só lugar", subtitle: "Tudo o que as fontes publicaram, em ordem cronológica, com filtros por categoria e tag." },
  hot: { kicker: "Em alta", title: "O que está sendo discutido nas últimas 48 horas", subtitle: "Índice de repercussão, tendência e as fontes públicas por trás dele.", accent: "hot" },
  daily: { kicker: "Notas diárias", title: "O que entrou no radar a cada dia", subtitle: `As publicações de ${SITE.subject} selecionadas no dia anterior.` },
  weekly: { kicker: "Edição semanal", title: `Toda segunda às ${spokenTime(EDITION_TIMES.weekly)}, a semana em ${SITE.subject}`, subtitle: "Os estudos que mudam a conduta, as diretrizes novas e o que vale levar para o centro cirúrgico e o consultório." },
  monthly: { kicker: "Briefing mensal", title: "O que mudou no mês", subtitle: "Os fios condutores e os fatos-chave do mês." },
  about: { kicker: "Sobre", title: `Sobre ${SITE.name}`, subtitle: SITE.description },
  terms: { kicker: "Termos de uso", title: `Termos de uso do ${SITE.bareName}`, subtitle: "O que é permitido no site, na API, no RSS e no MCP." },
  privacy: { kicker: "Privacidade", title: `Privacidade no ${SITE.bareName}`, subtitle: "Como tratamos registros de acesso, dados locais do navegador e feedback enviado." },
  changelog: { kicker: "Novidades", title: `Novidades do ${SITE.bareName}`, subtitle: "Novos recursos, melhorias, avisos e o que saiu do ar." },
  feedback: { kicker: "Feedback", title: "Diga o que podemos melhorar", subtitle: "Conteúdo, recursos, integração ou pedidos de correção e retirada de fontes." },
  assine: { kicker: "Assine grátis", title: `${SITE.name}: a edição semanal no seu e-mail ou WhatsApp`, subtitle: `Toda segunda às ${spokenTime(EDITION_TIMES.weekly)}: os estudos que mudam a conduta em ${SITE.subject}, em português.` },
  agent: { kicker: "Integração com agentes", title: `Conecte ${SITE.name} ao seu agente`, subtitle: "MCP, RSS ou API: acesso anônimo, só leitura, sem API Key." },
};

/** 公开接口的访问约定里随部署而变的几处：给 Agent 的使用说明、llms.txt 会写。 */
export const ACCESS = {
  /** 同一 IP 每分钟大约能请求多少次，超过会收到 429 并带 Retry-After（选填，由部署的反向代理限流）；null 表示不限流，说明里不提。 */
  ratePerMinute: null as number | null,
  /** 请写程序同步数据的人报上的 User-Agent（选填），写在 JSON 接口的说明后面。 */
  userAgent: null as string | null,
};

/** 这个部署自己的几处安排（选填）。 */
export const DEPLOYMENT = {
  /** 凭据分组文件（models.env、collectors.env……）默认放在哪个目录，相对仓库根目录；环境变量 AIHOT_CREDENTIALS_DIR 优先，都没有就只读环境变量。 */
  credentialsDir: null as string | null,
  /** 凭据分组的文件名（放在凭据目录下，选填）：没写的分组用“分组名.env”，比如 models.env。 */
  credentialFiles: {} as Partial<Record<string, string>>,
  /** 这个部署额外要求的凭据（[分组, 环境变量名]）；生产 API 启动时检查，默认没有额外要求。 */
  requiredSecrets: [] as const,
  /** 线上 api 收到的 Host（CDN 回源用的域名，选填）；本地开发时，网页开发服务器转给 api 的请求也换成它，和线上一致。 */
  originHost: null as string | null,
  /** 反向代理把没登录的后台访问转去登录时，用哪个请求头带上原来的地址（选填，登录后回到那里）。 */
  loginReturnHeader: null as string | null,
  /**
   * 图片代理从原站取图的流量上限：超过后没缓存的图先返回 503，等这一分钟或这一天过去，当天额度用完会进运营日报；
   * null 就不设上限。环境变量 IMGPROXY_UPSTREAM_MB_PER_MINUTE、IMGPROXY_UPSTREAM_GB_PER_DAY 优先。
   */
  imageUpstreamBudget: null as null | { mbPerMinute: number; gbPerDay: number },
  /**
   * 已实测应由服务器直接连接、不走出网代理（EGRESS_PROXY_URL）的域名，采集和图片共用（选填）。
   * 每次重定向重新按目标域名选路，直连仍检查实际连接地址。
   */
  directFetchHosts: [] as string[],
  /**
   * 精选评测（scripts/eval-selection.ts）不带参数时用的金标集：文件（相对仓库根目录）、抽样条数、只抽哪一份、门槛扫描范围。
   * null 就用 .data/gold.jsonl 的全部样本（最多 200 条），在 40–90 之间扫描。
   */
  selectionGold: null as null | { file: string; sample: number; split: string; sweep: [number, number] },
};

/** RSS 订阅源的说明里随站点而变的说法。 */
export const FEED_COPY = {
  /** “全部动态”源的说明里，除了未审内容、低相关条目和已合并重复条目，还写明不含的内容（选填）。 */
  allLeavesOut: [] as string[],
};

/**
 * 公开接口（API、RSS、MCP）里和网页不同的类别（选填）。上线后不要改：接口参数和订阅地址里有类别的 key。
 * merge：并进另一类发布的类别，key 是行业包里的类别，值是它并进的类别（公开接口比网页少一类时用）；
 * feedLabels：分类 RSS 标题里的名字，替换行业包里的 feedLabel（并进了别的类别时，名字常常也要跟着改）。
 */
export const PUBLIC_CATEGORIES = {
  merge: {},
  feedLabels: {},
} as const;

/** "Notícias de IA em medicina": o nome seguido do assunto do site (em português o assunto vem depois, com "de"). */
export function withSubject(noun: string): string {
  return `${noun} de ${SITE.subject}`;
}

/** "Tópicos de IA em medicina", "Últimos destaques de IA em medicina": um texto seguido de withSubject(noun), ou só do assunto. */
export function subjectAfter(text: string, noun?: string): string {
  return `${text} ${noun ? withSubject(noun) : SITE.subject}`;
}

/** "8h", "10h30": o HH:mm como se fala. */
function spokenTime(time: string): string {
  const [hour, minute] = time.split(":").map(Number) as [number, number];
  return `${hour}h${minute ? String(minute).padStart(2, "0") : ""}`;
}
