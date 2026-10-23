-- Each weekly edition once per channel: when its sends were planned, and for how many confirmed readers.
-- A reader confirmed after that waits for the next edition.
CREATE TABLE IF NOT EXISTS assinatura_editions (
  edition_key text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('email', 'whatsapp')),
  planned_at timestamptz NOT NULL DEFAULT now(),
  recipients integer NOT NULL,
  PRIMARY KEY (edition_key, channel)
);
