// Sitemap failure modes:
// - news activity invents lastmod dates for static pages, while corrections keep an old report date;
// - a report's lastmod survives a later change to material it cites;
// - unreleased selections or non-editorial sources leak into search discovery;
// - the site's own modules (agenda, especiais) drop out of the sitemap.
import './setup.ts';
import assert from 'node:assert/strict';
import { after, afterEach, test } from 'node:test';
import { sql, closeDb } from '@aihot/backend/db';
import { installModules } from '@aihot/backend/modules';
import { loadSitemapEntries } from '@aihot/backend/publication/sitemap';
import agenda from '../modules/agenda/server.ts';
import literatura from '../modules/literatura/server.ts';

after(closeDb);
afterEach(() => installModules([]));

async function material(id: string, options: { source?: string; future?: boolean } = {}) {
  const source = options.source ?? 'sitemap-editorial';
  await sql`INSERT INTO sources (id,name,kind,tier,participation_mode) VALUES (${source},${source},'rss','T1',${source === 'sitemap-signal' ? 'hot_signal' : 'editorial'}) ON CONFLICT DO NOTHING`;
  await sql`INSERT INTO articles (id,source_id,identity_key,url,title,published_at,timeline_at,discovered_at,updated_at)
    VALUES (${id},${source},${id},${`https://example.org/${id}`},'Notícia pública','2026-10-01','2026-10-01','2026-10-01','2026-10-01')`;
  await sql`INSERT INTO publications (article_id,source_id,title,summary,url,timeline_at,discovered_at,sort_at,selected,eligible,indexable,visible_after,updated_at,channel,category)
    VALUES (${id},${source},'Notícia pública','Resumo público',${`https://example.org/${id}`},'2026-10-01','2026-10-01','2026-10-01',true,true,true,
      ${options.future ? '2100-01-01' : '2026-10-01'},'2026-10-01','news','evidence')`;
}

test('sitemap dates follow page content and publication scope', async () => {
  await material('dates-visible');
  await material('dates-future', { future: true });
  await material('dates-signal', { source: 'sitemap-signal' });
  await sql`INSERT INTO reports (kind,key,window_start,window_end,content,generated_at,updated_at)
    VALUES ('daily','2026-10-01','2026-09-30','2026-10-01','{}','2026-10-01T00:00:00Z','2026-10-04T00:00:00Z')`;
  const entries = await loadSitemapEntries(new Date('2026-10-09'));
  for (const loc of ['/', '/all', '/hot', '/agent', '/changelog']) {
    assert.equal(entries.find(e => e.loc === loc)?.lastmod, undefined, `${loc} must not borrow the news clock`);
  }
  assert.equal(entries.find(e => e.loc === '/daily/2026-10-01')?.lastmod?.toISOString(), '2026-10-04T00:00:00.000Z');
  assert.ok(entries.some(e => e.loc === '/items/dates-visible'));
  assert.ok(!entries.some(e => e.loc === '/items/dates-future'));
  assert.ok(!entries.some(e => e.loc === '/items/dates-signal'));
});

test('a report citing items keeps its correction date until a cited item changes later', async () => {
  await material('cited-item');
  await sql`INSERT INTO reports (kind,key,window_start,window_end,content,generated_at,updated_at)
    VALUES ('weekly','2026-W40','2026-09-28','2026-10-04','{"leadItemId":"cited-item","sections":[{"items":[{"itemId":"cited-item"}]}]}',
      '2026-10-05T00:00:00Z','2026-10-06T00:00:00Z')`;
  const lastmod = async () => (await loadSitemapEntries(new Date('2026-10-09'))).find(e => e.loc === '/weekly/2026-W40')?.lastmod;
  assert.equal((await lastmod())?.toISOString(), '2026-10-06T00:00:00.000Z');
  await sql`UPDATE publications SET updated_at='2026-10-07T00:00:00Z' WHERE article_id='cited-item'`;
  assert.equal(await lastmod(), null, 'a cited item changed after the issue');
});

test("the site's modules keep their pages in the sitemap", async () => {
  installModules([agenda, literatura]);
  const locs = (await loadSitemapEntries()).map(e => e.loc);
  assert.ok(locs.includes('/agenda'));
  assert.ok(locs.includes('/especiais'));
  assert.ok(locs.indexOf('/especiais') < locs.indexOf('/agent'), 'module pages come before the site pages');
});
