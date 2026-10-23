// What the literature module adds to the web pages: the specials in the sidebar and in the admin's content
// group (with the drafts waiting for the editor), the admin's page to add a paper by PMID or DOI, and the
// weekly issue's special (web/report-part.tsx).
import { IconSparkles } from "@aihot/web/components/icons";
import { defineWebModule } from "@aihot/web/modules";

export default defineWebModule({
  name: "literatura",
  sidebar: { section: "Conteúdo", items: [{ to: "/especiais", label: "Especiais", icon: IconSparkles }] },
  admin: {
    content: [
      { to: "/admin/especiais", label: "Especiais", count: "especiais", tone: "accent" },
      { to: "/admin/literatura/adicionar", label: "Adicionar artigo" },
    ],
  },
  reportPage: () => import("./web/report-part.tsx"),
});
