CREATE INDEX CONCURRENTLY IF NOT EXISTS literatura_estudos_ids_idx ON literatura_estudos USING gin (ids)
