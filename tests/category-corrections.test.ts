// Failure cases: a benchmark, policy note, product or follow-up is counted as a regulatory approval; a category
// correction leaves frozen daily/weekly/monthly columns stale, rewrites the lead or selection, triggers
// a paid digest, leaves an obsolete section introduction, or commits without its audit/revision.
import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { sql, closeDb } from "@aihot/backend/db";
import { overrideFields } from "@aihot/backend/admin/content";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { publishArticle } from "@aihot/backend/publication/publish";
import { dailyMetrics } from "@aihot/backend/reports/compose";
import type { EditionEntry } from "@aihot/backend/reports/edition";
import { QUEUES, getBoss, stopBoss } from "@aihot/backend/jobs/queue";

after(async () => { await stopBoss(); await closeDb(); });

test("approvals require a release classification as well as an official, new approval event", () => {
  const base = { category: "regulatory", tags: ["Aprovação regulatória"], authority: 0, previous: null,
    entry: { sourceId: "official", firstParty: true } } as EditionEntry;
  const rows = [base, { ...base, tags: ["Benchmark/avaliação"] }, { ...base, tags: ["Política/regulação"] },
    { ...base, category: "products" }, { ...base, authority: 3 },
    { ...base, previous: { key: "2026-09-30", title: "Aprovação já noticiada" } }, { ...base, tags: [] }];
  assert.equal(dailyMetrics(rows).modelsReleased, 1);
  assert.equal(dailyMetrics(rows).totalEvents, 7);
});

test("category corrections revise every standard report atomically without selecting, rewriting or notifying", async () => {
  await getBoss(); // the digest check below reads the job table
  const sourceId = `category-${tag()}`;
  await sql`INSERT INTO sources (id,name,kind,tier,participation_mode) VALUES (${sourceId},'Category fixture','rss','T1','editorial')`;
  const { articleId } = await upsertMaterial({ sourceId, url: `https://example.com/${sourceId}`, title: "Ferramenta de triagem por IA", bodyText: "Texto da ferramenta", bodyStatus: "ok", via: "fetch", publishedAt: new Date() });
  await sql`INSERT INTO analyses (article_id,input_revision,origin,relevance,category,tags,title_zh,summary_zh,score,selected)
    VALUES (${articleId},1,'rule','pass','regulatory',ARRAY['Aprovação regulatória','FDA'],'Ferramenta de triagem por IA','Resumo congelado',88,true)`;
  const [story] = await sql`INSERT INTO stories (public_id,title) VALUES (gen_random_uuid(),'Evento da ferramenta') RETURNING id`;
  const [fact] = await sql`INSERT INTO facts (public_id,title,story_id) VALUES (${`f-${tag()}`},'Lançamento da ferramenta',${story!.id}) RETURNING id`;
  await sql`INSERT INTO fact_articles (fact_id,article_id,role) VALUES (${fact!.id},${articleId},'report')`;
  await publishArticle(articleId, { releasedAt: new Date() });
  const entry = { itemId: articleId, title: "Título congelado", summary: "Resumo congelado", sourceId, firstParty: true, role: "Oficial" };
  const contents = [
    { kind: "daily", key: "2097-01-02", content: { leadItemId: articleId, lead: { title: "Manchete congelada" }, highlights: [articleId], flashes: [], sections: [{ label: "Regulação e políticas", items: [entry] }], metrics: { totalEvents: 1, modelsReleased: 1 } } },
    ...(["weekly", "monthly"] as const).map(kind => ({ kind, key: kind === "weekly" ? "2097-W01" : "2097-01", content: { headline: "Manchete congelada", leadItemId: articleId, storyOrder: [articleId], overview: "Panorama mantido", themes: [{ heading: "Regulação e políticas", summary: "Introdução antiga de regulação", storyRefs: [entry] }], metrics: { totalStories: 1 } } })),
  ];
  for (const r of contents) await sql`INSERT INTO reports (kind,key,window_start,window_end,content,generated_at,origin)
    VALUES (${r.kind},${r.key},now(),now(),${sql.json(r.content as never)},now(),'imported')`;
  const [before] = await sql`SELECT selected,seat,score,visible_after,selected_ready_at FROM publications WHERE article_id=${articleId}`;
  const change = (actor: string) => overrideFields(articleId, { fields: { category: "products", tags: ["Produto/lançamento", "FDA"] }, version: 0, reason: "a ferramenta não é uma aprovação" }, actor);
  await sql.unsafe(`CREATE FUNCTION reject_category_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.actor = 'reject-category' THEN RAISE EXCEPTION 'category audit rejected'; END IF; RETURN NEW; END $$`);
  await sql.unsafe("CREATE TRIGGER reject_category_audit BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION reject_category_audit()");
  try {
    await assert.rejects(change("reject-category"), /category audit rejected/);
    assert.equal((await sql`SELECT category FROM publications WHERE article_id=${articleId}`)[0]!.category, "regulatory");
    assert.equal((await sql`SELECT 1 FROM report_revisions WHERE report_id IN (SELECT id FROM reports WHERE key IN ('2097-01-02','2097-W01','2097-01'))`).length, 0);
  } finally {
    await sql.unsafe("DROP TRIGGER reject_category_audit ON audit_log; DROP FUNCTION reject_category_audit()");
  }
  const digestCount = (await sql`SELECT count(*)::int AS n FROM pgboss.job WHERE name=${QUEUES.digest}`)[0]!.n;
  await change("test-category");
  for (const r of contents) {
    const [saved] = await sql`SELECT content,revision FROM reports WHERE kind=${r.kind} AND key=${r.key}`;
    assert.equal(saved!.revision, 2);
    const c = saved!.content;
    assert.equal(c.leadItemId, articleId);
    if (r.kind === "daily") {
      assert.deepEqual(c.sections, [{ label: "Produtos e ferramentas", items: [entry] }]);
      assert.equal(c.metrics.modelsReleased, 0);
      assert.deepEqual(c.highlights, [articleId]);
      assert.equal(c.lead.title, "Manchete congelada");
    } else {
      assert.deepEqual(c.themes, [{ heading: "Produtos e ferramentas", summary: null, storyRefs: [entry] }]);
      assert.deepEqual(c.storyOrder, [articleId]);
      assert.equal(c.overview, "Panorama mantido");
    }
  }
  assert.deepEqual((await sql`SELECT selected,seat,score,visible_after,selected_ready_at FROM publications WHERE article_id=${articleId}`)[0], before);
  assert.equal((await sql`SELECT count(*)::int AS n FROM pgboss.job WHERE name=${QUEUES.digest}`)[0]!.n, digestCount);
  await overrideFields(articleId, { fields: {}, clear: ["category", "tags"], version: 1, reason: "verificar a reversão da correção" }, "test-category");
  const [restored] = await sql`SELECT content FROM reports WHERE kind='daily' AND key='2097-01-02'`;
  assert.equal(restored!.content.sections[0].label, "Regulação e políticas");
  assert.equal(restored!.content.metrics.modelsReleased, 1);
});
