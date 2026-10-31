// The weekly e-mail with the modules' compact parts of its stories (ServerModule.items.mail). Failure cases:
// a story's part is left out, lands under another story, or a module without a mail form breaks the e-mail.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { ReportCitation, ReportDetail } from "@aihot/contracts/site";
import { installModules, type ServerModule } from "@aihot/backend/modules";
import { editionEmail } from "../backend/messages.ts";

const story = (itemId: string, title: string): ReportCitation => ({
  itemId, title, summary: null, sourceName: "Fôlego", sourceUrl: `https://doi.org/${itemId}`, sourceIconUrl: null, firstParty: false, publishedAt: null, available: true,
});

test("each story carries its modules' compact parts, in the HTML and the plain text, and only its own", () => {
  const minuto: ServerModule = { name: "minuto", items: { parts: async () => new Map(), mail: (part) => ({ html: `<div>Em um minuto: ${String(part)}</div>`, text: `Em um minuto: ${String(part)}` }) } };
  const silent: ServerModule = { name: "silent", items: { parts: async () => new Map() } };
  installModules([silent, minuto]);
  try {
    const report = {
      kind: "weekly", key: "2026-W44", issueNumber: 3, lead: null, leadItemId: "lead", overview: null, highlights: [], modules: {},
      sections: [{ label: "Pneumologia", summary: null, items: [story("lead", "A manchete"), story("a", "Primeira"), story("b", "Segunda")] }],
    } as unknown as ReportDetail;
    const parts = new Map([["lead", { minuto: "achado da manchete" }], ["a", { minuto: "achado da primeira", silent: "nada" }]]);
    const mail = editionEmail(report, "token", null, parts);
    assert.match(mail.html, /<div>Em um minuto: achado da manchete<\/div>/, "the lead's part goes under the lead");
    assert.match(mail.html, /Primeira<\/a>\s*<div>Em um minuto: achado da primeira<\/div>/);
    assert.equal(mail.html.match(/Em um minuto/g)!.length, 2);
    assert.match(mail.text, /- Primeira \(Fôlego\) — \S+\n {2}Em um minuto: achado da primeira\n- Segunda/);
    assert.match(mail.text, /MANCHETE: A manchete\nEm um minuto: achado da manchete\n/);
    assert.deepEqual(editionEmail(report, "token").text.match(/Em um minuto/g), null, "nothing without parts");
  } finally {
    installModules([]);
  }
});
