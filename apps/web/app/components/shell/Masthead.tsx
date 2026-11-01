// The journal's name across the top of every public page, set as a newspaper sets its masthead: the name large
// and centred, the subject between rules beneath it. On a phone the site's sections take the subject's place,
// so the page's news starts sooner. Pages that lead nowhere else on the site (the /assine pages) leave out the
// link to the front page and keep the subject.
import { Link, useLocation, useSearchParams } from "react-router";
import { SITE } from "@aihot/site";
import { Wordmark } from "@aihot/site/brand/Logo.tsx";
import { isAreaKey } from "@aihot/contracts/taxonomy";
import { AreaTabs } from "../../features/feed/Filters";

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
      <p className={`mt-2 border-b border-t-2 border-ink py-1.5 text-[10.5px] uppercase tracking-[0.2em] text-ink-3 lg:text-[11.5px] lg:tracking-[0.28em] ${link ? "hidden lg:block" : ""}`}>
        {SITE.tagline}
        {note && <span className="hidden sm:inline"> · {note}</span>}
      </p>
      {link && <PhoneSections />}
    </header>
  );
}

/** Phones: the sections, each to its feed; on a feed (Seleção or Todas) the one in view is marked and the feed's other filters carry over. */
function PhoneSections() {
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const feed = pathname === "/all" ? "/all" : pathname === "/selecao" ? "/selecao" : null;
  const chosen = params.get("area");
  const area = feed && isAreaKey(chosen) ? chosen : null;
  return (
    <div className="mt-2 border-t-2 border-ink pt-2 text-left lg:hidden">
      <AreaTabs base={feed ?? "/selecao"} area={area} everyArea={feed !== null} layoutId="masthead-area" />
    </div>
  );
}
