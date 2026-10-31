// The literature module's backend: the run every six hours (backend/collect.ts, with the watched journals of
// backend/revistas.ts) and the model step that writes the site's articles about papers (backend/materia.ts),
// chosen like the engine's steps; and the
// specials written from PubMed references (backend/especiais.ts): their writing queue, their admin and site
// routes (api/especiais.ts), their pages in the sitemap and their place in the weekly issue; and the papers the
// editor adds by PMID or DOI (backend/adicionar.ts), taken by the worker; and the papers X posts point to
// (backend/apurar.ts), every half hour, written up instead of the posts.
import type { ServerModule } from "@aihot/backend/modules";
import { registerEspeciais } from "./api/especiais.ts";
import { ADICIONAR_QUEUE } from "./backend/adicionar.ts";
import { APURACAO_PURPOSE, researchXPosts } from "./backend/apurar.ts";
import { collectLiterature } from "./backend/collect.ts";
import { draftsToReview, ESPECIAL_FAILED_QUEUE, ESPECIAL_QUEUE, especiaisSitemap, weeklyCard, weeklyPart } from "./backend/especiais.ts";
import { LINHA_PURPOSE, LINHA_STEP } from "./backend/linha-do-tempo.ts";
import { FONTE_PURPOSE, MATERIA_PURPOSE, MATERIA_STEP } from "./backend/materia.ts";
import { revistas } from "./backend/revistas.ts";

const server: ServerModule = {
  name: "literatura",
  takesXPosts: true,
  http: registerEspeciais,
  models: {
    [MATERIA_STEP]: {
      label: "Matéria sobre artigo científico (texto próprio do site a partir do resumo ou do texto completo em acesso aberto) e apuração dos posts do X (assunto, busca no PubMed, matéria a partir da página oficial)",
      env: "MATERIA_MODEL",
      purposes: [MATERIA_PURPOSE, APURACAO_PURPOSE, FONTE_PURPOSE],
    },
    [LINHA_STEP]: {
      label: "Especial Linha do tempo (os estudos-marco de um tema, a partir de uma busca no PubMed)",
      env: "LINHA_DO_TEMPO_MODEL",
      purposes: [LINHA_PURPOSE],
    },
  },
  schedules: [
    {
      name: "literatura.collect",
      cron: "20 */6 * * *",
      missed: "once",
      run: () => collectLiterature({ budgetMs: 50 * 60_000, revistas: revistas() }),
      when: () => process.env.COLLECT_ENABLED === "true",
    },
    {
      name: "literatura.apurar-x",
      cron: "10,40 * * * *",
      missed: "skip",
      run: () => researchXPosts({ budgetMs: 25 * 60_000 }),
      when: () => process.env.COLLECT_ENABLED === "true",
    },
  ],
  queues: [ESPECIAL_FAILED_QUEUE, ESPECIAL_QUEUE, ADICIONAR_QUEUE],
  admin: { counts: { especiais: draftsToReview } },
  sitemap: { pages: [{ loc: "/especiais", changefreq: "weekly", priority: 0.7 }], entries: especiaisSitemap },
  reports: { compose: weeklyPart, read: weeklyCard },
};

export default server;
