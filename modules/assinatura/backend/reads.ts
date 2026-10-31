// What readers do with the e-mailed edition, measured without third parties. Every link of the edition's HTML
// goes through the site (/assine/l, signed, so it redirects nowhere else) and counts one click on that send
// (assinatura_reads); there is no open pixel, since mail clients that fetch pictures for privacy (Apple Mail)
// make opens meaningless. Clicks a link scanner made are counted apart (scannerReason, then a burst over every
// link), so the admin's rates are people's. Resend's webhook (signed, Svix) adds bounces and complaints; a
// complaint takes the address off the list. The site's share buttons count clicks per day, not forwards.
// Counts and times only: no IP, browser or link is kept.
import { createHmac, timingSafeEqual } from "node:crypto";
import { beijingDate } from "@aihot/contracts/time";
import { config, credential } from "@aihot/backend/config";
import { sql } from "@aihot/backend/db";
import { unsubscribe } from "./subscribers.ts";

/** A link's kind: an ordinary link, an answer to the case of the week, or "Indique a um colega". */
export type LinkKind = "l" | "r" | "i";
const KINDS = new Set<string>(["l", "r", "i"]);

const SIG_CHARS = 22;
const signature = (send: number, kind: string, url: string) =>
  createHmac("sha256", credential("auth", "SESSION_SECRET") ?? "dev-feedback-secret").update(`assinatura-link-v1|${send}|${kind}|${url}`).digest("base64url").slice(0, SIG_CHARS);

/** The address a link of send `send` goes through. */
export function trackedUrl(send: number, kind: LinkKind, url: string): string {
  return `${config.siteUrl}/assine/l?${new URLSearchParams({ s: String(send), k: kind, u: url, h: signature(send, kind, url) })}`;
}

/** A tracked link's parts, if its signature holds. */
export function readLink(query: Record<string, unknown>): { send: number; kind: LinkKind; url: string } | null {
  const { s, k, u, h } = query;
  if (typeof s !== "string" || !/^\d{1,15}$/.test(s) || typeof k !== "string" || !KINDS.has(k) || typeof u !== "string" || !/^https?:\/\//.test(u) || typeof h !== "string") return null;
  const a = Buffer.from(h);
  const b = Buffer.from(signature(Number(s), k, u));
  return a.length === b.length && timingSafeEqual(a, b) ? { send: Number(s), kind: k as LinkKind, url: u } : null;
}

const unescape = (s: string) => s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * The edition's HTML for one send, every web link through /assine/l: an anchor marked data-answer (the case
 * of the week's choices) counts as an answer, the "Indique" link as that. The links that act on the address
 * (leave, preferences) stay as they are.
 */
export function trackLinks(html: string, send: number, indique: string): string {
  const own = `${config.siteUrl}/assine/`;
  return html.replace(/<a\b([^>]*?)\shref="([^"]*)"([^>]*)>/g, (tag, before: string, href: string, after: string) => {
    const url = unescape(href);
    if (!/^https?:\/\//.test(url) || url.startsWith(`${own}sair`) || url.startsWith(`${own}preferencias`)) return tag;
    const kind: LinkKind = /\sdata-answer\b/.test(` ${before} ${after}`) ? "r" : url === indique ? "i" : "l";
    return `<a${before} href="${escape(trackedUrl(send, kind, url))}"${after}>`;
  });
}

// --- Telling a scanner from a person -------------------------------------------------------------------------

/** A click this soon after the e-mail went out is a gateway checking links on arrival. */
export const EARLY_MS = 30_000;
/** This many clicks on one e-mail within BURST_MS is a scanner following every link; all of them are its. */
export const BURST_CLICKS = 5;
export const BURST_MS = 10_000;

/** Browsers of link checkers, mail gateways and scripts; a person's browser names none of these. */
const SCANNER_AGENTS = /bot|crawl|spider|slurp|preview|scan|python|curl|wget|go-http|java\/|okhttp|axios|node-fetch|undici|libwww|httpclient|headless|phantom|barracuda|proofpoint|mimecast|symantec|messagelabs|trend ?micro|sophos|fortinet|forcepoint|zscaler|safelinks|ms-office|microsoft office|appengine|cloudflare|virustotal/i;

/**
 * Published ranges of mail-security gateways that open links on arrival: Microsoft Exchange Online Protection
 * (Defender Safe Links), Proofpoint, Mimecast and Barracuda. Extend when the admin sees another one.
 */
const SCANNER_RANGES = [
  "40.92.0.0/15", "40.107.0.0/16", "52.100.0.0/14", "104.47.0.0/17", // Microsoft
  "148.163.128.0/19", "67.231.144.0/20", "205.220.160.0/19", // Proofpoint
  "205.139.110.0/24", "207.211.30.0/24", "170.10.128.0/22", // Mimecast
  "64.235.144.0/20", "209.222.80.0/21", // Barracuda
].map((cidr) => {
  const [base, bits] = cidr.split("/");
  return { net: ipv4(base!)!, mask: Number(bits) === 0 ? 0 : (~0 << (32 - Number(bits))) >>> 0 };
});

function ipv4(ip: string): number | null {
  const m = /^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip.trim());
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  return parts.some((p) => p > 255) ? null : ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;
}

export interface ClickSignals {
  method: string;
  userAgent: string;
  ip: string;
  /** The Purpose or Sec-Purpose header a browser sends when it only prefetches. */
  purpose: string;
  sentAt: Date | null;
  now: Date;
}

/** Why a click is a machine's, or null when it may be a person's (the burst over every link is judged after). */
export function scannerReason(s: ClickSignals): string | null {
  if (s.method === "HEAD") return "head";
  if (/prefetch|prerender|preview/i.test(s.purpose)) return "prefetch";
  if (!s.userAgent.trim() || SCANNER_AGENTS.test(s.userAgent)) return "agent";
  const ip = ipv4(s.ip);
  if (ip !== null && SCANNER_RANGES.some((r) => ((ip & r.mask) >>> 0) === r.net)) return "range";
  if (s.sentAt && s.now.getTime() - s.sentAt.getTime() < EARLY_MS) return "early";
  return null;
}

interface ReadState {
  clicks: number;
  bot_clicks: number;
  first_click_at: Date | null;
  answered_at: Date | null;
  indique_at: Date | null;
  burst_at: Date | null;
  burst_clicks: number;
}

/**
 * A send's counts after one more click. A click that may be a person's starts or extends the burst; when the
 * burst reaches BURST_CLICKS, its clicks so far, and the answer or "Indique" they made, become the scanner's.
 */
export function afterClick(state: ReadState, kind: LinkKind, machine: boolean, now: Date): ReadState {
  const next = { ...state };
  if (machine) {
    next.bot_clicks += 1;
    return next;
  }
  const inBurst = next.burst_at !== null && now.getTime() - next.burst_at.getTime() <= BURST_MS;
  next.burst_at = inBurst ? next.burst_at : now;
  next.burst_clicks = inBurst ? next.burst_clicks + 1 : 1;
  if (next.burst_clicks >= BURST_CLICKS) {
    const counted = next.burst_clicks === BURST_CLICKS ? BURST_CLICKS - 1 : 0;
    next.clicks -= counted;
    next.bot_clicks += counted + 1;
    const since = next.burst_at!.getTime();
    if (next.answered_at && next.answered_at.getTime() >= since) next.answered_at = null;
    if (next.indique_at && next.indique_at.getTime() >= since) next.indique_at = null;
    if (next.clicks === 0) next.first_click_at = null;
    return next;
  }
  next.clicks += 1;
  next.first_click_at ??= now;
  if (kind === "r") next.answered_at ??= now;
  if (kind === "i") next.indique_at ??= now;
  return next;
}

/** Counts a click on a send's link; a send that is not there (erased) is not counted. */
export async function recordClick(send: number, kind: LinkKind, signals: Omit<ClickSignals, "sentAt" | "now">): Promise<void> {
  await sql.begin(async (tx) => {
    const [row] = await tx<{ sent_at: Date | null; now: Date }[]>`SELECT sent_at, now() AS now FROM assinatura_sends WHERE id = ${send}`;
    if (!row) return;
    const machine = scannerReason({ ...signals, sentAt: row.sent_at, now: row.now }) !== null;
    await tx`INSERT INTO assinatura_reads (send_id) VALUES (${send}) ON CONFLICT (send_id) DO NOTHING`;
    const [state] = await tx<ReadState[]>`SELECT clicks, bot_clicks, first_click_at, answered_at, indique_at, burst_at, burst_clicks FROM assinatura_reads WHERE send_id = ${send} FOR UPDATE`;
    const n = afterClick(state!, kind, machine, row.now);
    await tx`UPDATE assinatura_reads SET clicks = ${n.clicks}, bot_clicks = ${n.bot_clicks}, first_click_at = ${n.first_click_at}, answered_at = ${n.answered_at},
      indique_at = ${n.indique_at}, burst_at = ${n.burst_at}, burst_clicks = ${n.burst_clicks} WHERE send_id = ${send}`;
  });
}

// --- Resend's webhook ----------------------------------------------------------------------------------------

/** Whether a Resend webhook call is signed with RESEND_WEBHOOK_SECRET (Svix: "whsec_" and base64), in the last five minutes. */
export function webhookSigned(secret: string, headers: Record<string, unknown>, body: string, now = Date.now()): boolean {
  const id = String(headers["svix-id"] ?? "");
  const timestamp = String(headers["svix-timestamp"] ?? "");
  const given = String(headers["svix-signature"] ?? "");
  if (!id || !/^\d+$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
  const expected = Buffer.from(createHmac("sha256", Buffer.from(secret.replace(/^whsec_/, ""), "base64")).update(`${id}.${timestamp}.${body}`).digest("base64"));
  return given.split(" ").some((part) => {
    const sig = Buffer.from(part.replace(/^v1,/, ""));
    return part.startsWith("v1,") && sig.length === expected.length && timingSafeEqual(sig, expected);
  });
}

/** A Resend event: a bounce marks the send; a complaint marks it and takes the address off the list. */
export async function handleResendEvent(event: unknown): Promise<"bounced" | "complained" | "ignored"> {
  const e = event as { type?: string; data?: { email_id?: string } };
  const kind = e.type === "email.bounced" ? "bounced" : e.type === "email.complained" ? "complained" : null;
  const emailId = e.data?.email_id;
  if (!kind || typeof emailId !== "string" || !emailId) return "ignored";
  const [send] = await sql<{ id: number; token: string }[]>`SELECT s.id, sub.token FROM assinatura_sends s JOIN assinatura_subscribers sub ON sub.id = s.subscriber_id
    WHERE sub.channel = 'email' AND s.status = 'sent' AND s.response = ${emailId} LIMIT 1`;
  if (!send) return "ignored";
  if (kind === "bounced") {
    await sql`INSERT INTO assinatura_reads (send_id, bounced_at) VALUES (${send.id}, now()) ON CONFLICT (send_id) DO UPDATE SET bounced_at = coalesce(assinatura_reads.bounced_at, now())`;
  } else {
    await sql`INSERT INTO assinatura_reads (send_id, complained_at) VALUES (${send.id}, now()) ON CONFLICT (send_id) DO UPDATE SET complained_at = coalesce(assinatura_reads.complained_at, now())`;
    await unsubscribe(send.token, "complaint");
  }
  return kind;
}

// --- The site's share buttons --------------------------------------------------------------------------------

/** The site's share buttons: WhatsApp (an article's or a story's), copying a link, and "Indique a um colega". */
export const BUTTONS = ["whatsapp", "copiar", "indique"] as const;
export type ShareButton = (typeof BUTTONS)[number];

const recent = new Map<string, number[]>();

/** One click on a share button, at most 20 per visitor in ten minutes. */
export async function countButton(button: unknown, source: string): Promise<boolean> {
  if (!(BUTTONS as readonly unknown[]).includes(button)) return false;
  const now = Date.now();
  const list = (recent.get(source) ?? []).filter((t) => now - t < 10 * 60_000);
  if (list.length >= 20) return false;
  list.push(now);
  recent.set(source, list);
  if (recent.size > 5000) for (const [k, v] of recent) if (v.every((t) => now - t > 10 * 60_000)) recent.delete(k);
  await sql`INSERT INTO assinatura_buttons (day, button, clicks) VALUES (${beijingDate(new Date())}, ${button as string}, 1)
    ON CONFLICT (day, button) DO UPDATE SET clicks = assinatura_buttons.clicks + 1`;
  return true;
}
