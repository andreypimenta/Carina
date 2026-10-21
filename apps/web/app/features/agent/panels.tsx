// The engine's ways in, one panel each: what it is for, the steps to connect, then the details folded away.
// Addresses are the site's configured public address (`base`); what visitors copy carries the site's tag
// (CopyTag) when it has one.
import { Fragment, useState } from "react";
import { Link } from "react-router";
import { PUBLIC_INTERFACE_VERSION } from "@aihot/contracts/http-policy";
import { MCP_TOOL_NAMES as T, MCP_TOOLS } from "@aihot/contracts/mcp";
import { feedCategoryLabel, PUBLIC_API_CATEGORY_KEYS } from "@aihot/contracts/taxonomy";
import { ACCESS, AGENT, EDITION_WHEN, POLICY, REPORTS, SITE } from "@aihot/site";
import { CodeBlock, CopyButton } from "./CodeBlock";
import { PillTabs } from "../../components/ui/Tabs";
import type { AgentPanelProps } from "../../modules";
import { AGENT_PARTS, GUIDE_CLIENTS, TAG } from "./module-parts";
import { Address, Ask, Block, Bullets, Details, Mono, PanelHead, Step, Steps, Table, Tips } from "./parts";

const V = PUBLIC_INTERFACE_VERSION;

/** Every MCP tool: the engine's and the modules'. */
export const mcpToolCount = () => MCP_TOOLS.length + AGENT_PARTS.reduce((n, a) => n + (a.tools?.length ?? 0), 0);
const link = "text-accent hover:underline";

/** An address on this site as the copy buttons copy it, with the tag. */
function addressOf({ base, tag }: AgentPanelProps, path: string): string {
  return TAG && tag ? `${base}${path}?${TAG.query}=${tag}` : `${base}${path}`;
}

const MCP_CLIENTS = [
  { key: "claude", label: "Claude Code" },
  { key: "codex", label: "Codex" },
  { key: "json", label: "Configuração JSON" },
  { key: "other", label: "Outros clientes" },
] as const;

export function McpPanel(props: AgentPanelProps) {
  const url = addressOf(props, "/api/mcp");
  const name = SITE.mcpPrefix;
  const [client, setClient] = useState<string>("claude");
  return (
    <>
      <PanelHead label={`MCP · ${V}`} title={`Um endereço e seu agente ganha ${mcpToolCount()} ferramentas`}>
        Streamable HTTP padrão, anônimo e somente leitura: sem token e sem acesso ao seu login. Serve para clientes com MCP remoto, como Claude Desktop, Cursor e Cherry Studio.
      </PanelHead>
      <Steps>
        <Step n={1} title="Copie o endereço do serviço">
          <Address url={url} />
          {TAG && <p className="mt-2 text-[13px] text-ink-3">{TAG.mcp}</p>}
        </Step>
        <Step n={2} title="Adicione ao seu cliente">
          <PillTabs className="mt-3" size="xs" layoutId="agent-mcp-client" label="Cliente" active={client} onSelect={setClient} items={MCP_CLIENTS.map((c) => ({ key: c.key, label: c.label }))} />
          {client === "claude" && <CodeBlock className="mb-0 mt-3" lang="bash" code={`claude mcp add --transport http ${name} '${url}'`} />}
          {client === "codex" && <CodeBlock className="mb-0 mt-3" lang="bash" code={`codex mcp add ${name} --url '${url}'`} />}
          {client === "json" && <CodeBlock className="mb-0 mt-3" title="Cursor, Cherry Studio e outros clientes configurados por JSON" lang="json" code={JSON.stringify({ mcpServers: { [name]: { type: "http", url } } }, null, 2)} />}
          {client === "other" && <p className="mt-3">{`Nas configurações de MCP ou de conectores do cliente, crie um item: nome ${name}, endereço igual ao de cima, autenticação "Nenhuma" e sem API Key. Se o cliente só aceita comandos locais, use primeiro o proxy de MCP remoto que ele oferece.`}</p>}
        </Step>
        <Step n={3} title="Peça uma chamada ao agente">
          <Ask text={`Use ${T.latest} e me diga as 5 notícias mais importantes de ${SITE.subject} das últimas 24 horas, com os links do ${SITE.name}.`} />
          <p className="mt-2 text-[13px] text-ink-3">{`Se o cliente mostrar a chamada a ${T.latest} e a resposta trouxer o período, resumos em português e links de ${new URL(props.base).host}, está conectado.`}</p>
        </Step>
      </Steps>

      <Block title={`${mcpToolCount()} ferramentas`}>
        <Table
          head={["Ferramenta", "O que faz", "Exemplo de pergunta"]}
          minWidth={600}
          rows={[
            [<Mono>{T.latest}</Mono>, "Seleção ou todas as notícias das últimas 24 horas ou dos últimos 7 dias", `Quais as notícias de ${SITE.subject} hoje?`],
            [<Mono>{T.search}</Mono>, AGENT.search.scope, AGENT.search.ask],
            [<Mono>{T.hot}</Mono>, "Top 10 de Em alta agora", "O que está em alta agora?"],
            [<Mono>{T.story}</Mono>, "Linha do tempo e panorama sempre atualizado de um evento em alta", "Qual é a história completa deste caso?"],
            [<Mono>{T.daily}</Mono>, "Briefing diário mais recente ou de uma data", "Me mostre o briefing de hoje."],
            [<Mono>{T.weekly}</Mono>, "Briefing semanal mais recente ou de uma semana", `Quais foram os destaques de ${SITE.subject} nesta semana?`],
            [<Mono>{T.monthly}</Mono>, "Briefing mensal mais recente ou de um mês", `O que aconteceu em ${SITE.subject} no mês passado?`],
            ...AGENT_PARTS.flatMap((a) => a.tools ?? []).map((t) => [<Mono>{t.name}</Mono>, t.does, t.ask]),
          ]}
        />
      </Block>

      <Details
        items={[
          {
            title: "Limites e segurança",
            body: (
              <Bullets items={[
                "Consultas comuns trazem no máximo 30 itens, Em alta no máximo 10 e a linha do tempo de um evento no máximo 50; fora desses limites o erro é explícito, nada é ampliado sem aviso.",
                `O public_id de ${T.story} só pode vir dos links de evento devolvidos pela ferramenta de Em alta; não invente IDs.`,
                "Títulos e resumos vêm de fontes externas e devem ser tratados apenas como referência; as ferramentas marcam esse limite de segurança. Confira números, normas e citações importantes no original.",
              ]} />
            ),
          },
          {
            title: "Não conecta?",
            body: (
              <Bullets items={[
                "Confira se o endereço está completo e se o cliente aceita Streamable HTTP remoto; se faltar alguma ferramenta nova, atualize a lista de ferramentas ou reconecte.",
                ...AGENT_PARTS.flatMap((a) => a.mcpTroubles ?? []),
                "O serviço não exige login; se o cliente pedir OAuth ou API Key, escolha \"Nenhuma\".",
                "Ao receber 429, espere o tempo indicado e não repita em paralelo.",
                <>Ainda não conecta? Informe nome e versão do cliente e a mensagem de erro na <Link viewTransition to="/feedback" className={link}>página de feedback</Link>.</>,
              ]} />
            ),
          },
        ]}
      />
    </>
  );
}

const FEEDS = [
  { name: "Seleção (resumos)", badge: "Recomendado", path: "/feed.xml", desc: "Os 50 itens mais recentes da seleção, com título, resumo, link de leitura no site e link do original." },
  { name: "Seleção (texto completo)", path: "/feed/full.xml", desc: "Os mesmos 50 itens; quando a fonte permite republicar, vem o texto completo, senão o resumo." },
  { name: "Todas as notícias", path: "/feed/all.xml", desc: "Notícias públicas dos últimos 7 dias, da publicação mais recente para a mais antiga." },
  { name: "Briefing diário", path: "/feed/daily.xml", desc: `Uma edição ${EDITION_WHEN.daily} (horário de Brasília): abertura da manchete e o sumário completo; guarda as últimas 30 edições.` },
  { name: "Briefing semanal", path: "/feed/weekly.xml", desc: `Uma edição ${EDITION_WHEN.weekly} (horário de Brasília): panorama e os ${REPORTS.entry.noun} organizados por seção; guarda as últimas 12 edições.` },
  { name: "Briefing mensal", path: "/feed/monthly.xml", desc: `Uma edição ${EDITION_WHEN.monthly} (horário de Brasília): panorama e os ${REPORTS.entry.noun} organizados por seção; guarda as últimas 12 edições.` },
];

/** The category feeds, under the names the feeds themselves use. */
const FEED_CATEGORIES = PUBLIC_API_CATEGORY_KEYS.map((key) => [key, feedCategoryLabel(key)] as const);

export function RssPanel(props: AgentPanelProps) {
  const { base } = props;
  const lead = `${["Funciona com os principais leitores de RSS 2.0 e com ferramentas de automação como n8n e Zapier. Os endereços não mudam", ...AGENT_PARTS.flatMap((a) => a.rssLead ?? [])].join("; ")}.`;
  return (
    <>
      <PanelHead label="RSS" title="Copie o endereço e assine no seu leitor">
        {lead}
      </PanelHead>
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FEEDS.map((f) => (
          <div key={f.path} className="card flex flex-col p-4">
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-semibold text-ink">{f.name}</span>
              {f.badge && <span className="inline-flex h-[18px] items-center rounded-full bg-accent-soft px-2 text-[11px] font-medium text-accent">{f.badge}</span>}
            </div>
            <p className="mt-1 flex-1 text-[13px] leading-[1.7] text-ink-3">{f.desc}</p>
            <div className="mt-3 flex items-center gap-2 border-t border-line-soft pt-3">
              <code className="mono min-w-0 flex-1 truncate text-[12px] text-ink-4">{base}{f.path}</code>
              <CopyButton text={addressOf(props, f.path)} label="Copiar endereço" className="shrink-0" />
            </div>
          </div>
        ))}
      </div>
      {TAG && <p className="mt-3 text-[12.5px] text-ink-4">{TAG.rss}</p>}

      <Block title="Assinar por categoria">
        <Table
          head={["Categoria", "Resumos", "Texto completo"]}
          minWidth={420}
          rows={FEED_CATEGORIES.map(([slug, label]) => [
            <span className="font-medium text-ink">{label}</span>,
            <span className="inline-flex items-center gap-2"><Mono>{`/feed/category/${slug}.xml`}</Mono><CopyButton text={addressOf(props, `/feed/category/${slug}.xml`)} className="!h-6 !px-1.5" /></span>,
            <span className="inline-flex items-center gap-2"><Mono>{`/feed/full/category/${slug}.xml`}</Mono><CopyButton text={addressOf(props, `/feed/full/category/${slug}.xml`)} className="!h-6 !px-1.5" /></span>,
          ])}
        />
      </Block>

      <Block title="Com que frequência atualizar">
        <p>O leitor pergunta com o ETag anterior e, se nada mudou, recebe só um 304 pequeno, sem baixar tudo de novo. Atualizar a cada 30 minutos basta; mais rápido não traz conteúdo novo.</p>
        <p className="mt-3 text-[13px] text-ink-3">{`Os links dos itens levam à página de leitura no site; o link do original está no resumo. Poder assinar sem cadastro não significa que todo uso esteja autorizado${POLICY.terms.notes ? `: ${POLICY.terms.notes.rss}` : ""}; veja os `}<Link viewTransition to="/terms" className={link}>{POLICY.terms.name}</Link>.</p>
      </Block>
    </>
  );
}

const RECIPES = [
  { key: "latest", label: "Acompanhar as novidades" },
  { key: "sync", label: "Sincronizar toda a seleção" },
];

export function ApiPanel(props: AgentPanelProps) {
  const { base, tag } = props;
  const userAgent = [ACCESS.userAgent, TAG && tag ? TAG.userAgent(tag) : null].filter(Boolean).join(" ");
  const curl = `curl --compressed${userAgent ? ` -A '${userAgent}'` : ""}`;
  let pace = `Com que frequência o conteúdo muda: notícias novas chegam ao longo do dia, a seleção muda de algumas a dezenas de vezes por dia, e há uma edição do briefing diário ${EDITION_WHEN.daily}, do semanal ${EDITION_WHEN.weekly} e do mensal ${EDITION_WHEN.monthly} (horário de Brasília).`;
  if (ACCESS.ratePerMinute) pace += ` Acima de cerca de ${ACCESS.ratePerMinute} requisições por minuto do mesmo IP, a resposta é 429: aguarde o Retry-After e não repita em paralelo.`;
  const [recipe, setRecipe] = useState<string>("latest");
  const recipes = AGENT_PARTS.flatMap((a) => a.recipes ?? []);
  const items = `${base}/api/v1/items?mode=selected&window=24h&limit=20`;
  return (
    <>
      <PanelHead label={`REST API · ${V}`} title="GET anônimo, pronto para usar">
        Sem token; dá para chamar direto do navegador (CORS), do curl e do cliente HTTP padrão de qualquer linguagem. O caminho é /api/v1; campos e códigos de erro seguem o <a href="/openapi-v1.json" className={link}>OpenAPI</a>.
      </PanelHead>
      <CodeBlock className="mt-6" title="Primeira requisição" lang="bash" code={`${curl} '${items}'`} />

      <Block title="Mais leve e mais rápido">
        <Tips
          items={[
            { title: "Ative a compressão", text: <>No curl use <Mono>--compressed</Mono>; em outros clientes, ative gzip ou br. Comprimido, o JSON fica com 1/4 a 1/8 do tamanho.</> },
            { title: "Envie o ETag", text: <>Guarde o ETag da resposta e envie-o depois em <Mono>If-None-Match</Mono>; se nada mudou, a resposta é 304, sem corpo.</> },
            { title: "Respeite o ritmo", text: `Notícias e Em alta: no máximo uma vez por minuto; o briefing diário, uma vez depois das ${EDITION_WHEN.daily.replace("todos os dias às ", "")}; semanal e mensal, uma vez depois que saem. Ao voltar páginas, pare quando chegar a um item que você já tem.` },
          ]}
        />
        <p className="mt-3 text-[13px] leading-[1.75] text-ink-3">{pace}</p>
      </Block>

      <Block title="Endpoints">
        <Table
          head={["Caminho", "Para que serve", "Frequência"]}
          minWidth={640}
          rows={[
            { group: "Notícias" },
            [<Mono>/api/v1/items</Mono>, "Seleção ou todas as notícias dos últimos 7 dias, com filtro por categoria, janela de tempo e palavra-chave", "No máximo 1 vez por minuto"],
            { group: "Em alta e eventos" },
            [<Mono>/api/v1/hot-topics</Mono>, "Top 10 de Em alta agora", "No máximo 1 vez por minuto"],
            [<Mono>{"/api/v1/stories/{publicId}"}</Mono>, "Linha do tempo das notícias de um evento, panorama gerado por IA e eventos relacionados", "Quando precisar"],
            { group: "Briefing diário" },
            [<Mono>/api/v1/dailies/latest</Mono>, "Edição mais recente do briefing diário", `Uma vez, depois da publicação (${EDITION_WHEN.daily})`],
            [<Mono>{"/api/v1/dailies/{date}"}</Mono>, "Briefing diário de uma data; itens retirados saem das citações", "Revalide o ETag quando o cache expirar"],
            [<Mono>/api/v1/dailies</Mono>, "Índice de datas do briefing diário", "Uma vez por dia"],
            { group: "Briefings semanal e mensal" },
            [<Mono>/api/v1/weeklies/latest</Mono>, "Edição mais recente do semanal: manchete, panorama e destaques da semana por seção", `Uma vez, depois da publicação (${EDITION_WHEN.weekly})`],
            [<Mono>{"/api/v1/weeklies/{week}"}</Mono>, "Uma semana, em semana ISO como 2026-W39; itens retirados saem das citações", "Revalide o ETag quando o cache expirar"],
            [<Mono>/api/v1/weeklies</Mono>, "Índice do briefing semanal", "Uma vez por semana"],
            [<Mono>/api/v1/monthlies/latest</Mono>, "Edição mais recente do mensal", `Uma vez, depois da publicação (${EDITION_WHEN.monthly})`],
            [<Mono>{"/api/v1/monthlies/{month}"}</Mono>, "Um mês, como 2026-09", "Revalide o ETag quando o cache expirar"],
            [<Mono>/api/v1/monthlies</Mono>, "Índice do briefing mensal", "Uma vez por mês"],
            ...AGENT_PARTS.flatMap((a) => (a.api ? [{ group: a.api.group }, ...a.api.rows.map(([path, does, often]) => [<Mono>{path}</Mono>, does, often])] : [])),
            { group: "Para assistentes de IA" },
            [<Mono>/api/v1/agent</Mono>, `Guia de uso para agentes; os endereços listados devolvem Markdown em português pronto para uso${GUIDE_CLIENTS ? `; é o que ${GUIDE_CLIENTS} usam` : ""}`, "Quando precisar"],
            { group: "Sincronização completa da seleção" },
            [<Mono>/api/v1/selected/snapshot</Mono>, "Toda a seleção atual, baixada uma vez por paginação", "Só na primeira vez"],
            [<Mono>/api/v1/selected/changes</Mono>, "Inclusões, alterações e retiradas desde então", "A cada poucos minutos"],
          ]}
        />
      </Block>

      <Block title="Usos comuns">
        <PillTabs size="xs" layoutId="agent-api-recipe" label="Uso" active={recipe} onSelect={setRecipe} items={[...RECIPES, ...recipes].map((r) => ({ key: r.key, label: r.label }))} />
        {recipe === "latest" && (
          <>
            <CodeBlock className="mb-3 mt-3" lang="bash" code={`# Primeira vez: guarde o ETag do cabeçalho da resposta\n${curl} -i '${items}'\n# Depois, no máximo uma vez por minuto, com o ETag; 304 significa que nada mudou\n${curl} -i -H 'If-None-Match: <ETag anterior>' '${items}'`} />
            <p>Para voltar páginas, envie <Mono>page.nextCursor</Mono> como cursor e pare ao chegar a um item que você já tem; não releia os 7 dias inteiros a cada vez.</p>
          </>
        )}
        {recipe === "sync" && (
          <>
            <CodeBlock className="mb-3 mt-3" lang="bash" code={`# Primeira vez: baixe tudo por paginação. Guarde o cursor da primeira página (é o mesmo em todas)\n${curl} '${base}/api/v1/selected/snapshot?fields=minimal&limit=500'\n# Enquanto hasMore for true, continue com nextPage até o fim\n${curl} '${base}/api/v1/selected/snapshot?fields=minimal&limit=500&page=<nextPage da página anterior>'\n# Depois: devolva o cursor como veio e receba só inclusões, alterações e retiradas\n${curl} '${base}/api/v1/selected/changes?cursor=<cursor da primeira página>&limit=100'`} />
            <p>Só salve o novo cursor depois de gravar a página localmente. O cursor é uma marca d'água do registro de mudanças e não expira; se vier 409 <Mono>snapshot_required</Mono>, baixe o snapshot de novo — nenhum dado se perde sem aviso.</p>
          </>
        )}
        {recipes.map((r) => recipe === r.key && <r.Body key={r.key} base={base} curl={curl} />)}
      </Block>

      <Block title="Deu erro?" id="agent-api-recovery">
        <dl className="grid grid-cols-[76px_minmax(0,1fr)] gap-x-3 gap-y-2.5">
          <dt className="mono text-[13px] text-ink">400</dt>
          <dd>Parâmetro inválido: corrija conforme o OpenAPI e o code devolvido, sem trocar automaticamente por uma consulta mais ampla. Cursor inválido ou fora da janela devolve invalid_cursor; recomece pela primeira página.</dd>
          <dt className="mono text-[13px] text-ink">409</dt>
          <dd>snapshot_required: não é seguro continuar de forma incremental; baixe o snapshot completo de novo.</dd>
          <dt className="mono text-[13px] text-ink">429</dt>
          <dd>Requisições demais: aguarde o Retry-After e não repita em paralelo.</dd>
          <dt className="mono text-[13px] text-ink">5xx</dt>
          <dd>Use espera exponencial e, enquanto isso, o último resultado bem-sucedido; o serviço público não tem SLA.</dd>
          {AGENT_PARTS.flatMap((a) => a.apiErrors ?? []).map(([status, what]) => (
            <Fragment key={status}>
              <dt className="mono text-[13px] text-ink">{status}</dt>
              <dd>{what}</dd>
            </Fragment>
          ))}
        </dl>
        <p className="mt-4 text-[13px] text-ink-3">{`Poder chamar sem cadastro não significa que todo uso esteja autorizado${POLICY.terms.notes ? `: ${POLICY.terms.notes.api}` : ""}; veja os `}<Link viewTransition to="/terms" className={link}>{POLICY.terms.name}</Link>.</p>
      </Block>

    </>
  );
}
