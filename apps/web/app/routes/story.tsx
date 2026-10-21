import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { IntentLink } from "../components/ui/IntentLink";
import { Link, useLoaderData, useLocation } from "react-router";
import type { Route } from "./+types/story";
import type { StoryDetail, StoryReportView } from "@aihot/contracts/site";
import { SITE } from "@aihot/site";
import { cachedPage, loadOr404 } from "../lib/api.server";
import { pageReuse } from "../lib/page-reuse";
import { breadcrumbLd, pageMeta, titled } from "../lib/seo";
import { beijingDate, beijingTime } from "@aihot/contracts/time";
import { monthDay, monthDayTime, relativeTime } from "../lib/format";
import { HeatChart } from "../features/story/HeatChart";
import { sessionCache } from "../lib/session-cache";
import { isReload } from "../lib/restore";
import { Badge, SelectedBadge } from "../components/ui/Badge";
import { PillTabs } from "../components/ui/Tabs";
import { Select } from "../components/ui/Controls";
import { IconArrowLeft, IconChevronRight, IconClock, IconDoc, IconUsers } from "../components/icons";
import { PhoneBar } from "../components/shell/PhoneBar";
import type { Screen } from "../components/shell/screens";

export const handle: Screen = { home: "hot" };
export { pageHeaders as headers } from "../lib/api.server";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

export async function loader({ params, request }: Route.LoaderArgs) {
  const story = await loadOr404<StoryDetail>(`/api/site/stories/${encodeURIComponent(params.publicId)}`, { signal: request.signal, merged: (id) => `/story/${id}` });
  return cachedPage(300, { story });
}

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) return [{ title: titled("Evento não encontrado") }, { name: "robots", content: "noindex" }];
  const s = loaderData.story;
  return pageMeta({
    title: s.title,
    description: (s.digest ?? s.summary)?.slice(0, 150) ?? `${s.reportCount} notícias de ${s.sourceCount} fontes: linha do tempo completa e últimas atualizações.`,
    path: `/story/${s.publicId}`,
    image: `/og/stories/${s.publicId}.png`,
    type: "article",
    jsonLd: breadcrumbLd([{ name: SITE.name, path: "/" }, { name: "Em alta", path: "/hot" }, { name: s.title, path: `/story/${s.publicId}` }]),
  });
}

const STATUS = {
  active: { label: "Em andamento", tone: "hot" },
  watching: { label: "Em observação", tone: "amber" },
  settled: { label: "Encerrado", tone: "neutral" },
} as const;

// Section anchors keep the old page's ids so shared links still land in the right place.
const SECTIONS = { overview: "event-overview", reports: "event-reports", heat: "event-heat" } as const;
type SectionKey = keyof typeof SECTIONS;

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** A main-column card: 17px title, 24px padding. */
function Panel({ id, title, sub, right, children, className = "" }: { id?: string; title: ReactNode; sub?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={`card scroll-mt-[calc(var(--bar-h)+64px)] p-5 lg:p-6 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[17px] font-[650] leading-[1.5] text-ink">{title}</h2>
          {sub && <p className="mt-0.5 text-[12.5px] text-ink-4">{sub}</p>}
        </div>
        {right && <div className="shrink-0 text-[11.5px] text-ink-4">{right}</div>}
      </div>
      <div className="mt-3.5">{children}</div>
    </section>
  );
}

/** A rail card: 14px title, 22px padding. */
function RailCard({ title, right, children, className = "" }: { title: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card p-5 lg:p-[22px] ${className}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[14px] font-[650] text-ink">{title}</h2>
        {right && <span className="num text-[11.5px] text-ink-4">{right}</span>}
      </div>
      <div className="mt-2">{children}</div>
    </section>
  );
}

/** Highlights the section nav entry whose section is under the sticky bar. */
function useActiveSection(keys: SectionKey[]): [SectionKey, (k: SectionKey) => void] {
  const [active, setActive] = useState<SectionKey>("overview");
  useEffect(() => {
    const els = keys.map((k) => document.getElementById(SECTIONS[k])).filter((e): e is HTMLElement => !!e);
    const onScroll = () => {
      let cur: SectionKey = keys[0]!;
      for (const [i, el] of els.entries()) if (el.getBoundingClientRect().top <= 96) cur = keys[i]!;
      // The last section may never reach the bar; at the bottom of the page it is the one being read.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) cur = keys[keys.length - 1]!;
      setActive(cur);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [keys.join()]);
  const go = (k: SectionKey) => {
    const el = document.getElementById(SECTIONS[k]);
    if (!el) return;
    el.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    history.replaceState(history.state, "", `#${SECTIONS[k]}`);
  };
  return [active, go];
}

/** One report on the story timeline: time, source and marks, title, a summary that opens on demand. */
function TimelineRow({ r }: { r: StoryReportView }) {
  const [open, setOpen] = useState(false);
  const [clamped, setClamped] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (el && !open) setClamped(el.scrollHeight > el.clientHeight + 1);
  }, [r.summary, open]);
  return (
    <li className="grid gap-x-3 border-b border-line-soft py-4 last:border-b-0 lg:grid-cols-[48px_minmax(0,1fr)]">
      <time dateTime={r.publishedAt} className="mono text-[12px] leading-[20px] text-ink-4">
        {beijingTime(r.publishedAt)}
      </time>
      <div className="min-w-0">
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-[12px] leading-[20px] text-ink-4 lg:mt-0">
          <span className="min-w-0 truncate">{r.source.name}</span>
          {r.selected && <SelectedBadge />}
        </div>
        <IntentLink viewTransition to={`/items/${r.id}`} className="mt-1 block text-[16px] font-[650] leading-[1.6] text-ink transition-colors hover:text-accent lg:text-[15.5px]">
          {r.title}
        </IntentLink>
        {r.summary && (
          <>
            <p ref={ref} className={`mt-1 text-[14px] leading-[1.75] text-ink-3 ${open ? "" : "line-clamp-2"}`}>
              {r.summary}
            </p>
            {(clamped || open) && (
              <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="mt-1 text-[12.5px] text-note transition-colors hover:text-accent">
                {open ? "Recolher resumo" : "Ver resumo completo"}
              </button>
            )}
          </>
        )}
      </div>
    </li>
  );
}

type Filter = "all" | "official" | "selected";
type Order = "desc" | "asc";

// The report filter and shared reading order, per history entry: back from a report restores the view.
const viewCache = sessionCache<{ savedAt: number; filter: Filter; order: Order }>("aihot:story-view:", 30 * 60 * 1000);

export default function StoryPage() {
  const { story } = useLoaderData<typeof loader>();
  const entry = useLocation().key;
  const [filter, setFilter] = useState<Filter>(() => viewCache.peek(entry)?.filter ?? "all");
  const [order, setOrder] = useState<Order>(() => viewCache.peek(entry)?.order ?? "desc");
  // A document the browser reloaded on back/forward gets the view back after hydration.
  useEffect(() => {
    if (viewCache.peek(entry) || isReload()) return;
    const saved = viewCache.read(entry);
    if (saved) {
      setFilter(saved.filter);
      setOrder(saved.order);
    }
  }, [entry]);
  useEffect(() => {
    if (filter !== "all" || order !== "desc" || viewCache.peek(entry)) viewCache.set(entry, { savedAt: Date.now(), filter, order });
  }, [entry, filter, order]);
  const status = STATUS[story.status];
  // A settled story nobody watched (history pages) has no heat to explain or chart.
  const observed = story.status !== "settled" || story.heat.length > 0 || story.whyHot.participants48h > 0 || story.whyHot.rank !== null;
  const sectionKeys: SectionKey[] = observed ? ["overview", "reports", "heat"] : ["overview", "reports"];
  const [activeSection, goSection] = useActiveSection(sectionKeys);
  const counts = {
    all: story.timeline.length,
    official: story.timeline.filter((r) => r.source.firstParty).length,
    selected: story.timeline.filter((r) => r.selected).length,
  };
  const days = useMemo(() => {
    const list = story.timeline.filter((r) => (filter === "official" ? r.source.firstParty : filter === "selected" ? r.selected : true));
    const sorted = [...list].sort((a, b) => (order === "desc" ? Date.parse(b.publishedAt) - Date.parse(a.publishedAt) : Date.parse(a.publishedAt) - Date.parse(b.publishedAt)));
    const out: Array<{ day: string; rows: StoryReportView[] }> = [];
    for (const r of sorted) {
      const d = beijingDate(r.publishedAt);
      const last = out[out.length - 1];
      if (last && last.day === d) last.rows.push(r);
      else out.push({ day: d, rows: [r] });
    }
    return out;
  }, [story.timeline, filter, order]);
  const developments = useMemo(() => [...story.developments].sort((a, b) =>
    order === "desc" ? Date.parse(b.firstReportAt) - Date.parse(a.firstReportAt) : Date.parse(a.firstReportAt) - Date.parse(b.firstReportAt)
  ), [story.developments, order]);
  const newest = story.latestReport;
  const overview = story.digest
    ? { label: "Panorama por IA", text: story.digest, note: story.digestUpdatedAt ? `Gerado por IA a partir das notícias · atualizado ${relativeTime(story.digestUpdatedAt)}` : "Gerado por IA a partir das notícias" }
    : story.summary
      ? { label: "Resumo dos fatos", text: story.summary, note: null }
      : story.excerpt
        ? { label: "Trecho da notícia", text: story.excerpt.text, note: `De ${story.excerpt.sourceName}` }
        : null;
  const showOfficial = () => {
    setFilter("official");
    goSection("reports");
  };

  return (
    <div className="mx-auto max-w-[var(--page-max-reading)] pb-10">
      <PhoneBar back={{ to: "/hot", label: "Em alta" }} title={story.title} />
      <nav aria-label="Você está em" className="hidden items-center gap-2.5 pb-5 pt-4 text-[12px] text-ink-4 lg:flex">
        <Link to="/hot" className="inline-flex items-center gap-1.5 transition-colors hover:text-ink">
          <IconArrowLeft size={15} /> Em alta
        </Link>
        <span className="h-3 w-px bg-line-strong" aria-hidden="true" />
        <span>Detalhes do evento</span>
      </nav>

      <header className="max-w-[960px] pt-3 lg:pt-0">
        <div className="flex items-center gap-2 text-[12px] text-ink-4">
          Evento em alta
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
        <h1 data-page-title="" className="mt-2.5 text-[27px] font-bold leading-[1.5] tracking-[-0.01em] text-ink lg:mt-3 lg:text-[36px] lg:font-[730]">{story.title}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[12.5px] text-ink-3">
          <span className="inline-flex items-center gap-1.5">
            <IconDoc size={15} className="text-ink-4" />
            <b className="num font-semibold text-ink">{story.reportCount}</b> {story.reportCount === 1 ? "notícia" : "notícias"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <IconUsers size={15} className="text-ink-4" />
            <b className="num font-semibold text-ink">{story.sourceCount}</b> {story.sourceCount === 1 ? "fonte" : "fontes"}
          </span>
          {story.latestAt && (
            <span className="inline-flex items-center gap-1.5" suppressHydrationWarning>
              <IconClock size={15} className="text-ink-4" />
              atualizado {relativeTime(story.latestAt)}
            </span>
          )}
        </div>
      </header>

      <div className="bleed sticky top-[var(--bar-h)] z-20 mt-5 bg-bg/90 py-2 backdrop-blur-md lg:mx-0 lg:px-0">
        <PillTabs
          size="sm"
          layoutId="story-sections"
          label="Navegação do evento"
          active={activeSection}
          onSelect={(k) => goSection(k as SectionKey)}
          items={[
            { key: "overview", label: "Visão geral" },
            { key: "reports", label: "Linha do tempo", count: story.reportCount },
            ...(observed ? [{ key: "heat", label: "Repercussão" }] : []),
          ]}
        />
      </div>

      <div className="mt-5 grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:mt-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-6 2xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* On phones the main column dissolves so the rail's cards can sit between its sections. */}
        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-6">
          <Panel id={SECTIONS.overview} title="Entenda o caso" right={overview?.label} className="order-1">
            {overview ? (
              <>
                <p className="whitespace-pre-line text-[15px] leading-[1.85] text-ink-2">{overview.text}</p>
                {overview.note && (
                  <p className="mt-2 text-[12px] text-ink-4" suppressHydrationWarning>
                    {overview.note}
                  </p>
                )}
              </>
            ) : (
              <p className="text-[13.5px] text-ink-4">Ainda não há panorama; veja a linha do tempo das notícias abaixo.</p>
            )}
            {story.latest && (
              <div className="-mx-5 mt-5 border-t border-line-soft px-5 pt-4 lg:-mx-6 lg:px-6">
                <div className="flex items-center gap-2.5 text-[12px]">
                  <span className="font-semibold text-ink">Última atualização</span>
                  {story.latestAt && <span className="num text-ink-4">{monthDayTime(story.latestAt)}</span>}
                </div>
                {newest ? (
                  <Link viewTransition to={`/items/${newest.id}`} className="group mt-1.5 inline text-[14px] leading-[1.7] text-ink-2 transition-colors hover:text-accent">
                    {story.latest}
                    <IconChevronRight size={14} className="ml-0.5 inline -translate-y-px text-ink-4 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                ) : (
                  <p className="mt-1.5 text-[14px] leading-[1.7] text-ink-2">{story.latest}</p>
                )}
              </div>
            )}
          </Panel>

          {story.developments.length > 1 && (
            <Panel title="Desdobramentos" sub={`${story.developments.length} ${story.developments.length === 1 ? "desdobramento" : "desdobramentos"}`} className="order-3" right={
              <Select value={order} onChange={(e) => setOrder(e.target.value as "desc" | "asc")} aria-label="Ordenar desdobramentos">
                <option value="desc">Mais recentes primeiro</option>
                <option value="asc">Mais antigos primeiro</option>
              </Select>
            }>
              <ol className="relative space-y-4 pl-5 before:absolute before:bottom-2 before:left-[3px] before:top-2 before:w-px before:bg-line">
                {developments.map((d) => (
                  <li key={d.factId} className="relative">
                    <span className={`absolute -left-5 top-[7px] size-[7px] rounded-full ring-4 ring-surface ${d.factId === story.developments[0]?.factId ? "bg-accent" : "bg-line-strong"}`} aria-hidden="true" />
                    <div className="num text-[12px] text-ink-4">
                      {monthDayTime(d.firstReportAt)} · {d.reportCount} {d.reportCount === 1 ? "notícia" : "notícias"}
                    </div>
                    <Link viewTransition to={`/items/${d.representative.id}`} className="mt-0.5 block text-[15px] font-semibold leading-snug text-ink transition-colors hover:text-accent">
                      {d.title}
                    </Link>
                    <div className="mt-0.5 truncate text-[12.5px] text-ink-4">
                      {d.representative.source.name}: {d.representative.title}
                    </div>
                  </li>
                ))}
              </ol>
            </Panel>
          )}

          <Panel
            id={SECTIONS.reports}
            title="Linha do tempo das notícias"
            sub="Acompanhe as notícias para ver os diferentes lados do caso."
            className="order-4"
            right={
              <Select value={order} onChange={(e) => setOrder(e.target.value as "desc" | "asc")} aria-label="Ordenar linha do tempo">
                <option value="desc">Mais recentes primeiro</option>
                <option value="asc">Mais antigos primeiro</option>
              </Select>
            }
          >
            <PillTabs
              size="xs"
              layoutId="story-report-filter"
              label="Filtrar notícias"
              active={filter}
              onSelect={(k) => setFilter(k as Filter)}
              items={[
                { key: "all", label: "Todas", count: counts.all },
                { key: "official", label: "Oficiais", count: counts.official },
                { key: "selected", label: "Selecionadas", count: counts.selected },
              ]}
            />
            {days.length === 0 ? (
              <p className="py-10 text-center text-[13px] text-ink-4">Nenhuma notícia com este filtro.</p>
            ) : (
              days.map(({ day, rows }) => (
                <div key={day}>
                  <div className="pb-0.5 pt-5 text-[14px] font-semibold text-ink">{monthDay(day)}</div>
                  <ol>
                    {rows.map((r) => (
                      <TimelineRow key={r.id} r={r} />
                    ))}
                  </ol>
                </div>
              ))
            )}
            {story.reportCount > story.timeline.length && (
              <p className="pt-3 text-center text-[12px] text-ink-4">
                Mostrando as {story.timeline.length} mais recentes de {story.reportCount} notícias.
              </p>
            )}
          </Panel>

          {observed && (
            <Panel id={SECTIONS.heat} title="Repercussão deste evento" className="order-5">
              <HeatChart points={story.heat} />
            </Panel>
          )}

          {story.related.length > 0 && (
            <Panel title="Eventos relacionados" className="order-6">
              <ul className="-my-1 divide-y divide-line-soft">
                {story.related.map((r) => (
                  <li key={r.publicId}>
                    <Link viewTransition to={`/story/${r.publicId}`} className="group flex items-baseline gap-3 py-3">
                      <span className="shrink-0 text-[12px] text-ink-4">{r.relation === "storyline" ? "Mesma história" : "Relacionado"}</span>
                      <span className="min-w-0 flex-1 text-[14.5px] font-medium text-ink-2 transition-colors group-hover:text-accent">{r.title}</span>
                      <IconChevronRight size={14} className="shrink-0 self-center text-ink-4" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>

        <aside className="order-2 flex min-w-0 flex-col gap-4 lg:order-none lg:gap-5">
          {observed && (
            <RailCard title="Por que está em alta">
              <p className="text-[12.5px] leading-[1.75] text-ink-3">
                Nas últimas 48 horas, observamos <b className="num font-semibold text-ink">{story.whyHot.participants48h}</b> participantes independentes discutindo ou noticiando o caso; nas últimas 6 horas, mais{" "}
                <b className="num font-semibold text-ink">{story.whyHot.newParticipants6h}</b>.
              </p>
              {!story.whyHot.observationComplete && <p className="mt-2 text-[12px] leading-relaxed text-ink-4">A observação de algumas fontes está incompleta; os números acima são só o que foi observado.</p>}
              <p className="mt-2 text-[12px] text-ink-4">
                <span className="num">{story.whyHot.recentReports24h}</span> {story.whyHot.recentReports24h === 1 ? "notícia recente" : "notícias recentes"}
                {story.whyHot.rank && (
                  <>
                    <span className="mx-1">·</span>
                    <Link to="/hot" className="text-accent hover:underline">
                      {story.whyHot.rank}º em Em alta
                    </Link>
                  </>
                )}
              </p>
            </RailCard>
          )}
          {story.officialReports.length > 0 && (
            <RailCard title="Fontes oficiais" right={String(counts.official || story.officialReports.length)}>
              <p className="text-[12px] text-ink-4">O que dizem diretamente os envolvidos</p>
              <ul className="mt-1 divide-y divide-line-soft">
                {story.officialReports.slice(0, 5).map((r) => (
                  <li key={r.id} className="py-3">
                    <div className="truncate text-[11.5px] text-ink-4">{r.source.name}</div>
                    <Link viewTransition to={`/items/${r.id}`} className="group mt-1 block text-[13.5px] font-semibold leading-[1.6] text-ink transition-colors hover:text-accent">
                      {r.title}
                      <IconChevronRight size={13} className="ml-0.5 inline -translate-y-px text-ink-4 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                ))}
              </ul>
              {counts.official > 0 && (
                <button type="button" onClick={showOfficial} className="text-[12px] text-ink-4 transition-colors hover:text-accent">
                  Ver todas as notícias oficiais na linha do tempo
                </button>
              )}
            </RailCard>
          )}
          {story.topics.length > 0 && (
            <RailCard title="Tópicos relacionados">
              <div className="flex flex-wrap gap-1.5">
                {story.topics.map((t) => (
                  <Link viewTransition key={t.slug} to={`/topics/${t.slug}`} className="chip">
                    {t.name}
                  </Link>
                ))}
              </div>
            </RailCard>
          )}
          <RailCard title="Registro do evento" className="hidden lg:block">
            <dl className="space-y-2 text-[12.5px]">
              {story.firstReportAt && (
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-4">Primeira notícia</dt>
                  <dd className="num text-ink-2">
                    <time dateTime={story.firstReportAt}>{monthDayTime(story.firstReportAt)}</time>
                  </dd>
                </div>
              )}
              {story.latestAt && (
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-4">Última atualização</dt>
                  <dd className="num text-ink-2">
                    <time dateTime={story.latestAt}>{monthDayTime(story.latestAt)}</time>
                  </dd>
                </div>
              )}
            </dl>
            <p className="mt-3 border-t border-line-soft pt-3 text-[12px] leading-relaxed text-ink-4">As notícias sobre este evento ficam reunidas aqui, e os novos desdobramentos continuam sendo acrescentados.</p>
          </RailCard>
        </aside>
      </div>
    </div>
  );
}
