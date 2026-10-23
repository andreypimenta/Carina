// The admin's view of the list: counts by channel and status, the latest addresses, every edition's sends
// and the whole list as CSV.
import { sql } from "@aihot/backend/db";
import type { Channel } from "../address.ts";
import type { AdminOverview, AdminSubscriber } from "../types.ts";
import { channelReady, whatsappNumberProblem } from "./channels.ts";

const CHANNELS = new Set(["email", "whatsapp"]);
const STATUSES = new Set(["pending", "confirmed", "unsubscribed"]);

export async function adminOverview(query: { channel?: string; status?: string }): Promise<AdminOverview> {
  const channel = query.channel && CHANNELS.has(query.channel) ? (query.channel as Channel) : null;
  const status = query.status && STATUSES.has(query.status) ? query.status : null;
  const [counts, editions, subscribers] = await Promise.all([
    sql<AdminOverview["counts"]>`SELECT channel, status, count(*)::int AS n FROM assinatura_subscribers GROUP BY channel, status ORDER BY channel, status`,
    sql<AdminOverview["editions"]>`
      SELECT e.edition_key, e.channel, e.planned_at, e.recipients,
        coalesce((SELECT jsonb_object_agg(status, n) FROM (SELECT s.status, count(*)::int AS n FROM assinatura_sends s JOIN assinatura_subscribers sub ON sub.id = s.subscriber_id
          WHERE s.edition_key = e.edition_key AND sub.channel = e.channel GROUP BY s.status) t), '{}'::jsonb) AS sends,
        (SELECT s.response FROM assinatura_sends s JOIN assinatura_subscribers sub ON sub.id = s.subscriber_id
          WHERE s.edition_key = e.edition_key AND sub.channel = e.channel AND s.status IN ('failed', 'unknown') ORDER BY s.updated_at DESC LIMIT 1) AS last_error
      FROM assinatura_editions e ORDER BY e.edition_key DESC, e.channel LIMIT 20`,
    sql<AdminSubscriber[]>`
      SELECT id, channel, address, status, created_at, confirmed_at, unsubscribed_at, left_by, confirm_error FROM assinatura_subscribers
      WHERE (${channel}::text IS NULL OR channel = ${channel}) AND (${status}::text IS NULL OR status = ${status})
      ORDER BY id DESC LIMIT 500`,
  ]);
  return { ready: { email: channelReady("email"), whatsapp: channelReady("whatsapp") }, whatsappNumberProblem: whatsappNumberProblem(), counts, editions, subscribers, filter: { channel, status } };
}

const cell = (value: unknown) => {
  const text = value instanceof Date ? value.toISOString() : String(value ?? "");
  // A spreadsheet runs a cell that starts with = + - @ as a formula.
  const safe = /^[=+\-@]/.test(text) && !/^\+\d+$/.test(text) ? `'${text}` : text;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** Every address, oldest first. */
export async function subscribersCsv(): Promise<string> {
  const rows = await sql`SELECT channel, address, status, created_at, consent_at, confirmed_at, unsubscribed_at, left_by FROM assinatura_subscribers ORDER BY id`;
  const columns = ["channel", "address", "status", "created_at", "consent_at", "confirmed_at", "unsubscribed_at", "left_by"];
  return [columns.join(","), ...rows.map((r) => columns.map((c) => cell(r[c])).join(","))].join("\n") + "\n";
}
