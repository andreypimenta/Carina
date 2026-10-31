// The journal's name across the top of every public page, set as a newspaper sets its masthead: the name large
// and centred, the subject between rules beneath it. Pages that lead nowhere else on the site (the /assine
// pages) leave out the link to the front page.
import { Link } from "react-router";
import { SITE } from "@aihot/site";
import { Wordmark } from "@aihot/site/brand/Logo.tsx";

export function Masthead({ link = true, note, className = "" }: { link?: boolean; note?: string; className?: string }) {
  const name = <Wordmark size="clamp(36px, 10vw, 64px)" className="text-ink" />;
  return (
    <header className={`text-center ${className}`}>
      {link ? (
        <Link to="/" prefetch="intent" aria-label={`${SITE.name}: primeira página`} className="inline-block py-1">
          {name}
        </Link>
      ) : (
        <div className="py-1">{name}</div>
      )}
      <p className="mt-2 border-b border-t-2 border-ink py-1.5 text-[10.5px] uppercase tracking-[0.2em] text-ink-3 lg:text-[11.5px] lg:tracking-[0.28em]">
        {SITE.tagline}
        {note && <span className="hidden sm:inline"> · {note}</span>}
      </p>
    </header>
  );
}
