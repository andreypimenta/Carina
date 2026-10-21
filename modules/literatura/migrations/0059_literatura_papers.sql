-- Each PubMed paper the literature module has taken, once: what became of it and the article it entered as.
CREATE TABLE IF NOT EXISTS literatura_papers (
  pmid text PRIMARY KEY,
  status text NOT NULL,
  article_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
