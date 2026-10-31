// Where the links in the messages land (/assine/confirmacao, /assine/saida, sent here by the api with the
// token): the journal's name and one button. Opening the page changes nothing; only the
// click confirms or takes the address off, so a mail scanner or a link preview that opens it does neither.
// After leaving, the reader can come back with one more click. The e-mail's "Escolher a seção que vem primeiro"
// opens /assine/preferencias, where the reader picks the section the edition puts first; the leaving page offers
// the same before the reader goes. Nothing else of the site, and no sign-up form.
import { useEffect, useId, useState } from "react";
import { data, Link, useLoaderData, type HeadersArgs, type LoaderFunctionArgs, type MetaArgs } from "react-router";
import { SITE } from "@aihot/site";
import { Wordmark } from "@aihot/site/brand/Logo.tsx";
import { IconCheck } from "@aihot/web/components/icons";
import { pageMeta } from "@aihot/web/lib/seo";
import type { Channel } from "../address.ts";
import { InterestChoice } from "./SignupForm.tsx";

export function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  return data(
    { leave: url.pathname.endsWith("/saida"), prefs: url.pathname.endsWith("/preferencias"), token: url.searchParams.get("t") },
    { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" } },
  );
}

export function headers({ loaderHeaders }: HeadersArgs) {
  return loaderHeaders;
}

export function meta({ loaderData, location }: MetaArgs<typeof loader>) {
  const title = loaderData?.leave ? `Sair da lista · ${SITE.name}` : loaderData?.prefs ? `Preferências · ${SITE.name}` : `Confirmar inscrição · ${SITE.name}`;
  return pageMeta({ title, rawTitle: true, path: location.pathname, noindex: true, nofollow: true });
}

type Done = { channel: Channel; status?: "confirmed" | "unsubscribed"; undo?: boolean };

/** Posts the token to one of the page's buttons: the answer, or null when the link no longer works. */
async function act<T>(path: string, token: string, extra: Record<string, unknown> = {}): Promise<T | null | "error"> {
  const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...extra, t: token }) }).catch(() => null);
  if (!res) return "error";
  if (res.status === 404) return null;
  return res.ok ? ((await res.json()) as T) : "error";
}

const BUTTON = "inline-flex h-12 w-full items-center justify-center rounded-full px-6 text-[15.5px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-60";

/**
 * The section the e-mailed edition puts first, for a confirmed e-mail address: read with the token, changed with
 * one click on "Salvar". Says nothing for other addresses (WhatsApp's message has no sections).
 */
function Preferences({ token, intro, onInvalid }: { token: string; intro: string; onInvalid?: () => void }) {
  const id = useId();
  const [state, setState] = useState<{ kind: "loading" | "hidden" | "error" } | { kind: "ready" | "saving" | "saved"; interest: string | null }>({ kind: "loading" });
  useEffect(() => {
    void act<{ channel: Channel; status: string; interest: string | null }>("/api/assinatura/preferencias/ler", token).then((p) => {
      if (p === null) onInvalid?.();
      if (p === "error") return setState({ kind: "error" });
      setState(p && p.channel === "email" && p.status === "confirmed" ? { kind: "ready", interest: p.interest } : { kind: "hidden" });
    });
  }, [token]);
  if (state.kind === "error") return <p role="alert" className="mt-6 text-[13.5px] font-medium text-hot">Não foi possível ler suas preferências agora. Tente de novo.</p>;
  if (!("interest" in state)) return null;
  const { interest } = state;
  const save = async () => {
    setState({ kind: "saving", interest });
    const done = await act<{ interest: string | null }>("/api/assinatura/preferencias", token, { interest });
    setState(done && done !== "error" ? { kind: "saved", interest: done.interest } : { kind: "error" });
  };
  return (
    <div className="mt-6 border-t border-line-soft pt-6 text-left">
      <p className="mb-3 text-[14px] leading-relaxed text-ink-3">{intro}</p>
      <InterestChoice name={`${id}-interest`} value={interest} onChange={(interest) => setState({ kind: "ready", interest })} />
      <button type="button" onClick={() => void save()} disabled={state.kind === "saving"} className={`${BUTTON} mt-4 bg-accent text-accent-contrast`}>
        {state.kind === "saving" ? "Um momento…" : state.kind === "saved" ? "Salvo" : "Salvar"}
      </button>
      {state.kind === "saved" && <p role="status" className="mt-2 text-center text-[13px] text-ink-3">A próxima edição já chega nessa ordem.</p>}
    </div>
  );
}

export default function LinkPage() {
  const { leave, prefs, token } = useLoaderData<typeof loader>();
  const [state, setState] = useState<{ kind: "ask" | "busy" | "error" | "invalid" } | { kind: "confirmed" | "left" | "back"; done: Done }>({ kind: token ? "ask" : "invalid" });

  const run = async (path: string, next: "confirmed" | "left" | "back") => {
    setState({ kind: "busy" });
    const done = await act<Done>(path, token!);
    if (done === "error") return setState({ kind: "error" });
    if (!done) return setState({ kind: "invalid" });
    setState({ kind: next === "confirmed" && done.status === "unsubscribed" ? "left" : next, done });
  };

  let title: string;
  let body: React.ReactNode;
  let action: React.ReactNode = null;
  let ok = false;
  if (prefs && state.kind !== "invalid") {
    title = "Suas preferências";
    body = "Escolha a seção que vem primeiro na sua edição semanal. As duas continuam chegando.";
    action = <Preferences token={token!} intro="A seção escolhida abre o seu e-mail; a outra vem logo depois." onInvalid={() => setState({ kind: "invalid" })} />;
  } else if (state.kind === "invalid") {
    title = "Este link não vale mais";
    body = "Ele expirou ou chegou incompleto. Se quiser receber a edição, inscreva-se de novo.";
    action = <Link to="/assine" className={`${BUTTON} bg-accent text-accent-contrast`}>Inscrever-se de novo</Link>;
  } else if (state.kind === "confirmed") {
    ok = true;
    title = "Inscrição confirmada";
    body = "A próxima edição chega na segunda-feira.";
  } else if (state.kind === "back") {
    ok = true;
    title = "Você voltou para a lista";
    body = "A edição continua chegando.";
  } else if (state.kind === "left" && state.done.status === "unsubscribed") {
    title = "Este endereço tinha saído da lista";
    body = "Para voltar a receber a edição, inscreva-se de novo.";
    action = <Link to="/assine" className={`${BUTTON} bg-accent text-accent-contrast`}>Inscrever-se de novo</Link>;
  } else if (state.kind === "left") {
    ok = true;
    title = "Você saiu da lista";
    body = "Você não vai mais receber a edição.";
    if (state.done.undo) {
      action = (
        <button type="button" onClick={() => run("/api/assinatura/voltar", "back")} className={`${BUTTON} bg-bg-sunk text-ink ring-1 ring-inset ring-line-soft`}>
          Saiu por engano? Voltar a receber
        </button>
      );
    }
  } else {
    title = leave ? "Deixar de receber a edição?" : "Falta um passo";
    body = leave
      ? `Ao clicar no botão, você sai da lista da edição semanal do ${SITE.bareName}.`
      : `Confirme que quer receber a edição semanal do ${SITE.bareName}.`;
    action = (
      <>
        <button
          type="button"
          onClick={() => (leave ? run("/api/assinatura/sair", "left") : run("/api/assinatura/confirmar", "confirmed"))}
          disabled={state.kind === "busy"}
          className={`${BUTTON} ${leave ? "bg-ink text-bg" : "bg-accent text-accent-contrast"}`}
        >
          {state.kind === "busy" ? "Um momento…" : leave ? "Não quero mais receber" : "Confirmar inscrição"}
        </button>
        {state.kind === "error" && <p role="alert" className="mt-3 text-[13.5px] font-medium text-hot">Não foi possível agora. Tente de novo.</p>}
        {leave && <Preferences token={token!} intro="Prefere continuar e só mudar a seção que vem primeiro?" />}
      </>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-bg px-[var(--gutter-l)] py-12">
      <Wordmark size={26} className="text-ink" />
      <section className="card mt-8 w-full max-w-[26rem] px-6 py-8 text-center sm:px-8" aria-live="polite">
        {ok && (
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-accent text-accent-contrast">
            <IconCheck size={22} />
          </div>
        )}
        <h1 className="text-[22px] font-bold leading-snug text-ink">{title}</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-3">{body}</p>
        {action && <div className="mt-6">{action}</div>}
      </section>
    </main>
  );
}
