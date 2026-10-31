-- What a reader did with one e-mailed edition, counted by its first-party links (/assine/l, backend/reads.ts):
-- clicks taken for a person and those taken for a link scanner, when the first person's click came, when the
-- case of the week was answered and "Indique a um colega" clicked, and the bounce, complaint or leaving that
-- followed it. Counts and times only: no IP, browser or link is kept. burst_at and burst_clicks hold the
-- current run of quick clicks, which turns into a scanner's when it reaches every link at once.
CREATE TABLE IF NOT EXISTS assinatura_reads (
  send_id bigint PRIMARY KEY REFERENCES assinatura_sends (id) ON DELETE CASCADE,
  clicks integer NOT NULL DEFAULT 0,
  bot_clicks integer NOT NULL DEFAULT 0,
  first_click_at timestamptz,
  answered_at timestamptz,
  indique_at timestamptz,
  burst_at timestamptz,
  burst_clicks integer NOT NULL DEFAULT 0,
  bounced_at timestamptz,
  complained_at timestamptz,
  left_at timestamptz
)
