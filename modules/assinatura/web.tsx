// The subscription module on the web: /assine draws its own chrome (only the edition and the form), and the
// admin lists the readers under 内容, with a badge for the edition's sends that need a look. The rest of the
// site leads to /assine: an entry in the sidebar, the tab bar and the 我的 page, and its Callout on the
// issues, the articles and the foot of every page. Each story of a weekly issue can be sent to WhatsApp.
import { defineWebModule } from "@aihot/web/modules";
import { IconMail } from "@aihot/web/components/icons";
import { Callout } from "./web/Callout.tsx";
import { StoryShare } from "./web/ShareLink.tsx";

export default defineWebModule({
  name: "assinatura",
  ownChrome: ["/assine"],
  sidebar: { section: "Conteúdo", items: [{ to: "/assine", label: "Assine grátis", icon: IconMail }] },
  tabs: [{ key: "assine", to: "/assine", label: "Assine", icon: IconMail }],
  tools: [{ to: "/assine", label: "Receber a edição semanal", icon: <IconMail size={20} /> }],
  Callout,
  StoryTool: StoryShare,
  admin: { content: [{ to: "/admin/assinatura", label: "Inscritos", count: "assinaturaProblems", tone: "bad" }] },
});
