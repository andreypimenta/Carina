-- Why each new matéria can be trusted (confianca.ts): its "Em um minuto", population, design, main limitation,
-- the text the pipeline read, whether it is a preprint and a guideline's dates, written with the matéria.
-- Matérias written before it have no row and show none of it.
CREATE TABLE IF NOT EXISTS literatura_confianca (
  article_id text PRIMARY KEY,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
