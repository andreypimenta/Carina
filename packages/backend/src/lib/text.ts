export function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function truncate(s: string, max: number, ellipsis = "…"): string {
  const chars = [...s];
  if (chars.length <= max) return s;
  return chars.slice(0, Math.max(0, max - ellipsis.length)).join("").trimEnd() + ellipsis;
}

/**
 * Removes element markup while keeping `>` inside quoted attribute values.
 * A VGC link title such as `title="Platforms > Xbox"` used to be split at that
 * character by the old regular expression, leaking the rest of the tag into text.
 * This follows the small part of the HTML tokenizer needed here: an equals sign
 * starts a quoted value only after an attribute name. Comments, doctypes and
 * `< a>` keep the old first-`>` behavior because they are not element tags here.
 */
export function stripTagMarkup(html: string, replacement = " "): string {
  let out = "";
  let at = 0;
  while (at < html.length) {
    const start = html.indexOf("<", at);
    if (start < 0) return out + html.slice(at);
    out += html.slice(at, start);

    const firstEnd = html.indexOf(">", start + 1);
    if (firstEnd < 0) return out + html.slice(start);
    let end = firstEnd;
    // Only element attributes need quote handling; other markup keeps its existing behavior.
    if (/^<\/?[a-z]/i.test(html.slice(start, start + 3))) {
      let quote = "";
      let tagName = true;
      let attributeName = false;
      let value: "none" | "start" | "unquoted" = "none";
      let i = start + 1;
      for (; i < html.length; i += 1) {
        const char = html[i]!;
        if (quote) {
          if (char === quote) quote = "";
        } else if (char === ">") {
          end = i;
          break;
        } else if (value === "unquoted") {
          if (/[\t\n\f\r ]/.test(char)) value = "none";
        } else if (value === "start") {
          if (/[\t\n\f\r ]/.test(char)) continue;
          value = "none";
          if (char === '"' || char === "'") quote = char;
          else value = "unquoted";
        } else if (tagName) {
          if (/[\t\n\f\r ]/.test(char)) tagName = false;
          else if (char === "/") continue;
          else if (char === "=") {
            tagName = false;
            attributeName = true;
          }
        } else if (char === "=") {
          if (attributeName) {
            attributeName = false;
            value = "start";
          } else {
            // A bare `=` is an attribute name in malformed HTML, not a value prefix.
            attributeName = true;
          }
        } else if (!/[\t\n\f\r ]/.test(char)) {
          attributeName = true;
        }
      }
      // An unfinished quoted tag consumes the rest of the document in the browser tokenizer.
      if (i === html.length) return out + replacement;
    }
    // Preserve the old result for the empty `<>` construct, which the old regex did not match.
    out += end === start + 1 ? "<>" : replacement;
    at = end + 1;
  }
  return out;
}

export function stripTags(html: string): string {
  const text = html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|blockquote|pre|tr)>/gi, "\n");
  return collapseWhitespace(
    stripTagMarkup(text)
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'"),
  );
}

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    // XML 1.0 forbids most control characters.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

/** The site's language: what readers read and what foreign material is translated into (translations.lang). */
export const SITE_LANG = "pt";

/** Words Portuguese writes and Spanish, English, French and Italian (almost) never do. */
const PT_WORDS = new Set([
  "não", "também", "são", "você", "vocês", "uma", "umas", "um", "uns", "é", "com", "em", "da", "das", "dos", "na", "nas", "no", "nos",
  "ao", "aos", "à", "às", "pelo", "pela", "pelos", "pelas", "isso", "isto", "então", "já", "foi", "seu", "sua", "seus", "suas",
  "mais", "os", "estão", "até", "após", "ainda", "muito", "muita", "novo", "nova", "novos", "novas", "pode", "podem", "sobre", "entre", "como", "mas",
]);
/** Common words of the languages most often confused with it (Spanish, English, French, Italian). */
const FOREIGN_WORDS = new Set([
  "el", "los", "del", "y", "es", "una", "un", "con", "en", "lo", "muy", "nuevo", "nueva", "también", "está", "hay", "pero", "sus", "las", "al",
  "the", "and", "of", "for", "with", "to", "is", "are", "in", "on", "that", "this", "by", "from", "new", "at", "its", "an",
  "le", "les", "des", "et", "est", "du", "une", "pour", "dans", "avec", "il", "di", "della", "per", "gli", "che", "non", "è",
]);
/** Portuguese by its spelling: nasal and circumflex vowels (-ção, -ões, câncer, ciência, também), -ça/-ço endings. */
const PT_SPELLING = /[ãõâêô]|.ç(?:ão|ões|as?|os?)$/u;
/** Spanish by its spelling: ñ, -ción/-ciones, the ue diphthong of nuevo/puede/tiene/fuente. */
const ES_SPELLING = /ñ|ci[oó]n(?:es)?$|^(?:nue|pue|tie|fue|cue|bue)/u;

/**
 * Whether a text reads as Portuguese: more of its words are only Portuguese (não, também, uma, com,
 * em, da, -ção, câncer…) than Spanish, English, French or Italian (el, una, con, the, les, che…), and
 * enough of them to carry a short title. Links and handles are left out; a text without words is not.
 */
export function looksPortuguese(s: string): boolean {
  const words = s.replace(/https?:\/\/\S+|[@#][\p{L}\p{N}_]+/gu, " ").toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);
  if (!words.length) return false;
  const foreign = words.filter((w) => FOREIGN_WORDS.has(w) || ES_SPELLING.test(w)).length;
  const pt = words.filter((w) => !FOREIGN_WORDS.has(w) && !ES_SPELLING.test(w) && (PT_WORDS.has(w) || PT_SPELLING.test(w))).length;
  return pt > foreign && pt / words.length >= (words.length <= 12 ? 0.08 : 0.1);
}

/** Already in the site's language: the source says so (pt, pt-BR, pt-PT), or, with no language given, its text reads so. */
export function isSiteLanguage(language: string | null | undefined, sample: string): boolean {
  if (language?.trim()) return language.trim().toLowerCase().startsWith(SITE_LANG);
  return looksPortuguese(sample.slice(0, 600));
}
