// Legal open access only: where a paper can be read for free (Unpaywall), and its full text when Europe PMC
// holds it (fullTextXML, the PMC open-access subset and author manuscripts). Whether the site may republish
// that text, translated, is the licence's call: Creative Commons BY, BY-SA, CC0 and the public domain
// allow it with credit; NC licences only when the deployment says it is non-commercial
// (LITERATURA_ALLOW_NC); ND licences never, because a translation is a derivative work. Republication goes
// by the licence URL the article declares, never by its licence sentence alone (a sentence can also cover
// the data or third-party material). Anything else is read to write the site's own article about the
// paper, and linked. Only a 404 means "none": any other failure is thrown, so the paper is tried again.
import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";
import { guardedFetch } from "@aihot/backend/lib/http-fetch";

export type License = "cc-by" | "cc-by-sa" | "cc-by-nc" | "cc-by-nc-sa" | "cc-by-nd" | "cc-by-nc-nd" | "cc0" | "pd";

export interface OpenCopy {
  /** Where to read it for free: the publisher's page, PMC or a repository. */
  url: string;
  license: License | null;
  /** "publisher" or "repository". */
  host: string | null;
  /** submittedVersion (preprint), acceptedVersion (author manuscript) or publishedVersion. */
  version: string | null;
}

/** What Unpaywall said: a free copy, that there is none ("closed"), or nothing (no contact address, unknown DOI). */
export type Access = { kind: "open"; copy: OpenCopy } | { kind: "closed" } | { kind: "unknown" };

export interface FullText {
  html: string;
  /** The whole text, block by block, as the model reads it. */
  text: string;
  /** Characters of the body alone, without the abstract: whether this is a full text at all. */
  bodyChars: number;
  /** The licence the article's licence URL declares; the only one republication goes by. */
  license: License | null;
  licenseUrl: string | null;
  /** The licence statement as the article prints it. */
  statement: string | null;
  /** Figures left out because their caption credits a third party. */
  omittedFigures: number;
}

const UNPAYWALL = () => (process.env.UNPAYWALL_BASE_URL ?? "https://api.unpaywall.org/v2").replace(/\/$/, "");
const EUROPE_PMC = () => (process.env.EUROPE_PMC_BASE_URL ?? "https://www.ebi.ac.uk/europepmc/webservices/rest").replace(/\/$/, "");

function fromParts(nc: boolean, sa: boolean, nd: boolean): License {
  return nd ? (nc ? "cc-by-nc-nd" : "cc-by-nd") : nc ? (sa ? "cc-by-nc-sa" : "cc-by-nc") : sa ? "cc-by-sa" : "cc-by";
}

/** A licence URL or code ("cc-by-nc", "CC BY–NC–ND 4.0", a creativecommons.org address), or null. */
export function licenseFromCode(value: string | null | undefined): License | null {
  if (!value) return null;
  const v = value.toLowerCase().replace(/[‐-―−]/g, "-").replace(/\s+/g, " ").trim();
  if (/creativecommons\.org\/publicdomain\/zero|^cc0\b|^cc-zero/.test(v)) return "cc0";
  if (/creativecommons\.org\/publicdomain\/mark|^public-domain$|^pd$/.test(v)) return "pd";
  const code = /creativecommons\.org\/licenses\/([a-z-]+)\//.exec(v)?.[1] ?? /^cc[- ]?(by(?:[- ](?:nc|sa|nd))*)\b/.exec(v)?.[1]?.replace(/ /g, "-");
  if (!code) return null;
  const parts = new Set(code.split("-"));
  return parts.has("by") ? fromParts(parts.has("nc"), parts.has("sa"), parts.has("nd")) : null;
}

/** A licence sentence ("…Creative Commons Attribution-NonCommercial-No Derivatives License…"), for display only. */
export function licenseFromStatement(value: string | null | undefined): License | null {
  if (!value) return null;
  const v = value.toLowerCase().replace(/[‐-―−]/g, "-").replace(/\s+/g, " ");
  const url = /creativecommons\.org\/licenses\/[a-z-]+\//.exec(v)?.[0];
  if (url) return licenseFromCode(url);
  if (!/creative commons attribution|\bcc[- ]by\b/.test(v)) return null;
  return fromParts(/non[- ]?commercial|\bnc\b/.test(v), /share[- ]?alike|\bsa\b/.test(v), /no[- ]?deriv|\bnd\b/.test(v));
}

/** Whether the site may publish a translation of the whole text. */
export function republishable(license: License | null, allowNc = process.env.LITERATURA_ALLOW_NC === "true"): boolean {
  if (!license) return false;
  if (license === "cc-by" || license === "cc-by-sa" || license === "cc0" || license === "pd") return true;
  return allowNc && (license === "cc-by-nc" || license === "cc-by-nc-sa");
}

export const LICENSE_NAMES: Record<License, string> = {
  "cc-by": "CC BY", "cc-by-sa": "CC BY-SA", "cc-by-nc": "CC BY-NC", "cc-by-nc-sa": "CC BY-NC-SA", "cc-by-nd": "CC BY-ND",
  "cc-by-nc-nd": "CC BY-NC-ND", cc0: "CC0", pd: "domínio público",
};

/** What Unpaywall knows about a DOI; "unknown" without a contact address (Unpaywall requires one) or for a DOI it lacks. */
export async function findOpenCopy(doi: string): Promise<Access> {
  const email = process.env.LITERATURA_EMAIL;
  if (!email) return { kind: "unknown" };
  const res = await guardedFetch(`${UNPAYWALL()}/${encodeURIComponent(doi)}?email=${encodeURIComponent(email)}`, { timeoutMs: 20_000 });
  if (res.status === 404) return { kind: "unknown" };
  if (res.status !== 200) throw new Error(`Unpaywall HTTP ${res.status}`);
  return parseUnpaywall(res.text());
}

export function parseUnpaywall(json: string): Access {
  const data = JSON.parse(json) as { is_oa?: boolean; best_oa_location?: { url?: string; url_for_landing_page?: string; url_for_pdf?: string; license?: string; host_type?: string; version?: string } | null };
  const best = data.best_oa_location;
  if (data.is_oa === false) return { kind: "closed" };
  if (!data.is_oa || !best) return { kind: "unknown" };
  const url = best.url_for_landing_page || best.url || best.url_for_pdf;
  if (!url || !/^https?:\/\//.test(url)) return { kind: "unknown" };
  return { kind: "open", copy: { url, license: licenseFromCode(best.license), host: best.host_type ?? null, version: best.version ?? null } };
}

/** The PMC id Europe PMC has for a PubMed record (PubMed itself often lists it only weeks later), or null. */
export async function lookupPmcid(pmid: string): Promise<string | null> {
  const query = encodeURIComponent(`EXT_ID:${pmid} AND SRC:MED`);
  const res = await guardedFetch(`${EUROPE_PMC()}/search?query=${query}&format=json&resultType=lite&pageSize=1`, { timeoutMs: 20_000 });
  if (res.status === 404) return null;
  if (res.status !== 200) throw new Error(`Europe PMC search HTTP ${res.status}`);
  const data = JSON.parse(res.text()) as { resultList?: { result?: Array<{ pmid?: string; pmcid?: string }> } };
  const hit = data.resultList?.result?.find((r) => r.pmid === pmid);
  return hit?.pmcid && /^PMC\d+$/i.test(hit.pmcid) ? hit.pmcid.toUpperCase() : null;
}

/** The full text Europe PMC holds for a PMC id; null when it has none. */
export async function fetchFullText(pmcid: string): Promise<FullText | null> {
  const res = await guardedFetch(`${EUROPE_PMC()}/${encodeURIComponent(pmcid)}/fullTextXML`, { timeoutMs: 30_000, maxBytes: 16 * 1024 * 1024 });
  if (res.status === 404) return null;
  if (res.status !== 200) throw new Error(`Europe PMC HTTP ${res.status}`);
  const xml = res.text();
  if (!/<article[\s>]/.test(xml)) return null;
  return jatsToHtml(xml, pmcid);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const BLOCK_END = /<\/(p|h[1-6]|li|td|th|tr|caption|figcaption|blockquote|figure|table|ul|ol)>/g;

/** The text of body HTML with its blocks and table cells kept apart, so words and numbers never run together. */
export function blockText(html: string): string {
  return cheerio.load(html.replace(BLOCK_END, "$& ").replace(/<br\s*\/?>/g, " "), null, false).root().text().replace(/\s+/g, " ").trim();
}

const INLINE: Record<string, string> = { italic: "em", bold: "strong", sup: "sup", sub: "sub", underline: "em", sc: "span", monospace: "code" };
/** Elements that are blocks even inside a paragraph (Frontiers and PLOS nest them there). */
const NESTED_BLOCKS = new Set(["list", "table-wrap", "fig", "disp-quote", "boxed-text", "fig-group", "table-wrap-group"]);
/** A caption that credits someone else: the article's licence does not cover that figure. */
const THIRD_PARTY = /reprinted|reproduced|adapted (?:with permission|from)|with permission (?:from|of)|courtesy of|©|copyright/i;

/**
 * A JATS article as the site's body HTML: the abstract and the body's sections, paragraphs, lists, figures
 * (images from Europe PMC) and tables, with floats-group figures and tables after the body. Citations become
 * plain text, formulas their TeX or MathML text, and the reference list, acknowledgements and other back
 * matter are left out; the article's own page has them.
 */
export function jatsToHtml(xml: string, pmcid: string): FullText {
  const $ = cheerio.load(xml, { xml: true });
  const imageBase = `https://europepmc.org/articles/${pmcid}/bin/`;
  let omittedFigures = 0;

  const formula = (el: Element): string => {
    const tex = $(el).find("tex-math").first();
    if (tex.length) return esc(tex.text().replace(/\\documentclass[\s\S]*?\\begin\{document\}|\\end\{document\}/g, "").replace(/\s+/g, " ").trim());
    const math = $(el).find("mml\\:math, math").first();
    return esc((math.length ? math.text() : $(el).text()).replace(/\s+/g, " ").trim());
  };

  const inline = (nodes: AnyNode[]): string => nodes.map((n) => {
    if (n.type === "text") return esc((n as unknown as { data: string }).data);
    if (n.type !== "tag") return "";
    const el = n as Element;
    const name = el.name;
    if (name === "xref") return inline(el.children);
    if (name === "ext-link" || name === "uri") {
      const href = el.attribs["xlink:href"] ?? "";
      return /^https?:\/\//.test(href) ? `<a href="${esc(href)}">${inline(el.children)}</a>` : inline(el.children);
    }
    if (name === "inline-formula" || name === "disp-formula") return formula(el);
    if (name === "fn" || name === "inline-graphic" || NESTED_BLOCKS.has(name)) return "";
    const tag = INLINE[name];
    return tag ? `<${tag}>${inline(el.children)}</${tag}>` : inline(el.children);
  }).join("");

  /** A paragraph, split around the blocks nested in it. */
  const paragraph = (el: Element, depth: number): string => {
    const out: string[] = [];
    let run: AnyNode[] = [];
    const flush = () => {
      const text = inline(run).trim();
      if (text) out.push(`<p>${text}</p>`);
      run = [];
    };
    for (const c of el.children) {
      if (c.type === "tag" && NESTED_BLOCKS.has((c as Element).name)) {
        flush();
        out.push(block(c as Element, depth));
      } else run.push(c);
    }
    flush();
    return out.join("");
  };

  const caption = (el: Element): { label: string; text: string } => {
    const label = $(el).children("label").text().replace(/\s+/g, " ").trim();
    const cap = $(el).children("caption").first();
    const title = cap.children("title").get(0);
    const paras = cap.children("p").toArray().map((p) => inline((p as Element).children).trim());
    return { label, text: [esc(label), title ? inline(title.children).trim() : "", ...paras].filter(Boolean).join(" ") };
  };

  function block(el: Element, depth: number): string {
    const children = el.children.filter((c): c is Element => c.type === "tag");
    switch (el.name) {
      case "p": return paragraph(el, depth);
      case "sec": {
        const title = children.find((c) => c.name === "title");
        const h = depth <= 1 ? "h2" : depth === 2 ? "h3" : "h4";
        return `${title ? `<${h}>${inline(title.children).trim()}</${h}>` : ""}${children.filter((c) => c.name !== "title" && c.name !== "label").map((c) => block(c, depth + 1)).join("")}`;
      }
      case "list": {
        const tag = el.attribs["list-type"] === "order" ? "ol" : "ul";
        const items = children.filter((c) => c.name === "list-item").map((li) => {
          const inner = li.children.filter((c): c is Element => c.type === "tag").map((c) => (c.name === "p" ? inline(c.children).trim() : block(c, depth))).join(" ");
          return `<li>${inner}</li>`;
        });
        return `<${tag}>${items.join("")}</${tag}>`;
      }
      case "fig": {
        const { label, text } = caption(el);
        if (THIRD_PARTY.test($(el).children("caption").text())) {
          omittedFigures += 1;
          return "";
        }
        const graphic = $(el).find("graphic").first().attr("xlink:href");
        const img = graphic ? `<img src="${esc(imageBase + (/\.\w{3,4}$/.test(graphic) ? graphic : `${graphic}.jpg`))}" alt="${esc(label || "Figura")}">` : "";
        return `<figure>${img}${text ? `<figcaption>${text}</figcaption>` : ""}</figure>`;
      }
      case "table-wrap": {
        const { text } = caption(el);
        const table = $(el).find("table").first();
        if (!table.length) return text ? `<p><strong>${text}</strong></p>` : "";
        const rows = table.find("tr").toArray().map((tr) => `<tr>${$(tr).children("th,td").toArray().map((cell) => {
          const c = cell as Element;
          const span = [c.attribs.colspan ? ` colspan="${esc(c.attribs.colspan)}"` : "", c.attribs.rowspan ? ` rowspan="${esc(c.attribs.rowspan)}"` : ""].join("");
          return `<${c.name}${span}>${inline(c.children).trim()}</${c.name}>`;
        }).join("")}</tr>`).join("");
        return `<table>${text ? `<caption>${text}</caption>` : ""}${rows}</table>`;
      }
      case "disp-formula": return `<p>${formula(el)}</p>`;
      case "disp-quote": return `<blockquote>${children.map((c) => block(c, depth)).join("")}</blockquote>`;
      case "boxed-text": case "fig-group": case "table-wrap-group": return children.map((c) => block(c, depth)).join("");
      case "title": case "label": case "ref-list": case "fn-group": case "ack": case "glossary": return "";
      default: return children.length ? children.map((c) => block(c, depth)).join("") : "";
    }
  }

  const parts: string[] = [];
  const abstract = $("article > front > article-meta > abstract").filter((_i, a) => !$(a).attr("abstract-type")).first();
  if (abstract.length) {
    parts.push("<h2>Resumo</h2>");
    for (const c of abstract.children().toArray() as Element[]) parts.push(c.name === "sec" || c.name === "p" ? block(c, 2) : "");
  }
  const bodyParts: string[] = [];
  for (const c of $("article > body").first().children().toArray() as Element[]) bodyParts.push(block(c, 1));
  for (const c of $("article > floats-group").first().children().toArray() as Element[]) bodyParts.push(block(c, 1));
  const bodyHtml = bodyParts.join("");
  parts.push(bodyHtml);

  const licenseEl = $("article-meta permissions license").first();
  const href = licenseEl.attr("xlink:href") || $("article-meta permissions").find("license_ref, ali\\:license_ref").first().text().trim() || null;
  const statement = licenseEl.find("license-p").text().replace(/\s+/g, " ").trim() || null;
  const html = parts.join("").replace(/<p><\/p>/g, "");
  return {
    html, text: blockText(html), bodyChars: blockText(bodyHtml).length,
    license: licenseFromCode(href), licenseUrl: href, statement, omittedFigures,
  };
}
