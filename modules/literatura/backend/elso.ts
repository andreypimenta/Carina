// The pediatric and neonatal ECMO guidelines of ELSO (Extracorporeal Life Support Organization), from its official
// open guidelines page (industry/alertas.json elso): each card names a guideline, its link and the month it was
// last updated. The documents themselves are a journal's pages that refuse the site's crawler or PDFs, so they are
// not read: a guideline that appears, or whose update month changes, becomes a short notice of what the page says
// (its title, its update month, the official link), with its dates (updated, verified by the journal), written
// without a model. The page's guidelines found on the first read are the baseline, never news (literatura_alertas).
import * as cheerio from "cheerio";
import { SITE } from "@aihot/site";
import { beijingDate } from "@aihot/contracts/time";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { sanitizeBody } from "@aihot/backend/content/sanitize";
import { sql } from "@aihot/backend/db";
import { queueProcessing } from "@aihot/backend/jobs/content";
import { guardedFetch } from "@aihot/backend/lib/http-fetch";
import { blockText } from "./access.ts";
import { alertasSettings, type AlertasSettings } from "./alertas.ts";
import { saveConfianca } from "./confianca.ts";
import { dataBr, type Confianca } from "../confianca.ts";

export const ELSO_SOURCE = "elso-diretrizes";

export interface Guideline {
  title: string;
  /** The guideline's link on the card: ELSO's PDF when it gives one, else the journal's page. */
  url: string;
  /** "Last updated: June 2026" as YYYY-MM; null when the card gives none. */
  updated: string | null;
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** The page's guideline cards, commented-out ones left out. */
export function parseGuidelines(html: string, pageUrl: string): Guideline[] {
  const $ = cheerio.load(html.replace(/<!--[\s\S]*?-->/g, ""));
  const out: Guideline[] = [];
  $("div.rounded-border").each((_i, card) => {
    const links = $(card).find("a.txt-blue").toArray().map((a) => ({ text: $(a).text().replace(/\s+/g, " ").trim(), href: $(a).attr("href") ?? "" })).filter((a) => a.href);
    const first = links[0];
    if (!first?.text) return;
    const pdf = links.find((a) => /\.pdf(?:$|[?#])/i.test(a.href));
    const m = /Last updated:\s*([A-Za-z]+)\s+(\d{4})/i.exec($(card).text());
    const month = m ? MONTHS.indexOf(m[1]!.toLowerCase()) : -1;
    let url: string;
    try {
      url = new URL((pdf ?? first).href, pageUrl).toString();
    } catch {
      return;
    }
    out.push({ title: first.text, url, updated: m && month >= 0 ? `${m[2]}-${String(month + 1).padStart(2, "0")}` : null });
  });
  return out;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const keyOf = (g: Guideline) => `elso:${g.title}|${g.updated ?? ""}`;

/** The notice: what the page says and nothing more. */
export function renderAviso(g: Guideline, pageUrl: string, update: boolean): string {
  const when = g.updated ? ` A página informa como última atualização ${dataBr(g.updated)}.` : "";
  return [
    `<p>A Extracorporeal Life Support Organization (ELSO) ${update ? "atualizou" : "incluiu"} em sua página oficial de diretrizes o documento “${esc(g.title)}”.${when}</p>`,
    `<p>O ${esc(SITE.bareName)} ainda não leu o documento; o conteúdo e as recomendações estão no original.</p>`,
    `<h2>Fonte oficial</h2><p>ELSO: <a href="${esc(g.url)}">${esc(g.title)}</a> · <a href="${esc(pageUrl)}">página de diretrizes da ELSO</a></p>`,
  ].join("");
}

/** The guidelines page read once: the pediatric and neonatal guidelines that are new or updated since the last read. */
export async function readElso(opts: { now?: Date; cfg?: AlertasSettings } = {}): Promise<Record<string, unknown>> {
  const now = opts.now ?? new Date();
  const { url: pageUrl, pediatric } = (opts.cfg ?? alertasSettings()).elso;
  const [source] = await sql<{ enabled: boolean }[]>`SELECT enabled FROM sources WHERE id = ${ELSO_SOURCE}`;
  if (!source?.enabled) return { paused: true };
  const res = await guardedFetch(pageUrl, { timeoutMs: 30_000 });
  if (res.status !== 200) throw new Error(`ELSO HTTP ${res.status}`);
  const all = parseGuidelines(res.text(), pageUrl);
  if (!all.length) throw new Error("ELSO: no guideline found on the page");
  const guidelines = all.filter((g) => new RegExp(pediatric, "i").test(g.title));
  const seen = await sql<{ key: string }[]>`SELECT key FROM literatura_alertas WHERE key LIKE 'elso:%'`;
  const known = new Set(seen.map((r) => r.key));
  const titles = new Set(seen.map((r) => r.key.slice(5, r.key.lastIndexOf("|"))));
  let written = 0;
  for (const g of guidelines) {
    if (known.has(keyOf(g))) continue;
    if (!seen.length) {
      await sql`INSERT INTO literatura_alertas (key, status) VALUES (${keyOf(g)}, 'elso-base') ON CONFLICT (key) DO NOTHING`;
      continue;
    }
    const update = titles.has(g.title);
    const html = sanitizeBody(renderAviso(g, pageUrl, update), g.url);
    const confianca: Confianca = {
      feitura: "aviso", minuto: null, populacao: null, desenho: "diretriz", desenhoDetalhe: null, limitacao: null, textoLido: "pagina-oficial", preprint: false,
      datas: { publicado: null, revisado: g.updated, conferido: beijingDate(now) },
    };
    await sql.begin(async (tx) => {
      const m = await upsertMaterial({
        sourceId: ELSO_SOURCE, url: g.url, title: `ELSO ${update ? "atualiza" : "publica"} diretriz: ${g.title}`, author: "ELSO", language: "pt", publishedAt: now,
        excerpt: null, bodyHtml: html, bodyText: blockText(html), bodyStatus: "ok", raw: { elso: g }, via: "literatura", staleOnDiscovery: false,
      }, tx);
      await saveConfianca(tx, m.articleId, confianca);
      await tx`INSERT INTO literatura_alertas (key, status, article_id) VALUES (${keyOf(g)}, 'elso', ${m.articleId}) ON CONFLICT (key) DO NOTHING`;
      if (m.created || m.revised || m.processingNeeded) await queueProcessing(m.articleId, { db: tx });
    });
    written++;
  }
  await sql`UPDATE sources SET last_fetch_at = now(), last_ok_at = now() WHERE id = ${ELSO_SOURCE}`;
  return { guidelines: all.length, pediatric: guidelines.length, written, baseline: !seen.length };
}
