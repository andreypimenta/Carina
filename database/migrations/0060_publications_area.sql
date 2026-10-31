-- An item's public section (aba): the analysis's, else derived from its tags; backfilled by scripts/abas-preencher.ts.
ALTER TABLE publications ADD COLUMN IF NOT EXISTS area text;
