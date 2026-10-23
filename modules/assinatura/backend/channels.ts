// The two ways out: e-mail through Resend and WhatsApp through an Evolution API instance. Each is a safety
// valve like the engine's pushes: nothing leaves the process unless its switch is exactly "true" and its
// credentials are set (NEWSLETTER_EMAIL_ENABLED, NEWSLETTER_WHATSAPP_ENABLED; WhatsApp also needs the
// journal's number, NEWSLETTER_WHATSAPP_NUMBER, which readers write to). A send says whether it
// arrived, failed for good, may succeed if tried again, or is unknown (it may have arrived: never resent
// on its own).
import { credential } from "@aihot/backend/config";
import { normalizePhone, type Channel } from "../address.ts";

export type Outcome =
  | { status: "sent"; id: string }
  | { status: "retry"; error: string }
  | { status: "failed"; error: string }
  | { status: "unknown"; error: string };

const resend = () => ({
  key: credential("integrations", "RESEND_API_KEY"),
  from: credential("integrations", "NEWSLETTER_FROM"),
  base: (process.env.RESEND_BASE_URL || "https://api.resend.com").replace(/\/+$/, ""),
});

const evolution = () => ({
  url: credential("integrations", "EVOLUTION_API_URL")?.replace(/\/+$/, "") ?? null,
  key: credential("integrations", "EVOLUTION_API_KEY"),
  instance: credential("integrations", "EVOLUTION_INSTANCE"),
});

/** The journal's WhatsApp number readers write to, as digits ("5511987654321"); null when unset or not a number. */
export function whatsappNumber(): string | null {
  const raw = credential("integrations", "NEWSLETTER_WHATSAPP_NUMBER");
  return (raw && normalizePhone(raw)?.slice(1)) || null;
}

/** Whether a channel may send now: its switch on and its credentials set. Read on each use. */
export function channelReady(channel: Channel): boolean {
  if (channel === "email") {
    const r = resend();
    return process.env.NEWSLETTER_EMAIL_ENABLED === "true" && !!r.key && !!r.from;
  }
  const e = evolution();
  return process.env.NEWSLETTER_WHATSAPP_ENABLED === "true" && !!e.url && !!e.key && !!e.instance && !!whatsappNumber();
}

const brief = (text: string) => text.replace(/\s+/g, " ").slice(0, 300);

/** Whether a failed request never reached the server (refused, no such host): nothing was sent. */
function unreached(error: unknown): boolean {
  const code = (error as { cause?: { code?: string } }).cause?.code ?? "";
  return ["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN"].includes(code);
}

export interface Email {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  /** Resend keeps a key for 24 hours: the same key sent again is not sent twice. */
  idempotencyKey: string;
}

/**
 * One e-mail. Resend answers a repeated idempotency key with the first answer, so a timeout or a lost
 * connection may be tried again without a second copy.
 */
export async function sendEmail(mail: Email): Promise<Outcome> {
  const r = resend();
  if (!channelReady("email")) return { status: "failed", error: "envio de e-mail desligado ou sem configuração" };
  let res: Response;
  try {
    res = await fetch(`${r.base}/emails`, {
      method: "POST",
      headers: { authorization: `Bearer ${r.key}`, "content-type": "application/json", "idempotency-key": mail.idempotencyKey },
      body: JSON.stringify({ from: r.from, to: [mail.to], subject: mail.subject, html: mail.html, text: mail.text, headers: mail.headers }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    return { status: "retry", error: brief(`resend: ${String(error)}`) };
  }
  const body = await res.text().catch(() => "");
  if (res.ok) {
    let id = "";
    try { id = String((JSON.parse(body) as { id?: string }).id ?? ""); } catch { /* not JSON */ }
    return { status: "sent", id };
  }
  // Too many requests or Resend's own trouble pass; anything else (an invalid address, a domain not verified) does not.
  if (res.status === 429 || res.status >= 500) return { status: "retry", error: brief(`resend ${res.status}: ${body}`) };
  return { status: "failed", error: brief(`resend ${res.status}: ${body}`) };
}

/**
 * Whether the instance is connected to WhatsApp. Sending while it is not would only fail, so a run that
 * finds it down sends nothing on that channel and tries again next time.
 */
export async function whatsappConnected(): Promise<boolean> {
  const e = evolution();
  if (!channelReady("whatsapp")) return false;
  try {
    const res = await fetch(`${e.url}/instance/connectionState/${encodeURIComponent(e.instance!)}`, { headers: { apikey: e.key! }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return false;
    const body = (await res.json()) as { instance?: { state?: string }; state?: string };
    return (body.instance?.state ?? body.state) === "open";
  } catch {
    return false;
  }
}

/**
 * One text message to a number (E.164). Evolution has no idempotency key: once the request may have
 * reached it (a timeout, an answer of its own failure), the outcome is unknown and the message is not
 * sent again on its own. A refusal of the request (no such number on WhatsApp, a wrong key or instance)
 * sent nothing. A message whose links only lead to actions goes without a preview: Evolution would open
 * the first one to draw it.
 */
export async function sendWhatsapp(to: string, text: string, { preview = true } = {}): Promise<Outcome> {
  const e = evolution();
  if (!channelReady("whatsapp")) return { status: "failed", error: "envio por WhatsApp desligado ou sem configuração" };
  let res: Response;
  try {
    res = await fetch(`${e.url}/message/sendText/${encodeURIComponent(e.instance!)}`, {
      method: "POST",
      headers: { apikey: e.key!, "content-type": "application/json" },
      body: JSON.stringify({ number: to.replace(/^\+/, ""), text, linkPreview: preview }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    if (unreached(error)) return { status: "retry", error: brief(`evolution: ${String((error as { cause?: unknown }).cause ?? error)}`) };
    return { status: "unknown", error: brief(`evolution: ${String(error)}`) };
  }
  const body = await res.text().catch(() => "");
  if (res.ok) {
    let id = "";
    try { id = String((JSON.parse(body) as { key?: { id?: string } }).key?.id ?? ""); } catch { /* not JSON */ }
    return { status: "sent", id };
  }
  if (res.status === 401 || res.status === 403 || res.status === 404 || res.status === 429) return { status: "retry", error: brief(`evolution ${res.status}: ${body}`) };
  if (res.status >= 500) return { status: "unknown", error: brief(`evolution ${res.status}: ${body}`) };
  return { status: "failed", error: brief(`evolution ${res.status}: ${body}`) };
}
