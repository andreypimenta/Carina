// Sign-ups, confirmations, leaving, the weekly sends and WhatsApp replies, against local stand-ins for Resend
// and the Evolution API: nothing is sent anywhere. Failure cases: an address receives an edition before it
// confirmed, or twice; a reader confirmed after the edition went out gets it late; a message that may have
// arrived is sent again on its own; leaving needs more than one click; a stranger's WhatsApp text or an
// unsigned webhook changes the list; a sign-up tells whether an address is already on it.
import { tag } from "../../../tests/setup.ts";
import assert from "node:assert/strict";
import http from "node:http";
import { randomBytes } from "node:crypto";
import { after, before, test } from "node:test";
import { config } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { installModules } from "@aihot/backend/modules";
import { passwordLogin, sessionPrincipal, SESSION_COOKIE } from "@aihot/backend/admin/auth";
import { buildApp } from "../../../apps/api/src/app.ts";
import server from "../server.ts";
import { normalizeEmail, normalizePhone, phoneVariants } from "../address.ts";
import { runSends } from "../backend/send.ts";
import { expireSubscribers } from "../backend/subscribers.ts";

const T = tag();
const WEEK = "2026-W43";
const MONDAY = new Date("2026-10-26T12:00:00Z");
const LATER = new Date("2026-11-20T12:00:00Z");
const noWait = async () => {};

interface Mail { key: string; to: string; subject: string; html: string; text: string; headers?: Record<string, string> }
const mails: Mail[] = [];
const texts: Array<{ number: string; text: string }> = [];
/** Addresses Resend answers 503 the first time; numbers Evolution answers 500 or 400. */
const busyOnce = new Set<string>();
const evoBroken = new Set<string>();
const evoRefused = new Set<string>();

const stub = http.createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (c: Buffer) => chunks.push(c));
  req.on("end", () => {
    const url = req.url ?? "/";
    const json = (status: number, body: unknown) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    if (url === "/resend/emails" && req.method === "POST") {
      assert.equal(req.headers.authorization, "Bearer test-resend-key");
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const to = body.to[0] as string;
      if (busyOnce.delete(to)) return json(503, { message: "busy" });
      mails.push({ key: String(req.headers["idempotency-key"]), to, subject: body.subject, html: body.html, text: body.text, headers: body.headers });
      return json(200, { id: `mail-${mails.length}` });
    }
    if (url === "/evo/instance/connectionState/folego") return json(200, { instance: { instanceName: "folego", state: "open" } });
    if (url === "/evo/message/sendText/folego" && req.method === "POST") {
      assert.equal(req.headers.apikey, "test-evo-key");
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { number: string; text: string };
      if (evoBroken.has(body.number)) return json(500, { error: "Internal Server Error" });
      if (evoRefused.has(body.number)) return json(400, { response: { message: [{ exists: false, number: body.number }] } });
      texts.push(body);
      return json(201, { key: { id: `wa-${texts.length}` } });
    }
    json(500, { error: `unexpected ${req.method} ${url}` });
  });
});

let app: Awaited<ReturnType<typeof buildApp>>;

before(async () => {
  await new Promise<void>((resolve) => stub.listen(0, "127.0.0.1", () => resolve()));
  const base = `http://127.0.0.1:${(stub.address() as { port: number }).port}`;
  Object.assign(process.env, {
    NEWSLETTER_EMAIL_ENABLED: "true", RESEND_API_KEY: "test-resend-key", NEWSLETTER_FROM: "O Fôlego <edicao@example.com>", RESEND_BASE_URL: `${base}/resend`,
    NEWSLETTER_WHATSAPP_ENABLED: "true", EVOLUTION_API_URL: `${base}/evo`, EVOLUTION_API_KEY: "test-evo-key", EVOLUTION_INSTANCE: "folego",
    EVOLUTION_WEBHOOK_SECRET: "test-webhook-secret-0123",
  });
  config.siteUrl = "https://folego.example";
  installModules([server]);
  app = await buildApp();
  // The edition, before anything reads the reports' index (kept a minute).
  const content = {
    kind: "weekly", title: `O Fôlego · Edição semanal · ${WEEK}`, headline: "Broncoscopia precoce reduz reinternações", overview: "Uma semana de estudos sobre via aérea.",
    themes: [{ heading: "Estudos clínicos", summary: null, storyRefs: [
      { title: "Broncoscopia precoce reduz reinternações", summary: "Coorte de 300 crianças.", sourceName: "PubMed", sourceUrl: "https://pubmed.example/1" },
      { title: "Traqueostomia <em>neonatal</em> em queda", summary: "Registro nacional.", sourceName: "SBPT", sourceUrl: "https://sbpt.example/2" },
    ] }],
  };
  await sql`INSERT INTO reports (kind, key, window_start, window_end, content, generated_at, origin) VALUES ('weekly', ${WEEK}, now(), now(), ${sql.json(content as never)}, now(), 'imported')`;

});

after(async () => {
  await app.close();
  await new Promise((resolve) => stub.close(resolve));
  await stopBoss();
  await closeDb();
});

let ip = 0;
const signup = (payload: Record<string, unknown>) =>
  app.inject({ method: "POST", url: "/api/assinatura", payload, headers: { "x-real-ip": `10.0.${T.length}.${++ip}`, "user-agent": "test" } });

async function until<T>(read: () => T | undefined, what: string): Promise<T> {
  for (let i = 0; i < 100; i++) {
    const value = read();
    if (value !== undefined) return value;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`timed out waiting for ${what}`);
}

const subscriber = async (channel: string, address: string) =>
  (await sql<{ id: number; status: string; token: string; left_by: string | null }[]>`SELECT id, status, token, left_by FROM assinatura_subscribers WHERE channel = ${channel} AND address = ${address}`)[0];

async function add(channel: "email" | "whatsapp", address: string, status: "pending" | "confirmed" | "unsubscribed") {
  const [row] = await sql<{ id: number; token: string }[]>`INSERT INTO assinatura_subscribers (channel, address, status, token, consent, consent_at, confirm_sent_at, confirmed_at)
    VALUES (${channel}, ${address}, ${status}, ${randomBytes(18).toString("base64url")}, 'test', now(), now(), ${status === "pending" ? null : new Date()}) RETURNING id, token`;
  return row!;
}

test("addresses are read the Brazilian way", () => {
  for (const given of ["(11) 98765-4321", "11987654321", "+55 11 98765-4321", "5511987654321", "011 98765 4321", "0055 11 98765-4321"]) {
    assert.equal(normalizePhone(given), "+5511987654321", given);
  }
  assert.equal(normalizePhone("(51) 3333-4444"), "+555133334444", "a landline");
  assert.equal(normalizePhone("(55) 99123-4567"), "+5555991234567", "DDD 55 is not the country code");
  assert.equal(normalizePhone("+351 912 345 678"), "+351912345678", "another country, written with its code");
  for (const bad of ["98765-4321", "(01) 98765-4321", "(11) 18765-4321", "abc", "+55 11 9876"]) assert.equal(normalizePhone(bad), null, bad);
  assert.deepEqual(phoneVariants("+5511987654321"), ["+5511987654321", "+551187654321"]);
  assert.deepEqual(phoneVariants("+551187654321"), ["+551187654321", "+5511987654321"]);
  assert.equal(normalizeEmail("  Ana@Example.COM "), "ana@example.com");
  assert.equal(normalizeEmail("ana@example"), null);
});

test("a sign-up is confirmed by its own link before anything is sent, and answers the same whatever the address's state", async () => {
  const email = `ana-${T}@example.com`;
  assert.equal((await signup({ email, consent: false })).statusCode, 400, "consent is required");
  assert.equal((await signup({ email: "nope", consent: true })).statusCode, 400);
  const bot = await signup({ email: `bot-${T}@example.com`, consent: true, website: "http://spam" });
  assert.equal(bot.statusCode, 202, "a bot is answered as a person");
  assert.equal(await subscriber("email", `bot-${T}@example.com`), undefined, "and nothing is kept");

  const first = await signup({ email: email.toUpperCase(), phone: "(11) 97777-0001", consent: true });
  assert.equal(first.statusCode, 202);
  assert.deepEqual(first.json().sent, { email: true, whatsapp: true });
  const mail = await until(() => mails.find((m) => m.to === email), "the confirmation e-mail");
  assert.match(mail.subject, /Confirme/);
  assert.equal((await subscriber("email", email))?.status, "pending");
  assert.equal(texts.length, 0, "WhatsApp waits for the worker's paced run");

  const again = await signup({ email, consent: true });
  assert.equal(again.statusCode, 202);
  assert.deepEqual(again.json(), { sent: { email: true, whatsapp: false } });
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(mails.filter((m) => m.to === email).length, 1, "a second request within ten minutes sends no second confirmation");

  // Weeks after the edition: only the confirmations are due.
  await runSends({ wait: noWait, now: LATER });
  const wa = texts.find((t) => t.number === "5511977770001");
  assert.ok(wa, "the WhatsApp confirmation goes out with the worker");
  assert.match(wa.text, /assine\/confirmar\?t=/);
  assert.equal(mails.filter((m) => m.to === email).length, 1, "the worker does not send the e-mail confirmation again");

  const link = /https:\/\/folego\.example(\/assine\/confirmar\?t=[\w-]+)/.exec(mail.text)![1]!;
  const confirmed = await app.inject({ url: link });
  assert.equal(confirmed.statusCode, 303);
  assert.equal(confirmed.headers.location, "/assine?confirmado=email");
  assert.equal(confirmed.headers["cache-control"], "no-store");
  assert.equal((await subscriber("email", email))?.status, "confirmed");
  assert.equal((await subscriber("whatsapp", "+5511977770001"))?.status, "pending", "each address is confirmed by its own link");

  const known = await signup({ email, consent: true });
  assert.deepEqual(known.json(), { sent: { email: true, whatsapp: false } }, "a confirmed address answers as a new one");
  assert.equal((await subscriber("email", email))?.status, "confirmed");
  assert.equal((await app.inject({ url: "/assine/confirmar?t=not-a-real-token-at-all" })).headers.location, "/assine?link=invalido");
});

test("each confirmed reader gets the edition once; a failure that may pass is tried again, one that may have arrived is not", async () => {
  const reader = await add("email", `leitor-${T}@example.com`, "confirmed");
  const pending = await add("email", `pendente-${T}@example.com`, "pending");
  await add("email", `saiu-${T}@example.com`, "unsubscribed");
  const busy = await add("email", `ocupado-${T}@example.com`, "confirmed");
  busyOnce.add(`ocupado-${T}@example.com`);
  await add("whatsapp", "+5511966660001", "confirmed");
  await add("whatsapp", "+5511966660002", "confirmed");
  evoBroken.add("5511966660002");
  await add("whatsapp", "+5511966660003", "confirmed");
  evoRefused.add("5511966660003");

  const run = await runSends({ wait: noWait, now: MONDAY });
  assert.ok(run.planned_email && run.planned_whatsapp, "the edition is planned on both channels");
  const edition = mails.filter((m) => m.to === `leitor-${T}@example.com`);
  assert.equal(edition.length, 1);
  assert.match(edition[0]!.subject, /Broncoscopia precoce/);
  assert.match(edition[0]!.html, /Traqueostomia &lt;em&gt;neonatal&lt;\/em&gt;/, "the edition's text is escaped");
  assert.match(edition[0]!.headers!["List-Unsubscribe"]!, new RegExp(`/assine/sair\\?t=${reader.token}`));
  assert.equal(edition[0]!.headers!["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  assert.ok(edition[0]!.html.includes(`https://folego.example/assine/${WEEK}`), "it links the edition's page");
  assert.equal(mails.filter((m) => m.to === `pendente-${T}@example.com` || m.to === `saiu-${T}@example.com`).length, 0, "only confirmed addresses get it");
  assert.equal(texts.filter((t) => t.number === "5511966660001" && t.text.includes(`/assine/${WEEK}`)).length, 1);

  const sendOf = async (id: number) => (await sql<{ status: string; attempts: number }[]>`SELECT status, attempts FROM assinatura_sends WHERE subscriber_id = ${id} AND edition_key = ${WEEK}`)[0];
  assert.deepEqual(await sendOf(busy.id), { status: "pending", attempts: 1 }, "Resend's trouble is tried again later");
  const broken = await subscriber("whatsapp", "+5511966660002");
  assert.equal((await sendOf(broken!.id))?.status, "unknown", "an error from Evolution may still have sent it");
  assert.equal((await sendOf((await subscriber("whatsapp", "+5511966660003"))!.id))?.status, "failed", "a number not on WhatsApp is given up");

  // Confirmed after the edition was planned: it waits for the next one.
  await sql`UPDATE assinatura_subscribers SET status = 'confirmed', confirmed_at = now() WHERE id = ${pending.id}`;
  evoBroken.clear();
  await sql`UPDATE assinatura_sends SET next_attempt_at = now() WHERE subscriber_id = ${busy.id}`;
  await runSends({ wait: noWait, now: MONDAY });
  await runSends({ wait: noWait, now: MONDAY });
  assert.equal(mails.filter((m) => m.to === `leitor-${T}@example.com`).length, 1, "never twice");
  assert.equal(texts.filter((t) => t.number === "5511966660001").length, 1, "never twice");
  assert.equal(mails.filter((m) => m.to === `pendente-${T}@example.com`).length, 0, "a reader confirmed later is not sent this edition");
  const retried = mails.filter((m) => m.to === `ocupado-${T}@example.com`);
  assert.equal(retried.length, 1);
  assert.equal(retried[0]!.key, `assinatura-send-${(await sql<{ id: number }[]>`SELECT id FROM assinatura_sends WHERE subscriber_id = ${busy.id}`)[0]!.id}`, "with the send's own idempotency key");
  assert.equal(texts.filter((t) => t.number === "5511966660002").length, 0, "an unknown send is not resent on its own");

  // The admin, after checking, sends the unknown one again.
  const password = "assinatura-admin-password";
  config.adminPassword = password;
  const { token } = await passwordLogin(password, "/admin", "test");
  const admin = (await sessionPrincipal(`${SESSION_COOKIE}=${token}`))!;
  const headers = { cookie: `${SESSION_COOKIE}=${token}`, "x-csrf-token": admin.csrf };
  assert.equal((await app.inject({ url: "/api/admin/assinatura" })).statusCode, 401);
  const overview = (await app.inject({ url: "/api/admin/assinatura", headers })).json();
  const wa = overview.editions.find((e: { edition_key: string; channel: string }) => e.edition_key === WEEK && e.channel === "whatsapp");
  assert.equal(wa.sends.unknown, 1);
  const retry = await app.inject({ method: "POST", url: "/api/admin/assinatura/reenviar", headers, payload: { edition: WEEK, channel: "whatsapp", reason: "conferido na instância" } });
  assert.equal(retry.json().count, 2, "the unknown and the failed send go back to the queue");
  evoRefused.clear();
  await runSends({ wait: noWait, now: MONDAY });
  assert.equal(texts.filter((t) => t.number === "5511966660002").length, 1);
  const csv = await app.inject({ url: "/api/admin/assinatura/inscritos.csv", headers });
  assert.equal(csv.statusCode, 200);
  assert.match(csv.headers["content-type"] as string, /text\/csv/);
  assert.match(csv.body, new RegExp(`email,leitor-${T}@example.com,confirmed`));

  await add("email", `tarde-${T}@example.com`, "confirmed");
  await sql`DELETE FROM assinatura_editions`;
  assert.equal((await runSends({ wait: noWait, now: LATER })).planned_email, undefined, "an old edition is not sent to anyone new");
});

test("leaving takes one click, from the link or the mail client's button, and a mistaken click can be undone", async () => {
  const reader = await add("email", `clique-${T}@example.com`, "confirmed");
  const left = await app.inject({ url: `/assine/sair?t=${reader.token}` });
  assert.equal(left.statusCode, 303);
  assert.equal(left.headers.location, `/assine?saiu=email&t=${reader.token}`);
  assert.deepEqual({ ...(await subscriber("email", `clique-${T}@example.com`)) }, { id: reader.id, status: "unsubscribed", token: reader.token, left_by: "link" });
  const back = await app.inject({ method: "POST", url: "/api/assinatura/voltar", payload: { t: reader.token } });
  assert.equal(back.statusCode, 200);
  assert.equal((await subscriber("email", `clique-${T}@example.com`))?.status, "confirmed");

  const oneClick = await app.inject({ method: "POST", url: `/assine/sair?t=${reader.token}`, headers: { "content-type": "application/x-www-form-urlencoded" }, payload: "List-Unsubscribe=One-Click" });
  assert.equal(oneClick.statusCode, 200);
  assert.equal((await subscriber("email", `clique-${T}@example.com`))?.left_by, "one-click");

  const never = await add("email", `nunca-${T}@example.com`, "pending");
  await app.inject({ url: `/assine/sair?t=${never.token}` });
  assert.equal((await app.inject({ method: "POST", url: "/api/assinatura/voltar", payload: { t: never.token } })).statusCode, 404, "only a confirmed address comes back without confirming");
});

test("WhatsApp replies: SAIR and PARAR leave, SIM confirms, the rest and unsigned calls change nothing", async () => {
  const hook = (payload: object, token = "test-webhook-secret-0123") => app.inject({ method: "POST", url: `/api/assinatura/evolution?token=${token}`, payload: payload as Record<string, unknown> });
  const message = (from: Record<string, unknown>, text: string) => ({ event: "messages.upsert", instance: "folego", data: { key: { fromMe: false, id: "x", ...from }, message: { conversation: text } } });
  const reader = await add("whatsapp", "+5511987650001", "confirmed");
  const sent = texts.length;

  assert.equal((await hook(message({ remoteJid: "5511987650001@s.whatsapp.net" }, "SAIR"), "wrong")).statusCode, 403);
  assert.equal((await app.inject({ method: "POST", url: "/api/assinatura/evolution", payload: message({ remoteJid: "5511987650001@s.whatsapp.net" }, "SAIR") })).statusCode, 403);
  assert.equal((await subscriber("whatsapp", "+5511987650001"))?.status, "confirmed");

  assert.equal((await hook(message({ remoteJid: "5511987650001@s.whatsapp.net" }, "Olá, gostei da edição"))).json().action, "ignored");
  assert.equal((await hook(message({ remoteJid: "120363@g.us", participant: "5511987650001@s.whatsapp.net" }, "sair"))).json().action, "ignored", "a group's message is nobody's request");
  assert.equal((await hook({ ...message({ remoteJid: "5511987650001@s.whatsapp.net" }, "sair"), data: { key: { remoteJid: "5511987650001@s.whatsapp.net", fromMe: true }, message: { conversation: "sair" } } })).json().action, "ignored", "the instance's own message");
  assert.equal(texts.length, sent, "nothing is answered");

  // A LID account carries its number apart, here the older eight-digit form of the same mobile.
  const left = await hook(message({ remoteJid: "2345678901234@lid", remoteJidAlt: "551187650001@s.whatsapp.net" }, " Sair! "));
  assert.deepEqual(left.json(), { action: "left", subscriber: reader.id });
  assert.equal((await subscriber("whatsapp", "+5511987650001"))?.left_by, "whatsapp");
  assert.equal(texts.length, sent + 1, "the reader is told");

  const pending = await add("whatsapp", "+5511987650002", "pending");
  assert.equal((await hook(message({ remoteJid: "5511987650002@s.whatsapp.net" }, "sim"))).json().action, "confirmed");
  assert.equal((await subscriber("whatsapp", "+5511987650002"))?.status, "confirmed");
  assert.equal((await hook(message({ remoteJid: "5511987650002@s.whatsapp.net" }, "PARAR"))).json().subscriber, pending.id);
  assert.equal((await subscriber("whatsapp", "+5511987650002"))?.status, "unsubscribed");
});

test("addresses nobody confirmed, and those that left, are erased after 30 days", async () => {
  const old = await add("email", `velho-${T}@example.com`, "pending");
  const gone = await add("email", `foi-${T}@example.com`, "unsubscribed");
  const kept = await add("email", `fica-${T}@example.com`, "confirmed");
  await sql`UPDATE assinatura_subscribers SET consent_at = now() - interval '31 days' WHERE id IN (${old.id}, ${kept.id})`;
  await sql`UPDATE assinatura_subscribers SET unsubscribed_at = now() - interval '31 days' WHERE id = ${gone.id}`;
  await expireSubscribers(new Date());
  assert.equal(await subscriber("email", `velho-${T}@example.com`), undefined);
  assert.equal(await subscriber("email", `foi-${T}@example.com`), undefined);
  assert.equal((await subscriber("email", `fica-${T}@example.com`))?.status, "confirmed");
});
