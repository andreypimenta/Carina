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

export interface AdminOverview {
  /** Whether each channel's switch is on and its credentials are set. */
  ready: Record<Channel, boolean>;
  counts: Array<{ channel: Channel; status: string; n: number }>;
  editions: AdminEdition[];
  subscribers: AdminSubscriber[];
  /** The list's filters, as read. */
  filter: { channel: Channel | null; status: string | null };
}
