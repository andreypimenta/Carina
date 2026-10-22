// The sign-up form: an e-mail, a WhatsApp number or both (only the channels open now), the consent the
// reader ticks, and a field people never see that bots fill. The api decides; the form only says early
// what it would refuse.
import { useId, useState } from "react";
import { Link } from "react-router";
import { EDITION_WHEN } from "@aihot/site";
import { IconCheck } from "@aihot/web/components/icons";
import { normalizeEmail, normalizePhone, type Channel } from "../address.ts";
import { CONSENT } from "../copy.ts";

const FIELD = "h-12 w-full rounded-card bg-bg-sunk px-4 text-[16px] text-ink outline-none ring-1 ring-inset ring-line-soft transition-[background-color,box-shadow] placeholder:text-ink-4 hover:ring-line-strong focus:bg-surface focus:shadow-[0_0_0_3px_var(--accent-soft)] focus:ring-accent dark:bg-bg-muted/60 dark:focus:bg-surface";
const LABEL = "mb-1.5 block text-[13px] font-semibold text-ink";

export function SignupForm({ channels, title, compact = false }: { channels: Record<Channel, boolean>; title: string; compact?: boolean }) {
  const id = useId();
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [trap, setTrap] = useState("");
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<{ kind: "idle" | "sending" | "error"; message?: string } | { kind: "done"; sent: Record<Channel, boolean> }>({ kind: "idle" });

  if (!channels.email && !channels.whatsapp) {
    return (
      <section className="card px-5 py-6 sm:px-7">
        <h2 className="text-[20px] font-bold leading-snug text-ink">{title}</h2>
        <p className="mt-2 text-[14.5px] leading-relaxed text-ink-3">As inscrições abrem em breve. Enquanto isso, a edição fica aqui toda semana.</p>
      </section>
    );
  }

  if (state.kind === "done") {
    const where = [state.sent.email && "no seu e-mail", state.sent.whatsapp && "no seu WhatsApp"].filter(Boolean).join(" e ");
    return (
      <section className="card px-5 py-7 text-center sm:px-7" aria-live="polite">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-accent text-accent-contrast">
          <IconCheck size={22} />
        </div>
        <h2 className="mt-4 text-[20px] font-bold text-ink">Quase lá!</h2>
        <p className="mx-auto mt-2 max-w-[34em] text-[14.5px] leading-relaxed text-ink-3">
          Enviamos um link de confirmação {where}. A edição só começa a chegar depois que você confirmar. Não achou o e-mail? Olhe na caixa de spam ou promoções.
        </p>
      </section>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const e1 = email.trim();
    const p1 = phone.trim();
    if (!e1 && !p1) return setState({ kind: "error", message: channels.email && channels.whatsapp ? "Informe um e-mail, um WhatsApp ou os dois." : channels.email ? "Informe seu e-mail." : "Informe seu WhatsApp." });
    if (e1 && !normalizeEmail(e1)) return setState({ kind: "error", message: "O e-mail não está em um formato válido." });
    if (p1 && !normalizePhone(p1)) return setState({ kind: "error", message: "O número de WhatsApp não é válido. Use o DDD, por exemplo (11) 98765-4321." });
    if (!consent) return setState({ kind: "error", message: "Marque a caixa de consentimento para receber a edição." });
    setState({ kind: "sending" });
    try {
      const res = await fetch("/api/assinatura", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: e1 || null, phone: p1 || null, consent, website: trap }),
      });
      const body = (await res.json().catch(() => ({}))) as { sent?: Record<Channel, boolean>; detail?: string };
      if (!res.ok || !body.sent) return setState({ kind: "error", message: body.detail ?? "Não foi possível concluir a inscrição. Tente de novo daqui a pouco." });
      setState({ kind: "done", sent: body.sent });
    } catch {
      setState({ kind: "error", message: "A conexão falhou. Verifique a internet e tente de novo." });
    }
  };

  return (
    <section className="card px-5 py-6 sm:px-7 sm:py-7">
      <h2 className="text-[20px] font-bold leading-snug text-ink sm:text-[22px]">{title}</h2>
      {!compact && (
        <p className="mt-1.5 text-[14.5px] leading-relaxed text-ink-3">
          Grátis, {EDITION_WHEN.weekly} (horário de Brasília). {channels.email && channels.whatsapp ? "No e-mail, no WhatsApp ou nos dois." : channels.email ? "No seu e-mail." : "No seu WhatsApp."}
        </p>
      )}
      <form onSubmit={submit} noValidate className="mt-5 space-y-4">
        <div className={channels.email && channels.whatsapp ? "grid gap-4 sm:grid-cols-2" : ""}>
          {channels.email && (
            <div>
              <label htmlFor={`${id}-email`} className={LABEL}>E-mail</label>
              <input id={`${id}-email`} type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@exemplo.com" className={FIELD} />
            </div>
          )}
          {channels.whatsapp && (
            <div>
              <label htmlFor={`${id}-phone`} className={LABEL}>WhatsApp</label>
              <input id={`${id}-phone`} type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 98765-4321" className={FIELD} />
            </div>
          )}
        </div>
        {/* People never see this field; a bot that fills it is thanked and forgotten. */}
        <div aria-hidden="true" className="absolute left-[-10000px] top-auto h-px w-px overflow-hidden">
          <label htmlFor={`${id}-website`}>Site</label>
          <input id={`${id}-website`} type="text" tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} />
        </div>
        <label className="flex cursor-pointer items-start gap-3 text-[13px] leading-[1.6] text-ink-3">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-[3px] size-[18px] shrink-0 accent-[var(--accent)]" />
          <span>
            {CONSENT}{" "}
            <Link to="/privacy" className="font-medium text-ink-2 underline underline-offset-2 hover:text-accent">Política de privacidade</Link>.
          </span>
        </label>
        {state.kind === "error" && <p role="alert" className="text-[13.5px] font-medium text-hot">{state.message}</p>}
        <button type="submit" disabled={state.kind === "sending"} className="inline-flex h-12 w-full items-center justify-center rounded-full bg-accent px-6 text-[15.5px] font-semibold text-accent-contrast transition-opacity hover:opacity-90 disabled:opacity-60 sm:w-auto">
          {state.kind === "sending" ? "Enviando…" : "Quero receber"}
        </button>
      </form>
    </section>
  );
}
