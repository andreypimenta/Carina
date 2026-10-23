// The agenda over HTTP: /api/site/agenda, the page's lists on the site's calendar day.
import type { FastifyInstance } from "fastify";
import { beijingDate } from "@aihot/contracts/time";
import { siteHandler } from "@aihot/api/routes/site";
import { sendJsonWithEtag } from "@aihot/api/http/respond";
import { agendaPage } from "../backend/congressos.ts";

export function registerAgenda(app: FastifyInstance) {
  app.get("/api/site/agenda", siteHandler(async (req, reply) => {
    return sendJsonWithEtag(req, reply, agendaPage(beijingDate(new Date())), { etagPrefix: "agenda", cacheControl: "public, max-age=300, s-maxage=300" });
  }));
}
