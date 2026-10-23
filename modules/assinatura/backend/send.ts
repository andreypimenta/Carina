// The worker's run, every minute: e-mail confirmations that are due, then the weekly edition. An edition is planned
// once per channel, when it is the newest and its week ended at most three days ago, for the addresses
// confirmed then: one send each (assinatura_sends), so nobody gets it twice. A send that may succeed later is
// tried up to MAX_ATTEMPTS times, ten minutes apart and more; one that may have arrived is never resent on its
// own (the admin can, after checking). WhatsApp messages leave one every WHATSAPP_GAP_MS or so, with a little
// jitter, so the number is not taken for a spammer; e-mails a little under Resend's two a second.
import { addDays, beijingDate, isoWeekRange } from "@aihot/contracts/time";
import { sql } from "@aihot/backend/db";
import { listReports, loadReport } from "@aihot/backend/publication/reports";
import type { ReportDetail } from "@aihot/contracts/site";
import type { Channel } from "../address.ts";
import { channelReady, sendEmail, sendWhatsapp, whatsappConnected, type Outcome } from "./channels.ts";
import { editionEmail, editionWhatsapp, links } from "./messages.ts";
import { dueConfirmations, sendConfirmation } from "./subscribers.ts";

export const MAX_ATTEMPTS = 3;
export const WHATSAPP_GAP_MS = 12_000;
const EMAIL_GAP_MS = 600;
/** An edition is sent until this many days after the Sunday that closes its week. */
const FRESH_DAYS = 3;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface RunOptions {
  /** How long the run may go on sending; the next run continues. */
  budgetMs?: number;
  now?: Date;
  /** Waits between messages (tests pass one that does not wait). */
  wait?: (ms: number) => Promise<unknown>;
}

/** The newest weekly edition, if its week is recent enough to send. */
export async function currentEdition(now = new Date()): Promise<string | null> {
  const [latest] = await listReports("weekly", 1);
  const range = latest ? isoWeekRange(latest.key) : null;
  if (!latest || !range) return null;
  return addDays(range.end, FRESH_DAYS) >= beijingDate(now) ? latest.key : null;
}

/** Plans an edition's sends on a channel once: every address confirmed now. Says how many, or null if it was planned before. */
export async function planEdition(key: string, channel: Channel): Promise<number | null> {
  return sql.begin(async (tx) => {
    const [planned] = await tx<{ recipients: number }[]>`
      INSERT INTO assinatura_editions (edition_key, channel, recipients)
      SELECT ${key}, ${channel}, count(*)::int FROM assinatura_subscribers WHERE channel = ${channel} AND status = 'confirmed'
      ON CONFLICT DO NOTHING RETURNING recipients`;
    if (!planned) return null;
    await tx`INSERT INTO assinatura_sends (subscriber_id, edition_key, status)
      SELECT id, ${key}, 'pending' FROM assinatura_subscribers WHERE channel = ${channel} AND status = 'confirmed'
      ON CONFLICT (subscriber_id, edition_key) DO NOTHING`;
    return planned.recipients;
  });
}

/**
 * Sends a stopped process left half way: an e-mail is sent again (Resend's idempotency key keeps it to one
 * copy), a WhatsApp message may have arrived and becomes unknown.
 */
async function recoverStale(): Promise<void> {
  const cutoff = new Date(Date.now() - 15 * 60_000);
  await sql`UPDATE assinatura_sends s SET status = CASE WHEN sub.channel = 'email' THEN 'pending' ELSE 'unknown' END,
      response = CASE WHEN sub.channel = 'email' THEN s.response ELSE 'processo interrompido durante o envio; não se sabe se chegou' END, updated_at = now()
    FROM assinatura_subscribers sub WHERE sub.id = s.subscriber_id AND s.status = 'sending' AND s.updated_at < ${cutoff}`;
}

/** The next send due on a channel, claimed. */
async function claimSend(channel: Channel) {
  const [row] = await sql<{ id: number; edition_key: string; attempts: number; address: string; token: string; status: string }[]>`
    WITH next AS (
      SELECT s.id FROM assinatura_sends s JOIN assinatura_subscribers sub ON sub.id = s.subscriber_id
      WHERE sub.channel = ${channel} AND s.status = 'pending' AND s.next_attempt_at <= now()
      ORDER BY s.id LIMIT 1 FOR UPDATE OF s SKIP LOCKED)
    UPDATE assinatura_sends s SET status = 'sending', attempts = s.attempts + 1, updated_at = now()
    FROM next, assinatura_subscribers sub WHERE s.id = next.id AND sub.id = s.subscriber_id
    RETURNING s.id, s.edition_key, s.attempts, sub.address, sub.token, sub.status`;
  return row ?? null;
}

async function record(id: number, attempts: number, outcome: Outcome): Promise<string> {
  if (outcome.status === "sent") {
    await sql`UPDATE assinatura_sends SET status = 'sent', sent_at = now(), response = ${outcome.id || null}, updated_at = now() WHERE id = ${id}`;
    return "sent";
  }
  if (outcome.status === "retry" && attempts < MAX_ATTEMPTS) {
    await sql`UPDATE assinatura_sends SET status = 'pending', response = ${outcome.error}, next_attempt_at = now() + ${`${10 * attempts} minutes`}::interval, updated_at = now() WHERE id = ${id}`;
    return "retry";
  }
  const status = outcome.status === "unknown" ? "unknown" : "failed";
  await sql`UPDATE assinatura_sends SET status = ${status}, response = ${outcome.error}, updated_at = now() WHERE id = ${id}`;
  return status;
}

let lastWhatsapp = 0;

export async function runSends(options: RunOptions = {}): Promise<Record<string, unknown>> {
  const budget = options.budgetMs ?? 50_000;
  const wait = options.wait ?? sleep;
  const started = Date.now();
  const left = () => budget - (Date.now() - started);
  const result: Record<string, unknown> = {};
  await recoverStale();

  const ready = { email: channelReady("email"), whatsapp: channelReady("whatsapp") && (await whatsappConnected()) };
  if (channelReady("whatsapp") && !ready.whatsapp) result.whatsapp = "instância desconectada";
  const key = await currentEdition(options.now);
  if (key) for (const channel of ["email", "whatsapp"] as const) {
    if (!ready[channel]) continue;
    const planned = await planEdition(key, channel);
    if (planned !== null) result[`planned_${channel}`] = { edition: key, recipients: planned };
  }

  const editions = new Map<string, ReportDetail | null>();
  const edition = async (k: string) => {
    if (!editions.has(k)) editions.set(k, await loadReport("weekly", k));
    return editions.get(k)!;
  };
  const counts: Record<string, number> = {};
  const count = (what: string) => { counts[what] = (counts[what] ?? 0) + 1; };

  if (ready.email) {
    for (const id of await dueConfirmations(50)) {
      if (left() < 2_000) break;
      count(`confirm_email_${await sendConfirmation(id)}`);
      await wait(EMAIL_GAP_MS);
    }
    while (left() > 2_000) {
      const send = await claimSend("email");
      if (!send) break;
      const report = send.status === "confirmed" ? await edition(send.edition_key) : null;
      if (!report) {
        await sql`UPDATE assinatura_sends SET status = 'skipped', response = ${send.status === "confirmed" ? "a edição não está mais publicada" : "o leitor saiu da lista"}, updated_at = now() WHERE id = ${send.id}`;
        count("email_skipped");
        continue;
      }
      const mail = editionEmail(report, send.token);
      const outcome = await sendEmail({
        to: send.address, ...mail, idempotencyKey: `assinatura-send-${send.id}`,
        // One-click unsubscribe (RFC 8058): mail clients show their own button, which posts to the link.
        headers: { "List-Unsubscribe": `<${links.leave(send.token)}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
      });
      count(`email_${await record(send.id, send.attempts, outcome)}`);
      await wait(EMAIL_GAP_MS);
    }
  }

  if (ready.whatsapp) {
    // Each WhatsApp message waits its turn, across runs.
    const turn = async () => {
      const gap = WHATSAPP_GAP_MS + Math.floor(Math.random() * WHATSAPP_GAP_MS / 2);
      const due = lastWhatsapp + gap - Date.now();
      if (due > left() - 1_000) return false;
      if (due > 0) await wait(due);
      lastWhatsapp = Date.now();
      return true;
    };
    while (left() > 2_000) {
      const [due] = await sql`SELECT 1 FROM assinatura_sends s JOIN assinatura_subscribers sub ON sub.id = s.subscriber_id
        WHERE sub.channel = 'whatsapp' AND s.status = 'pending' AND s.next_attempt_at <= now() LIMIT 1`;
      if (!due || !(await turn())) break;
      const send = await claimSend("whatsapp");
      if (!send) break;
      const report = send.status === "confirmed" ? await edition(send.edition_key) : null;
      if (!report) {
        await sql`UPDATE assinatura_sends SET status = 'skipped', response = ${send.status === "confirmed" ? "a edição não está mais publicada" : "o leitor saiu da lista"}, updated_at = now() WHERE id = ${send.id}`;
        count("whatsapp_skipped");
        continue;
      }
      count(`whatsapp_${await record(send.id, send.attempts, await sendWhatsapp(send.address, editionWhatsapp(report, send.token)))}`);
    }
  }
  return { ...result, ...counts };
}

/** The admin, after checking: an edition's failed and unknown sends on a channel go out again. */
export async function retrySends(key: string, channel: Channel): Promise<number> {
  const changed = await sql`UPDATE assinatura_sends s SET status = 'pending', attempts = 0, next_attempt_at = now(), updated_at = now()
    FROM assinatura_subscribers sub WHERE sub.id = s.subscriber_id AND sub.channel = ${channel} AND s.edition_key = ${key} AND s.status IN ('failed', 'unknown')`;
  return changed.count;
}

/** Sends that failed or may not have arrived, of editions planned in the last two weeks. */
export async function problemSends(): Promise<number> {
  const [row] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM assinatura_sends
    WHERE status IN ('failed', 'unknown') AND created_at > now() - interval '14 days'`;
  return row?.n ?? 0;
}
