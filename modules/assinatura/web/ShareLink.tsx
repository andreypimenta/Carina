// On a weekly issue's page: the button that copies the issue's /assine address, the link to send to WhatsApp
// groups. Where the browser refuses to copy, the address is shown to be selected by hand.
import { useEffect, useState } from "react";
import { copyText } from "@aihot/web/lib/clipboard";
import { siteUrl } from "@aihot/web/lib/seo";
import { IconCheck, IconCopy } from "@aihot/web/components/icons";

export function ShareLink({ week }: { week: string }) {
  const [state, setState] = useState<"idle" | "copied" | "refused">("idle");
  const url = `${siteUrl()}/assine/${week}`;
  useEffect(() => {
    if (state !== "copied") return;
    const t = setTimeout(() => setState("idle"), 2500);
    return () => clearTimeout(t);
  }, [state]);
  const copy = async () => {
    try {
      await copyText(url);
      setState("copied");
    } catch {
      setState("refused");
    }
  };
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-ink-3">
      <button
        type="button"
        onClick={() => void copy()}
        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line-strong bg-surface px-4 text-[13px] font-medium text-ink-2 transition-colors hover:border-ink-4 hover:text-ink"
      >
        {state === "copied" ? <IconCheck size={15} className="text-accent" /> : <IconCopy size={15} />}
        Copiar link para grupos
      </button>
      <span role="status">{state === "copied" ? "Link copiado. É só colar no grupo." : state === "refused" ? "Não deu para copiar. Selecione o link:" : ""}</span>
      {state === "refused" && (
        <input
          readOnly
          value={url}
          aria-label="Link para grupos"
          onFocus={(e) => e.currentTarget.select()}
          autoFocus
          className="h-9 w-full min-w-0 rounded-control bg-bg-sunk px-3 text-[13px] text-ink ring-1 ring-inset ring-line-soft sm:w-[26em]"
        />
      )}
    </div>
  );
}
