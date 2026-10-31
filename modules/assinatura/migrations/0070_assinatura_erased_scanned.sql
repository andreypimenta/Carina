-- The erased readers' sends whose clicks were all a link scanner's, so an edition's scanner-only figure does not change when they go.
ALTER TABLE assinatura_erased ADD COLUMN IF NOT EXISTS scanned integer NOT NULL DEFAULT 0
