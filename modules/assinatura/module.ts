// The subscription module: a lean page with the newest weekly edition and a sign-up form (/assine, made to
// be shared in WhatsApp groups), its articles on lean pages of their own, the edition sent to confirmed readers by e-mail (Resend) and WhatsApp
// (Evolution API), and the admin's view of the list. The links in its messages are answered by the api, which
// sends them to a page of their own: a button that confirms or takes the address off.
import { defineModule } from "@aihot/contracts/modules";

export default defineModule({
  name: "assinatura",
  pages: [
    { path: "assine", file: "web/assine.tsx", id: "assine" },
    { path: "assine/:key", file: "web/assine.tsx", id: "assine-edicao" },
    { path: "assine/:key/:item", file: "web/materia.tsx", id: "assine-materia" },
    { path: "assine/confirmacao", file: "web/link.tsx", id: "assine-confirmacao" },
    { path: "assine/saida", file: "web/link.tsx", id: "assine-saida" },
    { path: "assine/preferencias", file: "web/link.tsx", id: "assine-preferencias" },
  ],
  adminPages: [{ path: "admin/assinatura", file: "web/admin.tsx" }],
  apiPaths: [/^\/assine\/(?:confirmar|sair|l)$/],
});
