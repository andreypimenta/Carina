-- An edition's counts for the readers whose addresses the retention run erased (backend/subscribers.ts), so its
-- rates do not change when they go: what was delivered to them, how many clicked, answered the case, clicked
-- "Indique", left after it and complained. Counts only.
CREATE TABLE IF NOT EXISTS assinatura_erased (
  edition_key text NOT NULL,
  channel text NOT NULL,
  delivered integer NOT NULL DEFAULT 0,
  clicked integer NOT NULL DEFAULT 0,
  answered integer NOT NULL DEFAULT 0,
  indique integer NOT NULL DEFAULT 0,
  left_after integer NOT NULL DEFAULT 0,
  complained integer NOT NULL DEFAULT 0,
  PRIMARY KEY (edition_key, channel)
)
