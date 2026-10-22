-- Each PubMed paper the literature module has taken, once: what became of it, the article it entered as,
-- and how many runs failed on it (a paper that keeps failing is given up after a few, not paid for forever).
CREATE TABLE IF NOT EXISTS literatura_papers (
  pmid text PRIMARY KEY,
  status text NOT NULL,
  article_id text,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
