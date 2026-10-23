// An XML API read as a JSON list (mode "xml"): attributes as "@name", an element's text beside them as "#text",
// values kept as strings, and a single result still a list of one.
import assert from "node:assert/strict";
import http from "node:http";
import { after, test } from "node:test";
import { config } from "@aihot/backend/config";
import { fetchJsonList } from "@aihot/backend/sources/json-list";

const trial = (id: string, assigned: string, title: string) =>
  `<fullTrial><trial lastUpdated="2026-09-03T08:30:06Z"><isrctn dateAssigned="${assigned}">${id}</isrctn>` +
  `<trialDescription><title>${title}</title><scientificTitle>Scientific ${title}</scientificTitle></trialDescription></trial></fullTrial>`;
const bodies: Record<string, string> = {
  "/two.xml": `<?xml version="1.0"?><allTrials totalCount="2">${trial("00123456", "2026-10-06T09:00:00Z", "Airway &amp; trial")}${trial("86231109", "2026-09-09T09:21:20Z", "Second")}</allTrials>`,
  "/one.xml": `<?xml version="1.0"?><allTrials totalCount="1">${trial("00999999", "2026-10-01T00:00:00Z", "Only")}</allTrials>`,
  "/broken.xml": `<allTrials><fullTrial></allTrials>`,
};
const server = http.createServer((req, res) => { res.setHeader("content-type", "application/xml"); res.end(bodies[req.url!] ?? ""); });
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
const previousPrivateFetch = config.allowPrivateNetworkFetch;
config.allowPrivateNetworkFetch = true;
after(async () => {
  config.allowPrivateNetworkFetch = previousPrivateFetch;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const source = (file: string) => ({ id: "test-xml", config: {
  url: base + file, mode: "xml", itemsPath: "allTrials.fullTrial", titlePaths: ["trial.trialDescription.title"], summaryPaths: ["trial.trialDescription.scientificTitle"],
  urlTemplate: "https://www.isrctn.com/ISRCTN{trial.isrctn.#text}", publishedAtPath: "trial.isrctn.@dateAssigned", externalIdPath: "trial.isrctn.#text",
} }) as never;

test("XML elements, attributes and text map like JSON paths, with leading zeros kept", async () => {
  const items = await fetchJsonList(source("/two.xml"));
  assert.deepEqual(items.map((i) => [i.url, i.title, i.excerpt, i.publishedAt?.toISOString(), i.raw?.externalId]), [
    ["https://www.isrctn.com/ISRCTN00123456", "Airway & trial", "Scientific Airway & trial", "2026-10-06T09:00:00.000Z", "00123456"],
    ["https://www.isrctn.com/ISRCTN86231109", "Second", "Scientific Second", "2026-09-09T09:21:20.000Z", "86231109"],
  ]);
});

test("a single repeated element is a list of one, and broken XML is a fetch error", async () => {
  assert.deepEqual((await fetchJsonList(source("/one.xml"))).map((i) => i.title), ["Only"]);
  await assert.rejects(fetchJsonList(source("/broken.xml")), /not XML/);
});
