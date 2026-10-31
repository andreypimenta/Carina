-- The section the reader asked to read first (an AREAS key, industry/taxonomy.ts); null: both, in the journal's order.
ALTER TABLE assinatura_subscribers ADD COLUMN IF NOT EXISTS interest text
