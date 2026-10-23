// What the agenda adds to the web pages: its entry in the sidebar and, when congresses are near, its block in
// the weekly issue (web/report-part.tsx).
import { IconClock } from "@aihot/web/components/icons";
import { defineWebModule } from "@aihot/web/modules";

export default defineWebModule({
  name: "agenda",
  sidebar: { section: "Conteúdo", items: [{ to: "/agenda", label: "Agenda", icon: IconClock }] },
  reportPage: () => import("./web/report-part.tsx"),
});
