-- The journal's specials (especiais): texts the site writes from real PubMed references, one format each
-- (the first is the timeline, linha-do-tempo). A special is a draft until an editor approves it in the admin,
-- and goes on the site only when published from there; discarded ones are kept for the record. `writing` is
-- where the worker's writing of the draft is; `refs` are the studies its text cites as [n], with their
-- abstracts; `discarded` what the citation check took out of the text the model wrote; `issue_key` the
-- weekly issue that carried it.
CREATE TABLE IF NOT EXISTS literatura_especiais (
  id serial PRIMARY KEY,
  format text NOT NULL,
  theme text NOT NULL,
  query text NOT NULL,
  status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'aprovado', 'publicado', 'descartado')),
  writing text NOT NULL DEFAULT 'pendente' CHECK (writing IN ('pendente', 'pronto', 'falhou')),
  error text,
  title text,
  dek text,
  body text,
  refs jsonb NOT NULL DEFAULT '[]',
  discarded jsonb NOT NULL DEFAULT '[]',
  slug text UNIQUE,
  issue_key text,
  created_by text NOT NULL,
  approved_by text,
  approved_at timestamptz,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
