// The Instagram run against a local stand-in for ScrapeCreators. Failure cases: a post found by a hashtag and
// by its author's profile enters twice; a post already taken is paid for or processed again; an ad or a post
// without a caption reaches the prefilter; a profile is read page after page on every run; the run calls the
// service with its budget spent or with the valve off.
import "../../../tests/setup.ts";
import assert from "node:assert/strict";
import http from "node:http";
import { after, before, beforeEach, test } from "node:test";
import { config } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import { stopBoss } from "@aihot/backend/jobs/queue";
import server from "../server.ts";
import { collectInstagram } from "../backend/collect.ts";

const HASHTAG_SOURCE = "instagram-hashtags";
const PROFILE_SOURCE = "instagram-aspohns";
const hour = 3_600_000;
const t0 = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();
const unix = (ms: number) => Math.floor(ms / 1000);

const hits: Array<{ path: string; params: URLSearchParams; key: string | undefined }> = [];
let hashtagPosts: unknown[] = [];
let profilePages: Record<string, { items: unknown[]; next?: string }> = {};

const hashtagPost = (shortcode: string, at: number, extra: Record<string, unknown> = {}) => ({
  id: `id-${shortcode}`, shortcode, url: `https://www.instagram.com/p/${shortcode}/`, caption: `Subglottic stenosis repair ${shortcode}\nmore`, taken_at: iso(at),
  display_url: `https://cdn.example/${shortcode}.jpg`, is_video: false, is_ad: false, owner: { username: "someone", full_name: "Some One" }, ...extra,
});
const profileItem = (code: string, at: number) => ({
  pk: `pk-${code}`, code, taken_at: unix(at), caption: { text: `ASPO update ${code}` }, user: { username: "aspohns", full_name: "ASPO-HNS" },
  image_versions2: { candidates: [{ url: `https://cdn.example/${code}.jpg` }] }, media_type: 1,
});

const stub = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://stub");
  hits.push({ path: url.pathname, params: url.searchParams, key: req.headers["x-api-key"] as string | undefined });
  const send = (body: unknown) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
  if (url.pathname === "/v1/instagram/search/hashtag") {
    return send({ success: true, credits_charged: 1, posts: url.searchParams.get("hashtag") === "SubglotticStenosis" ? hashtagPosts : [] });
  }
  if (url.pathname === "/v2/instagram/user/posts") {
    const page = profilePages[url.searchParams.get("next_max_id") ?? "first"] ?? { items: [] };
    return send({ success: true, credits_charged: 1, items: page.items, more_available: !!page.next, next_max_id: page.next ?? null });
  }
  res.writeHead(500);
  res.end("unexpected");
});

const paths = (p: string) => hits.filter((h) => h.path === p);
const stored = () => sql<{ identity_key: string; source_id: string; title: string; revision: number; backfill: boolean }[]>`
  SELECT identity_key, source_id, title, revision, backfill FROM articles WHERE identity_key LIKE 'instagram:%' ORDER BY identity_key`;

before(async () => {
  await new Promise<void>((resolve) => stub.listen(0, "127.0.0.1", () => resolve()));
  config.allowPrivateNetworkFetch = true;
  process.env.SCRAPECREATORS_BASE_URL = `http://127.0.0.1:${(stub.address() as { port: number }).port}`;
  process.env.SCRAPECREATORS_API_KEY = "test-key";
  for (const id of [HASHTAG_SOURCE, PROFILE_SOURCE]) {
    await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, next_fetch_at)
      VALUES (${id}, ${id}, 'external', 'T2', 'editorial', '2100-01-01') ON CONFLICT (id) DO NOTHING`;
  }
});

beforeEach(async () => {
  hits.length = 0;
  await sql`UPDATE sources SET enabled = true WHERE id IN (${HASHTAG_SOURCE}, ${PROFILE_SOURCE})`;
});

after(async () => {
  await new Promise<void>((resolve) => stub.close(() => resolve()));
  await stopBoss();
  await closeDb();
});

test("the six-hour run is on only when both valves are true", () => {
  const [schedule] = server.schedules!;
  const saved = { collect: process.env.COLLECT_ENABLED, instagram: process.env.INSTAGRAM_COLLECT_ENABLED };
  try {
    process.env.COLLECT_ENABLED = "true";
    delete process.env.INSTAGRAM_COLLECT_ENABLED;
    assert.equal(schedule!.when!(), false);
    process.env.INSTAGRAM_COLLECT_ENABLED = "1";
    assert.equal(schedule!.when!(), false);
    process.env.INSTAGRAM_COLLECT_ENABLED = "true";
    assert.equal(schedule!.when!(), true);
    process.env.COLLECT_ENABLED = "false";
    assert.equal(schedule!.when!(), false);
  } finally {
    process.env.COLLECT_ENABLED = saved.collect;
    if (saved.instagram === undefined) delete process.env.INSTAGRAM_COLLECT_ENABLED;
    else process.env.INSTAGRAM_COLLECT_ENABLED = saved.instagram;
  }
});

test("each post enters once, ads and empty captions never; later runs take only new posts and read a profile only as far as the last run", async () => {
  hashtagPosts = [
    hashtagPost("HASH1", t0 - 3 * hour),
    hashtagPost("ADPOST", t0 - 2 * hour, { is_ad: true }),
    hashtagPost("NOCAPTION", t0 - 2 * hour, { caption: "" }),
    // The profile's own post, found by the hashtag too.
    hashtagPost("ASPO2", t0 - 4 * hour, { owner: { username: "aspohns", full_name: "ASPO-HNS" }, caption: "ASPO update ASPO2" }),
  ];
  profilePages = { first: { items: [profileItem("ASPO2", t0 - 4 * hour), profileItem("ASPO1", t0 - 30 * hour)], next: "older" }, older: { items: [profileItem("ASPO0", t0 - 90 * hour)] } };

  const first = await collectInstagram({ now: new Date(t0) });
  assert.deepEqual(first.failed, []);
  assert.equal(first.feeds, 21, "the 20 hashtags and the one profile whose source exists");
  assert.ok(hits.every((h) => h.key === "test-key"));
  assert.equal(paths("/v2/instagram/user/posts").length, 1, "a profile's first read is one page");
  assert.equal(paths("/v1/instagram/search/hashtag").find((h) => h.params.get("hashtag") === "SubglotticStenosis")!.params.get("date_posted"), "last-day");
  let rows = await stored();
  assert.deepEqual(rows.map((r) => r.identity_key), ["instagram:ASPO1", "instagram:ASPO2", "instagram:HASH1"]);
  assert.equal(rows.find((r) => r.identity_key === "instagram:HASH1")!.source_id, HASHTAG_SOURCE);
  assert.equal(rows.find((r) => r.identity_key === "instagram:HASH1")!.title, "Subglottic stenosis repair HASH1");
  assert.ok(rows.every((r) => r.backfill), "a feed's first read is archived like a new source's first import");
  const receipts = await sql<{ status: string }[]>`SELECT status FROM receipts WHERE service = 'scrapecreators'`;
  assert.equal(receipts.length, 21);
  assert.ok(receipts.every((r) => r.status === "completed"));
  const [budget] = await sql<{ per_minute: number }[]>`SELECT per_minute FROM budgets WHERE service = 'scrapecreators'`;
  assert.equal(budget?.per_minute, 40, "the run adds its budget row");
  // The runs below follow each other within the same minute.
  await sql`UPDATE budgets SET per_minute = 1000, per_hour = 1000 WHERE service = 'scrapecreators'`;

  // The same window again: the stored answers are reused, nothing is paid or stored twice.
  hits.length = 0;
  await collectInstagram({ now: new Date(t0) });
  assert.equal(hits.length, 0);

  // Six hours later: a new hashtag post, and a profile page made of new posts only, so the next page is read too.
  hashtagPosts = [...hashtagPosts, hashtagPost("HASH2", t0 + hour)];
  profilePages = {
    first: { items: [profileItem("ASPO4", t0 + 2 * hour), profileItem("ASPO3", t0 + hour)], next: "p2" },
    p2: { items: [profileItem("ASPO2", t0 - 4 * hour), profileItem("ASPO1", t0 - 30 * hour)], next: "older" },
    older: { items: [profileItem("ASPO0", t0 - 90 * hour)] },
  };
  hits.length = 0;
  const second = await collectInstagram({ now: new Date(t0 + 6 * hour) });
  assert.equal(second.created, 3);
  assert.deepEqual(paths("/v2/instagram/user/posts").map((h) => h.params.get("next_max_id")), [null, "p2"], "reads on until a page reaches the watermark, not further");
  rows = await stored();
  assert.deepEqual(rows.map((r) => r.identity_key), ["instagram:ASPO1", "instagram:ASPO2", "instagram:ASPO3", "instagram:ASPO4", "instagram:HASH1", "instagram:HASH2"]);
  assert.ok(rows.every((r) => r.revision === 1), "posts already taken are not revised or processed again");
  assert.equal(rows.find((r) => r.identity_key === "instagram:HASH2")!.backfill, false);
});

test("a paused source's feeds are not read, and a spent budget stops the run before any call", async () => {
  await sql`UPDATE sources SET enabled = false WHERE id = ${HASHTAG_SOURCE}`;
  profilePages = { first: { items: [] } };
  const paused = await collectInstagram({ now: new Date(t0 + 12 * hour) });
  assert.equal(paused.feeds, 1);
  assert.deepEqual(hits.map((h) => h.path), ["/v2/instagram/user/posts"]);

  hits.length = 0;
  await sql`UPDATE budgets SET per_day = 0 WHERE service = 'scrapecreators'`;
  try {
    const spent = await collectInstagram({ now: new Date(t0 + 18 * hour) });
    assert.equal(hits.length, 0);
    assert.equal((spent.failed as unknown[]).length, 1, "the first refusal stops the run");
  } finally {
    await sql`UPDATE budgets SET per_day = 200 WHERE service = 'scrapecreators'`;
  }
});
