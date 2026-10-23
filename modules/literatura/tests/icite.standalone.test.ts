// The iCite lookup against a local stand-in. Failure case: a slow iCite, answering each batch within its own
// time, holds the writing far longer than the whole lookup is allowed, instead of counting as out.
import "../../../tests/setup.ts";
import assert from "node:assert/strict";
import http from "node:http";
import { after, test } from "node:test";
import { config } from "@aihot/backend/config";
import { influence } from "../backend/icite.ts";

let requests = 0;
const stub = http.createServer((req, res) => {
  requests++;
  const ids = new URL(req.url ?? "/", "http://stub").searchParams.get("pmids")!.split(",");
  setTimeout(() => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ data: ids.map((id) => ({ pmid: Number(id), year: 2000, citation_count: 1 })) }));
  }, 150);
});
await new Promise<void>((resolve) => stub.listen(0, "127.0.0.1", () => resolve()));
const savedPrivate = config.allowPrivateNetworkFetch;
config.allowPrivateNetworkFetch = true;
process.env.ICITE_BASE_URL = `http://127.0.0.1:${(stub.address() as { port: number }).port}`;
after(async () => {
  config.allowPrivateNetworkFetch = savedPrivate;
  stub.closeAllConnections();
  await new Promise<void>((resolve) => stub.close(() => resolve()));
});

const pmids = Array.from({ length: 1500 }, (_, i) => String(1000 + i));

test("a lookup within its deadline reads every batch", async () => {
  requests = 0;
  const known = await influence(pmids, 10_000);
  assert.equal(known.size, 1500);
  assert.equal(requests, 5);
});

test("a slow iCite counts as out once the whole lookup passes its deadline, however quick each batch", async () => {
  requests = 0;
  const started = Date.now();
  await assert.rejects(influence(pmids, 400));
  assert.ok(Date.now() - started < 1000, "the lookup stops at its deadline");
  assert.ok(requests < 5, "the remaining batches are not asked");
});
