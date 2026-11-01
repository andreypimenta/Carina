// Run after `npm run build -w @aihot/web`. Real production server/router, synthetic HTTP API only.
// Failure cases: /assine/<week> opening its stories on the site's article pages, or with a sign-up form above
// the edition; its article page leading into the rest of the site; the weekly issue's page without the
// button that copies the /assine link, or the button on a daily issue or on /assine itself; an article, on the
// site, on its lean page or in a weekly issue, without the WhatsApp button that sends its lean page.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { chromium, expect, type Browser, type Locator } from "@playwright/test";
import type { ReportCitation, ReportDetail, SiteItemDetail } from "@aihot/contracts/site";
import { startWebServer, type WebServer } from "./web-server.ts";

const WEEK = "2026-W43";
const at = "2026-10-20T08:00:00.000Z";
const story = (id: string, title: string): ReportCitation => ({
  itemId: id, title, summary: `Resumo de ${title}`, sourceName: "Fonte", sourceUrl: `https://example.org/${id}`, available: true, publishedAt: at,
} as ReportCitation);
function report(kind: "weekly" | "daily", key: string): ReportDetail {
  return {
    kind, key, issueNumber: 1, title: "Edição de teste", generatedAt: at,
    lead: { title: "Manchete da semana", leadParagraph: "Abertura" }, leadItemId: "lead-1", overview: "Panorama",
    highlights: [story("high-1", "Destaque")], sections: [{ label: "Seção", summary: null, items: [story("lead-1", "Manchete da semana"), story("sec-1", "Matéria da seção")] }],
    flashes: [story("flash-1", "Nota rápida")], cover: null, metrics: {}, readingMinutes: 3, prev: null, next: null, modules: {},
  } as ReportDetail;
}
const item: SiteItemDetail = {
  ownText: false, id: "sec-1", title: "Matéria da seção", summary: "Resumo da matéria", reason: "Por que ler", source: { name: "Fonte" },
  publishedAt: at, timelineAt: at, discoveredAt: at, category: "reviews", tags: ["tag"], score: 80, selected: true,
  channel: "news", x: null, originalTitle: null, links: { original: "https://doi.org/10.1000/xyz" },
  story: null, readingMode: "full", author: null, outline: [], relatedStories: [], topics: [{ slug: "topico", name: "Tópico" }], indexable: true,
  markdownAvailable: true, group: null, hasTranslation: false, bodyLanguage: "zh", weekly: WEEK,
  body: { zh: "<p>Texto completo da matéria.</p>", original: null, zhKind: "original", complete: true },
} as SiteItemDetail;
const translated: SiteItemDetail = {
  ...item, id: "tr-1", hasTranslation: true,
  body: { zh: "<p>Começo traduzido.</p>", original: "<p>Full original text.</p>", zhKind: "translation", complete: false },
} as SiteItemDetail;

const literaturaPart = (fields: Record<string, unknown>) => ({ confianca: null, feitura: null, estado: null, versoes: [], mesmoEnsaio: [], correcoes: [], resumoEditor: null, ...fields });
const semFicha: SiteItemDetail = { ...item, id: "sem-ficha", ownText: true, modules: { literatura: literaturaPart({ feitura: "materia" }) } } as SiteItemDetail;
const semConferir: SiteItemDetail = {
  ...item, id: "sem-conferir", ownText: true,
  modules: {
    literatura: literaturaPart({
      feitura: "materia",
      confianca: { feitura: "materia", estrutura: "unica", minuto: null, populacao: { idade: "não informada", doenca: "Sibilância", cenario: "não informado" }, desenho: "coorte", desenhoDetalhe: null, limitacao: "não informada", conflitos: "Não informado", preprint: false, datas: null },
    }),
  },
} as SiteItemDetail;

const api = createServer((req, res) => {
  const path = new URL(req.url!, "http://api.local").pathname;
  res.setHeader("Content-Type", "application/json");
  if (path === "/api/site/meta") return res.end(JSON.stringify({ changelogVersion: "fixture" }));
  if (path === "/api/site/track") { res.statusCode = 204; return res.end(); }
  if (path === "/api/assinatura") return res.end(JSON.stringify({ email: true, whatsapp: null }));
  if (path === `/api/site/reports/weekly/${WEEK}`) return res.end(JSON.stringify(report("weekly", WEEK)));
  if (path === "/api/site/reports/weekly/latest-page") return res.end(JSON.stringify({ index: [{ key: WEEK, issueNumber: 1, title: "Edição de teste" }], report: report("weekly", WEEK) }));
  if (path === "/api/site/reports/daily/2026-10-20") return res.end(JSON.stringify(report("daily", "2026-10-20")));
  if (/^\/api\/site\/reports\/(weekly|daily)\/navigation\//.test(path)) return res.end(JSON.stringify({ items: [] }));
  if (path === "/api/site/items/sec-1") return res.end(JSON.stringify(item));
  if (path === "/api/site/items/tr-1") return res.end(JSON.stringify(translated));
  if (path === "/api/site/items/sem-ficha") return res.end(JSON.stringify(semFicha));
  if (path === "/api/site/items/sem-conferir") return res.end(JSON.stringify(semConferir));
  res.statusCode = 404;
  res.end(JSON.stringify({ code: "not_found" }));
});

let web: WebServer;
let chrome: Browser | undefined;
// The browser starts with the first test that needs it.
const browser = async () => (chrome ??= await chromium.launch({ channel: "chromium" }));
before(async () => { web = await startWebServer(api); });
// The page may still be hydrating after it loads, and a click before that does nothing: click until it answers.
const clickUntil = (button: Locator, answer: Locator) =>
  expect(async () => {
    await button.click();
    await expect(answer).toBeVisible({ timeout: 1000 });
  }).toPass();
after(async () => {
  await chrome?.close();
  await web?.stop();
});

async function page(path: string): Promise<string> {
  const response = await fetch(`${web.origin}${path}`);
  assert.equal(response.status, 200, web.logs());
  return response.text();
}
const hrefs = (html: string) => [...html.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => m[1]!);

for (const path of ["/assine", `/assine/${WEEK}`]) {
  test(`${path} opens its stories on lean pages under its address and asks to sign up only after the edition`, async () => {
    const html = await page(path);
    const links = hrefs(html);
    for (const id of ["lead-1", "high-1", "sec-1", "flash-1"]) assert.ok(links.includes(`/assine/${WEEK}/${id}`), `${id} links to its lean page`);
    assert.ok(!links.some((href) => href.startsWith("/items/")), "no story leads to the site's article page");
    assert.ok(links.includes("https://example.org/sec-1"), "the original stays as it is");
    const form = html.indexOf("Quero receber por e-mail");
    assert.ok(form > html.indexOf("(Fim desta edição)"), "the form comes after the edition");
    assert.equal(html.indexOf("Quero receber por e-mail", form + 1), -1, "and only once");
    assert.doesNotMatch(html, /Copiar link para grupos/);
  });
}

test("/assine sets the lead first on a phone, and under the overview beside the highlights once it has two columns below the desktop width", async () => {
  const context = await (await browser()).newContext({ viewport: { width: 390, height: 844 } });
  const tab = await context.newPage();
  const box = async (locator: Locator) => (await locator.boundingBox())!;
  const places = async () => ({
    overview: await box(tab.getByRole("region", { name: "Panorama da edição" })),
    lead: await box(tab.getByRole("heading", { name: "Manchete da semana", level: 2 })),
    highlights: await box(tab.getByText("Destaques da semana", { exact: true })),
  });
  try {
    await tab.goto(`${web.origin}/assine/${WEEK}`);
    const phone = await places();
    assert.ok(phone.lead.y < phone.overview.y, "the lead comes first");
    assert.ok(phone.overview.y < phone.highlights.y, "then the overview, then the highlights");

    await tab.setViewportSize({ width: 930, height: 844 });
    const twoColumns = await places();
    assert.ok(twoColumns.overview.y + twoColumns.overview.height <= twoColumns.lead.y, "the overview opens the issue");
    assert.ok(twoColumns.highlights.x > twoColumns.lead.x, "the highlights sit in the right column");
    assert.ok(twoColumns.highlights.y < twoColumns.lead.y + twoColumns.lead.height, "beside the lead");
  } finally {
    await context.close();
  }
});

test("an article opened from /assine shows its text, the original and the form, and no way into the site", async () => {
  const html = await page(`/assine/${WEEK}/sec-1`);
  assert.match(html, /Matéria da seção/);
  assert.match(html, /Texto completo da matéria\./);
  assert.match(html, /Quero receber por e-mail/);
  assert.match(html, /<meta name="robots" content="noindex, follow"/);
  assert.match(html, /<meta property="og:image" content="[^"]*\/og\/items\/sec-1\.png"/);
  const links = hrefs(html);
  assert.ok(links.includes("https://doi.org/10.1000/xyz"), "it links the original");
  assert.ok(links.includes(`/assine/${WEEK}`), "it leads back to the edition");
  const site = links.filter((href) => href.startsWith("/") && !href.startsWith("/assine/") && href !== "/privacy" && href !== "/terms");
  assert.deepEqual(site, [], "nothing else leads into the site");
  assert.doesNotMatch(html, /Edição semanal<\/a>|\/weekly/);
});

test("an article opened from /assine says when its text is an incomplete AI translation", async () => {
  const html = await page(`/assine/${WEEK}/tr-1`);
  assert.match(html, /Começo traduzido\./);
  assert.match(html, /Texto · tradução por IA/);
  assert.match(html, /A tradução ainda está incompleta; veja o texto completo no original\./);
  assert.doesNotMatch(await page(`/assine/${WEEK}/sec-1`), /tradução por IA|tradução ainda está incompleta/);
});

for (const at of [`/assine/${WEEK}/`, "/items/"]) {
  test(`${at}: a matéria without a trust record says it was written with AI, and the card never states what nobody checked`, async () => {
    assert.match(await page(`${at}sem-ficha`), /Matéria escrita com inteligência artificial e publicada automaticamente/);
    const html = (await page(`${at}sem-conferir`)).replace(/<script[\s\S]*?<\/script>/g, "");
    assert.match(html, /Matéria escrita com inteligência artificial/);
    assert.match(html, /População/);
    assert.match(html, /Sibilância/);
    assert.doesNotMatch(html, /Conflitos de interesse|Principal limitação|[Nn]ão informad/);
  });
}

test("an article page under /assine needs a week in its address", async () => {
  const response = await fetch(`${web.origin}/assine/semana/sec-1`);
  assert.equal(response.status, 404);
});

test("the weekly issue's page copies its /assine address for the groups; a daily's has no such button", async () => {
  for (const path of ["/weekly", `/weekly/${WEEK}`]) assert.match(await page(path), /Copiar link para grupos/, path);
  assert.doesNotMatch(await page("/daily/2026-10-20"), /Copiar link para grupos/);

  const context = await (await browser()).newContext();
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: web.origin });
  const tab = await context.newPage();
  await tab.goto(`${web.origin}/weekly/${WEEK}`);
  await clickUntil(tab.getByRole("button", { name: "Copiar link para grupos" }), tab.getByText("Link copiado"));
  assert.equal(await tab.evaluate(() => navigator.clipboard.readText()), `${web.origin}/assine/${WEEK}`);
  await context.close();
});

test("where the browser refuses to copy, the button shows the address to select", async () => {
  const context = await (await browser()).newContext();
  const tab = await context.newPage();
  await tab.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: () => Promise.reject(new Error("denied")) } });
    document.execCommand = () => false;
  });
  await tab.goto(`${web.origin}/weekly/${WEEK}`);
  await clickUntil(tab.getByRole("button", { name: "Copiar link para grupos" }), tab.getByLabel("Link para grupos"));
  assert.equal(await tab.getByLabel("Link para grupos").inputValue(), `${web.origin}/assine/${WEEK}`);
  await context.close();
});

test("where the browser can neither share nor copy, Indique a um colega shows the sign-up link to select", async () => {
  const context = await (await browser()).newContext();
  const tab = await context.newPage();
  await tab.addInitScript(() => {
    Object.defineProperty(navigator, "share", { value: undefined });
    Object.defineProperty(navigator, "clipboard", { value: { writeText: () => Promise.reject(new Error("denied")) } });
    document.execCommand = () => false;
  });
  await tab.goto(`${web.origin}/assine/${WEEK}`);
  await clickUntil(tab.getByRole("button", { name: "Enviar o link" }), tab.getByLabel("Link da inscrição"));
  assert.equal(await tab.getByLabel("Link da inscrição").inputValue(), `${web.origin}/assine?g=indique`);
  await context.close();
});

const whatsapp = (html: string) => hrefs(html).filter((href) => href.startsWith("https://wa.me/?text="))
  .map((href) => decodeURIComponent(href.slice("https://wa.me/?text=".length).replace(/&amp;/g, "&")));

test("an article goes to WhatsApp as its title and its lean page under the weekly issue that cites it", async () => {
  const lean = `${web.origin}/assine/${WEEK}/sec-1`;
  for (const path of ["/items/sec-1", `/assine/${WEEK}/sec-1`]) {
    const html = await page(path);
    assert.deepEqual(whatsapp(html), [`Matéria da seção\n${lean}`], path);
    assert.match(html, /Mandar no WhatsApp/, path);
    assert.match(html, />Copiar link</, path);
  }
});

test("each story of a weekly issue can be sent to WhatsApp, and a daily's cannot", async () => {
  for (const path of [`/weekly/${WEEK}`, `/assine/${WEEK}`]) {
    const sent = whatsapp(await page(path));
    for (const [id, title] of [["lead-1", "Manchete da semana"], ["sec-1", "Matéria da seção"]]) {
      assert.ok(sent.includes(`${title}\n${web.origin}/assine/${WEEK}/${id}`), `${path}: ${id}`);
    }
  }
  assert.deepEqual(whatsapp(await page("/daily/2026-10-20")), []);
});
