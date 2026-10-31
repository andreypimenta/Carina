// "Indique a um colega", where an issue ends (the site, /assine): the sign-up link, with the tag that counts
// what readers pass on (INDIQUE_GROUP), sent through the phone's share sheet or copied. Nothing is sent from
// the site; the click is counted as a button click.
import { useState } from "react";
import { SITE } from "@aihot/site";
import { copyText } from "@aihot/web/lib/clipboard";
import { IconCheck, IconShare } from "@aihot/web/components/icons";
import { INDIQUE_GROUP, signupPath } from "../group.ts";
import { countButton } from "./ShareLink.tsx";

export function Indique({ className = "mt-6" }: { className?: string }) {
  const [copied, setCopied] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const share = async () => {
    countButton("indique");
    const url = `${window.location.origin}${signupPath(INDIQUE_GROUP)}`;
    const text = `${SITE.name}: a edição semanal de ${SITE.subject}, de graça. Inscreva-se:`;
    if (navigator.share) {
      // Closing the share sheet rejects; the reader just did not share.
      return navigator.share({ title: SITE.name, text, url }).catch(() => {});
    }
    try {
      await copyText(url);
    } catch {
      return setRefused(url);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };
  return (
    <aside aria-label="Indique a um colega" className={`card flex flex-col gap-4 px-5 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-7 ${className}`}>
      <div className="min-w-0">
        <h2 className="text-[18px] font-bold leading-snug text-ink">Indique a um colega</h2>
        <p className="mt-1.5 text-[14.5px] leading-relaxed text-ink-3">{`Conhece alguém que gostaria de receber o ${SITE.bareName}? Mande o link da inscrição.`}</p>
        {refused && (
          <>
            <p role="status" className="mt-3 text-[13px] text-ink-3">Não deu para copiar. Selecione o link:</p>
            <input
              readOnly
              value={refused}
              aria-label="Link da inscrição"
              onFocus={(e) => e.currentTarget.select()}
              autoFocus
              className="mt-2 h-9 w-full min-w-0 rounded-control bg-bg-sunk px-3 text-[13px] text-ink ring-1 ring-inset ring-line-soft sm:w-[26em]"
            />
          </>
        )}
      </div>
      <button
        type="button"
        onClick={share}
        className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-bg-sunk px-6 text-[15px] font-semibold text-ink ring-1 ring-inset ring-line-soft transition-opacity hover:opacity-90"
      >
        {copied ? <IconCheck size={17} /> : <IconShare size={17} />}
        <span aria-live="polite">{copied ? "Link copiado" : "Enviar o link"}</span>
      </button>
    </aside>
  );
}
