// What the literature module adds to the web pages: the specials in the sidebar and in the admin's content
// group (with the drafts waiting for the editor), the admin's pages to add a paper by PMID or DOI and to add a
// public correction to a matéria, the weekly issue's special (web/report-part.tsx), and why each matéria can
// be trusted on its page (web/item-part.tsx).
import { IconSparkles } from "@aihot/web/components/icons";
import { defineWebModule } from "@aihot/web/modules";

export default defineWebModule({
  name: "literatura",
  sidebar: { section: "Conteúdo", items: [{ to: "/especiais", label: "Especiais", icon: IconSparkles }] },
  admin: {
    content: [
      { to: "/admin/especiais", label: "Especiais", count: "especiais", tone: "accent" },
      { to: "/admin/literatura/adicionar", label: "Adicionar artigo" },
      { to: "/admin/literatura/correcoes", label: "Correções" },
    ],
  },
  reportPage: () => import("./web/report-part.tsx"),
  itemPage: () => import("./web/item-part.tsx"),
});
