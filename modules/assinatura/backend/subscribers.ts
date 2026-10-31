// Readers' addresses: an e-mail signs up by the form and is confirmed by a link sent to it, before any
// edition; a WhatsApp number signs up by writing JOIN_TEXT to the journal's number, so nothing is ever sent
// to a number that did not write first. Then the button that confirms, the one that takes an address off
// the list (and its undo), and WhatsApp's SAIR and PARAR. A sign-up answers the same whatever the address's
// state, except one whose confirmations ran out in the last day. Abuse: a hidden field bots fill, and a few
// sign-ups per visitor (an unreadable hash of address and browser family) in ten minutes; a pending address
// gets a new confirmation at most every ten minutes.
import { randomBytes } from "node:crypto";
import { sql } from "@aihot/backend/db";
import { feedbackSourceHash } from "@aihot/backend/operations/feedback";
import { normalizeEmail, phoneVariants, type Channel } from "../address.ts";
import { CONSENT, JOIN_TEXT, LEAVE_WORDS, WHATSAPP_CONSENT } from "../copy.ts";
import { groupTag } from "../group.ts";
import { interestOf } from "../interest.ts";
import { channelReady, sendEmail, sendWhatsapp, whatsappNumber, type Outcome } from "./channels.ts";
import { confirmationEmail, welcomeWhatsapp } from "./messages.ts";

export class SignupRejected extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** A confirmation is tried this many times; a day after the last, a new sign-up starts again. */
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
  consent?: unknown;
  /** The hidden field: people leave it empty. */
  trap?: string | null;
  /** The tag of the group whose link the reader came by (/assine?g=). */
  group?: unknown;
  /** The section the reader wants first (interest.ts); anything else is both. */
  interest?: unknown;
  ip: string;
  userAgent: string;
}

/** The ways to sign up open now: the e-mail form, and the journal's WhatsApp number to write to. */
export function openChannels(): { email: boolean; whatsapp: string | null } {
  return { email: channelReady("email"), whatsapp: channelReady("whatsapp") ? whatsappNumber() : null };
}

/**
 * Records the e-mail as pending (or leaves it confirmed) and has its confirmation sent. Says false only when
 * its confirmations ran out less than a day ago: nothing goes out, and the reader is told to look in the spam.
 */
export async function subscribe(input: SignupInput): Promise<boolean> {
  const raw = input.email?.trim() || null;
  if (!raw) throw new SignupRejected(400, "invalid_request", "Informe seu e-mail.");
  const email = normalizeEmail(raw);
  if (!email) throw new SignupRejected(400, "invalid_request", "O e-mail não está em um formato válido.");
  if (input.consent !== true) throw new SignupRejected(400, "invalid_request", "Marque a caixa de consentimento para receber a edição.");
  if (!openChannels().email) throw new SignupRejected(400, "channel_closed", "As inscrições por e-mail ainda não estão abertas.");
  // A bot that filled the hidden field is told what a person would be, and nothing is kept.
  if (input.trap?.trim()) return true;
  rateLimit(feedbackSourceHash(input.ip, input.userAgent));
  // A confirmed address stays confirmed; any other becomes pending, and is due a confirmation unless one went
  // out in the last ten minutes, or its attempts ran out in the last day (then they start again). The group that
  // first brought the address stays its group; a confirmed address keeps its preference (only its own link changes it).
  const [row] = await sql<{ id: number; status: string; confirm_sent_at: Date | null; confirm_attempts: number }[]>`
    INSERT INTO assinatura_subscribers (channel, address, status, token, consent, consent_at, group_tag, interest)
    VALUES ('email', ${email}, 'pending', ${randomBytes(18).toString("base64url")}, ${CONSENT}, now(), ${groupTag(input.group)}, ${interestOf(input.interest)})
    ON CONFLICT (channel, address) DO UPDATE SET
      group_tag = coalesce(assinatura_subscribers.group_tag, EXCLUDED.group_tag),
      interest = CASE WHEN assinatura_subscribers.status = 'confirmed' THEN assinatura_subscribers.interest ELSE EXCLUDED.interest END,
      status = CASE WHEN assinatura_subscribers.status = 'confirmed' THEN 'confirmed' ELSE 'pending' END,
      consent = EXCLUDED.consent, consent_at = EXCLUDED.consent_at,
      unsubscribed_at = NULL, left_by = NULL,
      confirm_sent_at = CASE WHEN assinatura_subscribers.status <> 'confirmed' AND assinatura_subscribers.confirm_sent_at < now() -
          CASE WHEN assinatura_subscribers.status = 'pending' AND assinatura_subscribers.confirm_attempts >= ${CONFIRM_ATTEMPTS} THEN interval '24 hours' ELSE interval '10 minutes' END
        THEN NULL ELSE assinatura_subscribers.confirm_sent_at END,
      confirm_attempts = CASE WHEN assinatura_subscribers.status = 'unsubscribed'
          OR (assinatura_subscribers.status = 'pending' AND assinatura_subscribers.confirm_sent_at < now() - interval '24 hours') THEN 0
        ELSE assinatura_subscribers.confirm_attempts END,
      updated_at = now()
    RETURNING id, status, confirm_sent_at, confirm_attempts`;
  if (!row || row.status !== "pending") return true;
  if (row.confirm_attempts >= CONFIRM_ATTEMPTS) return false;
  if (!row.confirm_sent_at) void sendConfirmation(row.id).catch(() => {});
  return true;
}

/**
 * Sends a pending e-mail its confirmation, once: the row is claimed before the request. A failure that may
 * pass leaves it due again (the worker's next run) while attempts remain; one that cannot does not. The last
 * attempt's time stays, so a sign-up a day later can start again.
 */
export async function sendConfirmation(id: number): Promise<Outcome["status"] | null> {
  const [row] = await sql<{ address: string; token: string }[]>`
    UPDATE assinatura_subscribers SET confirm_sent_at = now(), confirm_attempts = confirm_attempts + 1, updated_at = now()
    WHERE id = ${id} AND channel = 'email' AND status = 'pending' AND confirm_sent_at IS NULL AND confirm_attempts < ${CONFIRM_ATTEMPTS}
    RETURNING address, token`;
  if (!row) return null;
  const outcome = await sendEmail({ to: row.address, ...confirmationEmail(row.token), idempotencyKey: `assinatura-confirm-${id}-${Date.now()}` });
  if (outcome.status === "sent") await sql`UPDATE assinatura_subscribers SET confirm_error = NULL WHERE id = ${id}`;
  else if (outcome.status === "retry") await sql`UPDATE assinatura_subscribers SET confirm_error = ${outcome.error},
    confirm_sent_at = CASE WHEN confirm_attempts < ${CONFIRM_ATTEMPTS} THEN NULL ELSE confirm_sent_at END, updated_at = now() WHERE id = ${id}`;
  else await sql`UPDATE assinatura_subscribers SET confirm_error = ${outcome.error}, updated_at = now() WHERE id = ${id}`;
  return outcome.status;
}

/** Pending e-mails due a confirmation: signed up in the last week, not tried in the last five minutes. */
export async function dueConfirmations(limit: number): Promise<number[]> {
  const rows = await sql<{ id: number }[]>`SELECT id FROM assinatura_subscribers
    WHERE channel = 'email' AND status = 'pending' AND confirm_sent_at IS NULL AND confirm_attempts < ${CONFIRM_ATTEMPTS}
      AND consent_at > now() - interval '7 days' AND (confirm_attempts = 0 OR updated_at < now() - interval '5 minutes')
    ORDER BY id LIMIT ${limit}`;
  return rows.map((r) => r.id);
}

/** The confirmation button. Says the address's channel and whether it is now on the list. */
export async function confirm(token: string): Promise<{ channel: Channel; status: "confirmed" | "unsubscribed" } | null> {
  const [row] = await sql<{ channel: Channel; status: "confirmed" | "unsubscribed" }[]>`
    UPDATE assinatura_subscribers SET status = CASE WHEN status = 'pending' THEN 'confirmed' ELSE status END,
      confirmed_at = CASE WHEN status = 'pending' THEN now() ELSE confirmed_at END, updated_at = now()
    WHERE token = ${token} RETURNING channel, status`;
  return row ?? null;
}

/**
 * The button behind the link in every message, the mail client's one click, a WhatsApp SAIR, a complaint to the
 * mail provider: the address is sent nothing more. Leaving is put down to the last edition it was sent, for the
 * admin's leavings per edition.
 */
export async function unsubscribe(token: string, by: "link" | "one-click" | "whatsapp" | "complaint"): Promise<{ channel: Channel; undo: boolean } | null> {
  // unsubscribed_at is now() only for an address that left in this statement.
  const [row] = await sql<{ id: number; channel: Channel; confirmed_at: Date | null; just_left: boolean }[]>`
    UPDATE assinatura_subscribers SET
      left_by = CASE WHEN status = 'unsubscribed' THEN left_by ELSE ${by} END,
      unsubscribed_at = CASE WHEN status = 'unsubscribed' THEN unsubscribed_at ELSE now() END,
      status = 'unsubscribed', updated_at = now()
    WHERE token = ${token} RETURNING id, channel, confirmed_at, unsubscribed_at = now() AS just_left`;
  if (!row) return null;
  if (row.just_left) {
    await sql`INSERT INTO assinatura_reads (send_id, left_at)
      SELECT id, now() FROM assinatura_sends WHERE subscriber_id = ${row.id} AND status = 'sent' ORDER BY sent_at DESC LIMIT 1
      ON CONFLICT (send_id) DO UPDATE SET left_at = now()`;
  }
  return { channel: row.channel, undo: row.confirmed_at !== null };
}

/** Undoes leaving (a click by mistake), for an address that had been confirmed. */
export async function resubscribe(token: string): Promise<Channel | null> {
  const [row] = await sql<{ id: number; channel: Channel }[]>`
    UPDATE assinatura_subscribers SET status = 'confirmed', unsubscribed_at = NULL, left_by = NULL, updated_at = now()
    WHERE token = ${token} AND status = 'unsubscribed' AND confirmed_at IS NOT NULL RETURNING id, channel`;
  if (!row) return null;
  await sql`UPDATE assinatura_reads r SET left_at = NULL FROM assinatura_sends s WHERE s.id = r.send_id AND s.subscriber_id = ${row.id} AND r.left_at IS NOT NULL`;
  return row.channel;
}

/** The preferences page behind the e-mail's link: the address's channel, whether it is on the list, and its section first. */
export async function preferences(token: string): Promise<{ channel: Channel; status: string; interest: string | null } | null> {
  const [row] = await sql<{ channel: Channel; status: string; interest: string | null }[]>`SELECT channel, status, interest FROM assinatura_subscribers WHERE token = ${token}`;
  return row ?? null;
}

/** Changes the section the edition puts first (null: both, in the journal's order). */
export async function setInterest(token: string, interest: unknown): Promise<{ interest: string | null } | null> {
  const [row] = await sql<{ interest: string | null }[]>`UPDATE assinatura_subscribers SET interest = ${interestOf(interest)}, updated_at = now() WHERE token = ${token} RETURNING interest`;
  return row ?? null;
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
 * An incoming WhatsApp message: JOIN_TEXT puts the number on the list (the message is its consent) and is
 * answered once with a welcome; SAIR or PARAR takes it off, with a reply. Anything else is left to whoever
 * else reads the number.
 */
export async function handleInbound(payload: unknown): Promise<{ action: "joined" | "left" | "ignored"; subscriber: number | null }> {
  const sender = inboundSender(payload);
  if (!sender) return { action: "ignored", subscriber: null };
  const command = word(sender.text);
  const leave = LEAVE_WORDS.includes(command);
  const join = command === word(JOIN_TEXT);
  if (!leave && !join) return { action: "ignored", subscriber: null };
  const [row] = await sql<{ id: number; status: string; token: string; address: string }[]>`SELECT id, status, token, address FROM assinatura_subscribers
    WHERE channel = 'whatsapp' AND address IN ${sql(phoneVariants(sender.phone))} ORDER BY id LIMIT 1`;
  if (leave) {
    if (!row || row.status === "unsubscribed") return { action: "ignored", subscriber: row?.id ?? null };
    await unsubscribe(row.token, "whatsapp");
    await sendWhatsapp(row.address, `Pronto: este número não vai mais receber a edição semanal. Se mudar de ideia, é só mandar ${JOIN_TEXT}.`, { preview: false });
    return { action: "left", subscriber: row.id };
  }
  if (!channelReady("whatsapp")) return { action: "ignored", subscriber: row?.id ?? null };
  const consent = `${WHATSAPP_CONSENT}\nMensagem recebida: ${sender.text.trim().slice(0, 200)}`;
  // Claimed in one statement each, so a message delivered twice is welcomed once.
  const [joined] = row
    ? await sql<{ id: number; token: string; address: string }[]>`UPDATE assinatura_subscribers SET status = 'confirmed', consent = ${consent}, consent_at = now(),
        confirmed_at = now(), unsubscribed_at = NULL, left_by = NULL, updated_at = now()
      WHERE id = ${row.id} AND status <> 'confirmed' RETURNING id, token, address`
    : await sql<{ id: number; token: string; address: string }[]>`INSERT INTO assinatura_subscribers (channel, address, status, token, consent, consent_at, confirmed_at)
      VALUES ('whatsapp', ${sender.phone}, 'confirmed', ${randomBytes(18).toString("base64url")}, ${consent}, now(), now())
      ON CONFLICT (channel, address) DO NOTHING RETURNING id, token, address`;
  if (!joined) return { action: "ignored", subscriber: row?.id ?? null };
  await sendWhatsapp(joined.address, welcomeWhatsapp(joined.token), { preview: false });
  return { action: "joined", subscriber: joined.id };
}

/**
 * The retention run: pending addresses nobody confirmed in 30 days, and addresses that left 30 days ago. Before
 * they go, what they did with each edition joins the edition's counts (assinatura_erased) and a reader who had
 * confirmed is kept for retention by origin without the address (assinatura_departed).
 */
export async function expireSubscribers(now: Date): Promise<Record<string, number>> {
  const cutoff = new Date(now.getTime() - 30 * 86400_000);
  return sql.begin(async (tx) => {
    const gone = () => tx`SELECT id FROM assinatura_subscribers WHERE (status = 'pending' AND consent_at < ${cutoff}) OR (status = 'unsubscribed' AND unsubscribed_at < ${cutoff})`;
    await tx`INSERT INTO assinatura_erased (edition_key, channel, delivered, clicked, scanned, answered, indique, left_after, complained)
      SELECT s.edition_key, sub.channel,
        count(*) FILTER (WHERE s.status = 'sent' AND r.bounced_at IS NULL)::int, count(*) FILTER (WHERE r.clicks > 0)::int,
        count(*) FILTER (WHERE r.clicks = 0 AND r.bot_clicks > 0)::int,
        count(r.answered_at)::int, count(r.indique_at)::int, count(r.left_at)::int, count(r.complained_at)::int
      FROM assinatura_sends s JOIN assinatura_subscribers sub ON sub.id = s.subscriber_id LEFT JOIN assinatura_reads r ON r.send_id = s.id
      WHERE s.subscriber_id IN (${gone()}) GROUP BY s.edition_key, sub.channel
      ON CONFLICT (edition_key, channel) DO UPDATE SET delivered = assinatura_erased.delivered + EXCLUDED.delivered,
        clicked = assinatura_erased.clicked + EXCLUDED.clicked, scanned = assinatura_erased.scanned + EXCLUDED.scanned, answered = assinatura_erased.answered + EXCLUDED.answered,
        indique = assinatura_erased.indique + EXCLUDED.indique, left_after = assinatura_erased.left_after + EXCLUDED.left_after,
        complained = assinatura_erased.complained + EXCLUDED.complained`;
    await tx`INSERT INTO assinatura_departed (channel, group_tag, confirmed_on, left_on)
      SELECT channel, group_tag, confirmed_at::date, coalesce(unsubscribed_at, consent_at)::date FROM assinatura_subscribers
      WHERE id IN (${gone()}) AND confirmed_at IS NOT NULL`;
    const pending = await tx`DELETE FROM assinatura_subscribers WHERE status = 'pending' AND consent_at < ${cutoff}`;
    const left = await tx`DELETE FROM assinatura_subscribers WHERE status = 'unsubscribed' AND unsubscribed_at < ${cutoff}`;
    return { pendingExpired: pending.count, unsubscribedErased: left.count };
  });
}
