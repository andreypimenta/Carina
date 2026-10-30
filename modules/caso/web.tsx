// What the case of the week adds to the web pages: its admin entry in the content group (with what the next
// edition still lacks) and its part of the weekly edition (web/report-part.tsx).
import { defineWebModule } from "@aihot/web/modules";

export default defineWebModule({
  name: "caso",
  admin: { content: [{ to: "/admin/caso", label: "Caso da semana", count: "caso", tone: "accent" }] },
  reportPage: () => import("./web/report-part.tsx"),
});
