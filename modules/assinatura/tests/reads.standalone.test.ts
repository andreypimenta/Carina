// Telling a scanner's clicks from a person's, the signed links of the e-mail, Resend's webhook signature and the
// reader's section first. Failure cases: a mail gateway's checks count as readers; a person's click is thrown
// away; a scanner that follows every link leaves its first clicks counted (or its answer to the case); a link
// can be made to redirect anywhere; the leave link is counted (or broken); an unsigned webhook is believed.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { config } from "@aihot/backend/config";
import { orderSections } from "../interest.ts";
import { afterClick, BURST_CLICKS, readLink, scannerReason, trackedUrl, trackLinks, webhookSigned } from "../backend/reads.ts";

config.siteUrl = "https://folego.example";
const SENT = new Date("2026-10-26T10:00:00Z");
const at = (seconds: number) => new Date(SENT.getTime() + seconds * 1000);
const PHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const person = { method: "GET", userAgent: PHONE, ip: "189.40.10.20", purpose: "", sentAt: SENT, now: at(3600) };

test("a person's click counts; HEAD, prefetch, robots' browsers, mail-gateway ranges and clicks on arrival do not", () => {
  assert.equal(scannerReason(person), null);
  assert.equal(scannerReason({ ...person, method: "HEAD" }), "head");
  assert.equal(scannerReason({ ...person, purpose: "prefetch" }), "prefetch");
  assert.equal(scannerReason({ ...person, userAgent: "" }), "agent");
  assert.equal(scannerReason({ ...person, userAgent: "python-requests/2.31" }), "agent");
  assert.equal(scannerReason({ ...person, userAgent: "Mozilla/5.0 (compatible; Barracuda Sentinel)" }), "agent");
  assert.equal(scannerReason({ ...person, ip: "40.107.12.7" }), "range", "Microsoft's mail protection");
  assert.equal(scannerReason({ ...person, ip: "::ffff:148.163.150.2" }), "range", "Proofpoint, written as IPv6");
  assert.equal(scannerReason({ ...person, ip: "2804:14c::1" }), null, "an IPv6 reader is a reader");
  assert.equal(scannerReason({ ...person, now: at(5) }), "early");
  assert.equal(scannerReason({ ...person, now: at(45) }), null);
});

test("a run of clicks over every link becomes the scanner's, with the answer it made; a person's earlier click stays", () => {
  const empty: Parameters<typeof afterClick>[0] = { clicks: 0, bot_clicks: 0, first_click_at: null, answered_at: null, indique_at: null, burst_at: null, burst_clicks: 0 };
  let s = afterClick(empty, "l", false, at(100));
  assert.equal(s.clicks, 1);
  s = afterClick(s, "l", true, at(200));
  assert.deepEqual([s.clicks, s.bot_clicks], [1, 1], "a machine's click is counted apart");
  // A minute later, a burst: the first clicks look like a person's until it reaches every link.
  for (let i = 0; i < BURST_CLICKS - 1; i++) s = afterClick(s, i === 1 ? "r" : "l", false, at(300 + i));
  assert.equal(s.clicks, BURST_CLICKS);
  assert.ok(s.answered_at);
  s = afterClick(s, "l", false, at(300 + BURST_CLICKS));
  assert.deepEqual([s.clicks, s.bot_clicks], [1, 1 + BURST_CLICKS]);
  assert.equal(s.answered_at, null, "the scanner's answer is not the reader's");
  assert.deepEqual(s.first_click_at, at(100));
  s = afterClick(s, "l", false, at(300 + BURST_CLICKS + 1));
  assert.deepEqual([s.clicks, s.bot_clicks], [1, 2 + BURST_CLICKS]);
  s = afterClick(s, "i", false, at(1000));
  assert.deepEqual([s.clicks, !!s.indique_at], [2, true], "a click after the burst is a person's again");
  const burstOnly = Array.from({ length: BURST_CLICKS }).reduce<typeof empty>((st, _, i) => afterClick(st, "l", false, at(50 + i)), empty);
  assert.deepEqual([burstOnly.clicks, burstOnly.first_click_at], [0, null]);
});

test("the e-mail's links go through the site, signed; the links that act on the address stay", () => {
  const leave = "https://folego.example/assine/sair?t=abcdefghijklmnop";
  const prefs = "https://folego.example/assine/preferencias?t=abcdefghijklmnop";
  const html = `<a href="https://folego.example/items/1" style="x">Matéria</a> <a href="https://pubmed.example/1?a=1&amp;b=2">Original ↗</a>
<a data-answer href="https://folego.example/assine/2026-W43?resposta=B#caso">B</a> <a href="https://folego.example/assine?g=indique">indique</a>
<a href="mailto:?subject=x">e-mail</a> <a href="${prefs}">prefs</a> <a href="${leave}">sair</a>`;
  const out = trackLinks(html, 42, "https://folego.example/assine?g=indique");
  const hrefs = [...out.matchAll(/href="([^"]*)"/g)].map((m) => m[1]!.replace(/&amp;/g, "&"));
  const read = (href: string) => readLink(Object.fromEntries(new URL(href).searchParams));
  assert.deepEqual(read(hrefs[0]!), { send: 42, kind: "l", url: "https://folego.example/items/1" });
  assert.deepEqual(read(hrefs[1]!), { send: 42, kind: "l", url: "https://pubmed.example/1?a=1&b=2" }, "the original's own query survives");
  assert.equal(read(hrefs[2]!)?.kind, "r");
  assert.equal(read(hrefs[3]!)?.kind, "i");
  assert.deepEqual(hrefs.slice(4), ["mailto:?subject=x", prefs, leave]);
  assert.match(out, /style="x"/);

  const signed = Object.fromEntries(new URL(trackedUrl(7, "l", "https://pubmed.example/1")).searchParams);
  assert.equal(readLink({ ...signed, u: "https://evil.example/" }), null, "no other address");
  assert.equal(readLink({ ...signed, s: "8" }), null, "no other send");
  assert.equal(readLink({ ...signed, k: "r" }), null, "no other kind");
  assert.equal(readLink({ ...signed, u: "javascript:alert(1)" }), null);
});

test("Resend's webhook is believed only with its Svix signature, in the last five minutes", () => {
  const secret = `whsec_${Buffer.from("segredo-de-teste-123").toString("base64")}`;
  const body = JSON.stringify({ type: "email.complained", data: { email_id: "mail-1" } });
  const now = Date.parse("2026-10-26T12:00:00Z");
  const ts = String(now / 1000);
  const sig = createHmac("sha256", Buffer.from("segredo-de-teste-123")).update(`msg_1.${ts}.${body}`).digest("base64");
  const headers = { "svix-id": "msg_1", "svix-timestamp": ts, "svix-signature": `v1,bad v1,${sig}` };
  assert.equal(webhookSigned(secret, headers, body, now), true);
  assert.equal(webhookSigned(secret, headers, body.replace("mail-1", "mail-2"), now), false);
  assert.equal(webhookSigned(secret, headers, body, now + 600_000), false, "an old call replayed");
  assert.equal(webhookSigned(secret, { ...headers, "svix-signature": "" }, body, now), false);
});

test("the reader's section comes first; both keeps the journal's order", () => {
  const sections = [{ label: "Cirurgia torácica pediátrica e via aérea" }, { label: "Pneumologia pediátrica" }];
  assert.deepEqual(orderSections(sections, "pneumologia").map((s) => s.label), ["Pneumologia pediátrica", "Cirurgia torácica pediátrica e via aérea"]);
  assert.deepEqual(orderSections(sections, "cirurgia"), sections);
  assert.deepEqual(orderSections(sections, null), sections);
  assert.deepEqual(orderSections(sections, "other"), sections);
});
