import { REPORTS, SITE } from "@aihot/site";
import { Link, redirect, useLoaderData } from "react-router";
import type { Route } from "./+types/topic";
import type { TopicPage } from "@aihot/contracts/site";
import { cachedPage, loadOr404 } from "../lib/api.server";
import { pageReuse } from "../lib/page-reuse";
import { breadcrumbLd, pageMeta, titled, topicLd } from "../lib/seo";
import { DayList, Pagination } from "../features/feed/DayList";
import { BrandMark } from "../components/BrandMark";
import { EmptyState } from "../components/ui/Page";
import { IconArrowLeft } from "../components/icons";
import { beijingDate } from "@aihot/contracts/time";
import { monthDay, monthDayTime } from "../lib/format";
import { PhoneBar } from "../components/shell/PhoneBar";
import type { Screen } from "../components/shell/screens";
import type { TopicPagePart } from "../modules";
import { loadParts } from "../site-modules";

export const handle: Screen = { home: "me" };
export { pageHeaders as headers } from "../lib/api.server";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

/** Selected items of a topic: shared caches keep the page as long as its api answer (one minute). */
export async function loader({ params, request }: Route.LoaderArgs) {
  const page = params.page ? Number(params.page) : 1;
  if (params.page !== undefined && (!/^\d+$/.test(params.page) || page < 1)) throw new Response("Not found", { status: 404 });
  // Page 1 lives at the topic's own address (308).
  if (params.page === "1") throw redirect(`/topics/${params.slug}`, 308);
  const data = await loadOr404<TopicPage>(`/api/site/topics/${encodeURIComponent(params.slug)}?page=${page}`, { signal: request.signal });
  return cachedPage(60, { data });
}

const PARTS = await loadParts((m) => m.topicPage);

type Part = TopicPagePart & { key: string; data: unknown };

/** The modules' parts that have something on this page, in the site's order. */
function partsOf(data: TopicPage): Part[] {
  return PARTS.flatMap(({ name, part }) => {
    const value = data.modules[name];
    return value !== undefined && part.shows(value, data.topic) ? [{ ...part, key: name, data: value }] : [];
  });
}

/** The search snippet: what the topic covers, after when it last changed and its biggest recent events. */
function description(data: TopicPage, parts: Part[]): string {
  const { topic } = data;
  let text = topic.definition;
  const news = parts.flatMap((p) => p.news(p.data)).slice(0, 2).map((title) => title.replace(/[。.]$/u, "")).join("; ");
  if (news && topic.latest) text = `Atualizado em ${monthDay(beijingDate(topic.latest.at))}: ${news}. ${topic.definition}`;
  return text.length > 150 ? `${text.slice(0, 149)}…` : text;
}

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) return [{ title: titled("Tópico não encontrado") }, { name: "robots", content: "noindex" }];
  const data = loaderData.data;
  const { topic, page } = data;
  const parts = partsOf(data);
  const path = page > 1 ? `/topics/${topic.slug}/page/${page}` : `/topics/${topic.slug}`;
  const text = page > 1 ? `Arquivo da seleção de ${topic.name}, página ${page}. ${topic.definition}` : description(data, parts);
  const crumbs = breadcrumbLd([{ name: SITE.name, path: "/" }, { name: "Tópicos", path: "/topics" }, { name: topic.name, path: `/topics/${topic.slug}` }]);
  return pageMeta({
    title: page > 1
      ? `${topic.name} · seleção · página ${page}`
      : `${topic.name}: últimas notícias${parts.length ? ` e ${parts.map((p) => p.name).join(", ")}` : ""}`,
    description: text,
    path,
    image: `/og/topics/${topic.slug}.png`,
    noindex: !topic.indexable,
    jsonLd: page > 1
      ? crumbs
      : [
          topicLd({
            path,
            name: `${topic.name}: últimas notícias`,
            description: text,
            dateModified: topic.latest?.at ?? null,
            lists: parts.map((p) => ({ name: p.name, entries: p.entries(p.data) })),
          }),
          crumbs,
        ],
  });
}

export default function TopicRoute() {
  const { data } = useLoaderData<typeof loader>();
  const { topic, items, page, pageCount, pageSize } = data;
  const parts = partsOf(data);
  const href = (p: number) => (p <= 1 ? `/topics/${topic.slug}` : `/topics/${topic.slug}/page/${p}`);
  const first = (page - 1) * pageSize + 1;
  const last = first + items.length - 1;
  return (
    <div className="pb-6">
      <PhoneBar back={{ to: "/topics", label: "Tópicos" }} title={topic.name} />
      <Link to="/topics" className="hidden items-center gap-1.5 py-2 text-[13px] text-ink-3 transition-colors hover:text-accent lg:inline-flex">
        <IconArrowLeft size={14} /> Voltar aos tópicos
      </Link>
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 pb-5 pt-3 lg:pt-1">
        <div className="min-w-0 max-w-[760px]">
          <p className="text-[12px] font-semibold tracking-[0.08em] text-accent">{topic.groupName}</p>
          <h1 data-page-title="" className="mt-1.5 flex items-center gap-3 text-[24px] font-bold leading-[1.3] tracking-[-0.01em] text-ink lg:text-[26px]">
            {topic.brand && <BrandMark brand={topic.brand} size={34} />}
            <span>
              {topic.name}{" "}
              <span className="whitespace-nowrap font-semibold text-ink-4">Últimas notícias</span>
            </span>
          </h1>
          <p className="mt-1.5 text-pretty text-[13.5px] leading-relaxed text-ink-3">{topic.definition}</p>
          <p className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-4">
            <span>
              <span className="num font-semibold text-ink-2">{topic.total.toLocaleString("pt-BR")}</span>{` ${REPORTS.metricUnits.selectedCount}`}
            </span>
            <span>
              <span className="num font-semibold text-ink-2">{topic.recent.toLocaleString("pt-BR")}</span> nos últimos 30 dias
            </span>
            <span>
              <span className="num font-semibold text-ink-2">{topic.poolTotal.toLocaleString("pt-BR")}</span> coletados no total
            </span>
          </p>
        </div>
        <div className="flex items-center gap-4 text-[12px] text-ink-4">
          {topic.latest && (
            <span>
              <time dateTime={topic.latest.at} className="num">{monthDayTime(topic.latest.at)}</time> última atualização
            </span>
          )}
        </div>
      </header>

      {parts.map((p) => (
        <div key={`${p.key}:${topic.slug}`} className="mb-8">
          <p.Block data={p.data} topic={topic} />
        </div>
      ))}

      <h2 className="sr-only">{page === 1 ? `Seleção de ${topic.name}` : `Arquivo da seleção · página ${page}`}</h2>
      {items.length === 0 ? (
        <div className="lg:card">
          <EmptyState title="Este tópico ainda não tem itens selecionados" />
        </div>
      ) : (
        <DayList items={items} headerAside={<span className="num whitespace-nowrap">{first}–{last}<span className="hidden sm:inline"> de {topic.total.toLocaleString("pt-BR")}</span></span>} />
      )}
      <Pagination page={page} pageCount={pageCount} href={href} />
    </div>
  );
}
