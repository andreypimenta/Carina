// The way to /assine from the site's own pages, for the reader who came by a shared link: one line under an
// issue's masthead (desktop only: on a phone the issue's lead comes first) and at the foot of every page, and a
// short card where an issue or an article ends, with "Indique a um colega" after it at an issue's end. Nothing
// pops up or covers the reading. Under a weekly issue's line (on a phone, under its closing card instead), the
// button that copies its link for the groups; at an article's end, above the card, the buttons that send its
// lean /assine page to WhatsApp or copy it.
import { Link } from "react-router";
import { EDITION_WHEN, SITE } from "@aihot/site";
import type { ReportDetail, SiteItemDetail } from "@aihot/contracts/site";
import type { CalloutPlace } from "@aihot/web/modules";
import { IconArrowRight, IconMail } from "@aihot/web/components/icons";
import { siteUrl } from "@aihot/web/lib/seo";
import { Indique } from "./Indique.tsx";
import { materiaUrl, ShareLink } from "./ShareLink.tsx";

const LINE = `Receba a edição semanal ${EDITION_WHEN.weekly}, de graça.`;

export function Callout({ at, report, item }: { at: CalloutPlace; report?: ReportDetail; item?: SiteItemDetail }) {
  if (at === "report-end" || at === "item-end") {
    const card = (
      <aside aria-label="Assine a edição semanal" className={`card ${item ? "mt-8" : "mt-12"} flex flex-col gap-4 px-5 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-7`}>
        <div className="min-w-0">
          <h2 className="text-[18px] font-bold leading-snug text-ink">{at === "report-end" ? "Gostou desta edição?" : "Gostou desta matéria?"}</h2>
          <p className="mt-1.5 text-[14.5px] leading-relaxed text-ink-3">
            {`A edição semanal do ${SITE.bareName} chega ${EDITION_WHEN.weekly}, de graça. Você sai quando quiser.`}
          </p>
        </div>
        <Link
          to="/assine"
          prefetch="intent"
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-accent px-6 text-[15px] font-semibold text-accent-contrast transition-opacity hover:opacity-90"
        >
          <IconMail size={17} />
          Quero receber
        </Link>
      </aside>
    );
    if (!item) {
      return (
        <>
          {card}
          {report?.kind === "weekly" && <ShareLink url={`${siteUrl()}/assine/${report.key}`} className="mt-4 lg:hidden" />}
          {at === "report-end" && <Indique className="mt-4" />}
        </>
      );
    }
    // Before the first weekly issue there is no lean page to send, and the article's own goes instead.
    return (
      <>
        <section aria-label="Mandar esta matéria" className="mt-12">
          <h2 className="text-[14px] font-semibold text-ink">Mande para quem vai gostar</h2>
          <ShareLink url={item.weekly ? materiaUrl(item.weekly, item.id) : `${siteUrl()}/items/${item.id}`} label="Copiar link" whatsapp={item.title} className="mt-2.5" />
        </section>
        {card}
      </>
    );
  }
  const more = (
    <span className="inline-flex items-center gap-0.5 whitespace-nowrap font-semibold text-accent group-hover:underline">
      Assine grátis <IconArrowRight size={13} />
    </span>
  );
  if (at === "foot") {
    return (
      <Link to="/assine" prefetch="intent" className="group mt-16 block py-6 text-center text-[13.5px] leading-relaxed text-ink-3">
        <IconMail size={16} className="mr-1.5 inline align-[-3px] text-accent" />
        {LINE} {more}
      </Link>
    );
  }
  return (
    <div className="hidden lg:block">
      <Link to="/assine" prefetch="intent" className="group mt-5 flex items-center gap-2.5 rounded-card bg-accent-softer px-4 py-2.5 text-[13.5px] leading-snug text-ink-2 ring-1 ring-inset ring-accent/25">
        <IconMail size={16} className="shrink-0 text-accent" />
        <span className="min-w-0">
          {LINE} {more}
        </span>
      </Link>
      {report?.kind === "weekly" && <ShareLink url={`${siteUrl()}/assine/${report.key}`} />}
    </div>
  );
}
