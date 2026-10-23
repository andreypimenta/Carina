-- Where each Instagram feed (a hashtag or a profile, industry/instagram.json) has been read up to: the newest
-- post seen. A later run takes only posts after it, less the 48 hours the engine still counts as new.
CREATE TABLE IF NOT EXISTS instagram_feeds (
  feed text PRIMARY KEY,
  newest_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
