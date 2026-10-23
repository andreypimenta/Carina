// ScrapeCreators (Instagram hashtag search and profile posts). Paid per request: every call goes through
// receipts and the budget, like the engine's SocialData calls (providers/socialdata.ts).
import { credential } from "@aihot/backend/config";
import { guardedFetch } from "@aihot/backend/lib/http-fetch";
import { assertAccepted, paidRequest, ProviderRejectedError } from "@aihot/backend/providers/receipts";

export const SERVICE = "scrapecreators";

/** A post as both endpoints give it, reduced to what the run keeps. */
export interface IgPost {
  id: string;
  shortcode: string;
  /** Reels have their own address; the post page shows them too. */
  url: string;
  caption: string;
  takenAt: Date;
  username: string;
  fullName: string | null;
  imageUrl: string | null;
  isVideo: boolean;
  isAd: boolean;
  isPaidPartnership: boolean;
  likes: number | null;
  comments: number | null;
}

export interface Page {
  posts: IgPost[];
  /** The next page of a profile (next_max_id), when there is one. */
  next: string | null;
  receiptId: number;
}

/**
 * ScrapeCreators sells credits in packs (US$47 for 25,000, about US$0.00188 each); a request costs the
 * credits its answer reports. Recorded per call as an estimate.
 */
function creditsCost(credits: number) {
  return { amount: credits * 0.00188, currency: "USD", basis: "estimated" as const };
}

/** The API root; tests point it at a local stub. */
function apiBase(): string {
  return (credential("collectors", "SCRAPECREATORS_BASE_URL") ?? "https://api.scrapecreators.com").replace(/\/$/, "");
}

/**
 * One paid GET behind a receipt. `window` buckets the receipt identity by run, so a retry within the same
 * run reuses the stored answer instead of paying again. An answer outside 2xx, or one that says
 * `success: false`, is a request ScrapeCreators did not serve.
 */
async function get(path: string, params: Record<string, string>, opts: { subject: string; window: string }): Promise<{ json: any; receiptId: number }> {
  const key = credential("collectors", "SCRAPECREATORS_API_KEY");
  if (!key) throw new Error("SCRAPECREATORS_API_KEY is not configured");
  const query = new URLSearchParams(params);
  const receipt = await paidRequest(
    { service: SERVICE, purpose: "source_fetch", subject: opts.subject, identity: { path, params, window: opts.window }, requestSummary: { path, ...params } },
    async () => {
      const res = await guardedFetch(`${apiBase()}${path}?${query}`, {
        headers: { "x-api-key": key, accept: "application/json" },
        timeoutMs: 60_000,
        maxBytes: 8 * 1024 * 1024,
        route: "direct",
      });
      const text = res.text();
      assertAccepted(SERVICE, res.status, text);
      const json = JSON.parse(text);
      if (json?.success === false) throw new ProviderRejectedError(`${SERVICE}: ${String(json.message ?? json.error ?? "success: false").slice(0, 500)}`, res.status, false);
      const credits = Number(json?.credits_charged ?? 1);
      return { response: json, usage: { credits, posts: (json?.posts ?? json?.items ?? []).length }, cost: creditsCost(credits) };
    },
  );
  return { json: receipt.response, receiptId: receipt.receiptId };
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Posts of a hashtag (best effort: the provider searches Google's index), from the last day. */
export async function searchHashtag(tag: string, opts: { subject: string; window: string }): Promise<Page> {
  const { json, receiptId } = await get("/v1/instagram/search/hashtag", { hashtag: tag, date_posted: "last-day" }, opts);
  const posts: IgPost[] = [];
  for (const p of json?.posts ?? []) {
    const takenAt = new Date(p?.taken_at);
    if (!str(p?.id) || !str(p?.shortcode) || !str(p?.owner?.username) || !Number.isFinite(takenAt.getTime())) continue;
    posts.push({
      id: p.id, shortcode: p.shortcode, url: str(p.url) ?? `https://www.instagram.com/p/${p.shortcode}/`, caption: str(p.caption) ?? "", takenAt,
      username: p.owner.username, fullName: str(p.owner.full_name), imageUrl: str(p.display_url) ?? str(p.thumbnail_src), isVideo: p.is_video === true,
      isAd: p.is_ad === true, isPaidPartnership: p.is_paid_partnership === true, likes: num(p.like_count), comments: num(p.comment_count),
    });
  }
  return { posts, next: null, receiptId };
}

/** A profile's posts, newest first (pinned posts may come first), a page at a time. */
export async function profilePosts(handle: string, next: string | null, opts: { subject: string; window: string }): Promise<Page> {
  const { json, receiptId } = await get("/v2/instagram/user/posts", { handle, ...(next ? { next_max_id: next } : {}) }, opts);
  const posts: IgPost[] = [];
  for (const p of json?.items ?? []) {
    const id = str(p?.pk) ?? str(String(p?.id ?? "").split("_")[0]);
    const takenAt = new Date(Number(p?.taken_at) * 1000);
    const user = p?.user ?? p?.owner;
    if (!id || !str(p?.code) || !Number.isFinite(takenAt.getTime())) continue;
    posts.push({
      id, shortcode: p.code, url: `https://www.instagram.com/p/${p.code}/`, caption: str(p.caption?.text) ?? "", takenAt,
      username: str(user?.username) ?? handle, fullName: str(user?.full_name), imageUrl: str(p.image_versions2?.candidates?.[0]?.url) ?? str(p.display_uri),
      isVideo: p.media_type === 2, isAd: false, isPaidPartnership: p.is_paid_partnership === true, likes: num(p.like_count), comments: num(p.comment_count),
    });
  }
  return { posts, next: json?.more_available === true ? str(json?.next_max_id) : null, receiptId };
}
