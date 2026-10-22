// The page to share in WhatsApp groups: the newest weekly edition (or the one in its address, the link each
// message carries) set in the site's own edition, with the sign-up form above and below it, and nothing of
// the rest of the site (WebModule.ownChrome). With no edition yet, a short presentation and the form. It
// also tells readers what a link from a message just did (?confirmado=, ?saiu=, ?link=).
import { useState } from "react";
import { data, Link, useLoaderData, useSearchParams, type LoaderFunctionArgs, type MetaArgs } from "react-router";
import type { ReportDetail, ReportLatestPage } from "@aihot/contracts/site";
import { SITE } from "@aihot/site";
import { Wordmark } from "@aihot/site/brand/Logo.tsx";
import { apiGet, cachedPage, loadOr404 } from "@aihot/web/lib/api.server";
import { pageMeta } from "@aihot/web/lib/seo";
import { ReportPaper } from "@aihot/web/features/report/ReportPaper";
import type { SignupChannels } from "../types.ts";
import { SignupForm } from "./SignupForm.tsx";

export { pageHeaders as headers } from "@aihot/web/lib/api.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const key = params.key;
  if (key !== undefined && !/^\d{4}-W\d{2}$/.test(key)) throw data({ message: "not_found" }, { status: 404 });
  const [report, signup] = await Promise.all([
    key
      ? loadOr404<ReportDetail>(`/api/site/reports/weekly/${key}`, { signal: request.signal })
      : loadOr404<ReportLatestPage>("/api/site/reports/weekly/latest-page", { signal: request.signal }).then((page) => page.report),
    apiGet<SignupChannels>("/api/assinatura", { signal: request.signal }),
  ]);
  return cachedPage(300, { report, channels: signup.channels });
}

export function meta({ loaderData, location }: MetaArgs<typeof loader>) {
  const report = loaderData?.report;
  const title = `${SITE.name}: receba a edição semanal`;
  const description = report?.lead?.title
    ? `Nesta edição: ${report.lead.title}. Grátis, toda segunda no e-mail ou no WhatsApp.`
    : `${SITE.description} Grátis, no e-mail ou no WhatsApp.`;
  return pageMeta({ title, rawTitle: true, description, path: location.pathname, image: "/og/pages/assine.png", type: report ? "article" : "website" });
}

function Notice() {
  const [params] = useSearchParams();
  const [undo, setUndo] = useState<"idle" | "busy" | "done" | "error">("idle");
  const confirmed = params.get("confirmado");
  const left = params.get("saiu");
  const token = params.get("t");
  const where = (c: string | null) => (c === "whatsapp" ? "este número de WhatsApp" : "este e-mail");
  let text: string | null = null;
  if (confirmed) text = `Pronto! Inscrição confirmada: a próxima edição chega a ${where(confirmed)} na segunda-feira.`;
  else if (left && undo === "done") text = `Você voltou para a lista: a edição continua chegando a ${where(left)}.`;
  else if (left) text = `Você saiu da lista: ${where(left)} não vai mais receber a edição.`;
  else if (params.get("link")) text = "Este link não é mais válido. Se quiser receber a edição, inscreva-se de novo abaixo.";
  if (!text) return null;
  const back = async () => {
    setUndo("busy");
    const res = await fetch("/api/assinatura/voltar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ t: token }) }).catch(() => null);
    setUndo(res?.ok ? "done" : "error");
  };
  return (
    <div role="status" className="mb-5 rounded-card bg-accent-softer px-4 py-3.5 text-[14px] leading-relaxed text-ink-2 ring-1 ring-inset ring-accent/30">
      {text}
      {left && token && undo !== "done" && (
        <>
          {" "}
          <button type="button" onClick={back} disabled={undo === "busy"} className="font-semibold text-accent underline underline-offset-2">
            Saiu por engano? Voltar a receber
          </button>
          {undo === "error" && <span className="ml-1 text-ink-3">(não foi possível; inscreva-se de novo abaixo)</span>}
        </>
      )}
    </div>
  );
}

export default function AssinePage() {
  const { report, channels } = useLoaderData<typeof loader>();
  return (
    <div className="report-shell min-h-dvh">
      <header className="mx-auto flex w-full max-w-[1160px] items-center justify-between gap-3 px-[var(--gutter-l)] py-4 lg:px-10">
        <Wordmark size={22} className="text-ink" />
        <span className="text-[12px] tracking-[0.12em] text-ink-4">EDIÇÃO SEMANAL · GRÁTIS</span>
      </header>
      <main className="mx-auto w-full max-w-[1160px] px-[var(--gutter-l)] pb-12 lg:px-10">
        <Notice />
        <SignupForm channels={channels} title={`Receba ${SITE.name} toda semana`} />
        {report ? (
          <div className="mt-6">
            <ReportPaper report={report} index={[{ key: report.key, issueNumber: report.issueNumber, title: report.title, count: 0 }]} standalone />
          </div>
        ) : (
          <section className="mt-8 max-w-[46em]">
            <h1 className="text-[26px] font-black leading-[1.25] tracking-[-0.02em] text-ink sm:text-[32px]">{SITE.homeTitle}</h1>
            <p className="mt-4 text-[16px] leading-[1.85] text-ink-2">{SITE.description}</p>
            <p className="mt-3 text-[16px] leading-[1.85] text-ink-2">
              A primeira edição está a caminho.{(channels.email || channels.whatsapp) && " Inscreva-se para recebê-la assim que sair."}
            </p>
          </section>
        )}
        {report && <SignupForm channels={channels} title="Gostou? Receba a próxima edição" compact />}
        <footer className="mt-10 flex flex-wrap justify-center gap-x-5 gap-y-2 text-[12.5px] text-ink-4">
          <Link to="/privacy" className="hover:text-accent">Política de privacidade</Link>
          <Link to="/terms" className="hover:text-accent">Termos de uso</Link>
          <Link to="/" className="hover:text-accent">{SITE.name} na web</Link>
        </footer>
      </main>
    </div>
  );
}
