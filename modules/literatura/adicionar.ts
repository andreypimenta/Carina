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
