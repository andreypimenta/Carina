-- Each X post the literature module has researched, once: the paper it points to (PMID), what became of it,
-- and how many runs failed on it. A post whose paper is still waiting (PMC, Unpaywall, the model) is taken
-- again on later runs; one with no paper found stays out of the editions (server.ts takesXPosts).
CREATE TABLE IF NOT EXISTS literatura_x_posts (
  article_id text PRIMARY KEY,
  status text NOT NULL,
  pmid text,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
