// The public corrections of a matéria from the admin (/api/admin/literatura/correcoes, behind the admin's
// session and CSRF guard; backend/correcoes.ts). The site reads them with the matéria (ServerModule.items).
import type { FastifyInstance } from "fastify";
import { actorOf } from "@aihot/backend/admin/auth";
import { adminHandler } from "@aihot/api/routes/admin-auth";
import { body } from "@aihot/api/routes/admin";
import { addCorrection, listCorrections } from "../backend/correcoes.ts";

export function registerCorrecoes(app: FastifyInstance) {
  app.get("/api/admin/literatura/correcoes", adminHandler(async () => ({ rows: await listCorrections() })));
  app.post("/api/admin/literatura/correcoes", adminHandler(async (req, _reply, admin) => addCorrection(body(req), actorOf(admin))));
}
