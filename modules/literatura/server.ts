// The literature module's backend: the run every six hours (backend/collect.ts) and the model step that
// writes the site's articles about papers (backend/materia.ts), chosen like the engine's steps.
import type { ServerModule } from "@aihot/backend/modules";
import { collectLiterature } from "./backend/collect.ts";
import { MATERIA_PURPOSE, MATERIA_STEP } from "./backend/materia.ts";

const server: ServerModule = {
  name: "literatura",
  models: {
    [MATERIA_STEP]: {
      label: "Matéria sobre artigo científico (texto próprio do site a partir do resumo ou do texto completo em acesso aberto)",
      env: "MATERIA_MODEL",
      purposes: [MATERIA_PURPOSE],
    },
  },
  schedules: [
    {
      name: "literatura.collect",
      cron: "20 */6 * * *",
      missed: "once",
      run: () => collectLiterature({ budgetMs: 50 * 60_000 }),
      when: () => process.env.COLLECT_ENABLED === "true",
    },
  ],
};

export default server;
