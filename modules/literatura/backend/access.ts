// Legal open access only: where a paper can be read for free (Unpaywall), and its full text when Europe PMC
// holds it (fullTextXML, the PMC open-access subset and author manuscripts). Whether the site may republish
// that text, translated, is the licence's call: Creative Commons BY, BY-SA, CC0 and the public domain
// allow it with credit; NC licences only when the deployment says it is non-commercial
// (LITERATURA_ALLOW_NC); ND licences never, because a translation is a derivative work. Anything else is
// read to write the site's own article about the paper, and linked.
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

export interface FullText {
  html: string;
  text: string;
  license: License | null;
  licenseUrl: string | null;
  /** The licence statement as the article prints it. */
  statement: string | null;
}

const UNPAYWALL = () => (process.env.UNPAYWALL_BASE_URL ?? "https://api.unpaywall.org/v2").replace(/\/$/, "");
const EUROPE_PMC = () => (process.env.EUROPE_PMC_BASE_URL ?? "https://www.ebi.ac.uk/europepmc/webservices/rest").replace(/\/$/, "");

/** "cc-by", "CC BY-NC-ND 4.0", a creativecommons.org URL or a licence sentence, as one of the licences above. */
export function normalizeLicense(value: string | null | undefined): License | null {
  if (!value) return null;
  const v = value.toLowerCase();
  if (/publicdomain\/zero|\bcc0\b|cc-zero/.test(v)) return "cc0";
  if (/public[- ]domain|publicdomain\/mark/.test(v)) return "pd";
  const url = /creativecommons\.org\/licenses\/([a-z-]+)\//.exec(v)?.[1];
  const code = url ?? /\bcc[- ]?(by(?:[- ](?:nc|sa|nd))*)\b/.exec(v)?.[1]?.replace(/ /g, "-");
  if (code) {
    const parts = new Set(code.split("-"));
    if (!parts.has("by")) return null;
    const nc = parts.has("nc"), sa = parts.has("sa"), nd = parts.has("nd");
    return nd ? (nc ? "cc-by-nc-nd" : "cc-by-nd") : nc ? (sa ? "cc-by-nc-sa" : "cc-by-nc") : sa ? "cc-by-sa" : "cc-by";
  }
  if (/creative commons attribution/.test(v)) {
    const nc = /non-?commercial/.test(v), nd = /no-?deriv/.test(v), sa = /share-?alike/.test(v);
    return nd ? (nc ? "cc-by-nc-nd" : "cc-by-nd") : nc ? (sa ? "cc-by-nc-sa" : "cc-by-nc") : sa ? "cc-by-sa" : "cc-by";
  }
  return null;
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

/** The best free, legal copy Unpaywall knows of; null without a contact address (Unpaywall requires one) or a copy. */
export async function findOpenCopy(doi: string): Promise<OpenCopy | null> {
  const email = process.env.LITERATURA_EMAIL;
  if (!email) return null;
  const res = await guardedFetch(`${UNPAYWALL()}/${encodeURIComponent(doi)}?email=${encodeURIComponent(email)}`, { timeoutMs: 20_000 });
  if (res.status === 404) return null;
  if (res.status !== 200) throw new Error(`Unpaywall HTTP ${res.status}`);
  return parseUnpaywall(res.text());
}

export function parseUnpaywall(json: string): OpenCopy | null {
  const data = JSON.parse(json) as { is_oa?: boolean; best_oa_location?: { url?: string; url_for_landing_page?: string; url_for_pdf?: string; license?: string; host_type?: string; version?: string } | null };
  const best = data.best_oa_location;
  if (!data.is_oa || !best) return null;
  const url = best.url_for_landing_page || best.url || best.url_for_pdf;
  if (!url || !/^https?:\/\//.test(url)) return null;
  return { url, license: normalizeLicense(best.license), host: best.host_type ?? null, version: best.version ?? null };
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

const INLINE: Record<string, string> = { italic: "em", bold: "strong", sup: "sup", sub: "sub", underline: "em", sc: "span", monospace: "code" };

/**
 * A JATS article as the site's body HTML: the abstract and the body's sections, paragraphs, lists, figures
 * (images from Europe PMC) and tables. Citations become plain text and the reference list, acknowledgements
 * and other back matter are left out; the article's own page has them.
 */
export function jatsToHtml(xml: string, pmcid: string): FullText {
  const $ = cheerio.load(xml, { xml: true });
  const imageBase = `https://europepmc.org/articles/${pmcid}/bin/`;

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
    if (name === "inline-formula" || name === "disp-formula") return esc($(el).text());
    if (name === "fn" || name === "inline-graphic" || name === "alternatives") return "";
    const tag = INLINE[name];
    return tag ? `<${tag}>${inline(el.children)}</${tag}>` : inline(el.children);
  }).join("");

  const block = (el: Element, depth: number): string => {
    const children = el.children.filter((c): c is Element => c.type === "tag");
    switch (el.name) {
      case "p": return `<p>${inline(el.children).trim()}</p>`;
      case "sec": {
        const title = children.find((c) => c.name === "title");
        const h = depth <= 1 ? "h2" : depth === 2 ? "h3" : "h4";
        return `${title ? `<${h}>${inline(title.children).trim()}</${h}>` : ""}${children.filter((c) => c.name !== "title" && c.name !== "label").map((c) => block(c, depth + 1)).join("")}`;
      }
      case "list": {
        const tag = el.attribs["list-type"] === "order" ? "ol" : "ul";
        return `<${tag}>${children.filter((c) => c.name === "list-item").map((li) => `<li>${li.children.filter((c): c is Element => c.type === "tag").map((c) => (c.name === "p" ? inline(c.children).trim() : block(c, depth))).join(" ")}</li>`).join("")}</${tag}>`;
      }
      case "fig": {
        const label = $(el).children("label").text().trim();
        const caption = $(el).children("caption").first();
        const capText = [label, caption.children("title").length ? inline(caption.children("title").get(0)!.children).trim() : "", caption.children("p").toArray().map((p) => inline((p as Element).children).trim()).join(" ")].filter(Boolean).join(" ");
        const graphic = $(el).find("graphic").first().attr("xlink:href");
        const img = graphic ? `<img src="${esc(imageBase + (/\.\w{3,4}$/.test(graphic) ? graphic : `${graphic}.jpg`))}" alt="${esc(label || "Figura")}">` : "";
        return `<figure>${img}${capText ? `<figcaption>${capText}</figcaption>` : ""}</figure>`;
      }
      case "table-wrap": {
        const label = $(el).children("label").text().trim();
        const caption = $(el).children("caption").first();
        const capText = [label, caption.text().replace(/\s+/g, " ").trim()].filter(Boolean).join(" ");
        const table = $(el).find("table").first();
        if (!table.length) return capText ? `<p><strong>${esc(capText)}</strong></p>` : "";
        const rows = table.find("tr").toArray().map((tr) => `<tr>${$(tr).children("th,td").toArray().map((cell) => {
          const c = cell as Element;
          const span = [c.attribs.colspan ? ` colspan="${esc(c.attribs.colspan)}"` : "", c.attribs.rowspan ? ` rowspan="${esc(c.attribs.rowspan)}"` : ""].join("");
          return `<${c.name}${span}>${inline(c.children).trim()}</${c.name}>`;
        }).join("")}</tr>`).join("");
        return `<table>${capText ? `<caption>${esc(capText)}</caption>` : ""}${rows}</table>`;
      }
      case "disp-quote": return `<blockquote>${children.map((c) => block(c, depth)).join("")}</blockquote>`;
      case "boxed-text": return children.map((c) => block(c, depth)).join("");
      case "title": case "label": case "ref-list": case "fn-group": case "ack": case "glossary": return "";
      default: return children.length ? children.map((c) => block(c, depth)).join("") : "";
    }
  };

  const parts: string[] = [];
  const abstract = $("article > front > article-meta > abstract").filter((_i, a) => !$(a).attr("abstract-type")).first();
  if (abstract.length) {
    parts.push("<h2>Resumo</h2>");
    for (const c of abstract.children().toArray() as Element[]) parts.push(c.name === "sec" ? block(c, 2) : c.name === "p" ? block(c, 2) : "");
  }
  const body = $("article > body").first();
  for (const c of body.children().toArray() as Element[]) parts.push(block(c, 1));

  const licenseEl = $("article-meta permissions license").first();
  const licenseUrl = licenseEl.attr("xlink:href") ?? $("article-meta permissions license_ref, article-meta permissions ali\\:license_ref").first().text().trim() ?? null;
  const statement = licenseEl.find("license-p").text().replace(/\s+/g, " ").trim() || null;
  const license = normalizeLicense(licenseUrl) ?? normalizeLicense(statement) ?? normalizeLicense(licenseEl.attr("license-type"));
  const html = parts.join("").replace(/<p><\/p>/g, "");
  return { html, text: cheerio.load(html, null, false).root().text().replace(/\s+/g, " ").trim(), license, licenseUrl: licenseUrl || null, statement };
}
