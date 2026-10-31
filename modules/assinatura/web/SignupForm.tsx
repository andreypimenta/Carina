// The ways to sign up, only those open now: the e-mail form (with the consent the reader ticks and a field
// people never see that bots fill), and a button that opens WhatsApp with JOIN_TEXT ready to send to the
// journal's number, the consent written beside it. The tag of the group whose link brought the reader
// (?g=) goes with the e-mail, and so does the section the reader wants first (optional; both by default). The api
// decides; the form only says early what it would refuse.
import { useId, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { EDITION_WHEN } from "@aihot/site";
import { IconCheck, IconMessage } from "@aihot/web/components/icons";
import { normalizeEmail } from "../address.ts";
import { CONSENT, JOIN_TEXT, WHATSAPP_CONSENT } from "../copy.ts";
import { INTERESTS } from "../interest.ts";
import type { SignupChannels } from "../types.ts";

const FIELD = "h-12 w-full rounded-card bg-bg-sunk px-4 text-[16px] text-ink outline-none ring-1 ring-inset ring-line-soft transition-[background-color,box-shadow] placeholder:text-ink-4 hover:ring-line-strong focus:bg-surface focus:shadow-[0_0_0_3px_var(--accent-soft)] focus:ring-accent dark:bg-bg-muted/60 dark:focus:bg-surface";
const LABEL = "mb-1.5 block text-[13px] font-semibold text-ink";
const PRIVACY = <Link to="/privacy" className="font-medium text-ink-2 underline underline-offset-2 hover:text-accent">Política de privacidade</Link>;

function WhatsappJoin({ number }: { number: string }) {
  return (
    <div className="space-y-3">
      <a
        href={`https://wa.me/${number}?text=${encodeURIComponent(JOIN_TEXT)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#25d366] px-6 text-[15.5px] font-semibold text-[#06301a] transition-opacity hover:opacity-90 sm:w-auto"
      >
        <IconMessage size={18} />
        Receber pelo WhatsApp
      </a>
      <p className="text-[13px] leading-[1.6] text-ink-3">{WHATSAPP_CONSENT} {PRIVACY}.</p>
    </div>
  );
}

/** The section the edition puts first: one choice, both by default. */
export function InterestChoice({ name, value, onChange }: { name: string; value: string | null; onChange: (key: string | null) => void }) {
  return (
    <fieldset>
      <legend className={LABEL}>Qual seção vem primeiro no seu e-mail?</legend>
      <div className="flex flex-wrap gap-2">
        {INTERESTS.map((o) => (
          <label key={o.key ?? ""} className={`cursor-pointer rounded-full px-3.5 py-2 has-[:focus-visible]:shadow-[0_0_0_3px_var(--accent-soft)] text-[13.5px] ring-1 ring-inset transition-colors ${value === o.key ? "bg-accent-soft font-semibold text-ink ring-accent" : "text-ink-2 ring-line-soft hover:ring-line-strong"}`}>
            <input type="radio" name={name} checked={value === o.key} onChange={() => onChange(o.key)} className="sr-only" />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function SignupForm({ channels, title }: { channels: SignupChannels; title: string }) {
  const id = useId();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [trap, setTrap] = useState("");
  const [consent, setConsent] = useState(false);
  const [interest, setInterest] = useState<string | null>(null);
  const [state, setState] = useState<{ kind: "idle" | "sending" | "error"; message?: string } | { kind: "done"; sent: boolean }>({ kind: "idle" });

  if (!channels.email && !channels.whatsapp) {
    return (
      <section className="card px-5 py-6 sm:px-7">
        <h2 className="text-[20px] font-bold leading-snug text-ink">{title}</h2>
        <p className="mt-2 text-[14.5px] leading-relaxed text-ink-3">As inscrições abrem em breve. Enquanto isso, a edição fica aqui toda semana.</p>
      </section>
    );
  }

  if (state.kind === "done") {
    return (
      <section className="card px-5 py-7 text-center sm:px-7" aria-live="polite">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-accent text-accent-contrast">
          <IconCheck size={22} />
        </div>
        <h2 className="mt-4 text-[20px] font-bold text-ink">{state.sent ? "Quase lá!" : "Tente de novo mais tarde"}</h2>
        <p className="mx-auto mt-2 max-w-[34em] text-[14.5px] leading-relaxed text-ink-3">
          {state.sent
            ? "Enviamos um link de confirmação para o seu e-mail. A edição só começa a chegar depois que você confirmar. Não achou o e-mail? Olhe na caixa de spam ou promoções."
            : "Não conseguimos enviar um novo link agora. Se já pediu antes, olhe na caixa de spam ou promoções; se não encontrar, tente de novo amanhã."}
        </p>
      </section>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const e1 = email.trim();
    if (!e1) return setState({ kind: "error", message: "Informe seu e-mail." });
    if (!normalizeEmail(e1)) return setState({ kind: "error", message: "O e-mail não está em um formato válido." });
    if (!consent) return setState({ kind: "error", message: "Marque a caixa de consentimento para receber a edição." });
    setState({ kind: "sending" });
    try {
      const res = await fetch("/api/assinatura", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: e1, consent, website: trap, group: params.get("g"), interest }),
      });
      const body = (await res.json().catch(() => ({}))) as { sent?: boolean; detail?: string };
      if (!res.ok || typeof body.sent !== "boolean") return setState({ kind: "error", message: body.detail ?? "Não foi possível concluir a inscrição. Tente de novo daqui a pouco." });
      setState({ kind: "done", sent: body.sent });
    } catch {
      setState({ kind: "error", message: "A conexão falhou. Verifique a internet e tente de novo." });
    }
  };

  return (
    <section className="card px-5 py-6 sm:px-7 sm:py-7">
      <h2 className="text-[20px] font-bold leading-snug text-ink sm:text-[22px]">{title}</h2>
      <p className="mt-1.5 text-[14.5px] leading-relaxed text-ink-3">
        Grátis, {EDITION_WHEN.weekly} (horário de Brasília). {channels.email && channels.whatsapp ? "No e-mail, no WhatsApp ou nos dois." : channels.email ? "No seu e-mail." : "No seu WhatsApp."}
      </p>
      {channels.email && (
        <form onSubmit={submit} noValidate className="mt-5 space-y-4">
          <div>
            <label htmlFor={`${id}-email`} className={LABEL}>E-mail</label>
            <input id={`${id}-email`} type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@exemplo.com" className={FIELD} />
          </div>
          <InterestChoice name={`${id}-interest`} value={interest} onChange={setInterest} />
          {/* People never see this field; a bot that fills it is thanked and forgotten. */}
          <div aria-hidden="true" className="absolute left-[-10000px] top-auto h-px w-px overflow-hidden">
            <label htmlFor={`${id}-website`}>Site</label>
            <input id={`${id}-website`} type="text" tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} />
          </div>
          <label className="flex cursor-pointer items-start gap-3 text-[13px] leading-[1.6] text-ink-3">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-[3px] size-[18px] shrink-0 accent-[var(--accent)]" />
            <span>{CONSENT} {PRIVACY}.</span>
          </label>
          {state.kind === "error" && <p role="alert" className="text-[13.5px] font-medium text-hot">{state.message}</p>}
          <button type="submit" disabled={state.kind === "sending"} className="inline-flex h-12 w-full items-center justify-center rounded-full bg-accent px-6 text-[15.5px] font-semibold text-accent-contrast transition-opacity hover:opacity-90 disabled:opacity-60 sm:w-auto">
            {state.kind === "sending" ? "Enviando…" : "Quero receber por e-mail"}
          </button>
        </form>
      )}
      {channels.whatsapp && (
        <div className={channels.email ? "mt-6 border-t border-line-soft pt-5" : "mt-5"}>
          <WhatsappJoin number={channels.whatsapp} />
        </div>
      )}
    </section>
  );
}
