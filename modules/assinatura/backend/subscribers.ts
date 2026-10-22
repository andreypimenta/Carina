// Readers' addresses: signing up (each address confirmed by a link sent to it, before any edition), the link
// that confirms, the one that takes it off the list (and its undo), and WhatsApp replies (SAIR, PARAR, SIM).
// A sign-up answers the same whatever the address's state, so the form cannot tell whether someone is on the
// list. Abuse: a hidden field bots fill, and a few sign-ups per visitor (an unreadable hash of address and
// browser family) in ten minutes; a pending address gets a new confirmation at most every ten minutes.
import { randomBytes } from "node:crypto";
import { sql } from "@aihot/backend/db";
import { feedbackSourceHash } from "@aihot/backend/operations/feedback";
import { normalizeEmail, normalizePhone, phoneVariants, type Channel } from "../address.ts";
import { CONFIRM_WORDS, CONSENT, LEAVE_WORDS } from "../copy.ts";
import { channelReady, sendEmail, sendWhatsapp, type Outcome } from "./channels.ts";
import { confirmationEmail, confirmationWhatsapp } from "./messages.ts";

export class SignupRejected extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** A confirmation is tried this many times in all; past that, the reader signs up again later. */
export const CONFIRM_ATTEMPTS = 5;

const recent = new Map<string, number[]>();
function rateLimit(source: string, limit = 5, windowMs = 10 * 60_000): void {
  const now = Date.now();
  const list = (recent.get(source) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= limit) throw new SignupRejected(429, "rate_limited", "Muitas inscrições seguidas deste aparelho. Tente de novo daqui a alguns minutos.");
  list.push(now);
  recent.set(source, list);
  if (recent.size > 5000) for (const [k, v] of recent) if (v.every((t) => now - t > windowMs)) recent.delete(k);
}

export interface SignupInput {
  email?: string | null;
  phone?: string | null;
  consent?: unknown;
  /** The hidden field: people leave it empty. */
  trap?: string | null;
  ip: string;
  userAgent: string;
}

/** The channels open for sign-ups: those that can send their confirmation. */
export function openChannels(): Record<Channel, boolean> {
  return { email: channelReady("email"), whatsapp: channelReady("whatsapp") };
}

/** Records the addresses as pending (or leaves them confirmed) and has their confirmations sent. */
export async function subscribe(input: SignupInput): Promise<Record<Channel, boolean>> {
  const rawEmail = input.email?.trim() || null;
  const rawPhone = input.phone?.trim() || null;
  if (!rawEmail && !rawPhone) throw new SignupRejected(400, "invalid_request", "Informe um e-mail ou um número de WhatsApp.");
  const email = rawEmail ? normalizeEmail(rawEmail) : null;
  if (rawEmail && !email) throw new SignupRejected(400, "invalid_request", "O e-mail não está em um formato válido.");
  const phone = rawPhone ? normalizePhone(rawPhone) : null;
  if (rawPhone && !phone) throw new SignupRejected(400, "invalid_request", "O número de WhatsApp não é válido. Use o DDD, por exemplo (11) 98765-4321.");
  if (input.consent !== true) throw new SignupRejected(400, "invalid_request", "Marque a caixa de consentimento para receber a edição.");
  const open = openChannels();
  if ((email && !open.email) || (phone && !open.whatsapp)) throw new SignupRejected(400, "channel_closed", "Este canal ainda não está aberto para inscrições.");
  const asked = { email: !!email, whatsapp: !!phone };
  // A bot that filled the hidden field is told what a person would be, and nothing is kept.
  if (input.trap?.trim()) return asked;
  rateLimit(feedbackSourceHash(input.ip, input.userAgent));
  for (const [channel, address] of [["email", email], ["whatsapp", phone]] as const) {
    if (!address) continue;
    // A confirmed address stays confirmed; any other becomes pending, and is due a confirmation unless one
    // went out in the last ten minutes.
    const [row] = await sql<{ id: number; status: string; confirm_sent_at: Date | null }[]>`
      INSERT INTO assinatura_subscribers (channel, address, status, token, consent, consent_at)
      VALUES (${channel}, ${address}, 'pending', ${randomBytes(18).toString("base64url")}, ${CONSENT}, now())
      ON CONFLICT (channel, address) DO UPDATE SET
        status = CASE WHEN assinatura_subscribers.status = 'confirmed' THEN 'confirmed' ELSE 'pending' END,
        consent = EXCLUDED.consent, consent_at = EXCLUDED.consent_at,
        unsubscribed_at = NULL, left_by = NULL,
        confirm_sent_at = CASE WHEN assinatura_subscribers.status <> 'confirmed' AND assinatura_subscribers.confirm_sent_at < now() - interval '10 minutes'
          THEN NULL ELSE assinatura_subscribers.confirm_sent_at END,
        confirm_attempts = CASE WHEN assinatura_subscribers.status = 'unsubscribed' THEN 0 ELSE assinatura_subscribers.confirm_attempts END,
        updated_at = now()
      RETURNING id, status, confirm_sent_at`;
    // E-mail goes out now; WhatsApp waits for the worker, which paces the number's messages.
    if (row && row.status === "pending" && !row.confirm_sent_at && channel === "email") void sendConfirmation(row.id).catch(() => {});
  }
  return asked;
}

/**
 * Sends a pending address its confirmation, once: the row is claimed before the request. A failure that may
 * pass leaves it due again (the worker's next run); one that cannot, or a WhatsApp message that may have
 * arrived, does not.
 */
export async function sendConfirmation(id: number): Promise<Outcome["status"] | null> {
  const [row] = await sql<{ channel: Channel; address: string; token: string }[]>`
    UPDATE assinatura_subscribers SET confirm_sent_at = now(), confirm_attempts = confirm_attempts + 1, updated_at = now()
    WHERE id = ${id} AND status = 'pending' AND confirm_sent_at IS NULL AND confirm_attempts < ${CONFIRM_ATTEMPTS}
    RETURNING channel, address, token`;
  if (!row) return null;
  const outcome = row.channel === "email"
    ? await sendEmail({ to: row.address, ...confirmationEmail(row.token), idempotencyKey: `assinatura-confirm-${id}-${Date.now()}` })
    : await sendWhatsapp(row.address, confirmationWhatsapp(row.token));
  if (outcome.status === "sent") await sql`UPDATE assinatura_subscribers SET confirm_error = NULL WHERE id = ${id}`;
  else if (outcome.status === "retry") await sql`UPDATE assinatura_subscribers SET confirm_error = ${outcome.error}, confirm_sent_at = NULL, updated_at = now() WHERE id = ${id}`;
  else await sql`UPDATE assinatura_subscribers SET confirm_error = ${outcome.error}, updated_at = now() WHERE id = ${id}`;
  return outcome.status;
}

/** Pending addresses due a confirmation on a channel: signed up in the last week, not tried in the last five minutes. */
export async function dueConfirmations(channel: Channel, limit: number): Promise<number[]> {
  const rows = await sql<{ id: number }[]>`SELECT id FROM assinatura_subscribers
    WHERE channel = ${channel} AND status = 'pending' AND confirm_sent_at IS NULL AND confirm_attempts < ${CONFIRM_ATTEMPTS}
      AND consent_at > now() - interval '7 days' AND (confirm_attempts = 0 OR updated_at < now() - interval '5 minutes')
    ORDER BY id LIMIT ${limit}`;
  return rows.map((r) => r.id);
}

/** The confirmation link. Says the address's channel and whether it is now on the list. */
export async function confirm(token: string): Promise<{ channel: Channel; status: "confirmed" | "unsubscribed" } | null> {
  const [row] = await sql<{ channel: Channel; status: "confirmed" | "unsubscribed" }[]>`
    UPDATE assinatura_subscribers SET status = CASE WHEN status = 'pending' THEN 'confirmed' ELSE status END,
      confirmed_at = CASE WHEN status = 'pending' THEN now() ELSE confirmed_at END, updated_at = now()
    WHERE token = ${token} RETURNING channel, status`;
  return row ?? null;
}

/** The link in every message (and a WhatsApp SAIR): the address is sent nothing more. */
export async function unsubscribe(token: string, by: "link" | "one-click" | "whatsapp"): Promise<{ channel: Channel; undo: boolean } | null> {
  const [row] = await sql<{ channel: Channel; confirmed_at: Date | null }[]>`
    UPDATE assinatura_subscribers SET
      left_by = CASE WHEN status = 'unsubscribed' THEN left_by ELSE ${by} END,
      unsubscribed_at = CASE WHEN status = 'unsubscribed' THEN unsubscribed_at ELSE now() END,
      status = 'unsubscribed', updated_at = now()
    WHERE token = ${token} RETURNING channel, confirmed_at`;
  return row ? { channel: row.channel, undo: row.confirmed_at !== null } : null;
}

/** Undoes leaving (a click by mistake, a mail scanner opening the link), for an address that had been confirmed. */
export async function resubscribe(token: string): Promise<Channel | null> {
  const [row] = await sql<{ channel: Channel }[]>`
    UPDATE assinatura_subscribers SET status = 'confirmed', unsubscribed_at = NULL, left_by = NULL, updated_at = now()
    WHERE token = ${token} AND status = 'unsubscribed' AND confirmed_at IS NOT NULL RETURNING channel`;
  return row?.channel ?? null;
}

/** "SAIR!", "sair " and "Sáir" are all SAIR. */
const word = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").replace(/[^\p{L}]/gu, "").toUpperCase();

/**
 * The sender of an incoming Evolution message (messages.upsert), as E.164; null for groups, broadcasts and
 * the instance's own messages. Accounts known by a LID carry their number in a second field.
 */
export function inboundSender(payload: unknown): { phone: string; text: string } | null {
  const p = payload as { event?: string; data?: { key?: Record<string, unknown>; message?: Record<string, any> | null; senderPn?: string } };
  if (!/^messages[._]upsert$/i.test(p.event ?? "")) return null;
  const key = p.data?.key ?? {};
  if (key.fromMe === true) return null;
  const jid = [key.remoteJidAlt, key.senderPn, p.data?.senderPn, key.remoteJid].find((j): j is string => typeof j === "string" && j.endsWith("@s.whatsapp.net"));
  if (!jid) return null;
  const digits = jid.split("@")[0]!.split(":")[0]!;
  if (!/^\d{8,15}$/.test(digits)) return null;
  const message = p.data?.message ?? {};
  const text = String(message.conversation ?? message.extendedTextMessage?.text ?? "");
  return { phone: `+${digits}`, text };
}

/**
 * An incoming WhatsApp message: SAIR or PARAR takes the number off the list, SIM or CONFIRMAR confirms a
 * pending one; the reader is told in a reply. Anything else is left to whoever else reads the number.
 */
export async function handleInbound(payload: unknown): Promise<{ action: "left" | "confirmed" | "ignored"; subscriber: number | null }> {
  const sender = inboundSender(payload);
  if (!sender) return { action: "ignored", subscriber: null };
  const command = word(sender.text);
  const leave = LEAVE_WORDS.includes(command);
  if (!leave && !CONFIRM_WORDS.includes(command)) return { action: "ignored", subscriber: null };
  const [row] = await sql<{ id: number; status: string; token: string; address: string }[]>`SELECT id, status, token, address FROM assinatura_subscribers
    WHERE channel = 'whatsapp' AND address IN ${sql(phoneVariants(sender.phone))} ORDER BY id LIMIT 1`;
  if (!row) return { action: "ignored", subscriber: null };
  if (leave) {
    if (row.status === "unsubscribed") return { action: "ignored", subscriber: row.id };
    await unsubscribe(row.token, "whatsapp");
    await sendWhatsapp(row.address, "Pronto: este número não vai mais receber a edição semanal. Se mudar de ideia, é só se inscrever de novo pelo site.");
    return { action: "left", subscriber: row.id };
  }
  if (row.status !== "pending") return { action: "ignored", subscriber: row.id };
  await confirm(row.token);
  await sendWhatsapp(row.address, "Inscrição confirmada! A edição semanal chega por aqui toda segunda-feira. Para sair, responda SAIR.");
  return { action: "confirmed", subscriber: row.id };
}

/** The retention run: pending addresses nobody confirmed in 30 days, and addresses that left 30 days ago. */
export async function expireSubscribers(now: Date): Promise<Record<string, number>> {
  const cutoff = new Date(now.getTime() - 30 * 86400_000);
  const pending = await sql`DELETE FROM assinatura_subscribers WHERE status = 'pending' AND consent_at < ${cutoff}`;
  const left = await sql`DELETE FROM assinatura_subscribers WHERE status = 'unsubscribed' AND unsubscribed_at < ${cutoff}`;
  return { pendingExpired: pending.count, unsubscribedErased: left.count };
}
