// The Instagram module's backend: the run every six hours (backend/collect.ts), on only when both
// COLLECT_ENABLED and INSTAGRAM_COLLECT_ENABLED are true. Its posts are ordinary items of external sources.
import type { ServerModule } from "@aihot/backend/modules";
import { collectInstagram } from "./backend/collect.ts";

const server: ServerModule = {
  name: "instagram",
  schedules: [
    {
      name: "instagram.collect",
      cron: "40 */6 * * *",
      missed: "once",
      run: () => collectInstagram(),
      when: () => process.env.COLLECT_ENABLED === "true" && process.env.INSTAGRAM_COLLECT_ENABLED === "true",
    },
  ],
};

export default server;
