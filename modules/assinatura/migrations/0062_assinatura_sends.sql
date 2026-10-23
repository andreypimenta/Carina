-- One send per reader and edition, so no edition reaches an address twice. `pending` waits for
-- next_attempt_at (a failure that may pass is tried again a few times); `unknown` may have arrived and is
-- never sent again on its own; `skipped` was not sent because the reader left or the edition is gone.
CREATE TABLE IF NOT EXISTS assinatura_sends (
  id bigserial PRIMARY KEY,
  subscriber_id bigint NOT NULL REFERENCES assinatura_subscribers (id) ON DELETE CASCADE,
  edition_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'unknown', 'skipped')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  response text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subscriber_id, edition_key)
);
