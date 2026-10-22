// The subscription module: a lean page with the newest weekly edition and a sign-up form (/assine, made to
// be shared in WhatsApp groups), the edition sent to confirmed readers by e-mail (Resend) and WhatsApp
// (Evolution API), and the admin's view of the list. The links in its messages are answered by the api.
import { defineModule } from "@aihot/contracts/modules";

export default defineModule({
  name: "assinatura",
  pages: [
    { path: "assine", file: "web/assine.tsx", id: "assine" },
    { path: "assine/:key", file: "web/assine.tsx", id: "assine-edicao" },
  ],
  adminPages: [{ path: "admin/assinatura", file: "web/admin.tsx" }],
  apiPaths: [/^\/assine\/(?:confirmar|sair)$/],
});
