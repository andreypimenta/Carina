// The weekly issue's agenda: the congresses going on or starting in the 30 days after it, leading to the agenda.
import { Link } from "react-router";
import { IconArrowRight } from "@aihot/web/components/icons";
import { Kicker } from "@aihot/web/components/ui/Kicker";
import type { ReportPagePart } from "@aihot/web/modules";
import { whenLabel, type Congresso } from "../agenda.ts";

function Block({ data }: { data: unknown }) {
  const list = data as Congresso[];
  return (
    <section id="agenda" aria-labelledby="agenda-t" className="scroll-mt-[calc(var(--bar-h)+1.5rem)] border-b border-line py-8 @[880px]:py-10">
      <Kicker>Agenda</Kicker>
      <h2 id="agenda-t" className="mt-4 text-[20px] font-black leading-[1.3] tracking-[-0.01em] text-ink @[880px]:text-[22px]">Congressos nas próximas semanas</h2>
      <ul className="mt-4 divide-y divide-line">
        {list.map((c) => (
          <li key={c.id} className="py-3">
            <a href={c.url} target="_blank" rel="noopener noreferrer" className="group block">
              <span className="text-[13px] font-semibold text-accent">{[whenLabel(c), c.place].filter(Boolean).join(" · ")}</span>
              <span className="mt-1 block text-[16px] font-semibold leading-[1.45] text-ink transition-colors group-hover:text-accent">{c.name}</span>
              {c.about && <span className="mt-1 block text-[14px] leading-[1.7] text-ink-3">{c.about}</span>}
            </a>
          </li>
        ))}
      </ul>
      <Link to="/agenda" className="mt-4 inline-flex items-center gap-1 text-[13.5px] font-semibold text-accent">
        Ver a agenda completa <IconArrowRight size={14} />
      </Link>
    </section>
  );
}

const part: ReportPagePart = { Block };
export default part;
