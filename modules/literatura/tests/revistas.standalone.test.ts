// The watched journals' readers and subject filter, on fixed listings. Failure cases: a table of contents
// item loses its DOI (the paper cannot join its PubMed record and is written twice), an adult or cardiac paper
// passes the filter (a paid article off the site's subjects), a paper on the subjects is missed because the
// filter reads it differently from the PubMed search, or a journal in the list is read by no path at all.
import assert from "node:assert/strict";
import { test } from "node:test";
import { onSubject, paperFromItem, parseCrossref, parseFeed, pubmedTerm, revistas, type Revistas } from "../backend/revistas.ts";

const cfg: Revistas = {
  filtro: { idade: ["child*", "infan*", "pediatric*", "neonat*"], tema: ["trache*", "airway*", "chest wall", "lung*"] },
  revistas: [
    { id: "a", name: "Journal A", nlm: "J A", sumario: { crossref: "1234-5678" } },
    { id: "b", name: "Journal B", sumario: { rss: "https://example.org/rss" } },
    { id: "c", name: "Journal C", nlm: "J C" },
  ],
};

test("the PubMed search names every indexed journal and asks for a word of each list in the title or abstract", () => {
  assert.equal(pubmedTerm(cfg),
    '(("J A"[ta] OR "J C"[ta]) AND (child*[tiab] OR infan*[tiab] OR pediatric*[tiab] OR neonat*[tiab]) AND (trache*[tiab] OR airway*[tiab] OR "chest wall"[tiab] OR lung*[tiab])) NOT "Published Erratum"[pt]');
  assert.equal(pubmedTerm({ ...cfg, revistas: [cfg.revistas[1]!] }), null);
});

test("a journal with its own subject list is searched apart, with the age list and its own list in place of the subject list", () => {
  const own: Revistas = { ...cfg, revistas: [...cfg.revistas, { id: "d", name: "Journal D", nlm: "J D", tema: ["trache*"] }] };
  assert.equal(pubmedTerm(own),
    '((("J A"[ta] OR "J C"[ta]) AND (child*[tiab] OR infan*[tiab] OR pediatric*[tiab] OR neonat*[tiab]) AND (trache*[tiab] OR airway*[tiab] OR "chest wall"[tiab] OR lung*[tiab])) OR ("J D"[ta] AND (child*[tiab] OR infan*[tiab] OR pediatric*[tiab] OR neonat*[tiab]) AND (trache*[tiab]))) NOT "Published Erratum"[pt]');
  assert.equal(pubmedTerm({ ...cfg, revistas: [own.revistas[3]!] }),
    '("J D"[ta] AND (child*[tiab] OR infan*[tiab] OR pediatric*[tiab] OR neonat*[tiab]) AND (trache*[tiab])) NOT "Published Erratum"[pt]');
  assert.ok(onSubject(cfg, "Lung ultrasound in children"));
  assert.ok(!onSubject(cfg, "Lung ultrasound in children", own.revistas[3]), "off the journal's own list");
  assert.ok(onSubject(cfg, "Tracheostomy care at home for children", own.revistas[3]));
});

test("a table of contents item is on the subjects with a word of each list, as the search reads them", () => {
  assert.ok(onSubject(cfg, "Slide tracheoplasty in infants with long-segment stenosis"));
  assert.ok(onSubject(cfg, "Pectus repair: chest-wall outcomes in children"), "a hyphen joins a phrase's words");
  assert.ok(!onSubject(cfg, "Tracheal resection in adults: a 20-year experience"), "adult only");
  assert.ok(!onSubject(cfg, "Arterial switch in neonates: late outcomes"), "a child, but cardiac");
  assert.ok(!onSubject(cfg, "Childhood mentoring of thoracic surgeons"), "no subject word");
  assert.ok(!onSubject(cfg, "Nonpediatric airway emergencies"), "a stem matches from the start of a word only");
});

test("RSS and Atom tables of contents: the DOI from prism:doi, dc:identifier or the link; the date; the abstract", () => {
  const rss = parseFeed(`<?xml version="1.0"?><rss xmlns:prism="http://prismstandard.org/namespaces/basic/2.0/" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel>
    <item><title>Airway &lt;i&gt;stents&lt;/i&gt; in children</title><link>https://example.org/article/view/1</link><prism:doi>10.21037/JTD-26-100</prism:doi>
      <description>&lt;p&gt;We reviewed 40 children.&lt;/p&gt;</description><dc:creator>Silva A</dc:creator><dc:creator>Souza B</dc:creator><pubDate>Mon, 26 Oct 2026 10:00:00 GMT</pubDate></item>
    <item><title>Second</title><link>https://example.org/2</link><dc:identifier>doi:10.1055/a-2700-1234</dc:identifier><dc:date>2026-10-27</dc:date></item>
    <item><title>Third</title><link>https://link.springer.com/article/10.1007/s11748-026-02200-1</link></item>
    <item><title>No DOI</title><link>https://example.org/4</link></item>
  </channel></rss>`);
  assert.deepEqual(rss.map((i) => i.doi), ["10.21037/jtd-26-100", "10.1055/a-2700-1234", "10.1007/s11748-026-02200-1", null]);
  assert.equal(rss[0]!.title, "Airway stents in children");
  assert.equal(rss[0]!.abstract, "We reviewed 40 children.");
  assert.deepEqual(rss[0]!.authors, ["Silva A", "Souza B"]);
  assert.equal(rss[0]!.date!.toISOString(), "2026-10-26T10:00:00.000Z");
  assert.equal(rss[2]!.date, null);

  const atom = parseFeed(`<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Atom item</title><link href="https://doi.org/10.1016/j.athoracsur.2026.01.001"/>
    <summary>Neonates.</summary><author><name>Lee J</name></author><updated>2026-10-28T00:00:00Z</updated></entry></feed>`);
  assert.equal(atom[0]!.doi, "10.1016/j.athoracsur.2026.01.001");
  assert.deepEqual(atom[0]!.authors, ["Lee J"]);
});

test("a Crossref listing: the DOI, the title, the JATS abstract without its heading, the authors and the day the DOI was created", () => {
  const [item] = parseCrossref(JSON.stringify({ message: { items: [{
    DOI: "10.1186/S13019-026-03001-2", title: ["Thoracoscopic lobectomy in children"],
    abstract: "<jats:title>Abstract</jats:title><jats:sec><jats:title>Background</jats:title><jats:p>Children with CPAM.</jats:p></jats:sec>",
    author: [{ given: "Ana Maria", family: "Silva" }, { name: "Pediatric Group" }], created: { "date-time": "2026-10-27T08:00:00Z" },
  }] } }));
  assert.equal(item!.doi, "10.1186/s13019-026-03001-2");
  assert.equal(item!.abstract, "Children with CPAM.");
  assert.deepEqual(item!.authors, ["Silva AM", "Pediatric Group"]);
  const paper = paperFromItem(cfg.revistas[0]!, { ...item!, doi: item!.doi! });
  assert.equal(paper.pmid, null);
  assert.equal(paper.journal, "Journal A", "the paper shows the journal's name");
  assert.equal(paper.enteredOn, "2026-10-27");
  assert.equal(paperFromItem(cfg.revistas[0]!, { ...item!, doi: "10.1/x", title: "Correction to: Thoracoscopic lobectomy in children" }).publicationTypes[0], "Published Erratum");
});

test("every watched journal is read by its PubMed search or its table of contents", () => {
  const cfg = revistas();
  const ids = cfg.revistas.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length, "ids are unique");
  for (const r of cfg.revistas) assert.ok(r.nlm || r.sumario, `${r.id} is read somewhere`);
  assert.ok(pubmedTerm(cfg));
});

test("the watched journals' filter takes pediatric pulmonology too, and still leaves out the adult-only papers", () => {
  const cfg = revistas();
  const pairs = [
    ["Biologic therapy for severe asthma in children", "Biologic therapy for severe asthma in adults"],
    ["Childhood interstitial lung disease: a national registry", "Interstitial lung disease in older adults: a national registry"],
    ["ECMO in neonates with congenital diaphragmatic hernia", "ECMO in adults after cardiac arrest"],
    ["Home ventilation in children with neuromuscular disease", "Home ventilation in adults with neuromuscular disease"],
    ["Obstructive sleep apnoea in preterm infants", "Obstructive sleep apnoea in middle-aged men"],
    ["Acute respiratory failure in pediatric intensive care", "Acute respiratory failure in adult intensive care"],
    ["Bronchopulmonary dysplasia after extreme prematurity", "Bronchopulmonary disease in smokers"],
  ];
  for (const [child, adult] of pairs) {
    assert.ok(onSubject(cfg, child!), child);
    assert.ok(!onSubject(cfg, adult!), adult);
  }
  assert.ok(!onSubject(cfg, "Arterial switch in neonates: late outcomes"), "a child, but cardiac");
});

test("from the pediatric nursing journal only the airway and tracheostomy papers enter", () => {
  const cfg = revistas();
  const nursing = cfg.revistas.find((r) => r.id === "j-pediatr-nurs")!;
  assert.ok(onSubject(cfg, "Caregiver training before discharge of children with a tracheostomy", nursing));
  assert.ok(onSubject(cfg, "Nurse-led airway clearance in infants after extubation", nursing));
  assert.ok(!onSubject(cfg, "An asthma education program for school-age children", nursing), "pediatric pulmonology, but not the airway");
  assert.ok(!onSubject(cfg, "Pain assessment in hospitalized children", nursing));
  assert.ok(!onSubject(cfg, "Tracheostomy care by nurses in adult intensive care", nursing), "adult only");
});
