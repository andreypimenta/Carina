import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { RingMark } from "@aihot/site/brand/Logo.tsx";
import { PhoneBar } from "../components/shell/PhoneBar";
import type { Screen } from "../components/shell/screens";
import { titled } from "../lib/seo";

export const handle: Screen = { tab: "featured" };

export function meta() {
  return [{ title: titled("Busca ocupada") }, { name: "robots", content: "noindex, follow" }];
}
export function headers() {
  return { "Cache-Control": "no-store" };
}

const RETRY_AFTER_SECONDS = 5;
const SEARCH_PARAMS = ["q", "tag", "channel", "category", "page", "tab"];

/** The busy page after an overloaded search: the same search can be tried again after a few seconds. */
export default function SearchBusy() {
  const { pathname, search } = useLocation();
  const [wait, setWait] = useState(RETRY_AFTER_SECONDS);
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);
  const kept = new URLSearchParams();
  for (const [k, v] of new URLSearchParams(search)) if (SEARCH_PARAMS.includes(k)) kept.append(k, v);
  const base = pathname.startsWith("/all") ? "/all" : "/";
  const retry = kept.toString() ? `${base}?${kept}` : base;
  const hasSearch = kept.has("q");
  const button = "inline-flex h-9 items-center rounded-full px-4 text-[13.5px]";
  return (
    <>
    <PhoneBar back={{ to: base, label: base === "/all" ? "Todas" : "Seleção" }} />
    <div className="mx-auto max-w-sm py-24 text-center" aria-live="polite">
      <RingMark className="mx-auto mb-5 size-10 text-accent" spinning />
      <h1 className="text-[20px] font-bold text-ink">A busca está ocupada</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-ink-3">Muita gente buscando agora. Tente de novo em {RETRY_AFTER_SECONDS} segundos; a navegação pelas listas continua normal.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2.5">
        {hasSearch &&
          (wait > 0 ? (
            <span aria-disabled="true" className={`${button} num cursor-default bg-bg-sunk font-medium text-ink-4`}>Tente de novo em {wait} s</span>
          ) : (
            <Link to={retry} className={`${button} bg-accent font-medium text-accent-contrast hover:bg-accent-ink`}>Repetir esta busca</Link>
          ))}
        <Link to="/all" className={`${button} ${hasSearch ? "border border-line-strong bg-surface text-ink-2 hover:border-ink-4" : "bg-accent font-medium text-accent-contrast hover:bg-accent-ink"}`}>Ver todas as notícias</Link>
        <Link to="/" className={`${button} border border-line-strong bg-surface text-ink-2 hover:border-ink-4`}>Voltar à seleção</Link>
      </div>
    </div>
    </>
  );
}
