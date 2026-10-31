import { redirect, useLoaderData } from "react-router";
import type { Route } from "./+types/home";
import type { TimelineResponse } from "@aihot/contracts/site";
import { cachedPage, loadOr404 } from "../lib/api.server";
import { pageReuse } from "../lib/page-reuse";
import { filterParams, hasFeedFilters, itemListLd, listPath, pageMeta, readFilters } from "../lib/seo";
import { SITE } from "@aihot/site";
import { inNav } from "../components/shell/nav";
import type { Screen } from "../components/shell/screens";
import { Timeline } from "../features/feed/Timeline";
import { HotTopics } from "../features/feed/HotTopics";
import { ActiveFilters, AreaTabs, CategoryTabs, FeedBar, SearchField } from "../features/feed/Filters";
import { AREA_LABELS } from "@aihot/contracts/taxonomy";

export const handle: Screen = { tab: "featured", name: "Seleção" };
export { pageHeaders as headers } from "../lib/api.server";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q");
  // Search lives on /all; keep the parameters so old links still land on results.
  if (q && q.trim()) throw redirect(`/all${url.search}`);
  const filters = readFilters(url.searchParams);
  const upstream = new Headers();
  const data = await loadOr404<TimelineResponse>(listPath("/api/site/timeline", filterParams(filters)), { responseHeaders: upstream, signal: request.signal });
  return cachedPage(60, { data, filters }, upstream);
}

export function meta({ loaderData }: Route.MetaArgs) {
  const path = listPath("/selecao", loaderData ? filterParams(loaderData.filters) : {});
  const titles = loaderData?.data.cards.map((c) => c.item.title) ?? [];
  return pageMeta({
    title: "Seleção",
    description: `A Seleção diária do ${SITE.bareName}: o que importa em ${SITE.subject}, escolhido entre tudo o que foi coletado, com filtros por seção e categoria.`,
    path,
    noindex: hasFeedFilters(loaderData?.filters),
    jsonLd: path === "/selecao" ? itemListLd(path, "Seleção", titles) : undefined,
  });
}

export default function Home() {
  const { data, filters } = useLoaderData<typeof loader>();
  const title = filters.tag ? `#${filters.tag}` : filters.area ? AREA_LABELS[filters.area] : "Seleção";
  return (
    <div className="pb-6">
      {/* Phones: the bar (精选 | 全部, filter, search), the filter in use, today's hot topics, the feed. */}
      <FeedBar base="/selecao" category={filters.category} channel={filters.channel} />
      <AreaTabs base="/selecao" area={filters.area} layoutId="home-area-phone" className="mb-3 lg:hidden" />
      <ActiveFilters base="/selecao" category={filters.category} channel={filters.channel} tag={filters.tag} />
      <div className="hidden lg:block">
        <h1 className="text-[24px] font-semibold leading-[1.3] text-ink">{title}</h1>
        <AreaTabs base="/selecao" area={filters.area} layoutId="home-area-desk" className="mt-4" />
        <div className="mb-5 mt-4 flex items-center justify-between gap-4">
          <CategoryTabs base="/selecao" category={filters.category} channel={filters.channel} layoutId="home-cat-desk" className="min-w-0" />
          <SearchField keep={{ category: filters.category, area: filters.area ?? null }} />
        </div>
      </div>

      {data.hot && inNav("/hot") && <HotTopics entries={data.hot} />}

      <Timeline initial={data} filters={data.filters} />
    </div>
  );
}
