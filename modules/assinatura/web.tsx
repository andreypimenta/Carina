// The subscription module on the web: /assine draws its own chrome (only the edition and the form), and the
// admin lists the readers under 内容, with a badge for the edition's sends that need a look.
import { defineWebModule } from "@aihot/web/modules";

export default defineWebModule({
  name: "assinatura",
  ownChrome: ["/assine"],
  admin: { content: [{ to: "/admin/assinatura", label: "Inscritos", count: "assinaturaProblems", tone: "bad" }] },
});
