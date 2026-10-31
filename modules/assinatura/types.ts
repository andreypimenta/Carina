// What the module's api answers its pages: the admin overview, and the ways to sign up open now. Types
// only, shared by the backend and the web.
import type { Channel } from "./address.ts";

/** The ways to sign up open now: the e-mail form, and the journal's WhatsApp number (digits) readers write to. */
export interface SignupChannels {
  email: boolean;
  whatsapp: string | null;
}

export interface AdminSubscriber {
  id: number;
  channel: Channel;
  address: string;
  status: "pending" | "confirmed" | "unsubscribed";
  /** The group whose link brought it (/assine?g=), if any. */
  group_tag: string | null;
  /** The sections it reads first (interest.ts); null: all in the journal's order. */
  interest: string | null;
  created_at: string;
  confirmed_at: string | null;
  unsubscribed_at: string | null;
  left_by: string | null;
  confirm_error: string | null;
}

export interface AdminEdition {
  edition_key: string;
  channel: Channel;
  planned_at: string;
  recipients: number;
  /** Sends by status: pending, sending, sent, failed, unknown, skipped. */
  sends: Record<string, number>;
  /** The latest error among its failed and unknown sends. */
  last_error: string | null;
}

/** One e-mailed edition as its readers took it (backend/reads.ts), the erased readers' counts included. */
export interface ReadingEdition {
  edition_key: string;
  /** Accepted by Resend and not bounced. */
  delivered: number;
  /** Sends with at least one click taken for a person's. */
  clicked: number;
  /** Sends clicked only by scanners (filtered out). */
  scanned: number;
  /** Whether the e-mail asked the case of the week, and how many answered it by tapping a choice. */
  caso: boolean;
  answered: number;
  /** Clicks on the e-mail's "Indique a um colega" link (the link was clicked; a forward is not known). */
  indique: number;
  /** Readers who left with this as the last edition they were sent, and complaints to their mail provider. */
  left_after: number;
  complained: number;
}

export interface Reading {
  editions: ReadingEdition[];
  /** Confirmed e-mail readers who clicked in at least 2 of the last 4 editions, of those delivered at least 2 of them. */
  recurring: { readers: number; eligible: number; editions: number };
  /** By the group whose link brought them: confirmed 8 weeks ago or more (cohort), and of them still on the list 8 weeks after confirming. */
  retention: Array<{ group: string | null; cohort: number; retained: number }>;
  /** E-mail readers by the section they read first: confirmed now, and their deliveries and clicks in the last 4 editions. */
  interests: Array<{ interest: string | null; confirmed: number; delivered: number; clicked: number }>;
  /** The site's share buttons, clicks in the last 30 days. */
  buttons: Array<{ button: string; clicks: number }>;
  /** Whether Resend's webhook is set (RESEND_WEBHOOK_SECRET): without it no bounce or complaint is known. */
  resendWebhook: boolean;
}

export interface AdminOverview {
  /** Whether each channel's switch is on and its credentials are set. */
  ready: Record<Channel, boolean>;
  /** What is wrong with NEWSLETTER_WHATSAPP_NUMBER, which keeps the WhatsApp channel closed; null when it is fine. */
  whatsappNumberProblem: string | null;
  counts: Array<{ channel: Channel; status: string; n: number }>;
  /** Addresses by the group whose link brought them (null: none) and status. */
  groups: Array<{ group: string | null; status: string; n: number }>;
  editions: AdminEdition[];
  reading: Reading;
  subscribers: AdminSubscriber[];
  /** The list's filters, as read. */
  filter: { channel: Channel | null; status: string | null };
}
