// The Instagram run: each hashtag and each followed profile of industry/instagram.json, read through
// ScrapeCreators. A post enters once, as material of the feed's source (identity: its shortcode, the id
// in every address of the post), and then goes the way of any material: prefilter, scores, selection,
// grouping. Each feed keeps the newest post it has seen (instagram_feeds), so a run reads a profile only
// as far back as the last one did and never takes an old post again.
import { readFileSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "@aihot/backend/config";
import { sql } from "@aihot/backend/db";
import { STALE_ON_DISCOVERY_MS, upsertMaterial } from "@aihot/backend/content/materials";
import { queueProcessing } from "@aihot/backend/jobs/content";
import { BudgetExceededError, completeReceipt } from "@aihot/backend/providers/receipts";
import { profilePosts, searchHashtag, SERVICE, type IgPost } from "./scrapecreators.ts";

interface Settings {
  hashtagSource: string;
  hashtags: string[];
  profiles: Array<{ handle: string; sourceId: string }>;
}

export function settings(): Settings {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "industry/instagram.json"), "utf8")) as Settings;
}

/** Pages of a profile read per run when every post on the page is new (a long pause, a busy account). */
export const MAX_PROFILE_PAGES = 3;

/**
 * The paid calls' circuit breaker. A run makes one call per hashtag and one to three per profile, all
 * within a minute or two; these limits leave room for a missed run caught up within the hour. Online
 * migrations cannot insert rows, so the run adds the row the first time; the admin tunes it in
 * Configurações, and a zero stops the service.
 */
async function ensureBudget(): Promise<void> {
  await sql`INSERT INTO budgets (service, per_minute, per_hour, per_day, note)
    VALUES (${SERVICE}, 40, 80, 200, 'Instagram pela ScrapeCreators (cobrado por requisição)') ON CONFLICT (service) DO NOTHING`;
}

interface Feed {
  key: string;
  sourceId: string;
  read: (window: string) => Promise<{ posts: IgPost[]; receiptIds: number[] }>;
}

/** Six-hour receipt window: a run retried within it reuses the answers it paid for. */
function windowKey(now: Date): string {
  return new Date(Math.floor(now.getTime() / 21_600_000) * 21_600_000).toISOString();
}

function profileFeed(handle: string, sourceId: string, newest: Date | null): Feed {
  return {
    key: `profile:${handle.toLowerCase()}`,
    sourceId,
    read: async (window) => {
      const posts: IgPost[] = [];
      const receiptIds: number[] = [];
      let next: string | null = null;
      for (let page = 0; page < MAX_PROFILE_PAGES; page++) {
        const res = await profilePosts(handle, next, { subject: `source:${sourceId}`, window });
        posts.push(...res.posts);
        receiptIds.push(res.receiptId);
        // A first read takes one page; later ones go on while the whole page is newer than the watermark.
        if (!newest || !res.next || res.posts.some((p) => p.takenAt <= newest)) break;
        next = res.next;
      }
      return { posts, receiptIds };
    },
  };
}

function hashtagFeed(tag: string, sourceId: string): Feed {
  return {
    key: `hashtag:${tag.toLowerCase()}`,
    sourceId,
    read: async (window) => {
      const res = await searchHashtag(tag, { subject: `source:${sourceId}`, window });
      return { posts: res.posts, receiptIds: [res.receiptId] };
    },
  };
}

function title(caption: string): string {
  const first = caption.split("\n").find((l) => l.trim())?.trim() ?? caption.trim();
  return first.length > 140 ? `${first.slice(0, 137)}...` : first;
}

/**
 * One feed: its new posts stored and queued, its watermark moved and its receipts completed together, so
 * a failure leaves the feed to read again (the receipts make that free within the window).
 */
export async function takeFeed(feed: Feed, now = new Date()): Promise<{ read: number; created: number }> {
  const [state] = await sql<{ newest_at: Date }[]>`SELECT newest_at FROM instagram_feeds WHERE feed = ${feed.key}`;
  const { posts, receiptIds } = await feed.read(windowKey(now));
  const floor = state ? new Date(state.newest_at.getTime() - STALE_ON_DISCOVERY_MS) : null;
  const unique = new Map<string, IgPost>();
  for (const p of posts) {
    // An ad has nothing to say; a post without a caption gives the prefilter nothing to read.
    if (p.isAd || !p.caption.trim() || (floor && p.takenAt <= floor)) continue;
    unique.set(`instagram:${p.shortcode}`, p);
  }
  const known = new Set((await sql<{ identity_key: string }[]>`
    SELECT identity_key FROM articles WHERE identity_key = ANY(${[...unique.keys()]}::text[])`).map((r) => r.identity_key));
  const newest = posts.reduce<Date | null>((m, p) => (!m || p.takenAt > m ? p.takenAt : m), state?.newest_at ?? null);
  let created = 0;
  await sql.begin(async (tx) => {
    for (const [identityKey, p] of unique) {
      if (known.has(identityKey)) continue;
      const res = await upsertMaterial({
        sourceId: feed.sourceId, url: p.url, identityKey, title: title(p.caption), author: p.fullName ? `${p.fullName} (@${p.username})` : `@${p.username}`,
        publishedAt: p.takenAt, bodyText: p.caption.trim(), bodyStatus: "ok", media: p.imageUrl ? [{ kind: "image", url: p.imageUrl }] : [],
        raw: { instagram: { id: p.id, shortcode: p.shortcode, username: p.username, feed: feed.key, video: p.isVideo, paidPartnership: p.isPaidPartnership, likes: p.likes, comments: p.comments } },
        via: "instagram",
        // A feed's first read brings what was already there: archived by its date, like a new source's first import.
        backfill: state ? null : "first-import",
      }, tx);
      if (res.created) created += 1;
      if (res.created || res.revised || res.processingNeeded) await queueProcessing(res.articleId, { db: tx });
    }
    if (newest) {
      await tx`INSERT INTO instagram_feeds (feed, newest_at) VALUES (${feed.key}, ${newest})
        ON CONFLICT (feed) DO UPDATE SET newest_at = GREATEST(instagram_feeds.newest_at, EXCLUDED.newest_at), updated_at = now()`;
    }
    for (const id of receiptIds) await completeReceipt(tx, id);
  });
  return { read: posts.length, created };
}

/** Every feed whose source is on; a spent budget stops the run, other failures only their feed. */
export async function collectInstagram(opts: { now?: Date } = {}): Promise<Record<string, unknown>> {
  const s = settings();
  await ensureBudget();
  const sourceIds = [s.hashtagSource, ...s.profiles.map((p) => p.sourceId)];
  const enabled = new Set((await sql<{ id: string }[]>`SELECT id FROM sources WHERE id = ANY(${sourceIds}::text[]) AND enabled`).map((r) => r.id));
  const watermarks = new Map((await sql<{ feed: string; newest_at: Date }[]>`SELECT feed, newest_at FROM instagram_feeds`).map((r) => [r.feed, r.newest_at]));
  const feeds = [
    ...s.hashtags.map((tag) => hashtagFeed(tag, s.hashtagSource)),
    ...s.profiles.map((p) => profileFeed(p.handle, p.sourceId, watermarks.get(`profile:${p.handle.toLowerCase()}`) ?? null)),
  ].filter((f) => enabled.has(f.sourceId));
  const ok = new Set<string>();
  const failed: Array<{ feed: string; error: string }> = [];
  let read = 0;
  let created = 0;
  for (const feed of feeds) {
    try {
      const res = await takeFeed(feed, opts.now);
      read += res.read;
      created += res.created;
      ok.add(feed.sourceId);
    } catch (error) {
      failed.push({ feed: feed.key, error: String((error as Error).message).slice(0, 300) });
      console.error(`instagram: ${feed.key}: ${(error as Error).message}`);
      if (error instanceof BudgetExceededError) break;
    }
  }
  // Like the ingest API: the sources report in, so their health shows the run, not a missing fetch.
  if (ok.size) await sql`UPDATE sources SET last_fetch_at = now(), last_ok_at = now() WHERE id = ANY(${[...ok]}::text[])`;
  return { feeds: feeds.length, read, created, failed };
}
