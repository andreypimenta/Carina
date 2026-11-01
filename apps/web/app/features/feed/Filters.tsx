// Feed filters: the section (aba) tabs, the channel and category choice (a row of tabs on desktop, a sheet behind the bar's filter
// button on phones), the phone bar of 精选 and 全部, and search.
import { useEffect, useRef, useState } from "react";
import { Form, Link, useLocation, useNavigation, useSearchParams } from "react-router";
import { AREA_KEYS, AREA_LABELS, CATEGORY_KEYS, CATEGORY_LABELS, CHANNEL_LABELS, type AreaKey, type CategoryKey, type ChannelKey } from "@aihot/contracts/taxonomy";
import { IconCheck, IconClose, IconFilter, IconSearch } from "../../components/icons";
import { PillTabs } from "../../components/ui/Tabs";
import { Sheet } from "../../components/ui/Sheet";
import { BarButton, PhoneBar } from "../../components/shell/PhoneBar";
import { openSearch } from "../search/SearchOverlay";
import { centeredScrollLeft } from "../../lib/scroll-row.ts";

/** Same page with some query parameters changed (paging state dropped). */
function hrefWith(base: string, params: URLSearchParams, patch: Record<string, string | null>) {
  const sp = new URLSearchParams(params);
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === "") sp.delete(k);
    else sp.set(k, v);
  }
  sp.delete("page");
  sp.delete("cursor");
  const s = sp.toString();
  return s ? `${base}?${s}` : base;
}

/**
 * The feed's one filter (精选 and 全部动态 alike): none, 一手, or a category. One choice at a time: picking
 * 一手 clears the category and picking a category clears 一手. Older 资讯 / X links still filter; the
 * choice then shows as none.
 */
function filterOptions(base: string, params: URLSearchParams, noneLabel: string) {
  return [
    { key: "all", label: noneLabel, to: hrefWith(base, params, { category: null, channel: null }) },
    { key: "firstParty", label: CHANNEL_LABELS.firstParty, to: hrefWith(base, params, { category: null, channel: "firstParty" }) },
    ...CATEGORY_KEYS.map((k) => ({ key: k, label: CATEGORY_LABELS[k], to: hrefWith(base, params, { category: k, channel: null }) })),
  ];
}

function filterKey(category: CategoryKey | null, channel: ChannelKey): string {
  return channel === "firstParty" ? "firstParty" : (category ?? "all");
}

/**
 * The site's sections (abas): on desktop above a feed's other filters, on phones in the masthead. On the
 * feed itself every section, or one, with the other filters in use carrying over; off it, where none is
 * chosen, only the sections.
 */
export function AreaTabs({ base, area, layoutId, className = "" }: { base: string; area: AreaKey | null | undefined; layoutId: string; className?: string }) {
  const [current] = useSearchParams();
  const onFeed = useLocation().pathname === base;
  const params = onFeed ? current : new URLSearchParams();
  const items = [
    ...(onFeed ? [{ key: "all", label: "Todas as áreas", to: hrefWith(base, params, { area: null }), prefetch: "intent" as const }] : []),
    ...AREA_KEYS.map((k) => ({ key: k, label: AREA_LABELS[k], to: hrefWith(base, params, { area: k }), resetScroll: !onFeed, prefetch: "intent" as const })),
  ];
  const ref = useRef<HTMLDivElement>(null);
  // On a phone the row scrolls sideways; bring the chosen section into view without moving the page.
  useEffect(() => {
    const scroller = ref.current?.firstElementChild as HTMLElement | null;
    const tab = scroller?.querySelector<HTMLElement>('[aria-current="page"]');
    if (scroller && tab) scroller.scrollLeft = centeredScrollLeft(scroller, tab);
  }, [area]);
  return (
    <div ref={ref} className={className}>
      <PillTabs items={items} active={area ?? "all"} layoutId={layoutId} label="Área" />
    </div>
  );
}

/** Desktop: the filter as a row of tabs beside the search field. */
export function CategoryTabs({ base, category, channel = "all", layoutId, className = "" }: { base: string; category: CategoryKey | null; channel?: ChannelKey; layoutId: string; className?: string }) {
  const [params] = useSearchParams();
  return <PillTabs items={filterOptions(base, params, "Todas").map(o => ({ ...o, prefetch: 'intent' as const }))} active={filterKey(category, channel)} layoutId={layoutId} label="Filtro" className={className} />;
}

/**
 * The phone bar of 精选 and 全部 (the masthead above names the journal): the 精选 | 全部 switch (a filter in use carries over), and
 * buttons for the filter sheet and search.
 */
export function FeedBar({ base, category, channel }: { base: "/selecao" | "/all"; category: CategoryKey | null; channel: ChannelKey }) {
  const [params] = useSearchParams();
  const [sheet, setSheet] = useState(false);
  const scope = (to: string) => hrefWith(to, params, { q: null, tab: null, search: null });
  const filtered = filterKey(category, channel) !== "all";
  return (
    <>
      <PhoneBar
        center={
          <PillTabs
            size="sm"
            layoutId="feed-scope"
            label="Ver a seleção ou todas"
            active={base === "/selecao" ? "featured" : "all"}
            items={[
              { key: "featured", label: "Seleção", to: scope("/selecao"), resetScroll: true, prefetch: 'intent' },
              { key: "all", label: "Todas", to: scope("/all"), resetScroll: true, prefetch: 'intent' },
            ]}
          />
        }
        actions={
          <>
            <BarButton label={filtered ? "Filtrar (ativo)" : "Filtrar"} on={filtered} onClick={() => setSheet(true)}>
              <IconFilter size={21} />
              {filtered && <span aria-hidden="true" className="absolute right-[9px] top-[9px] size-[7px] rounded-full bg-accent ring-2 ring-bg" />}
            </BarButton>
            <SearchButton />
          </>
        }
      />
      <FilterSheet open={sheet} onClose={() => setSheet(false)} base={base} active={filterKey(category, channel)} />
    </>
  );
}

/** Phones: the filter as a sheet of options, the one in use ticked; choosing one applies it. */
function FilterSheet({ open, onClose, base, active }: { open: boolean; onClose: () => void; base: string; active: string }) {
  const [params] = useSearchParams();
  return (
    <Sheet open={open} onClose={onClose} title="Filtrar">
      <ul className="mx-4 divide-y divide-line-soft">
        {filterOptions(base, params, "Sem filtro").map((o) => {
          const on = o.key === active;
          return (
            <li key={o.key}>
              <Link
                to={o.to}
                onClick={onClose}
                aria-current={on ? "true" : undefined}
                className={`-mx-2 flex h-12 items-center justify-between rounded-tile px-2 text-[16px] transition-colors active:bg-bg-sunk ${on ? "font-semibold text-accent" : "text-ink"}`}
              >
                {o.label}
                {on && <IconCheck size={19} strokeWidth={2.2} />}
              </Link>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}

/** Phones: the filter and tag in use as chips under the bar; each one clears itself when tapped. */
export function ActiveFilters({ base, category, channel, tag }: { base: string; category: CategoryKey | null; channel: ChannelKey; tag: string | null }) {
  const [params] = useSearchParams();
  const label = channel === "firstParty" ? CHANNEL_LABELS.firstParty : category ? CATEGORY_LABELS[category] : null;
  if (!label && !tag) return null;
  const chip = "inline-flex min-h-11 max-w-full items-center gap-1 rounded-full bg-accent-soft pl-3 pr-2 text-[13px] font-medium text-accent transition-opacity active:opacity-60";
  return (
    <div className="flex flex-wrap gap-2 pb-3 pt-1 lg:hidden">
      {label && (
        <Link to={hrefWith(base, params, { category: null, channel: null })} aria-label={`Remover filtro: ${label}`} className={chip}>
          Só {label}
          <IconClose size={14} strokeWidth={2} />
        </Link>
      )}
      {tag && (
        <Link to={hrefWith(base, params, { tag: null })} aria-label={`Remover tag: ${tag}`} className={chip}>
          <span className="truncate">#{tag}</span>
          <IconClose size={14} strokeWidth={2} className="shrink-0" />
        </Link>
      )}
    </div>
  );
}

/** Phones: the magnifier in a bar; the search opens over the page with the keyboard up. */
function SearchButton() {
  return (
    <BarButton label="Buscar" onClick={(event) => openSearch("", event.currentTarget)}>
      <IconSearch size={21} />
    </BarButton>
  );
}

function useSlashFocus(ref: React.RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || (e.target as HTMLElement)?.isContentEditable)) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ref]);
}

/** Desktop search field (GET /all?q=…): at the end of the filter row as the same grey track, at the height of md tabs, with a "/" hint. */
export function SearchField({ defaultValue = "", keep = {} }: { defaultValue?: string; keep?: Record<string, string | null> }) {
  const [value, setValue] = useState(defaultValue);
  const navigation = useNavigation();
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => setValue(defaultValue), [defaultValue]);
  useSlashFocus(inputRef);
  const searching = navigation.state === "loading" && navigation.location?.pathname === "/all" && !!new URLSearchParams(navigation.location.search).get("q");
  const hidden = Object.entries(keep).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null));

  return (
    <Form method="get" action="/all" role="search" className="group relative w-full shrink-0 lg:w-60">
      {hidden}
      <label htmlFor="site-search" className="sr-only">
        Buscar em títulos, resumos e textos
      </label>
      <IconSearch size={16} className={`pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 transition-colors ${searching ? "text-accent" : "text-ink-4 group-focus-within:text-ink-3"}`} />
      <input
        ref={inputRef}
        id="site-search"
        name="q"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Buscar em títulos, resumos…"
        maxLength={200}
        autoComplete="off"
        className="h-[42px] w-full rounded-full bg-bg-sunk pl-10 pr-10 text-[14px] text-ink outline-none ring-1 ring-inset ring-line-soft transition-[background-color,box-shadow] placeholder:text-ink-4 hover:ring-line-strong focus:bg-surface focus:shadow-[0_0_0_3px_var(--accent-soft)] focus:ring-accent dark:bg-bg-muted/60 dark:focus:bg-surface"
      />
      {value ? (
        <button
          type="button"
          aria-label="Limpar"
          onClick={() => {
            setValue("");
            inputRef.current?.focus();
          }}
          className="absolute right-3 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-ink-4 transition-colors hover:bg-bg-sunk hover:text-ink"
        >
          <IconClose size={13} />
        </button>
      ) : (
        <kbd className="mono pointer-events-none absolute right-4 top-1/2 hidden -translate-y-1/2 rounded-mark border border-line-strong bg-surface px-1.5 text-[10.5px] leading-4 text-ink-4 lg:block">/</kbd>
      )}
    </Form>
  );
}
