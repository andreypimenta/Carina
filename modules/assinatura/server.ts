// The subscription module's backend: its api routes (api/routes.ts), the run every minute that sends the
// e-mail confirmations and the weekly edition (backend/send.ts), and the expiry of addresses nobody confirmed or
// that left (backend/subscribers.ts).
import type { ServerModule } from "@aihot/backend/modules";
import { registerAssinatura } from "./api/routes.ts";
import { problemSends, runSends } from "./backend/send.ts";
import { expireSubscribers } from "./backend/subscribers.ts";

const server: ServerModule = {
  name: "assinatura",
  http: registerAssinatura,
  schedules: [
    {
      name: "assinatura.send",
      cron: "* * * * *",
      run: () => runSends(),
      when: () => process.env.NEWSLETTER_EMAIL_ENABLED === "true" || process.env.NEWSLETTER_WHATSAPP_ENABLED === "true",
    },
  ],
  retention: (now) => expireSubscribers(now),
  admin: {
    // The navigation's badge: recent sends that failed or may not have arrived.
    counts: { assinaturaProblems: () => problemSends() },
  },
};

export default server;
