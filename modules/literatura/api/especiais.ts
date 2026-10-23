// The specials over HTTP: the admin's (/api/admin/especiais, behind the admin's session and CSRF guard) and
// the site's (/api/site/especiais), which answer only what is published; and the admin's papers added by
// PMID or DOI (/api/admin/literatura/adicionar, backend/adicionar.ts).
import type { FastifyInstance } from "fastify";
import { actorOf } from "@aihot/backend/admin/auth";
import { adminHandler } from "@aihot/api/routes/admin-auth";
import { body, orNotFound, param } from "@aihot/api/routes/admin";
import { siteHandler } from "@aihot/api/routes/site";
import { sendJsonWithEtag, sendProblem } from "@aihot/api/http/respond";
import {
  approveEspecial, createEspecial, discardEspecial, editEspecial, especialDetail, listEspeciais, publishedEspecial, publishedEspeciais,
  publishEspecial, reopenEspecial, rewriteEspecial,
} from "../backend/especiais.ts";
import { listAdded, requestAdd } from "../backend/adicionar.ts";

const id = (req: Parameters<typeof param>[0]) => Number(param(req, "id")) || 0;

export function registerEspeciais(app: FastifyInstance) {
  app.get("/api/admin/especiais", adminHandler(async () => listEspeciais()));
  app.post("/api/admin/especiais", adminHandler(async (req, _reply, admin) => createEspecial(body(req), actorOf(admin))));
  app.get("/api/admin/especiais/:id", adminHandler(async (req, reply) => orNotFound(req, reply, await especialDetail(id(req)))));
  app.patch("/api/admin/especiais/:id", adminHandler(async (req, reply, admin) => orNotFound(req, reply, await editEspecial(id(req), body(req), actorOf(admin)))));
  for (const [action, run] of [
    ["rewrite", rewriteEspecial], ["approve", approveEspecial], ["reopen", reopenEspecial], ["publish", publishEspecial], ["discard", discardEspecial],
  ] as const) {
    app.post(`/api/admin/especiais/:id/${action}`, adminHandler(async (req, reply, admin) => orNotFound(req, reply, await run(id(req), body(req), actorOf(admin)))));
  }

  app.get("/api/admin/literatura/adicionados", adminHandler(async () => ({ rows: await listAdded() })));
  app.post("/api/admin/literatura/adicionar", adminHandler(async (req, _reply, admin) => requestAdd(body(req), actorOf(admin))));

  app.get("/api/site/especiais", siteHandler(async (req, reply) => {
    return sendJsonWithEtag(req, reply, { items: await publishedEspeciais() }, { etagPrefix: "especiais", cacheControl: "public, max-age=120, s-maxage=120" });
  }));
  app.get("/api/site/especiais/:slug", siteHandler(async (req, reply) => {
    const slug = (req.params as { slug: string }).slug;
    const page = /^[a-z0-9-]{1,100}$/.test(slug) ? await publishedEspecial(slug) : null;
    if (!page) return sendProblem(req, reply, { status: 404, code: "not_found", detail: "especial not found", cacheControl: "public, max-age=60" });
    return sendJsonWithEtag(req, reply, page, { etagPrefix: "especial", cacheControl: "public, max-age=120, s-maxage=120" });
  }));
}
