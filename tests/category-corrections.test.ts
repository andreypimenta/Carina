// Failure cases: a device note, regulation note, technique or follow-up is counted as a guideline; a category
// correction leaves a frozen daily's release figure stale, a tag or section (aba) correction that changes the section
// leaves frozen daily/weekly/monthly sections stale, a correction rewrites the lead or selection, triggers
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

const SURGERY = "Cirurgia torácica pediátrica e via aérea";
const PULMONOLOGY = "Pneumologia pediátrica";

after(async () => { await stopBoss(); await closeDb(); });

test("approvals require a release classification as well as an official, new approval event", () => {
  const base = { category: "guidelines", tags: ["Diretriz/consenso"], authority: 0, previous: null,
    entry: { sourceId: "official", firstParty: true } } as EditionEntry;
  const rows = [base, { ...base, tags: ["Dispositivo"] }, { ...base, tags: ["Regulação"] },
    { ...base, category: "technique" }, { ...base, authority: 3 },
    { ...base, previous: { key: "2026-09-30", title: "Diretriz já noticiada" } }, { ...base, tags: [] }];
  assert.equal(dailyMetrics(rows).modelsReleased, 1);
  assert.equal(dailyMetrics(rows).totalEvents, 7);
});

test("category corrections revise every standard report atomically without selecting, rewriting or notifying", async () => {
  await getBoss(); // the digest check below reads the job table
  const sourceId = `category-${tag()}`;
  await sql`INSERT INTO sources (id,name,kind,tier,participation_mode) VALUES (${sourceId},'Category fixture','rss','T1','editorial')`;
  const { articleId } = await upsertMaterial({ sourceId, url: `https://example.com/${sourceId}`, title: "Ferramenta de triagem por IA", bodyText: "Texto da ferramenta", bodyStatus: "ok", via: "fetch", publishedAt: new Date() });
  await sql`INSERT INTO analyses (article_id,input_revision,origin,relevance,category,tags,title_zh,summary_zh,score,selected)
    VALUES (${articleId},1,'rule','pass','guidelines',ARRAY['Diretriz/consenso','FDA'],'Ferramenta de triagem por IA','Resumo congelado',88,true)`;
  const [story] = await sql`INSERT INTO stories (public_id,title) VALUES (gen_random_uuid(),'Evento da ferramenta') RETURNING id`;
  const [fact] = await sql`INSERT INTO facts (public_id,title,story_id) VALUES (${`f-${tag()}`},'Lançamento da ferramenta',${story!.id}) RETURNING id`;
  await sql`INSERT INTO fact_articles (fact_id,article_id,role) VALUES (${fact!.id},${articleId},'report')`;
  await publishArticle(articleId, { releasedAt: new Date() });
  const entry = { itemId: articleId, title: "Título congelado", summary: "Resumo congelado", sourceId, firstParty: true, role: "Oficial" };
  const contents = [
    { kind: "daily", key: "2097-01-02", content: { leadItemId: articleId, lead: { title: "Manchete congelada" }, highlights: [articleId], flashes: [], sections: [{ label: SURGERY, items: [entry] }], metrics: { totalEvents: 1, modelsReleased: 1 } } },
    ...(["weekly", "monthly"] as const).map(kind => ({ kind, key: kind === "weekly" ? "2097-W01" : "2097-01", content: { headline: "Manchete congelada", leadItemId: articleId, storyOrder: [articleId], overview: "Panorama mantido", themes: [{ heading: SURGERY, summary: "Introdução antiga da cirurgia", storyRefs: [entry] }], metrics: { totalStories: 1 } } })),
  ];
  for (const r of contents) await sql`INSERT INTO reports (kind,key,window_start,window_end,content,generated_at,origin)
    VALUES (${r.kind},${r.key},now(),now(),${sql.json(r.content as never)},now(),'imported')`;
  const [before] = await sql`SELECT selected,seat,score,visible_after,selected_ready_at FROM publications WHERE article_id=${articleId}`;
  const change = (actor: string) => overrideFields(articleId, { fields: { category: "technique", tags: ["Técnica cirúrgica", "FDA"] }, version: 0, reason: "a ferramenta não é uma aprovação" }, actor);
  await sql.unsafe(`CREATE FUNCTION reject_category_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.actor = 'reject-category' THEN RAISE EXCEPTION 'category audit rejected'; END IF; RETURN NEW; END $$`);
  await sql.unsafe("CREATE TRIGGER reject_category_audit BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION reject_category_audit()");
  try {
    await assert.rejects(change("reject-category"), /category audit rejected/);
    assert.equal((await sql`SELECT category FROM publications WHERE article_id=${articleId}`)[0]!.category, "guidelines");
    assert.equal((await sql`SELECT 1 FROM report_revisions WHERE report_id IN (SELECT id FROM reports WHERE key IN ('2097-01-02','2097-W01','2097-01'))`).length, 0);
  } finally {
    await sql.unsafe("DROP TRIGGER reject_category_audit ON audit_log; DROP FUNCTION reject_category_audit()");
  }
  const digestCount = (await sql`SELECT count(*)::int AS n FROM pgboss.job WHERE name=${QUEUES.digest}`)[0]!.n;
  await change("test-category");
  // The section stays: only the daily's release figure follows the new category.
  for (const r of contents) {
    const [saved] = await sql`SELECT content,revision FROM reports WHERE kind=${r.kind} AND key=${r.key}`;
    const c = saved!.content;
    assert.equal(c.leadItemId, articleId);
    if (r.kind === "daily") {
      assert.equal(saved!.revision, 2);
      assert.deepEqual(c.sections, [{ label: SURGERY, items: [entry] }]);
      assert.equal(c.metrics.modelsReleased, 0);
      assert.deepEqual(c.highlights, [articleId]);
      assert.equal(c.lead.title, "Manchete congelada");
    } else {
      assert.equal(saved!.revision, 1);
      assert.deepEqual(c.themes, [{ heading: SURGERY, summary: "Introdução antiga da cirurgia", storyRefs: [entry] }]);
    }
  }
  assert.deepEqual((await sql`SELECT selected,seat,score,visible_after,selected_ready_at FROM publications WHERE article_id=${articleId}`)[0], before);
  assert.equal((await sql`SELECT count(*)::int AS n FROM pgboss.job WHERE name=${QUEUES.digest}`)[0]!.n, digestCount);
  await overrideFields(articleId, { fields: {}, clear: ["category", "tags"], version: 1, reason: "verificar a reversão da correção" }, "test-category");
  const [restored] = await sql`SELECT content FROM reports WHERE kind='daily' AND key='2097-01-02'`;
  assert.equal(restored!.content.sections[0].label, SURGERY);
  assert.equal(restored!.content.metrics.modelsReleased, 1);
  // Without the model's section, a tag of the other section moves the item there in every issue.
  await overrideFields(articleId, { fields: { tags: ["Diretriz/consenso", "Fibrose cística"] }, version: 2, reason: "a diretriz é de fibrose cística" }, "test-category");
  for (const r of contents) {
    const [saved] = await sql`SELECT content FROM reports WHERE kind=${r.kind} AND key=${r.key}`;
    const c = saved!.content;
    if (r.kind === "daily") assert.deepEqual(c.sections, [{ label: PULMONOLOGY, items: [entry] }]);
    else {
      assert.deepEqual(c.themes, [{ heading: PULMONOLOGY, summary: null, storyRefs: [entry] }]);
      assert.deepEqual(c.storyOrder, [articleId]);
      assert.equal(c.overview, "Panorama mantido");
    }
  }
});

test("an editor's section (aba) wins over the model's and moves the item in every issue; clearing it restores the model's", async () => {
  const sourceId = `area-${tag()}`;
  await sql`INSERT INTO sources (id,name,kind,tier,participation_mode) VALUES (${sourceId},'Area fixture','rss','T1','editorial')`;
  const { articleId } = await upsertMaterial({ sourceId, url: `https://example.com/${sourceId}`, title: "Estenose subglótica em lactentes", bodyText: "Texto", bodyStatus: "ok", via: "fetch", publishedAt: new Date() });
  await sql`INSERT INTO analyses (article_id,input_revision,origin,relevance,category,area,tags,title_zh,summary_zh,score,selected)
    VALUES (${articleId},1,'rule','pass','guidelines','cirurgia',ARRAY['Diretriz/consenso','Fibrose cística'],'Estenose subglótica em lactentes','Resumo',80,true)`;
  await publishArticle(articleId, { releasedAt: new Date() });
  const area = async () => (await sql`SELECT area FROM publications WHERE article_id=${articleId}`)[0]!.area;
  assert.equal(await area(), "cirurgia");
  const entry = { itemId: articleId, title: "Título congelado", summary: "Resumo", sourceId, firstParty: true, role: "Oficial" };
  const keys = { daily: "2097-02-02", weekly: "2097-W05", monthly: "2097-02" } as const;
  for (const [kind, key] of Object.entries(keys)) {
    const content = kind === "daily"
      ? { leadItemId: articleId, highlights: [articleId], flashes: [], sections: [{ label: SURGERY, items: [entry] }], metrics: { totalEvents: 1, modelsReleased: 1 } }
      : { headline: "Manchete", leadItemId: articleId, storyOrder: [articleId], overview: "Panorama", themes: [{ heading: SURGERY, summary: "Introdução", storyRefs: [entry] }], metrics: { totalStories: 1 } };
    await sql`INSERT INTO reports (kind,key,window_start,window_end,content,generated_at,origin)
      VALUES (${kind},${key},now(),now(),${sql.json(content as never)},now(),'imported')`;
  }
  const sections = async () => Promise.all(Object.entries(keys).map(async ([kind, key]) => {
    const c = (await sql`SELECT content FROM reports WHERE kind=${kind} AND key=${key}`)[0]!.content;
    return kind === "daily" ? c.sections.map((s: { label: string }) => s.label) : c.themes.map((t: { heading: string }) => t.heading);
  }));
  await overrideFields(articleId, { fields: { area: "pneumologia" }, version: 0, reason: "é pneumologia" }, "test-area");
  assert.equal(await area(), "pneumologia");
  assert.deepEqual(await sections(), [[PULMONOLOGY], [PULMONOLOGY], [PULMONOLOGY]]);
  await overrideFields(articleId, { fields: {}, clear: ["area"], version: 1, reason: "volta ao modelo" }, "test-area");
  assert.equal(await area(), "cirurgia");
  assert.deepEqual(await sections(), [[SURGERY], [SURGERY], [SURGERY]]);
  await assert.rejects(overrideFields(articleId, { fields: { area: "adulto" }, version: 2, reason: "aba inexistente" }, "test-area"));
});
