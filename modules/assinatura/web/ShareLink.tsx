// The links to send to WhatsApp groups: on a weekly issue's page, the button that copies the issue's /assine
// address; on an article, a button that opens WhatsApp with its title and lean /assine page ready to send
// (wa.me picks the chat; nothing goes through the site) and one that copies that page. Where the browser
// refuses to copy, the address is shown to be selected by hand. Each click is counted as a button click
// (countButton): whether the link was then sent is not known.
import { useEffect, useState } from "react";
import { copyText } from "@aihot/web/lib/clipboard";
import { siteUrl } from "@aihot/web/lib/seo";
import { IconCheck, IconCopy, IconMessage } from "@aihot/web/components/icons";

/** An article's lean page under its weekly issue (materia.tsx), the address its share buttons send. */
export const materiaUrl = (week: string, id: string) => `${siteUrl()}/assine/${week}/${id}`;

/** Tells the api a share button was clicked; the count is all it keeps (backend/reads.ts countButton). */
export function countButton(button: "whatsapp" | "copiar" | "indique"): void {
  try {
    navigator.sendBeacon?.("/api/assinatura/botao", new Blob([JSON.stringify({ button })], { type: "application/json" }));
  } catch {
    // A count is not worth an error.
  }
}

/** WhatsApp's own share link: it asks for the chat and fills in the title and the address. */
export const whatsappShare = (title: string, url: string) => `https://wa.me/?text=${encodeURIComponent(`${title}\n${url}`)}`;

export function ShareLink({ url, label = "Copiar link para grupos", whatsapp, className = "mt-3" }: { url: string; label?: string; whatsapp?: string; className?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "refused">("idle");
  useEffect(() => {
    if (state !== "copied") return;
    const t = setTimeout(() => setState("idle"), 2500);
    return () => clearTimeout(t);
  }, [state]);
  const copy = async () => {
    countButton("copiar");
    try {
      await copyText(url);
      setState("copied");
    } catch {
      setState("refused");
    }
  };
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-ink-3 ${className}`}>
      {whatsapp !== undefined && (
        <a
          href={whatsappShare(whatsapp, url)}
          onClick={() => countButton("whatsapp")}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#25d366] px-4 text-[13px] font-semibold text-[#06301a] transition-opacity hover:opacity-90"
        >
          <IconMessage size={15} />
          Mandar no WhatsApp
        </a>
      )}
      <button
        type="button"
        onClick={() => void copy()}
        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line-strong bg-surface px-4 text-[13px] font-medium text-ink-2 transition-colors hover:border-ink-4 hover:text-ink"
      >
        {state === "copied" ? <IconCheck size={15} className="text-accent" /> : <IconCopy size={15} />}
        {label}
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

/** Beside each story of a weekly issue (WebModule.StoryTool): WhatsApp with the story's lean page. */
export function StoryShare({ report, itemId, title }: { report: { kind: string; key: string }; itemId: string; title: string }) {
  if (report.kind !== "weekly") return null;
  return (
    <a
      href={whatsappShare(title, materiaUrl(report.key, itemId))}
      onClick={() => countButton("whatsapp")}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Mandar no WhatsApp: ${title} (abre o WhatsApp)`}
      className="inline-flex min-h-7 items-center gap-1 text-[12.5px] font-medium text-ink-3 transition-colors hover:text-accent"
    >
      <IconMessage size={13} /> WhatsApp
    </a>
  );
}
