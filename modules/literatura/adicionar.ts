// A paper the editor adds by PMID or DOI (backend/adicionar.ts), as the admin shows it.

/** What the admin's request found: the paper, and whether it was taken before or is now queued. */
export interface AdicionarPedido {
  pmid: string;
  title: string;
  /** The paper's earlier outcome when it was taken before; it is not taken again. */
  existing: { status: string; articleId: string | null } | null;
  queued: boolean;
}

/** One addition as the worker or the script left it. */
export interface Adicionado {
  at: string;
  actor: string;
  pmid: string;
  title: string;
  status: string;
  articleId: string | null;
  existing: boolean;
  selected: boolean;
  error: string | null;
}

export interface AdminAdicionados {
  rows: Adicionado[];
}

/** Why the paper was not included, for an outcome takePaper leaves unrecorded: nothing takes it later on its own. */
const NOT_INCLUDED: Record<string, string> = {
  "aguardando-pmc": "o texto integral ainda não chegou ao PMC",
  "aguardando-unpaywall": "o Unpaywall ainda não conhece o DOI",
  "aguardando-modelo": "as chamadas de modelo estão desligadas",
  "fonte-pausada": "a fonte da literatura está pausada",
};

/** "Não incluído: …; adicione de novo mais tarde", or null when the outcome is recorded. */
export function notIncluded(status: string): string | null {
  const why = NOT_INCLUDED[status];
  return why ? `Não incluído: ${why}. Nada o retoma sozinho; adicione de novo mais tarde.` : null;
}
