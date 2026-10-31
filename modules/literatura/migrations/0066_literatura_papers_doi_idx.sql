CREATE INDEX CONCURRENTLY IF NOT EXISTS literatura_papers_doi_idx ON literatura_papers (doi) WHERE doi IS NOT NULL
