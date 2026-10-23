// The congress agenda: what is going on or still to come, soonest first, then what is over.
import { useLoaderData, type LoaderFunctionArgs } from "react-router";
import { SITE } from "@aihot/site";
import { apiGet, cachedPage } from "@aihot/web/lib/api.server";
import { pageReuse } from "@aihot/web/lib/page-reuse";
import { pageMeta } from "@aihot/web/lib/seo";
import { IconExternal } from "@aihot/web/components/icons";
import { AsideCard, EmptyState, ReadingLayout } from "@aihot/web/components/ui/Page";
import { PhoneBar } from "@aihot/web/components/shell/PhoneBar";
import type { Screen } from "@aihot/web/components/shell/screens";
import { whenLabel, type AgendaPage, type Congresso } from "../agenda.ts";

export const handle: Screen = { home: "featured", name: "Agenda" };
export { pageHeaders as headers } from "@aihot/web/lib/api.server";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

const DESCRIPTION = `Os congressos de via aérea, cirurgia torácica, broncoscopia e anestesia que o ${SITE.bareName} acompanha, com as datas que os organizadores anunciaram.`;

export async function loader({ request }: LoaderFunctionArgs) {
  return cachedPage(300, await apiGet<AgendaPage>("/api/site/agenda", { signal: request.signal }));
}

export function meta() {
  return pageMeta({ title: "Agenda", description: DESCRIPTION, path: "/agenda" });
}

function Item({ c }: { c: Congresso }) {
  return (
    <li>
      <a href={c.url} target="_blank" rel="noopener noreferrer" className="card group block px-5 py-5 lg:px-7">
        <div className="text-[12px] font-semibold tracking-[0.08em] text-accent">{[whenLabel(c), c.place].filter(Boolean).join(" · ")}</div>
        <h2 className="mt-2 inline-flex items-start gap-1.5 text-[18px] font-bold leading-[1.4] text-ink transition-colors group-hover:text-accent">
          {c.name} <IconExternal size={14} className="mt-1.5 shrink-0 text-ink-4" />
        </h2>
        {c.about && <p className="mt-2 text-[14px] leading-[1.75] text-ink-3">{c.about}</p>}
        <div className="mt-3 text-[12px] text-ink-4">{c.organizer}</div>
      </a>
    </li>
  );
}

export default function AgendaRoute() {
  const { upcoming, past } = useLoaderData<typeof loader>();
  const aside = (
    <AsideCard title="Na edição semanal">
      <p className="text-[13px] leading-[1.7] text-ink-3">A edição semanal lembra os congressos em andamento ou que começam nos 30 dias seguintes a ela.</p>
    </AsideCard>
  );
  return (
    <>
      <PhoneBar title="Agenda" large sub={DESCRIPTION} />
      <ReadingLayout aside={aside}>
        <header className="hidden pb-6 lg:block">
          <h1 data-page-title="" className="text-[24px] font-semibold leading-[1.3] text-ink">Agenda</h1>
          <p className="mt-1.5 text-[13px] text-ink-3">{DESCRIPTION}</p>
        </header>
        {upcoming.length ? (
          <ul className="space-y-4">{upcoming.map((c) => <Item key={c.id} c={c} />)}</ul>
        ) : (
          <div className="card"><EmptyState title="Nenhum congresso anunciado">Os próximos congressos aparecem aqui assim que os organizadores anunciarem as datas.</EmptyState></div>
        )}
        {past.length > 0 && (
          <section className="mt-10">
            <h2 className="pb-3 text-[15px] font-semibold text-ink-2">Já aconteceram</h2>
            <ul className="space-y-4 opacity-80">{past.map((c) => <Item key={c.id} c={c} />)}</ul>
          </section>
        )}
      </ReadingLayout>
    </>
  );
}
