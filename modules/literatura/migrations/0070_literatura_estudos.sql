-- Each study the site published (backend/estudos.ts): where it stands (registered, recruiting, results deposited,
-- preprint, reviewed article) and the identifiers its versions share (trial registrations, DOIs, PMIDs), so the
-- registry entry, the preprint and the article of one study are linked instead of read as separate findings; the
-- original title and first author let a preprint and its article be matched when no identifier links them.
CREATE TABLE IF NOT EXISTS literatura_estudos (
  article_id text PRIMARY KEY,
  ids text[] NOT NULL DEFAULT '{}',
  estado text,
  titulo text,
  autor text,
  checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
