// The way to /assine from the site's own pages, for the reader who came by a shared link: one line under an
// issue's masthead and at the foot of every page, and a short card where an issue or an article ends. Nothing
// pops up or covers the reading. Under a weekly issue's line, the button that copies its link for the groups.
import { Link } from "react-router";
import { EDITION_WHEN, SITE } from "@aihot/site";
import type { ReportDetail } from "@aihot/contracts/site";
import type { CalloutPlace } from "@aihot/web/modules";
import { IconArrowRight, IconMail } from "@aihot/web/components/icons";
import { ShareLink } from "./ShareLink.tsx";

const LINE = `Receba a edição semanal ${EDITION_WHEN.weekly}, de graça.`;

export function Callout({ at, report }: { at: CalloutPlace; report?: ReportDetail }) {
  if (at === "report-end" || at === "item-end") {
    return (
      <aside aria-label="Assine a edição semanal" className="card mt-12 flex flex-col gap-4 px-5 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-7">
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
    <>
      <Link to="/assine" prefetch="intent" className="group mt-5 flex items-center gap-2.5 rounded-card bg-accent-softer px-4 py-2.5 text-[13.5px] leading-snug text-ink-2 ring-1 ring-inset ring-accent/25">
        <IconMail size={16} className="shrink-0 text-accent" />
        <span className="min-w-0">
          {LINE} {more}
        </span>
      </Link>
      {report?.kind === "weekly" && <ShareLink week={report.key} />}
    </>
  );
}
