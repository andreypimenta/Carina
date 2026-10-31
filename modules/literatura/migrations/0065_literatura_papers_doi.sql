-- The DOI of each paper taken, so a paper read in a journal's table of contents before PubMed had it
-- (keyed `doi:<DOI>` in pmid) and its later PubMed record are one article.
ALTER TABLE literatura_papers ADD COLUMN IF NOT EXISTS doi text
