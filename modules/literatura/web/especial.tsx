// A published special's page: its text with each citation leading to its study, and the studies below.
import { Link, useLoaderData, type LoaderFunctionArgs, type MetaArgs } from "react-router";
import { SITE } from "@aihot/site";
import { beijingDate } from "@aihot/contracts/time";
import { cachedPage, loadOr404 } from "@aihot/web/lib/api.server";
import { pageReuse } from "@aihot/web/lib/page-reuse";
import { articleLd, pageMeta, titled } from "@aihot/web/lib/seo";
import { dayMonthYear } from "@aihot/web/lib/format";
import { ArticleLayout, RailSection } from "@aihot/web/components/ui/Page";
import { Kicker } from "@aihot/web/components/ui/Kicker";
import { PhoneBar } from "@aihot/web/components/shell/PhoneBar";
import type { Screen } from "@aihot/web/components/shell/screens";
import { EspecialBody, References } from "./Body.tsx";
import type { EspecialPage } from "../especiais.ts";

export const handle: Screen = { home: "featured" };
export { pageHeaders as headers } from "@aihot/web/lib/api.server";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

export async function loader({ request, params }: LoaderFunctionArgs) {
  const especial = await loadOr404<EspecialPage>(`/api/site/especiais/${encodeURIComponent(params.slug ?? "")}`, { signal: request.signal });
  return cachedPage(300, { especial });
}

export function meta({ loaderData }: MetaArgs<typeof loader>) {
  if (!loaderData) return [{ title: titled("Especial não encontrado") }, { name: "robots", content: "noindex" }];
  const e = loaderData.especial;
  const path = `/especiais/${e.slug}`;
  return pageMeta({
    title: e.title, description: e.dek ?? `${e.formatName}: ${e.theme}`, path, type: "article",
    jsonLd: articleLd({ path, headline: e.title, description: e.dek, publishedAt: e.publishedAt, section: ["Especiais", e.formatName] }),
  });
}

export default function EspecialPage() {
  const { especial: e } = useLoaderData<typeof loader>();
  const published = dayMonthYear(beijingDate(e.publishedAt));
  const about = (
    <RailSection title="Sobre este especial">
      <p className="text-[13px] leading-[1.75] text-ink-3">
        {`${e.formatName} escrita pelo sistema editorial do ${SITE.bareName} a partir de estudos encontrados no PubMed, e revisada e aprovada pela editoria antes da publicação. Cada trecho cita o estudo em que se apoia; os ${e.refCount} estudos citados estão nas referências.`}
      </p>
      {e.issueKey && (
        <Link to={`/weekly/${e.issueKey}`} className="mt-3 inline-block text-[13px] font-medium text-accent hover:underline">{`Saiu na edição semanal ${e.issueKey}`}</Link>
      )}
    </RailSection>
  );
  return (
    <div className="mx-auto max-w-[var(--page-max-reading)] pb-8">
      <PhoneBar back={{ to: "/especiais", label: "Especiais" }} title={e.title} />
      <ArticleLayout
        left={
          <Link to="/especiais" className="text-[13px] font-medium text-ink-3 transition-colors hover:text-accent">‹ Especiais</Link>
        }
        right={about}
      >
        <article className="pb-6 pt-3 lg:pt-2 2xl:pt-1">
          <Kicker>{`Especial · ${e.formatName}`}</Kicker>
          <h1 data-page-title="" className="mt-4 text-[26px] font-bold leading-[1.38] tracking-[-0.01em] text-ink lg:text-[32px] lg:leading-[1.34] xl:text-[36px] xl:leading-[1.3]">{e.title}</h1>
          {e.dek && <p className="mt-4 text-[18px] leading-[1.7] text-ink-2 xl:text-[20px]">{e.dek}</p>}
          <div className="mt-4 text-[13px] text-ink-4">
            <time dateTime={e.publishedAt}>{published}</time> · {`${e.refCount} estudos citados`}
          </div>
          <div className="mt-9 border-t border-line pt-7">
            <EspecialBody body={e.body} />
          </div>
          <div className="mt-8 lg:hidden">{about}</div>
          <section aria-labelledby="refs-t" className="mt-12 border-t border-line-strong pt-6">
            <h2 id="refs-t" className="mb-5 text-[19px] font-bold text-ink">Referências</h2>
            <References refs={e.refs} />
          </section>
        </article>
      </ArticleLayout>
    </div>
  );
}
