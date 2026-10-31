// What each message says: the e-mail confirmation, the WhatsApp welcome, the weekly edition as an e-mail
// (tables and inline styles, which mail clients keep) and as a WhatsApp text. The edition is the one the site shows, read from the
// public read layer (publication/reports.ts loadReport): withdrawn items are left out, as on the page.
import type { ReportCitation, ReportDetail } from "@aihot/contracts/site";
import { isoWeekRange } from "@aihot/contracts/time";
import { config } from "@aihot/backend/config";
import { serverModules } from "@aihot/backend/modules";
import { EDITION_WHEN, SITE } from "@aihot/site";

export const links = {
  confirm: (token: string) => `${config.siteUrl}/assine/confirmar?t=${token}`,
  leave: (token: string) => `${config.siteUrl}/assine/sair?t=${token}`,
  edition: (key: string) => `${config.siteUrl}/assine/${key}`,
  page: () => `${config.siteUrl}/assine`,
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const dm = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

/** "19/10 — 25/10": the week an edition covers. */
export function weekSpan(key: string): string {
  const range = isoWeekRange(key);
  return range ? `${dm(range.start)} — ${dm(range.end)}` : key;
}

function clip(text: string, max: number): string {
  const chars = [...text.trim()];
  return chars.length <= max ? chars.join("") : `${chars.slice(0, max - 1).join("").replace(/\s+\S*$/, "")}…`;
}

/** The edition as the page arranges it: the lead, the next three, then each section without the lead. */
export function editionParts(report: ReportDetail) {
  const all = report.sections.flatMap((s) => s.items);
  const lead = (report.leadItemId && all.find((c) => c.itemId === report.leadItemId && c.available)) || null;
  const leadKey = lead ? lead.itemId ?? lead.title : null;
  const seen = new Set<string>(leadKey ? [leadKey] : []);
  const sections = report.sections
    .map((s) => ({
      label: s.label,
      summary: s.summary,
      items: s.items.filter((c) => {
        const k = c.itemId ?? c.title;
        if (!c.available || seen.has(k)) return false;
        seen.add(k);
        return true;
      }),
    }))
    .filter((s) => s.items.length > 0);
  const highlights = report.highlights.filter((h) => h.available && (h.itemId ?? h.title) !== leadKey).slice(0, 3);
  const title = report.lead?.title ?? lead?.title ?? `${SITE.name} · Edição semanal`;
  const dek = lead?.summary ?? report.lead?.leadParagraph ?? null;
  return { lead, title, dek, overview: lead ? report.overview : null, highlights, sections };
}

/** The modules' parts of the edition that have an e-mail form (ServerModule.reports.mail), in the site's order. */
function moduleParts(report: ReportDetail): Array<{ html: string; text: string }> {
  return serverModules().flatMap((m) => {
    const part = report.modules?.[m.name];
    const mail = part === undefined ? null : m.reports?.mail?.(part, { kind: report.kind, key: report.key });
    return mail ? [mail] : [];
  });
}

const itemUrl = (c: ReportCitation) => (c.itemId ? `${config.siteUrl}/items/${c.itemId}` : c.sourceUrl);

export function confirmationEmail(token: string) {
  const url = links.confirm(token);
  const subject = `Confirme sua inscrição no ${SITE.bareName}`;
  const text = [
    `Recebemos um pedido para enviar a edição semanal do ${SITE.bareName} para este e-mail, ${EDITION_WHEN.weekly} (horário de Brasília).`,
    "",
    `Para confirmar, abra: ${url}`,
    "",
    "Se não foi você, ignore esta mensagem: sem a confirmação, nada será enviado.",
  ].join("\n");
  const html = frame(subject, `
    <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#1f2a2e">Recebemos um pedido para enviar a edição semanal do ${esc(SITE.bareName)} para este e-mail, ${esc(EDITION_WHEN.weekly)} (horário de Brasília).</p>
    <p style="margin:24px 0"><a href="${esc(url)}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;font-weight:bold;font-size:16px;padding:12px 22px;border-radius:999px">Confirmar inscrição</a></p>
    <p style="margin:0;font-size:13px;line-height:1.6;color:#5b676b">Se não foi você, ignore esta mensagem: sem a confirmação, nada será enviado.</p>`, null);
  return { subject, text, html };
}

/** The one reply to a number that wrote JOIN_TEXT: it is on the list, and how to leave. */
export function welcomeWhatsapp(token: string): string {
  return [
    `Inscrição feita! A edição semanal do *${SITE.name}* chega por aqui ${EDITION_WHEN.weekly} (horário de Brasília).`,
    "",
    `Para não receber mais, responda SAIR ou toque em ${links.leave(token)}`,
  ].join("\n");
}

/** The e-mail page around a body: the site's name above, and the reason for the message and the way out below. */
function frame(title: string, body: string, footer: string | null, preheader = ""): string {
  return `<!doctype html>
<html lang="${esc(SITE.locale)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#f4f2ec">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2ec"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;font-family:Georgia,'Times New Roman',serif">
<tr><td style="padding:24px 28px 8px;border-bottom:2px solid #1f2a2e"><div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;letter-spacing:3px;font-weight:bold;color:#1f2a2e">${esc(SITE.name.toUpperCase())}</div></td></tr>
<tr><td style="padding:20px 28px 28px">${body}</td></tr>
${footer ? `<tr><td style="padding:18px 28px 24px;border-top:1px solid #e3e0d7;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#6b7478">${footer}</td></tr>` : ""}
</table></td></tr></table></body></html>`;
}

function storyHtml(c: ReportCitation, summaryChars: number): string {
  const meta = [esc(c.sourceName), c.firstParty ? "Oficial" : null].filter(Boolean).join(" · ");
  return `<tr><td style="padding:14px 0;border-bottom:1px solid #e3e0d7">
<div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#6b7478">${meta}</div>
<a href="${esc(itemUrl(c))}" style="display:block;margin-top:4px;font-size:18px;line-height:1.45;font-weight:bold;color:#1f2a2e;text-decoration:none">${esc(c.title)}</a>
${c.summary ? `<p style="margin:6px 0 0;font-size:15px;line-height:1.7;color:#3b4649">${esc(clip(c.summary, summaryChars))}</p>` : ""}
<a href="${esc(c.sourceUrl)}" style="display:inline-block;margin-top:6px;font-family:Arial,Helvetica,sans-serif;font-size:12.5px;color:#0f766e">Original ↗</a>
</td></tr>`;
}

/** The weekly edition for one reader: the page's arrangement, each story linked to its page on the site. */
export function editionEmail(report: ReportDetail, token: string) {
  const parts = editionParts(report);
  const extra = moduleParts(report);
  const span = weekSpan(report.key);
  const url = links.edition(report.key);
  const leave = links.leave(token);
  const subject = clip(`${SITE.name} · ${span}: ${parts.title}`, 140);
  const body = [
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#6b7478">Edição semanal nº ${report.issueNumber} · ${esc(span)}</div>`,
    parts.overview ? `<p style="margin:14px 0 0;font-size:16px;line-height:1.75;color:#3b4649">${esc(parts.overview)}</p>` : "",
    `<div style="margin-top:22px;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:2px;font-weight:bold;color:#0f766e">MANCHETE</div>`,
    parts.lead
      ? `<a href="${esc(itemUrl(parts.lead))}" style="display:block;margin-top:6px;font-size:26px;line-height:1.3;font-weight:bold;color:#1f2a2e;text-decoration:none">${esc(parts.title)}</a>`
      : `<div style="margin-top:6px;font-size:26px;line-height:1.3;font-weight:bold;color:#1f2a2e">${esc(parts.title)}</div>`,
    parts.dek ? `<p style="margin:10px 0 0;font-size:16px;line-height:1.75;color:#3b4649">${esc(parts.dek)}</p>` : "",
    parts.lead ? `<div style="margin-top:8px;font-family:Arial,Helvetica,sans-serif;font-size:12.5px;color:#6b7478">${esc(parts.lead.sourceName)} · <a href="${esc(parts.lead.sourceUrl)}" style="color:#0f766e">Original ↗</a></div>` : "",
    parts.highlights.length
      ? `<div style="margin-top:26px;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:2px;font-weight:bold;color:#0f766e">DESTAQUES DA SEMANA</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${parts.highlights.map((h, i) => `<tr><td valign="top" style="width:28px;padding:10px 0;font-size:22px;font-weight:bold;color:#0f766e">${i + 1}</td><td style="padding:10px 0;border-bottom:1px solid #e3e0d7"><a href="${esc(itemUrl(h))}" style="font-size:16px;line-height:1.5;font-weight:bold;color:#1f2a2e;text-decoration:none">${esc(h.title)}</a><div style="margin-top:2px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#6b7478">${esc(h.sourceName)}</div></td></tr>`).join("")}</table>`
      : "",
    ...extra.map((p) => p.html),
    ...parts.sections.map((s) => `<div style="margin-top:30px;padding-bottom:6px;border-bottom:2px solid #1f2a2e;font-size:21px;font-weight:bold;color:#1f2a2e">${esc(s.label)}</div>
${s.summary ? `<p style="margin:10px 0 0;font-size:15px;line-height:1.7;color:#3b4649"><b style="color:#0f766e">Nesta seção</b> ${esc(s.summary)}</p>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${s.items.map((c) => storyHtml(c, 320)).join("")}</table>`),
    `<p style="margin:30px 0 0;text-align:center"><a href="${esc(url)}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-weight:bold;font-size:15px;padding:12px 22px;border-radius:999px">Ler a edição no site</a></p>`,
  ].join("\n");
  const footer = `Você recebe esta edição porque se inscreveu em <a href="${esc(links.page())}" style="color:#6b7478">${esc(links.page().replace(/^https?:\/\//, ""))}</a>. Ela sai ${esc(EDITION_WHEN.weekly)} (horário de Brasília).<br><a href="${esc(leave)}" style="color:#6b7478">Não quero mais receber</a>`;
  const text = [
    `${SITE.name} · Edição semanal nº ${report.issueNumber} · ${span}`,
    "",
    ...(parts.overview ? [parts.overview, ""] : []),
    `MANCHETE: ${parts.title}`,
    ...(parts.dek ? [parts.dek] : []),
    ...(parts.lead ? [itemUrl(parts.lead)] : []),
    "",
    ...(parts.highlights.length ? ["DESTAQUES DA SEMANA", ...parts.highlights.map((h, i) => `${i + 1}. ${h.title} — ${itemUrl(h)}`), ""] : []),
    ...extra.flatMap((p) => [p.text, ""]),
    ...parts.sections.flatMap((s) => [s.label.toUpperCase(), ...s.items.map((c) => `- ${c.title} (${c.sourceName}) — ${itemUrl(c)}`), ""]),
    `Ler a edição no site: ${url}`,
    "",
    `Não quero mais receber: ${leave}`,
  ].join("\n");
  return { subject, html: frame(subject, body, footer, parts.overview ?? parts.dek ?? ""), text };
}

/** The weekly edition as a WhatsApp text: the lead and highlights, the page's link first (its preview) and the way out. */
export function editionWhatsapp(report: ReportDetail, token: string): string {
  const parts = editionParts(report);
  const more = parts.sections.reduce((n, s) => n + s.items.length, 0) - parts.highlights.length;
  return [
    `*${SITE.name} · Edição semanal* (${weekSpan(report.key)})`,
    "",
    `*${parts.title}*`,
    ...(parts.dek ? [clip(parts.dek, 300)] : []),
    "",
    ...(parts.highlights.length ? ["*Destaques da semana*", ...parts.highlights.map((h) => `• ${h.title}`), ""] : []),
    `Leia a edição completa${more > 0 ? ` (mais ${more} ${more === 1 ? "matéria" : "matérias"})` : ""}: ${links.edition(report.key)}`,
    "",
    `Para não receber mais, responda SAIR ou toque em ${links.leave(token)}`,
  ].join("\n");
}
