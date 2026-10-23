// The published specials, newest first.
import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { SITE } from "@aihot/site";
import { beijingDate } from "@aihot/contracts/time";
import { apiGet, cachedPage } from "@aihot/web/lib/api.server";
import { pageReuse } from "@aihot/web/lib/page-reuse";
import { pageMeta } from "@aihot/web/lib/seo";
import { dayMonthYear } from "@aihot/web/lib/format";
import { AsideCard, EmptyState, ReadingLayout } from "@aihot/web/components/ui/Page";
import { PhoneBar } from "@aihot/web/components/shell/PhoneBar";
import type { Screen } from "@aihot/web/components/shell/screens";
import { FORMATS, type EspecialCard } from "../especiais.ts";

export const handle: Screen = { home: "featured", name: "Especiais" };
export { pageHeaders as headers } from "@aihot/web/lib/api.server";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

const DESCRIPTION = `Textos especiais do ${SITE.bareName}, escritos a partir de estudos reais do PubMed e publicados depois de aprovados pela editoria.`;

export async function loader({ request }: LoaderFunctionArgs) {
  return cachedPage(300, await apiGet<{ items: EspecialCard[] }>("/api/site/especiais", { signal: request.signal }));
}

export function meta() {
  return pageMeta({ title: "Especiais", description: DESCRIPTION, path: "/especiais" });
}

export default function EspeciaisPage() {
  const { items } = useLoaderData<typeof loader>();
  const aside = (
    <AsideCard title="Os formatos">
      <ul className="space-y-3">
        {Object.values(FORMATS).map((f) => (
          <li key={f.name} className="text-[13px] leading-[1.7] text-ink-3">
            <span className="font-semibold text-ink-2">{f.name}</span>: {f.pitch}
          </li>
        ))}
      </ul>
    </AsideCard>
  );
  return (
    <>
      <PhoneBar title="Especiais" large sub={DESCRIPTION} />
      <ReadingLayout aside={aside}>
        <header className="hidden pb-6 lg:block">
          <h1 data-page-title="" className="text-[24px] font-semibold leading-[1.3] text-ink">Especiais</h1>
          <p className="mt-1.5 text-[13px] text-ink-3">{DESCRIPTION}</p>
        </header>
        {items.length ? (
          <ul className="space-y-4">
            {items.map((e) => (
              <li key={e.slug}>
                <Link to={`/especiais/${e.slug}`} className="card group block px-5 py-5 lg:px-7">
                  <div className="text-[12px] font-semibold tracking-[0.08em] text-accent">{e.formatName}</div>
                  <h2 className="mt-2 text-[19px] font-bold leading-[1.4] text-ink transition-colors group-hover:text-accent">{e.title}</h2>
                  {e.dek && <p className="mt-2 text-[14px] leading-[1.75] text-ink-3">{e.dek}</p>}
                  <div className="mt-3 text-[12px] text-ink-4">{`${dayMonthYear(beijingDate(e.publishedAt))} · ${e.refCount} estudos citados`}</div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="card"><EmptyState title="Nenhum especial publicado ainda">O primeiro especial aparece aqui assim que a editoria aprovar e publicar.</EmptyState></div>
        )}
      </ReadingLayout>
    </>
  );
}
