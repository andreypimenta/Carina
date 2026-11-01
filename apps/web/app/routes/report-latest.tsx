import { redirect, useLoaderData } from "react-router";
import type { Route } from "./+types/report-latest";
import type { ReportLatestPage } from "@aihot/contracts/site";
import { REPORTS } from "@aihot/site";
import { cachedPage, loadOr404 } from "../lib/api.server";
import { pageReuse } from "../lib/page-reuse";
import { pageMeta, reportLd, siteLd } from "../lib/seo";
import { EmptyState } from "../components/ui/Page";
import { ReportLayout } from "../features/report/ReportLayout";
import { ReportPaper, reportOutline } from "../features/report/ReportPaper";
import { KIND_LABEL, feedLink, isFrontPath, kindFromPath } from "../features/report/format";
import type { Screen } from "../components/shell/screens";

export const handle: Screen = { tab: "daily", name: "Edição" };
export { pageHeaders as headers } from "../lib/api.server";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

/** What the front page used to carry as the Seleção feed: its filters and search. */
const FEED_PARAMS = ["channel", "category", "area", "tag", "q"];

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  // In-app navigation asks for the page's data at "/_.data" (the front page) or "/weekly.data": read the page's own path.
  const pathname = url.pathname.replace(/(\/_)?\.data$/, "") || "/";
  // Links to the front page from when it was the Seleção feed still land on that feed.
  if (isFrontPath(pathname) && FEED_PARAMS.some((p) => url.searchParams.has(p))) throw redirect(`/selecao${url.search}`);
  const kind = kindFromPath(pathname);
  const { index, report } = await loadOr404<ReportLatestPage>(`/api/site/reports/${kind}/latest-page`, { signal: request.signal });
  return cachedPage(600, { kind, report, index });
}

export function meta({ loaderData, location }: Route.MetaArgs) {
  const kind = loaderData?.kind ?? "daily";
  const description = `${REPORTS.descriptions[kind]}.`;
  const report = loaderData?.report;
  // The front page shows the latest weekly edition: /weekly names it as its canonical, so the two are one page in search.
  const front = isFrontPath(location.pathname);
  const path = kind === "weekly" ? "/" : location.pathname;
  const issue = report ? reportLd(report, path, report.lead?.leadParagraph || description) : null;
  return [...pageMeta({
    title: front ? null : KIND_LABEL[kind],
    description: front ? null : description,
    path,
    image: `/og/pages/${kind}.png`,
    // The latest issue, described at its canonical address; the front page also describes the site.
    jsonLd: front ? [...siteLd(), ...(issue ? [issue] : [])] : issue ?? undefined,
  }), feedLink(kind)];
}

export default function ReportLatestPage() {
  const { kind, report, index } = useLoaderData<typeof loader>();
  return (
    <ReportLayout kind={kind} index={index} current={report?.key ?? null} outline={report ? reportOutline(report) : []}>
      {report ? <ReportPaper report={report} index={index} /> : <EmptyState title={`Ainda não há ${KIND_LABEL[kind].toLowerCase()} publicado`}>A primeira edição vai aparecer aqui assim que sair.</EmptyState>}
    </ReportLayout>
  );
}
