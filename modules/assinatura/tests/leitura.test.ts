// How readers take the e-mailed edition, end to end against a local stand-in for Resend: the section each reader
// chose comes first, the links go through the site and come back to their destinations, scanners' clicks are
// filtered out, leaving and complaints are put down to the edition, and the counts survive the erasure of the
// addresses. Failure cases: a scanner counts as a reader; a reader's choice is ignored or changed by a stranger;
// an unsigned webhook takes someone off the list; erasing those who left changes an old edition's rates or makes
// retention look better than it was.
import { tag } from "../../../tests/setup.ts";
import assert from "node:assert/strict";
import http from "node:http";
import { createHmac, randomBytes } from "node:crypto";
import { after, before, test } from "node:test";
import { config } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { installModules } from "@aihot/backend/modules";
import { AREA_LABELS } from "@aihot/contracts/taxonomy";
import { buildApp } from "../../../apps/api/src/app.ts";
import server from "../server.ts";
import { readingOverview } from "../backend/admin.ts";
import { runSends } from "../backend/send.ts";
import { expireSubscribers } from "../backend/subscribers.ts";

const T = tag();
const WEEK = "2026-W43";
const MONDAY = new Date("2026-10-26T12:00:00Z");
const PHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const SECRET = "segredo-do-webhook-resend";

const mails: Array<{ to: string; html: string; text: string }> = [];
const stub = http.createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (c: Buffer) => chunks.push(c));
  req.on("end", () => {
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    mails.push({ to: body.to?.[0], html: body.html, text: body.text });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ id: `mail-${T}-${mails.length}` }));
  });
});

let app: Awaited<ReturnType<typeof buildApp>>;

before(async () => {
  await new Promise<void>((resolve) => stub.listen(0, "127.0.0.1", () => resolve()));
  Object.assign(process.env, {
    NEWSLETTER_EMAIL_ENABLED: "true", RESEND_API_KEY: "test-resend-key", NEWSLETTER_FROM: "O Fôlego <edicao@example.com>",
    RESEND_BASE_URL: `http://127.0.0.1:${(stub.address() as { port: number }).port}`, NEWSLETTER_WHATSAPP_ENABLED: "false",
    RESEND_WEBHOOK_SECRET: `whsec_${Buffer.from(SECRET).toString("base64")}`,
  });
  config.siteUrl = "https://folego.example";
  installModules([server]);
  app = await buildApp();
  const story = (title: string, url: string) => ({ title, summary: "Resumo.", sourceName: "PubMed", sourceUrl: url });
  const content = {
    kind: "weekly", title: `O Fôlego · ${WEEK}`, headline: "Edição", overview: "Uma semana.",
    themes: [
      { heading: AREA_LABELS.cirurgia, summary: null, storyRefs: [story("Estenose subglótica em prematuros", "https://pubmed.example/1")] },
      { heading: AREA_LABELS.pneumologia, summary: null, storyRefs: [story("Fibrose cística e novos moduladores", "https://pubmed.example/2")] },
    ],
  };
  await sql`INSERT INTO reports (kind, key, window_start, window_end, content, generated_at, origin) VALUES ('weekly', ${WEEK}, now(), now(), ${sql.json(content as never)}, now(), 'imported')`;
});

after(async () => {
  await app.close();
  await new Promise((resolve) => stub.close(resolve));
  await stopBoss();
  await closeDb();
});

async function add(name: string, interest: string | null) {
  const [row] = await sql<{ id: number; token: string }[]>`INSERT INTO assinatura_subscribers (channel, address, status, token, consent, consent_at, confirm_sent_at, confirmed_at, interest)
    VALUES ('email', ${`${name}-${T}@example.com`}, 'confirmed', ${randomBytes(18).toString("base64url")}, 'test', now(), now(), now() - interval '70 days', ${interest}) RETURNING id, token`;
  return { ...row!, address: `${name}-${T}@example.com` };
}

const sendOf = async (id: number) => (await sql<{ id: number }[]>`SELECT id FROM assinatura_sends WHERE subscriber_id = ${id}`)[0]!.id;
const read = async (id: number) => (await sql`SELECT r.* FROM assinatura_reads r JOIN assinatura_sends s ON s.id = r.send_id WHERE s.subscriber_id = ${id}`)[0];
const click = (href: string, headers: Record<string, string> = { "user-agent": PHONE, "x-real-ip": "189.40.10.20" }, method: "GET" | "HEAD" = "GET") =>
  app.inject({ method, url: href.replace(/&amp;/g, "&").replace("https://folego.example", ""), headers });
const linksIn = (html: string) => [...html.matchAll(/href="(https:\/\/folego\.example\/assine\/l\?[^"]*)"/g)].map((m) => m[1]!);

test("the chosen section comes first; clicks of people count, scanners' do not; leaving and complaints go to the edition and outlive the erasure", async () => {
  // The choice at sign-up, and a stranger's new sign-up does not change a confirmed reader's.
  const signup = (email: string, interest: unknown) => app.inject({ method: "POST", url: "/api/assinatura", payload: { email, consent: true, interest }, headers: { "x-real-ip": "10.9.0.1", "user-agent": "test" } });
  assert.equal((await signup(`nova-${T}@example.com`, "pneumologia")).statusCode, 202);
  assert.equal((await sql`SELECT interest FROM assinatura_subscribers WHERE address = ${`nova-${T}@example.com`}`)[0]!.interest, "pneumologia");
  await signup(`nova-${T}@example.com`, "qualquer");
  assert.equal((await sql`SELECT interest FROM assinatura_subscribers WHERE address = ${`nova-${T}@example.com`}`)[0]!.interest, null, "anything else is both");
  await sql`DELETE FROM assinatura_subscribers WHERE address = ${`nova-${T}@example.com`}`;

  const ana = await add("ana", "pneumologia");
  const bia = await add("bia", null);
  const caio = await add("caio", null);
  const davi = await add("davi", null);
  await sql`UPDATE assinatura_subscribers SET confirmed_at = now() WHERE id = ${davi.id}`;
  await signup(ana.address, "cirurgia");
  assert.equal((await sql`SELECT interest FROM assinatura_subscribers WHERE id = ${ana.id}`)[0]!.interest, "pneumologia", "a confirmed reader's choice is changed only by its own link");

  await runSends({ wait: async () => {}, now: MONDAY });
  const mailOf = (who: { address: string }) => mails.find((m) => m.to === who.address)!;
  const order = (html: string) => html.indexOf(AREA_LABELS.pneumologia) < html.indexOf(AREA_LABELS.cirurgia);
  assert.equal(order(mailOf(ana).html), true, "Ana reads pneumologia first");
  assert.equal(order(mailOf(bia).html), false, "both keeps the journal's order");
  assert.ok(mailOf(ana).text.indexOf(AREA_LABELS.pneumologia.toUpperCase()) < mailOf(ana).text.indexOf(AREA_LABELS.cirurgia.toUpperCase()));
  assert.ok(!/href="https:\/\/pubmed\.example/.test(mailOf(ana).html), "no link goes straight out");
  assert.match(mailOf(ana).html, new RegExp(`href="https://folego.example/assine/sair\\?t=${ana.token}"`), "the way out is not counted");
  assert.match(mailOf(ana).html, new RegExp(`/assine/preferencias\\?t=${ana.token}`));
  await sql`UPDATE assinatura_sends SET sent_at = now() - interval '1 hour'`;

  // Ana clicks a story and the "Indique" link; the redirect goes where the link said.
  const anaLinks = linksIn(mailOf(ana).html);
  const toOriginal = anaLinks.find((l) => decodeURIComponent(l).includes("pubmed.example/2"))!;
  const first = await click(toOriginal);
  assert.equal(first.statusCode, 302);
  assert.equal(first.headers.location, "https://pubmed.example/2");
  await click(anaLinks.find((l) => decodeURIComponent(l).includes("g=indique"))!);
  assert.equal((await click(toOriginal.replace("pubmed.example%2F2", "evil.example%2F2"))).statusCode, 404, "a changed link redirects nowhere");
  // Bia's provider checks the link with HEAD; Caio's scanner opens every link at once; Davi's is a robot.
  await click(linksIn(mailOf(bia).html)[0]!, { "user-agent": PHONE }, "HEAD");
  for (const l of linksIn(mailOf(caio).html).slice(0, 6)) await click(l);
  await click(linksIn(mailOf(davi).html)[0]!, { "user-agent": "Mozilla/5.0 (compatible; Proofpoint URL Defense)" });
  assert.deepEqual([(await read(ana.id))!.clicks, !!(await read(ana.id))!.indique_at], [2, true]);
  assert.deepEqual([(await read(bia.id))!.clicks, (await read(bia.id))!.bot_clicks], [0, 1]);
  assert.deepEqual([(await read(caio.id))!.clicks, (await read(caio.id))!.bot_clicks], [0, 6]);
  assert.equal((await read(davi.id))!.clicks, 0);

  // Bia leaves by her link; Davi complains to his provider (Resend's webhook, signed).
  assert.equal((await app.inject({ method: "POST", url: "/api/assinatura/sair", payload: { t: bia.token } })).statusCode, 200);
  assert.ok((await read(bia.id))!.left_at, "leaving is put down to the last edition sent");
  const body = JSON.stringify({ type: "email.complained", data: { email_id: (await sql`SELECT response FROM assinatura_sends WHERE id = ${await sendOf(davi.id)}`)[0]!.response } });
  const ts = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", Buffer.from(SECRET)).update(`msg_${T}.${ts}.${body}`).digest("base64");
  const hook = (sig: string) => app.inject({ method: "POST", url: "/api/assinatura/resend", payload: body, headers: { "content-type": "application/json", "svix-id": `msg_${T}`, "svix-timestamp": ts, "svix-signature": `v1,${sig}` } });
  assert.equal((await hook("bad")).statusCode, 403);
  assert.equal((await sql`SELECT status FROM assinatura_subscribers WHERE id = ${davi.id}`)[0]!.status, "confirmed", "an unsigned call changes nothing");
  assert.equal((await hook(signature)).json().result, "complained");
  assert.deepEqual({ ...(await sql`SELECT status, left_by FROM assinatura_subscribers WHERE id = ${davi.id}`)[0] }, { status: "unsubscribed", left_by: "complaint" });

  // The share buttons count clicks only.
  for (const button of ["whatsapp", "whatsapp", "indique", "nada"]) await app.inject({ method: "POST", url: "/api/assinatura/botao", payload: { button }, headers: { "x-real-ip": "10.9.0.2", "user-agent": "test" } });

  const expected = { edition_key: WEEK, caso: false, delivered: 4, clicked: 1, scanned: 3, answered: 0, indique: 1, left_after: 2, complained: 1 };
  let reading = await readingOverview();
  assert.deepEqual({ ...reading.editions[0] }, expected);
  assert.deepEqual([...reading.buttons], [{ button: "indique", clicks: 1 }, { button: "whatsapp", clicks: 2 }]);
  assert.deepEqual({ ...reading.recurring }, { readers: 0, eligible: 0, editions: 1 });
  assert.deepEqual(reading.interests.map((i) => [i.interest, i.confirmed, i.clicked]), [[null, 1, 0], ["pneumologia", 1, 1]]);
  assert.equal(reading.resendWebhook, true);

  // Bia left 31 days ago, 39 days after confirming: erased, her edition's counts and her short stay remain.
  await sql`UPDATE assinatura_subscribers SET unsubscribed_at = now() - interval '31 days' WHERE id = ${bia.id}`;
  await expireSubscribers(new Date());
  assert.equal((await sql`SELECT 1 FROM assinatura_subscribers WHERE id = ${bia.id}`).length, 0);
  reading = await readingOverview();
  assert.deepEqual({ ...reading.editions[0] }, { ...expected, scanned: 2 }, "only the scanners' tally, a live view, loses her");
  assert.deepEqual({ ...reading.retention.find((r) => r.group === null) }, { group: null, cohort: 3, retained: 2 }, "Ana and Caio stayed 8 weeks, Bia did not");

  // Ana's own link reads and changes her choice; a token that is not one changes nothing.
  const prefs = (path: string, payload: Record<string, unknown>) => app.inject({ method: "POST", url: `/api/assinatura/preferencias${path}`, payload });
  assert.deepEqual((await prefs("/ler", { t: ana.token })).json(), { channel: "email", status: "confirmed", interest: "pneumologia" });
  assert.deepEqual((await prefs("", { t: ana.token, interest: "cirurgia" })).json(), { interest: "cirurgia" });
  assert.equal((await prefs("", { t: "x".repeat(24), interest: "cirurgia" })).statusCode, 404);
});
