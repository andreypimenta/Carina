// The case of the week's backend: its admin and picture routes (api/casos.ts) and its part of the weekly
// edition, on the page (backend/casos.ts) and in the e-mail (backend/mail.ts).
import type { ServerModule } from "@aihot/backend/modules";
import { registerCasos } from "./api/casos.ts";
import { weeklyPart } from "./backend/casos.ts";
import { casoMail } from "./backend/mail.ts";

const server: ServerModule = {
  name: "caso",
  http: registerCasos,
  reports: { read: (_saved, issue) => weeklyPart(issue), mail: (part, issue) => casoMail(part, issue) },
};

export default server;
