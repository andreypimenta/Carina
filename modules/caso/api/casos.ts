// The case of the week over HTTP: the admin's (/api/admin/caso, behind the admin's session and CSRF guard),
// with the pictures of every case for its previews, and the site's pictures (/caso/imagens), which answer
// only those of published cases.
import path from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { actorOf } from "@aihot/backend/admin/auth";
import { adminHandler } from "@aihot/api/routes/admin-auth";
import { body, orNotFound, param } from "@aihot/api/routes/admin";
import { sendFile } from "@aihot/api/routes/static";
import {
  ADMIN_IMAGES, casoDetail, createCaso, deleteCaso, editCaso, IMAGE_DIR, IMAGE_FILE, imageShown, listCasos, PUBLIC_IMAGES, publishCaso, withdrawCaso,
} from "../backend/casos.ts";

const id = (req: Parameters<typeof param>[0]) => Number(param(req, "id")) || 0;

async function sendImage(req: FastifyRequest, reply: FastifyReply, published: boolean, cacheControl: string) {
  const file = param(req, "file");
  if (!IMAGE_FILE.test(file) || !(await imageShown(file, published))) return reply.code(404).type("text/plain; charset=utf-8").send("Not found");
  return sendFile(req, reply, path.join(IMAGE_DIR(), file), { cacheControl });
}

export function registerCasos(app: FastifyInstance) {
  app.get("/api/admin/caso", adminHandler(async () => listCasos()));
  app.post("/api/admin/caso", adminHandler(async (req, _reply, admin) => createCaso(body(req), actorOf(admin))));
  app.get("/api/admin/caso/:id", adminHandler(async (req, reply) => orNotFound(req, reply, await casoDetail(id(req)))));
  app.patch("/api/admin/caso/:id", adminHandler(async (req, reply, admin) => orNotFound(req, reply, await editCaso(id(req), body(req), actorOf(admin)))));
  for (const [action, run] of [["publish", publishCaso], ["withdraw", withdrawCaso], ["delete", deleteCaso]] as const) {
    app.post(`/api/admin/caso/:id/${action}`, adminHandler(async (req, reply, admin) => orNotFound(req, reply, await run(id(req), body(req), actorOf(admin)))));
  }
  app.get(`${ADMIN_IMAGES}/:file`, adminHandler(async (req, reply) => sendImage(req, reply, false, "private, no-store")));
  // Pictures are named by their content; one taken off the site stops being sent, so shared caches keep it briefly.
  app.get(`${PUBLIC_IMAGES}/:file`, (req, reply) => sendImage(req, reply, true, "public, max-age=600"));
}
