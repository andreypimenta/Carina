-- The public corrections the editor adds to a matéria (backend/correcoes.ts): the day, what changed and why,
-- shown at the end of the matéria.
CREATE TABLE IF NOT EXISTS literatura_correcoes (
  id bigserial PRIMARY KEY,
  article_id text NOT NULL,
  corrected_on date NOT NULL,
  what text NOT NULL,
  why text NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
