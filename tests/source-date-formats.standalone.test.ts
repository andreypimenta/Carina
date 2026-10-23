// Dates as Portuguese, Spanish and English pages write them, and numeric dates with the year last. A day and a
// month that could be read either way are no date unless the source declares its order (publishedAtDateOrder).
import assert from "node:assert/strict";
import http from "node:http";
import { after, test } from "node:test";
import { config } from "@aihot/backend/config";
import { unsupportedConfig } from "@aihot/backend/sources/config-keys";
import { parseLooseDate } from "@aihot/backend/sources/dates";
import { fetchJsonList } from "@aihot/backend/sources/json-list";
import { fetchDetail, fromHtml } from "@aihot/backend/sources/web-list";

const iso = (v: string, offset?: string, order?: "dmy" | "mdy") => parseLooseDate(v, offset, order)?.toISOString() ?? null;

test("written months in Portuguese, Spanish and English are read in the source's offset", () => {
  assert.equal(iso("3 de outubro de 2026"), "2026-10-03T03:00:00.000Z");
  assert.equal(iso("1º de março de 2026", "+00:00"), "2026-03-01T00:00:00.000Z");
  assert.equal(iso("30 de mayo de 2026", "-05:00"), "2026-05-30T05:00:00.000Z");
  assert.equal(iso("12 de diciembre del 2026", "+00:00"), "2026-12-12T00:00:00.000Z");
  assert.equal(iso("3 set. 2026", "+00:00"), "2026-09-03T00:00:00.000Z");
  assert.equal(iso("23-Oct-2026", "+00:00"), "2026-10-23T00:00:00.000Z");
});

test("the words around a written date do not hide it, and a time right after it is kept", () => {
  assert.equal(iso("segunda-feira, 13 de março de 2026 às 10h", "+00:00"), "2026-03-13T00:00:00.000Z");
  assert.equal(iso("13 de marzo de 2026, 14:30", "-05:00"), "2026-03-13T19:30:00.000Z");
  assert.equal(iso("Published 26 Sep 2026 · 4 min read", "+00:00"), "2026-09-26T00:00:00.000Z");
  assert.equal(iso("8 March 2026 02:30:45", "+08:00"), "2026-03-07T18:30:45.000Z");
  assert.equal(iso("Sat, 26 Sep 2026 10:00:00 +0200", "-07:00"), "2026-09-26T08:00:00.000Z");
});

test("a numeric date with the year last is read when a number above 12 says which is the day", () => {
  assert.equal(iso("18/09/2026"), "2026-09-18T03:00:00.000Z");
  assert.equal(iso("10/21/2026"), "2026-10-21T03:00:00.000Z");
  assert.equal(iso("04.23.2026", "+00:00"), "2026-04-23T00:00:00.000Z");
  assert.equal(iso("18-09-2026 10:00", "+00:00"), "2026-09-18T10:00:00.000Z");
  assert.equal(iso("18/09/2026 10:00 GMT", "+08:00"), "2026-09-18T10:00:00.000Z");
});

test("an ambiguous day and month, or a two-digit year, needs the source's declared order", () => {
  assert.equal(iso("05/10/2026"), null);
  assert.equal(iso("05/10/2026", "+00:00", "dmy"), "2026-10-05T00:00:00.000Z");
  assert.equal(iso("05/10/2026", "+00:00", "mdy"), "2026-05-10T00:00:00.000Z");
  assert.equal(iso("Released on 10.08.2026", "+00:00"), null);
  assert.equal(iso("Released on 10.08.2026", "+00:00", "dmy"), "2026-08-10T00:00:00.000Z");
  assert.equal(iso("24/09/26", "+00:00"), null);
  assert.equal(iso("24/09/26", "+00:00", "dmy"), "2026-09-24T00:00:00.000Z");
});

test("impossible days, a wrong declared order and version-like numbers are no date", () => {
  for (const [value, order] of [["31/02/2026", "dmy"], ["13/13/2026", undefined], ["18/09/2026", "mdy"], ["Version 1.2.2026", undefined], ["31 de fevereiro de 2026", undefined]] as const) {
    assert.equal(iso(value, "+00:00", order), null, value);
  }
  assert.equal(iso("2026-09-26"), "2026-09-26T00:00:00.000Z");
});

test("the declared order is a config key of listings and detail rules, with only two values", () => {
  assert.deepEqual(unsupportedConfig("web_list", { publishedAtDateOrder: "dmy", detail: { publishedAtDateOrder: "mdy" } }), []);
  assert.deepEqual(unsupportedConfig("json_list", { publishedAtDateOrder: "mdy" }), []);
  assert.deepEqual(unsupportedConfig("web_list", { publishedAtDateOrder: "ymd" }), ["publishedAtDateOrder=ymd"]);
  assert.deepEqual(unsupportedConfig("web_list", { detail: { publishedAtDateOrder: "day-first" } }), ["detail.publishedAtDateOrder=day-first"]);
  assert.deepEqual(unsupportedConfig("rss", { publishedAtDateOrder: "dmy" }), ["publishedAtDateOrder"]);
});

const page = `<html><body><ul id="news">` +
  `<li><a href="/news/one">First</a><span class="d">05/10/2026</span></li>` +
  `<li><a href="/news/two">Second</a><span class="d">18/09/2026</span></li></ul>` +
  `<article><h1>One</h1><p class="byline">Publicado em 05/10/2026</p></article></body></html>`;
const json = JSON.stringify({ data: [{ id: "a", title: "Trial A", decided: "05/10/2026" }, { id: "b", title: "Trial B", decided: "31/08/2026" }] });
const server = http.createServer((req, res) => {
  res.setHeader("content-type", req.url === "/trials.json" ? "application/json" : "text/html");
  res.end(req.url === "/trials.json" ? json : page);
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
const previousPrivateFetch = config.allowPrivateNetworkFetch;
config.allowPrivateNetworkFetch = true;
after(async () => {
  config.allowPrivateNetworkFetch = previousPrivateFetch;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test("a listing, its detail pages and a JSON list read day-first dates when the source declares them", async () => {
  const listing = (extra: Record<string, unknown>) => fromHtml(page, base, { config: { url: base, itemSelector: "#news li", publishedAtSelector: ".d", publishedAtUtcOffset: "+00:00", ...extra } } as never)
    .map((item) => item.publishedAt?.toISOString() ?? null);
  assert.deepEqual(listing({}), [null, "2026-09-18T00:00:00.000Z"]);
  assert.deepEqual(listing({ publishedAtDateOrder: "dmy" }), ["2026-10-05T00:00:00.000Z", "2026-09-18T00:00:00.000Z"]);

  const detail = await fetchDetail(base + "/news/one", { config: { publishedAtDateOrder: "dmy", detail: { publishedAtSelector: ".byline", publishedAtUtcOffset: "+00:00" } } } as never, { date: true, title: false, summary: false });
  assert.equal(detail.publishedAt?.toISOString(), "2026-10-05T00:00:00.000Z");

  const trials = await fetchJsonList({ id: "test-json", config: { url: `${base}/trials.json`, itemsPath: "data", titlePaths: ["title"], urlTemplate: "https://example.org/t/{id}", publishedAtPath: "decided", publishedAtUtcOffset: "+01:00", publishedAtDateOrder: "dmy" } } as never);
  assert.deepEqual(trials.map((item) => item.publishedAt?.toISOString()), ["2026-10-04T23:00:00.000Z", "2026-08-30T23:00:00.000Z"]);
});
