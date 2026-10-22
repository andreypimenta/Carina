// The weekly issue's special: a block of its own after the front page, leading to the special's page.
import { Link } from "react-router";
import { IconArrowRight } from "@aihot/web/components/icons";
import { Kicker } from "@aihot/web/components/ui/Kicker";
import type { ReportPagePart } from "@aihot/web/modules";
import type { EspecialCard } from "../especiais.ts";

function Block({ data }: { data: unknown }) {
  const e = data as EspecialCard;
  return (
    <section id="especial" aria-labelledby="especial-t" className="scroll-mt-[calc(var(--bar-h)+1.5rem)] border-b border-line py-8 @[880px]:py-10">
      <Kicker>{`Especial · ${e.formatName}`}</Kicker>
      <Link to={`/especiais/${e.slug}`} className="group mt-4 block rounded-panel bg-accent-soft/60 p-5 ring-1 ring-accent/15 transition-colors hover:bg-accent-soft @[880px]:p-7">
        <h2 id="especial-t" className="text-[22px] font-black leading-[1.3] tracking-[-0.01em] text-ink transition-colors group-hover:text-accent @[880px]:text-[26px]">{e.title}</h2>
        {e.dek && <p className="mt-3 max-w-[46em] text-[15.5px] leading-[1.8] text-ink-2 @[880px]:text-[16.5px]">{e.dek}</p>}
        <span className="mt-4 inline-flex items-center gap-1 text-[13.5px] font-semibold text-accent">
          {`Ler o especial · ${e.refCount} ${e.refCount === 1 ? "estudo citado" : "estudos citados"}`} <IconArrowRight size={14} />
        </span>
      </Link>
    </section>
  );
}

const part: ReportPagePart = { Block };
export default part;
