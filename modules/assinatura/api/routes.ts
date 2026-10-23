// The module's addresses on the api: the sign-up the page posts, the links in the messages (which only open
// the page: its buttons post to confirm, leave and undo, so a link scanner or a preview changes nothing), the
// mail clients' one-click leave, Evolution's webhook for incoming WhatsApp messages and the admin's view.
import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { credential } from "@aihot/backend/config";
import { audit } from "@aihot/backend/audit";
import { actorOf } from "@aihot/backend/admin/auth";
import { sendProblem } from "@aihot/api/http/respond";
import { adminHandler } from "@aihot/api/routes/admin-auth";
import { adminOverview, subscribersCsv } from "../backend/admin.ts";
import { retrySends } from "../backend/send.ts";
import { confirm, handleInbound, openChannels, resubscribe, SignupRejected, subscribe, unsubscribe } from "../backend/subscribers.ts";
import type { SignupChannels } from "../types.ts";

const tokenOf = (req: FastifyRequest) => {
  const t = (req.query as Record<string, unknown>).t;
  return typeof t === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(t) ? t : null;
};

const toPage = (reply: FastifyReply, params: Record<string, string>) =>
  reply.header("Cache-Control", "no-store").header("Referrer-Policy", "no-referrer").redirect(`/assine?${new URLSearchParams(params)}`, 303);

/** Evolution's webhook carries the secret as ?token= or as a bearer token. */
function webhookAllowed(req: FastifyRequest): boolean {
  const secret = credential("integrations", "EVOLUTION_WEBHOOK_SECRET");
  if (!secret) return false;
  const given = String((req.query as Record<string, unknown>).token ?? "") || String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function registerAssinatura(app: FastifyInstance) {
  app.get("/api/assinatura", async (_req, reply) => {
    const body: SignupChannels = openChannels();
    return reply.header("Cache-Control", "public, max-age=60").send(body);
  });

  app.post("/api/assinatura", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const b = (req.body ?? {}) as Record<string, unknown>;
    const text = (v: unknown) => (typeof v === "string" ? v : null);
    try {
      const sent = await subscribe({
        email: text(b.email), consent: b.consent, trap: text(b.website),
        ip: String(req.headers["x-real-ip"] ?? req.ip ?? ""), userAgent: String(req.headers["user-agent"] ?? ""),
      });
      return reply.code(202).send({ sent });
    } catch (error) {
      if (error instanceof SignupRejected) return sendProblem(req, reply, { status: error.status, code: error.code, detail: error.message, retryAfter: error.status === 429 ? 600 : undefined });
      req.log.error({ err: error }, "signup failed");
      return sendProblem(req, reply, { status: 503, code: "temporarily_unavailable", detail: "No momento não é possível se inscrever; tente de novo daqui a pouco.", retryAfter: 30 });
    }
  });

  // The page's buttons, with the token its link carried.
  const tokenAction = <T>(path: string, act: (token: string) => Promise<T | null>) =>
    app.post(path, async (req, reply) => {
      reply.header("Cache-Control", "no-store");
      const t = (req.body as Record<string, unknown> | null)?.t;
      const done = typeof t === "string" ? await act(t) : null;
      if (!done) return sendProblem(req, reply, { status: 404, code: "not_found", detail: "Este link não serve mais; inscreva-se de novo pelo formulário." });
      return reply.send(done);
    });
  tokenAction("/api/assinatura/confirmar", confirm);
  tokenAction("/api/assinatura/sair", (t) => unsubscribe(t, "link"));
  tokenAction("/api/assinatura/voltar", async (t) => {
    const channel = await resubscribe(t);
    return channel ? { channel } : null;
  });

  // The links in the messages open the page, which asks; the one-click unsubscribe mail clients post (RFC 8058),
  // whatever its body, takes the address off at once.
  app.register(async (links) => {
    links.addContentTypeParser("*", { parseAs: "string", bodyLimit: 16 * 1024 }, (_req, _body, done) => done(null, null));
    links.get("/assine/confirmar", async (req, reply) => {
      const token = tokenOf(req);
      return toPage(reply, token ? { confirmar: token } : { link: "invalido" });
    });
    links.get("/assine/sair", async (req, reply) => {
      const token = tokenOf(req);
      return toPage(reply, token ? { sair: token } : { link: "invalido" });
    });
    links.post("/assine/sair", async (req, reply) => {
      const token = tokenOf(req);
      const done = token ? await unsubscribe(token, "one-click") : null;
      return reply.header("Cache-Control", "no-store").code(done ? 200 : 404).type("text/plain; charset=utf-8").send(done ? "Inscrição cancelada." : "Link inválido.");
    });
  });

  // Point the Evolution instance's webhook here (docs/assinatura.md), with the MESSAGES_UPSERT event.
  app.post("/api/assinatura/evolution", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    if (!webhookAllowed(req)) return sendProblem(req, reply, { status: 403, code: "forbidden", detail: "Missing or wrong webhook secret." });
    const result = await handleInbound(req.body);
    req.log.info({ msg: "whatsapp message", ...result }, "assinatura inbound");
    return reply.send(result);
  });

  app.get("/api/admin/assinatura", adminHandler(async (req, reply) => reply.send(await adminOverview(req.query as Record<string, string>))));
  app.get("/api/admin/assinatura/inscritos.csv", adminHandler(async (_req, reply) => {
    const day = new Date().toISOString().slice(0, 10);
    return reply.type("text/csv; charset=utf-8").header("Content-Disposition", `attachment; filename="inscritos-${day}.csv"`).send(await subscribersCsv());
  }));
  app.post("/api/admin/assinatura/reenviar", adminHandler(async (req, reply, admin) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const key = String(b.edition ?? "");
    const channel = b.channel === "email" || b.channel === "whatsapp" ? b.channel : null;
    if (!/^\d{4}-W\d{2}$/.test(key) || !channel) return sendProblem(req, reply, { status: 400, code: "invalid_request", detail: "Informe a edição e o canal." });
    const count = await retrySends(key, channel);
    await audit(actorOf(admin), "assinatura.resend", `assinatura:${key}:${channel}`, String(b.reason ?? "") || null, null, { count }, { requestId: req.id });
    return reply.send({ count });
  }));
}
