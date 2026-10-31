// The case of the week in the e-mailed edition (ServerModule.reports.mail): tables and inline styles, which
// mail clients keep, in the edition e-mail's colors, and the same as plain text. The picture links to the
// site's copy. Each choice of this week's question is a link marked data-answer to the edition's page, where the
// choice shows: the newsletter counts those clicks as answers (modules/assinatura/backend/reads.ts). The answer
// itself comes in the next edition.
import { config } from "@aihot/backend/config";
import { optionLetter, paragraphs, type CasoPart } from "../caso.ts";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const kicker = (text: string) => `<div style="margin-top:30px;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:2px;font-weight:bold;color:#0f766e">${esc(text)}</div>`;
const prose = (text: string) => paragraphs(text).map((p) => `<p style="margin:10px 0 0;font-size:16px;line-height:1.75;color:#3b4649">${esc(p)}</p>`).join("");
const choices = (options: string[], correct: number | null, answerUrl?: (letter: string) => string) => options.length
  ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px">${options.map((o, i) => {
    const text = `${esc(o)}${i === correct ? " ✓" : ""}`;
    const cell = answerUrl ? `<a data-answer href="${esc(answerUrl(optionLetter(i)))}" style="color:#1f2a2e;text-decoration:underline">${text}</a>` : text;
    return `<tr><td valign="top" style="width:26px;padding:4px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:${i === correct ? "#0f766e" : "#6b7478"}">${optionLetter(i)}</td><td style="padding:4px 0;font-size:15px;line-height:1.6;color:#1f2a2e${i === correct ? ";font-weight:bold" : ""}">${cell}</td></tr>`;
  }).join("")}</table>`
  : "";

export function casoMail(saved: unknown, issue: { key: string }): { html: string; text: string } | null {
  const { caso, resposta } = saved as CasoPart;
  const html: string[] = [];
  const text: string[] = [];
  if (resposta) {
    html.push(
      kicker("RESPOSTA DO CASO DA SEMANA PASSADA"),
      `<div style="margin-top:6px;font-size:20px;line-height:1.35;font-weight:bold;color:#1f2a2e">${esc(resposta.title)}</div>`,
      `<p style="margin:8px 0 0;font-size:15px;line-height:1.6;color:#3b4649"><b>${esc(resposta.question)}</b></p>`,
      choices(resposta.options, resposta.correct),
      prose(resposta.answer),
    );
    text.push(
      "RESPOSTA DO CASO DA SEMANA PASSADA", resposta.title, resposta.question,
      ...resposta.options.map((o, i) => `${optionLetter(i)}) ${o}${i === resposta.correct ? " ✓" : ""}`),
      ...paragraphs(resposta.answer), "",
    );
  }
  if (caso) {
    html.push(
      kicker("CASO DA SEMANA"),
      `<div style="margin-top:6px;font-size:22px;line-height:1.35;font-weight:bold;color:#1f2a2e">${esc(caso.title)}</div>`,
      prose(caso.body),
      caso.image
        ? `<img src="${esc(`${config.siteUrl}${caso.image.url}`)}" width="544" alt="${esc(caso.image.caption ?? caso.title)}" style="display:block;margin-top:14px;width:100%;max-width:544px;height:auto;border-radius:8px">${caso.image.caption ? `<div style="margin-top:6px;font-family:Arial,Helvetica,sans-serif;font-size:12.5px;color:#6b7478">${esc(caso.image.caption)}</div>` : ""}`
        : "",
      `<div style="margin-top:16px;padding:14px 16px;background:#e8f3f1;border-radius:8px"><div style="font-size:17px;line-height:1.5;font-weight:bold;color:#1f2a2e">${esc(caso.question)}</div>${choices(caso.options, null, (letter) => `${config.siteUrl}/assine/${issue.key}?${new URLSearchParams({ resposta: letter })}#caso`)}<div style="margin-top:8px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#3b4649">${caso.options.length ? "Toque na sua resposta ou discuta no seu grupo." : "Discuta no seu grupo."} A resposta sai na próxima edição, ${esc(caso.answerOn)}.</div></div>`,
    );
    text.push(
      "CASO DA SEMANA", caso.title, ...paragraphs(caso.body),
      ...(caso.image ? [`Imagem: ${config.siteUrl}${caso.image.url}`] : []),
      "", caso.question, ...caso.options.map((o, i) => `${optionLetter(i)}) ${o}`),
      `A resposta sai na próxima edição, ${caso.answerOn}.`, "",
    );
  }
  return html.length ? { html: html.join("\n"), text: text.join("\n") } : null;
}
