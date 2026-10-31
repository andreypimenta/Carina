-- Each regulatory act (an openFDA recall or 510(k), an Anvisa news item) and each ELSO guideline version the
-- module has read, once (backend/alertas.ts, backend/elso.ts): what became of it and the article it entered as.
CREATE TABLE IF NOT EXISTS literatura_alertas (
  key text PRIMARY KEY,
  status text NOT NULL,
  article_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
