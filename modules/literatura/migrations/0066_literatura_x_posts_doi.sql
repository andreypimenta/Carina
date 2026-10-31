-- The DOI an X post points to while PubMed does not have it yet ('aguardando-pubmed'): later runs ask PubMed
-- for it again, without reading the post's pages again.
ALTER TABLE literatura_x_posts ADD COLUMN IF NOT EXISTS doi text
