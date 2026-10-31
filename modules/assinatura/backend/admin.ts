// The admin's view of the list: counts by channel and status and by the group that brought them, the latest
// addresses, every edition's sends, how readers took the e-mailed editions (reading) and the whole list as CSV.
import { credential } from "@aihot/backend/config";
import { sql } from "@aihot/backend/db";
import type { Channel } from "../address.ts";
import type { AdminOverview, AdminSubscriber, Reading } from "../types.ts";
import { channelReady, whatsappNumberProblem } from "./channels.ts";

const CHANNELS = new Set(["email", "whatsapp"]);
const STATUSES = new Set(["pending", "confirmed", "unsubscribed"]);

export async function adminOverview(query: { channel?: string; status?: string }): Promise<AdminOverview> {
  const channel = query.channel && CHANNELS.has(query.channel) ? (query.channel as Channel) : null;
  const status = query.status && STATUSES.has(query.status) ? query.status : null;
  const [counts, groups, editions, reading, subscribers] = await Promise.all([
    sql<AdminOverview["counts"]>`SELECT channel, status, count(*)::int AS n FROM assinatura_subscribers GROUP BY channel, status ORDER BY channel, status`,
    sql<AdminOverview["groups"]>`SELECT group_tag AS "group", status, count(*)::int AS n FROM assinatura_subscribers GROUP BY group_tag, status ORDER BY group_tag NULLS LAST, status`,
    sql<AdminOverview["editions"]>`
      SELECT e.edition_key, e.channel, e.planned_at, e.recipients,
        coalesce((SELECT jsonb_object_agg(status, n) FROM (SELECT s.status, count(*)::int AS n FROM assinatura_sends s JOIN assinatura_subscribers sub ON sub.id = s.subscriber_id
          WHERE s.edition_key = e.edition_key AND sub.channel = e.channel GROUP BY s.status) t), '{}'::jsonb) AS sends,
        (SELECT s.response FROM assinatura_sends s JOIN assinatura_subscribers sub ON sub.id = s.subscriber_id
          WHERE s.edition_key = e.edition_key AND sub.channel = e.channel AND s.status IN ('failed', 'unknown') ORDER BY s.updated_at DESC LIMIT 1) AS last_error
      FROM assinatura_editions e ORDER BY e.edition_key DESC, e.channel LIMIT 20`,
    readingOverview(),
    sql<AdminSubscriber[]>`
      SELECT id, channel, address, status, group_tag, interest, created_at, confirmed_at, unsubscribed_at, left_by, confirm_error FROM assinatura_subscribers
      WHERE (${channel}::text IS NULL OR channel = ${channel}) AND (${status}::text IS NULL OR status = ${status})
      ORDER BY id DESC LIMIT 500`,
  ]);
  return { ready: { email: channelReady("email"), whatsapp: channelReady("whatsapp") }, whatsappNumberProblem: whatsappNumberProblem(), counts, groups, editions, reading, subscribers, filter: { channel, status } };
}

/** The e-mail's last editions, newest first: what the reading figures look back on. */
const lastEditions = (n: number) => sql`SELECT edition_key FROM assinatura_editions WHERE channel = 'email' ORDER BY edition_key DESC LIMIT ${n}`;

/** How readers took the e-mailed editions; every figure counts sends whose clicks were taken for a person's (reads.ts). */
export async function readingOverview(): Promise<Reading> {
  const [editions, [recurring], retention, interests, buttons] = await Promise.all([
    sql<Reading["editions"]>`
      WITH live AS (
        SELECT s.edition_key,
          count(*) FILTER (WHERE s.status = 'sent' AND r.bounced_at IS NULL)::int AS delivered, count(*) FILTER (WHERE r.clicks > 0)::int AS clicked,
          count(*) FILTER (WHERE r.clicks = 0 AND r.bot_clicks > 0)::int AS scanned, count(r.answered_at)::int AS answered, count(r.indique_at)::int AS indique,
          count(r.left_at)::int AS left_after, count(r.complained_at)::int AS complained
        FROM assinatura_sends s JOIN assinatura_subscribers sub ON sub.id = s.subscriber_id AND sub.channel = 'email' LEFT JOIN assinatura_reads r ON r.send_id = s.id
        WHERE s.edition_key IN (${lastEditions(12)}) GROUP BY s.edition_key)
      SELECT e.edition_key, e.caso, coalesce(l.scanned, 0) AS scanned,
        coalesce(l.delivered, 0) + coalesce(x.delivered, 0) AS delivered, coalesce(l.clicked, 0) + coalesce(x.clicked, 0) AS clicked,
        coalesce(l.answered, 0) + coalesce(x.answered, 0) AS answered, coalesce(l.indique, 0) + coalesce(x.indique, 0) AS indique,
        coalesce(l.left_after, 0) + coalesce(x.left_after, 0) AS left_after, coalesce(l.complained, 0) + coalesce(x.complained, 0) AS complained
      FROM assinatura_editions e LEFT JOIN live l ON l.edition_key = e.edition_key LEFT JOIN assinatura_erased x ON x.edition_key = e.edition_key AND x.channel = 'email'
      WHERE e.channel = 'email' AND e.edition_key IN (${lastEditions(12)}) ORDER BY e.edition_key DESC`,
    sql<Array<Reading["recurring"]>>`
      WITH per AS (
        SELECT s.subscriber_id, count(*) FILTER (WHERE s.status = 'sent' AND r.bounced_at IS NULL) AS got, count(*) FILTER (WHERE r.clicks > 0) AS read
        FROM assinatura_sends s JOIN assinatura_subscribers sub ON sub.id = s.subscriber_id AND sub.channel = 'email' AND sub.status = 'confirmed'
        LEFT JOIN assinatura_reads r ON r.send_id = s.id WHERE s.edition_key IN (${lastEditions(4)}) GROUP BY s.subscriber_id)
      SELECT count(*) FILTER (WHERE read >= 2)::int AS readers, count(*) FILTER (WHERE got >= 2)::int AS eligible,
        (SELECT count(*)::int FROM (${lastEditions(4)}) l) AS editions FROM per`,
    sql<Reading["retention"]>`
      WITH r AS (
        SELECT group_tag, confirmed_at::date AS c, CASE WHEN status = 'unsubscribed' THEN unsubscribed_at::date END AS l
          FROM assinatura_subscribers WHERE confirmed_at IS NOT NULL AND status IN ('confirmed', 'unsubscribed')
        UNION ALL SELECT group_tag, confirmed_on, left_on FROM assinatura_departed)
      SELECT group_tag AS "group", count(*) FILTER (WHERE c <= current_date - 56)::int AS cohort,
        count(*) FILTER (WHERE c <= current_date - 56 AND (l IS NULL OR l >= c + 56))::int AS retained
      FROM r GROUP BY group_tag ORDER BY group_tag NULLS LAST`,
    sql<Reading["interests"]>`
      SELECT sub.interest, count(DISTINCT sub.id) FILTER (WHERE sub.status = 'confirmed')::int AS confirmed,
        count(s.id) FILTER (WHERE s.status = 'sent' AND r.bounced_at IS NULL)::int AS delivered, count(r.send_id) FILTER (WHERE r.clicks > 0)::int AS clicked
      FROM assinatura_subscribers sub LEFT JOIN assinatura_sends s ON s.subscriber_id = sub.id AND s.edition_key IN (${lastEditions(4)})
      LEFT JOIN assinatura_reads r ON r.send_id = s.id
      WHERE sub.channel = 'email' GROUP BY sub.interest ORDER BY sub.interest NULLS FIRST`,
    sql<Reading["buttons"]>`SELECT button, sum(clicks)::int AS clicks FROM assinatura_buttons WHERE day > current_date - 30 GROUP BY button ORDER BY button`,
  ]);
  return { editions, recurring: recurring!, retention, interests, buttons, resendWebhook: !!credential("integrations", "RESEND_WEBHOOK_SECRET") };
}

const cell = (value: unknown) => {
  const text = value instanceof Date ? value.toISOString() : String(value ?? "");
  // A spreadsheet runs a cell that starts with = + - @ as a formula.
  const safe = /^[=+\-@]/.test(text) && !/^\+\d+$/.test(text) ? `'${text}` : text;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** Every address, oldest first. */
export async function subscribersCsv(): Promise<string> {
  const rows = await sql`SELECT channel, address, status, group_tag, interest, created_at, consent_at, confirmed_at, unsubscribed_at, left_by FROM assinatura_subscribers ORDER BY id`;
  const columns = ["channel", "address", "status", "group_tag", "interest", "created_at", "consent_at", "confirmed_at", "unsubscribed_at", "left_by"];
  return [columns.join(","), ...rows.map((r) => columns.map((c) => cell(r[c])).join(","))].join("\n") + "\n";
}
