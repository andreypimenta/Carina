// Production SSR with a synthetic api. Failure modes recorded before the metadata change:
// - filtered and search feeds compete with their parent page in search results;
// - tracking and obsolete positioning parameters leak into canonical, or ordinary archives become noindex;
// - the second page of a list repeats the first page's title;
// - an issue's title omits its visible lead, or its metadata promotes a withdrawn citation;
// - an article invents a modification date from its source's publication date or omits its image;
// - a story has no machine-readable subject, or claims its first report as its own publication date.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, test } from 'node:test';
import * as cheerio from 'cheerio';
import type { FeedItemSummary, ReportCitation, ReportDetail, ReportKind, SiteItemDetail, StoryDetail } from '@aihot/contracts/site';
import { SITE } from '@aihot/site';
import { articleLd, readFilters, reportLd } from '../app/lib/seo.ts';
import { reportDateLabel } from '../app/features/report/format.ts';
import { startWebServer, type WebServer } from './web-server.ts';

const at = '2026-10-04T08:00:00.000Z';
const item: FeedItemSummary = { id: 'metadata-fixture', title: 'Traqueostomia precoce em lactentes', summary: 'Resumo da notícia', reason: null, source: { name: 'Fixture' }, publishedAt: at, timelineAt: at, category: 'evidence', tags: [], score: 80, selected: true, channel: 'news', x: null };
const detail = { ...item, originalTitle: null, links: { original: 'https://example.org/report' }, discoveredAt: at, story: null, readingMode: 'full', author: null, body: { zh: '<p>Texto verificável.</p>', original: null, zhKind: 'original', complete: true }, outline: [], relatedStories: [], topics: [], indexable: true, markdownAvailable: true, group: null, hasTranslation: false, bodyLanguage: 'pt' } as unknown as SiteItemDetail;
const citation = (available: boolean): ReportCitation => ({ itemId: available ? item.id : 'withdrawn', title: available ? item.title : 'Manchete antiga retirada', summary: item.summary, sourceName: item.source.name, sourceUrl: 'https://example.org/report', sourceIconUrl: null, firstParty: true, publishedAt: at, available } as ReportCitation);
const KEYS: Record<ReportKind, string> = { daily: '2026-10-04', weekly: '2026-W40', monthly: '2026-10' };
const report = (kind: ReportKind) => ({ kind, key: KEYS[kind], issueNumber: 1, title: `${SITE.name} · edição de teste`, generatedAt: at, lead: { title: 'Nova diretriz para estenose subglótica', leadParagraph: 'A abertura da edição.' }, leadItemId: item.id, overview: null, highlights: [citation(true)], sections: [], flashes: [], cover: null, metrics: {}, readingMinutes: 1, prev: null, next: null }) as unknown as ReportDetail;
const story = { publicId: 'metadata-story', title: 'Diretriz de via aérea pediátrica', status: 'settled', reportCount: 1, sourceCount: 1, firstReportAt: at, latestAt: at, digest: 'Síntese atual e verificável do evento.', digestUpdatedAt: '2026-10-04T09:00:00.000Z', summary: null, excerpt: null, latest: null, latestReport: null, whyHot: { participants48h: 0, newParticipants6h: 0, recentReports24h: 0, observationComplete: true, rank: null }, developments: [], officialReports: [], timeline: [{ id: item.id, title: item.title, summary: item.summary, source: { name: item.source.name, firstParty: true }, publishedAt: at, selected: true }], heat: [], related: [], topics: [] } as unknown as StoryDetail;

let web: WebServer;
const api = createServer((req, res) => {
  const url = new URL(req.url!, 'http://local');
  const path = url.pathname;
  res.setHeader('Content-Type', 'application/json');
  const send = (value: unknown) => res.end(JSON.stringify(value));
  if (path === '/api/site/meta') return send({ changelogVersion: 'fixture' });
  if (path === '/api/site/timeline') return send({ filters: readFilters(url.searchParams), cards: [{ key: item.id, anchorAt: at, item, group: null }], nextCursor: null, hot: null, dayCounts: { '2026-10-04': 1 } });
  if (path === '/api/site/pool') return send({ filters: { ...readFilters(url.searchParams), q: url.searchParams.get('q'), tab: url.searchParams.get('tab') ?? 'time' }, items: [item], page: Number(url.searchParams.get('page') ?? 1), pageCount: 3, total: 100, todayCount: 1, freshness: at });
  if (path === `/api/site/items/${item.id}`) return send(detail);
  if (path === `/api/site/stories/${story.publicId}`) return send(story);
  const match = /^\/api\/site\/reports\/(daily|weekly|monthly)\/(.+)$/.exec(path);
  if (match) {
    const r = report(match[1] as ReportKind);
    const index = [{ key: r.key, issueNumber: 1, title: r.title, count: 1 }];
    if (match[2] === 'latest-page') return send({ report: r, index });
    if (match[2]?.startsWith('navigation/')) return send({ items: index });
    if (match[2] === r.key) return send(r);
  }
  res.statusCode = 404;
  send({ code: 'not_found' });
});
before(async () => { web = await startWebServer(api); });
after(async () => { await web?.stop(); });

async function page(path: string) {
  const response = await fetch(`${web.origin}${path}`);
  assert.equal(response.status, 200, web.logs());
  return cheerio.load(await response.text());
}
function structured($: cheerio.CheerioAPI): Array<Record<string, unknown>> {
  return $("script[type='application/ld+json']").toArray().flatMap((node) => JSON.parse($(node).text()));
}

test('filtered feeds keep their exact content address but leave indexing to the plain lists', async () => {
  for (const base of ['/selecao', '/all']) for (const query of ['channel=news', 'category=evidence', 'tag=Traqueostomia', 'channel=x&category=cases&tag=Traqueostomia']) {
    const $ = await page(`${base}?${query}&utm_source=fixture&anchorAt=old&deep=1`);
    assert.equal($('meta[name=robots]').attr('content'), 'noindex, follow', `${base}?${query}`);
    assert.equal($('link[rel=canonical]').attr('href'), `${web.origin}${base}?${query}`);
    assert.ok($('main').text().includes(item.title));
  }
  const $ = await page('/all?q=estenose&tab=relevance&page=2&anchorAt=old');
  assert.equal($('meta[name=robots]').attr('content'), 'noindex, follow');
  assert.equal($('link[rel=canonical]').attr('href'), `${web.origin}/all?q=estenose&tab=relevance&page=2`);
});

test('plain feed pages stay indexable, drop ignored parameters and title their later pages', async () => {
  for (const [requested, canonical] of [['/selecao?channel=invalid&category=invalid&tag=%20&utm_source=fixture', '/selecao'], ['/all?channel=all&tab=relevance&anchorAt=old&page=2&utm_source=fixture', '/all?page=2']]) {
    const $ = await page(requested!);
    assert.equal($('meta[name=robots]').attr('content'), undefined);
    assert.equal($('link[rel=canonical]').attr('href'), `${web.origin}${canonical}`);
    if (canonical?.includes('page=2')) assert.equal($('title').text(), `Todas as notícias · Página 2 · ${SITE.name}`);
  }
  assert.equal((await page('/all'))('title').text(), `Todas as notícias · ${SITE.name}`);
});

test('the front page is the latest weekly edition, one page in search with /weekly; old feed links go to the Seleção', async () => {
  const r = report('weekly');
  const front = await page('/');
  assert.equal(front('link[rel=canonical]').attr('href'), `${web.origin}/`);
  assert.equal(front('title').text(), SITE.homeTitle);
  assert.ok(front('main').text().includes(r.lead!.title));
  assert.ok(structured(front).some((entry) => entry['@type'] === 'NewsArticle'));
  const weekly = await page('/weekly');
  assert.equal(weekly('link[rel=canonical]').attr('href'), `${web.origin}/`);
  assert.equal(weekly('meta[name=robots]').attr('content'), undefined);
  const old = await fetch(`${web.origin}/?category=evidence`, { redirect: 'manual' });
  assert.equal(old.status, 302);
  assert.equal(old.headers.get('location'), '/selecao?category=evidence');
  await old.text();
});

for (const [kind, label, date] of [['daily', 'Notas diárias', '04/10/2026'], ['weekly', 'Edição semanal', '28/09 a 04/10/2026'], ['monthly', 'Balanço mensal', 'outubro de 2026']] as const) {
  test(`${kind} issue metadata carries its visible lead and dates`, async () => {
    const r = report(kind);
    const $ = await page(`/${kind}/${r.key}`);
    const title = `${label} de ${date}: ${r.lead!.title}`;
    assert.equal($('title').text(), `${title} · ${SITE.name}`);
    assert.equal($("meta[property='og:title']").attr('content'), title);
    assert.ok($('main').text().includes(r.lead!.title));
    const article = structured($).find((entry) => entry['@type'] === 'NewsArticle')!;
    assert.equal(article.headline, title);
    assert.equal(article.image, `${web.origin}/og/reports/${kind}/${r.key}.png`);
    assert.equal('dateModified' in article, false);
  });
}

test("an issue's dates read as readers write them, across months and years", () => {
  assert.equal(reportDateLabel('daily', '2026-10-17'), '17/10/2026');
  assert.equal(reportDateLabel('weekly', '2026-W42'), '12/10 a 18/10/2026');
  assert.equal(reportDateLabel('weekly', '2026-W53'), '28/12/2026 a 03/01/2027');
  assert.equal(reportDateLabel('monthly', '2026-01'), 'janeiro de 2026');
});

test('an issue without an edited lead uses only a still-public visible highlight', () => {
  const r = { ...report('weekly'), lead: null, highlights: [citation(false), citation(true)] };
  assert.match(reportLd(r, '/weekly/2026-W40', 'Abertura').headline, new RegExp(item.title));
  assert.doesNotMatch(reportLd(r, '/weekly/2026-W40', 'Abertura').headline, /retirada/);
});

test('article metadata has a representative image and does not invent an update time', async () => {
  const $ = await page(`/items/${item.id}`);
  const article = structured($).find((entry) => entry['@type'] === 'NewsArticle')!;
  assert.equal(article.image, `${web.origin}/og/items/${item.id}.png`);
  assert.equal(article.datePublished, at);
  assert.equal('dateModified' in article, false);
  assert.equal(article.isBasedOn, 'https://example.org/report');
  assert.deepEqual(article.author, { '@id': `${web.origin}/#organization` });
  const modified = '2026-10-04T10:00:00.000Z';
  assert.equal(articleLd({ path: '/items/test', headline: 'Correção', modifiedAt: modified }).dateModified, modified);
});

test('story metadata describes the visible collection, its current digest and its reports', async () => {
  const $ = await page(`/story/${story.publicId}`);
  const collection = structured($).find((entry) => entry['@type'] === 'CollectionPage')!;
  assert.ok(collection);
  assert.equal(collection.name, story.title);
  assert.equal(collection.description, story.digest);
  assert.equal(collection.dateModified, story.digestUpdatedAt);
  assert.equal('datePublished' in collection, false);
  const list = collection.mainEntity as { itemListElement: Array<{ name: string }> };
  assert.deepEqual(list.itemListElement.map((entry) => entry.name), [item.title]);
  assert.ok($('main').text().includes(story.digest!));
});
