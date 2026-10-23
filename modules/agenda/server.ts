// The agenda's backend: its site route (api/agenda.ts), its page in the sitemap and its part of the weekly issue,
// the congresses near the day the issue comes out (backend/congressos.ts).
import type { ServerModule } from "@aihot/backend/modules";
import { registerAgenda } from "./api/agenda.ts";
import { weeklyCard, weeklyPart } from "./backend/congressos.ts";

const server: ServerModule = {
  name: "agenda",
  http: registerAgenda,
  sitemap: { pages: [{ loc: "/agenda", changefreq: "weekly", priority: 0.6 }] },
  reports: { compose: (issue) => weeklyPart(issue), read: (saved) => weeklyCard(saved) },
};

export default server;
