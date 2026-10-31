-- The children's hospitals' news, read only as leads (industry/pistas.json) since 31/10/2026: the sources that
-- published it as site content are paused, not deleted, so their articles stay and the Painel can resume them.
UPDATE sources SET enabled = false WHERE id IN ('rss-boston-childrens-answers', 'rss-cincinnati-research-horizons', 'web-cincinnati-releases', 'web-chop-news', 'web-sickkids-news', 'web-childrens-colorado', 'rss-gnews-site-cincinnati', 'rss-gnews-site-boston-answers', 'rss-gnews-site-chop')
