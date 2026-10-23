// The page to share in WhatsApp groups: the newest weekly edition (or the one in its address, the link each
// message carries) set in the site's own edition, with the sign-up form above and below it, and nothing of
// the rest of the site (WebModule.ownChrome). With no edition yet, a short presentation and the form. The
// links in the messages land here (?confirmar=, ?sair=, ?link=) and change nothing: a button asks the reader
// before confirming or leaving, so a mail scanner or a link preview that opens them does neither.
import { useState } from "react";
import { data, Link, useLoaderData, useSearchParams, type LoaderFunctionArgs, type MetaArgs } from "react-router";
import type { ReportDetail, ReportLatestPage } from "@aihot/contracts/site";
import { SITE } from "@aihot/site";
import { Wordmark } from "@aihot/site/brand/Logo.tsx";
import { apiGet, cachedPage, loadOr404 } from "@aihot/web/lib/api.server";
import { pageMeta } from "@aihot/web/lib/seo";
import { ReportPaper } from "@aihot/web/features/report/ReportPaper";
import type { Channel } from "../address.ts";
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
  return cachedPage(300, { report, channels: signup });
}

export function meta({ loaderData, location }: MetaArgs<typeof loader>) {
  const report = loaderData?.report;
  const title = `${SITE.name}: receba a edição semanal`;
  const description = report?.lead?.title
    ? `Nesta edição: ${report.lead.title}. Grátis, toda segunda no e-mail ou no WhatsApp.`
    : `${SITE.description} Grátis, no e-mail ou no WhatsApp.`;
  return pageMeta({ title, rawTitle: true, description, path: location.pathname, image: "/og/pages/assine.png", type: report ? "article" : "website" });
}

type Done = { channel: Channel; status?: "confirmed" | "unsubscribed"; undo?: boolean };

/** Posts the token to one of the page's buttons: the answer, or null when the link no longer works. */
async function act<T>(path: string, token: string): Promise<T | null | "error"> {
  const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ t: token }) }).catch(() => null);
  if (!res) return "error";
  if (res.status === 404) return null;
  return res.ok ? ((await res.json()) as T) : "error";
}

function Notice() {
  const [params] = useSearchParams();
  const toConfirm = params.get("confirmar");
  const toLeave = params.get("sair");
  const token = toConfirm ?? toLeave;
  const [state, setState] = useState<{ kind: "ask" | "busy" | "error" | "invalid" } | { kind: "confirmed" | "left" | "back"; done: Done }>({ kind: params.get("link") ? "invalid" : "ask" });
  const where = (c: Channel) => (c === "whatsapp" ? "este número de WhatsApp" : "este e-mail");
  if (!token && state.kind !== "invalid") return null;

  const run = async (path: string, next: "confirmed" | "left" | "back") => {
    setState({ kind: "busy" });
    const done = await act<Done>(path, token!);
    if (done === "error") return setState({ kind: "error" });
    if (!done) return setState({ kind: "invalid" });
    setState({ kind: next === "confirmed" && done.status === "unsubscribed" ? "left" : next, done });
  };
  const button = (label: string, onClick: () => void) => (
    <button type="button" onClick={onClick} disabled={state.kind === "busy"} className="ml-1 font-semibold text-accent underline underline-offset-2 disabled:opacity-60">
      {label}
    </button>
  );

  let body: React.ReactNode;
  if (state.kind === "invalid") body = "Este link não é mais válido. Se quiser receber a edição, inscreva-se de novo abaixo.";
  else if (state.kind === "confirmed") body = `Pronto! Inscrição confirmada: a próxima edição chega a ${where(state.done.channel)} na segunda-feira.`;
  else if (state.kind === "back") body = `Você voltou para a lista: a edição continua chegando a ${where(state.done.channel)}.`;
  else if (state.kind === "left") {
    body = state.done.status === "unsubscribed"
      ? "Este endereço tinha saído da lista. Para voltar a receber, inscreva-se de novo abaixo."
      : (
        <>
          Você saiu da lista: {where(state.done.channel)} não vai mais receber a edição.
          {state.done.undo && button("Saiu por engano? Voltar a receber", () => run("/api/assinatura/voltar", "back"))}
        </>
      );
  } else {
    body = (
      <>
        {toConfirm ? "Falta um passo: confirme que quer receber a edição semanal." : "Quer deixar de receber a edição semanal?"}
        {toConfirm
          ? button("Confirmar inscrição", () => run("/api/assinatura/confirmar", "confirmed"))
          : button("Não quero mais receber", () => run("/api/assinatura/sair", "left"))}
        {state.kind === "error" && <span className="ml-1 text-ink-3">(não foi possível agora; tente de novo)</span>}
      </>
    );
  }
  return (
    <div role="status" className="mb-5 rounded-card bg-accent-softer px-4 py-3.5 text-[14px] leading-relaxed text-ink-2 ring-1 ring-inset ring-accent/30">
      {body}
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
