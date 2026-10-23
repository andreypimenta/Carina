-- The PMIDs an editor requires in a special's list of studies, beside those its search finds: the classics a
-- search does not reach.
ALTER TABLE literatura_especiais ADD COLUMN IF NOT EXISTS pmids text[] NOT NULL DEFAULT '{}'
