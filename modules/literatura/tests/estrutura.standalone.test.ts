// The matéria's single structure, on a sample written like the target example (the PROSpect trial). Failure cases:
// a key number is said in two blocks of the page; a section restates another; the page or the body exceeds the
// length cap, or the model is not told the cap; the body ignores the study's design; a flag that is not on the
// list, or an absent one, reaches "Quanto confiar"; an older matéria's card repeats what its stored body says.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { blockText } from "../backend/access.ts";
import { parsePubmedXml, type Paper } from "../backend/pubmed.ts";
import { confiancaDaMateria, limitePalavras, materiaInput, materiaText, palavrasDaMateria, renderMateria, type Materia } from "../backend/materia.ts";
import { corpoJaDiz, fichaRows, minutoEmLinha, type Confianca } from "../confianca.ts";

const [fixturePaper] = parsePubmedXml(readFileSync(new URL("./fixtures/pubmed.xml", import.meta.url), "utf8"));
const paper: Paper = { ...fixturePaper!, abstract: [{ label: null, text: Array(593).fill("word").join(" ") }] };
const now = new Date("2026-11-01T12:00:00Z");

const prospect: Materia = {
  sinaisDeAlerta: [
    { sinal: "interrupcao-precoce", detalhe: "Parou por futilidade e recrutamento lento, com 71% da amostra planejada." },
    { sinal: "sem-mascaramento", detalhe: "Inevitável, mas pesa sobre os eventos adversos registrados pela equipe." },
  ],
  titulo: "Pronação e HFOV não aumentam os dias sem ventilador na SDRA pediátrica precoce e trazem mais eventos adversos",
  perguntaClinica: "Em crianças intubadas com SDRA pediátrica moderada a grave e precoce, a prona ou a ventilação oscilatória de alta frequência aumentam os dias livres de ventilador?",
  achado: "Não. Nenhuma das duas estratégias mudou os dias livres de ventilador, e cada uma trouxe um sinal de dano próprio: mais obstrução do tubo e lesões por pressão com a prona, mais instabilidade hemodinâmica com a HFOV.",
  mudaAlgo: "pode-informar-discussao", diretriz: "",
  populacaoIdade: "2 semanas a 20 anos, mediana de 3,3 anos", populacaoDoenca: "SDRA pediátrica moderada a grave, intubados há menos de 96 h", populacaoCenario: "75 UTIs pediátricas em 18 países",
  desenho: "ensaio-clinico", desenhoDetalhe: "randomizado fase 3, fatorial, sem mascaramento, 424 de 600 planejados",
  conflitos: "Financiado pelo NIH/NHLBI; alguns autores declaram honorários de fabricantes de ventiladores.",
  limitacaoPrincipal: "Interrompido antes do fim, o que reduz a precisão para efeitos pequenos.",
  oQueFizeram: "Cada criança foi sorteada para duas escolhas ao mesmo tempo, posição e modo de ventilação. Os grupos foram supina com convencional (126), prona com convencional (130), supina com HFOV (90) e prona com HFOV (78).",
  resultados: [
    { desfecho: "Dias livres de ventilador, prona vs supina", resultado: "17,9 vs 17,4", efeito: "0,0 dia (IC 95% −0,8 a 1,0)" },
    { desfecho: "Dias livres de ventilador, HFOV vs convencional", resultado: "17,3 vs 18,0", efeito: "−0,3 dia (IC 95% −1,5 a 0,5)" },
    { desfecho: "Obstrução do tubo, prona vs supina", resultado: "6% vs 2%", efeito: "razão de taxas 4,8" },
    { desfecho: "Instabilidade hemodinâmica, HFOV vs convencional", resultado: "13% vs 9%", efeito: "razão de taxas 1,8" },
    { desfecho: "Mortalidade em 28 dias", resultado: "10%, sem diferença entre os grupos", efeito: "" },
  ],
  aFavor: ["Randomizado, multicêntrico e com desfecho clínico; os intervalos estreitos em torno de zero tornam improvável um benefício relevante perdido."],
  naoInformado: ["O resumo não traz o seguimento após o período principal nem os subgrupos por gravidade; não informado não quer dizer que não foi feito."],
  naPratica: "Para quem cuida de crianças ventiladas com SDRA no início do quadro, o estudo não dá base para pronar ou passar para HFOV de rotina buscando menos tempo de ventilador. O estudo não testou a prona como resgate na hipoxemia refratária. Para o Brasil, o resultado depende de equipe e ventiladores comparáveis aos dos centros participantes, que o resumo não descreve.",
  contexto: "",
};

/** The page, block by block, as the reader meets it, without the reference (the citation's own numbers are not the study's). */
function pageBlocks(m: Materia): Record<string, string> {
  const c = confiancaDaMateria(m, paper, "resumo", now);
  const blocks: Record<string, string> = { Título: m.titulo, "Pergunta clínica": c.perguntaClinica!, "Em um minuto": c.minuto!.achado };
  for (const r of fichaRows({ confianca: c, estado: "artigo-revisado" })) if (r.text) blocks[r.label] = r.text;
  const html = renderMateria(m, paper, { kind: "unknown" }, null).split("<h2>Referência</h2>")[0]!;
  for (const section of html.split("<h2>").slice(1)) blocks[section.slice(0, section.indexOf("</h2>"))] = blockText(section.slice(section.indexOf("</h2>") + 5));
  return blocks;
}

const numbers = (s: string) => new Set(s.match(/\d+(?:[.,]\d+)*%?/g) ?? []);

test("a sample matéria shows each key number in one block of the page, and Na prática has none", () => {
  const blocks = pageBlocks(prospect);
  const seen = new Map<string, string>();
  for (const [name, text] of Object.entries(blocks)) {
    for (const n of numbers(text)) {
      assert.equal(seen.get(n), undefined, `${n} is in "${seen.get(n)}" and in "${name}"`);
      seen.set(n, name);
    }
  }
  for (const [key, where] of [["424", "Desenho"], ["75", "População"], ["17,9", "O que encontraram"], ["10%", "O que encontraram"]] as const) assert.equal(seen.get(key), where);
  assert.equal(numbers(blocks["Na prática"]!).size, 0);
  assert.deepEqual(Object.keys(blocks), ["Título", "Pergunta clínica", "Em um minuto", "População", "Desenho", "Texto lido", "Conflitos de interesse declarados", "Principal limitação", "O que fizeram", "O que encontraram", "Quanto confiar", "Na prática"]);
});

test("the length cap: about 1.2x the abstract's words, 900 from a full text; the model is told, the prompt says so, and the sample fits", () => {
  assert.equal(limitePalavras(paper, null), 712);
  assert.equal(limitePalavras(paper, "full text"), 900);
  assert.match(materiaInput(paper, null), /Limite desta matéria: cerca de 712 palavras, somando todos os campos/);
  assert.match(materiaInput(paper, "full text"), /Limite desta matéria: cerca de 900 palavras/);
  const prompt = readFileSync(new URL("../../../industry/prompts/materia.md", import.meta.url), "utf8");
  assert.match(prompt, /1,2 vez o tamanho do resumo/);
  assert.match(prompt, /cerca de 900 palavras/);
  assert.match(prompt, /Cada fato e cada número aparecem uma única vez/);
  assert.match(prompt, /Não informado não é o mesmo que não feito/);
  const words = palavrasDaMateria(prospect);
  assert.ok(words <= limitePalavras(paper, null), `${words} words`);
  assert.ok(words > 150, "every field the reader sees is counted");
});

test("the body changes with the study's design", () => {
  const body = (desenho: Materia["desenho"], efeito = "x") => renderMateria({ ...prospect, desenho, resultados: [{ desfecho: "d", resultado: "r", efeito }] }, paper, { kind: "unknown" }, null);
  assert.match(body("ensaio-clinico"), /<h2>O que encontraram<\/h2><table><thead><tr><th>Desfecho<\/th><th>Por grupo<\/th><th>Diferença<\/th>/);
  assert.match(body("coorte"), /<th>Por grupo<\/th><th>Associação<\/th>/);
  assert.match(body("meta-analise"), /<th>Efeito combinado<\/th><th>Estudos e certeza<\/th>/);
  assert.match(body("serie-de-casos"), /<th>Resultado<\/th>/);
  assert.match(body("diretriz"), /<h2>O que recomendam<\/h2><table><thead><tr><th>Recomendação<\/th><th>Força<\/th>/);
  assert.doesNotMatch(body("serie-de-casos", ""), /Observação/, "a column nothing fills is left out");
  const prompt = readFileSync(new URL("../../../industry/prompts/materia.md", import.meta.url), "utf8");
  for (const design of ["Ensaio clínico", "Coorte, caso-controle, transversal", "Revisão sistemática, metanálise", "Série, relato de caso", "Diretriz, consenso"]) assert.ok(prompt.includes(`**${design}`), design);
});

test("Quanto confiar: the flags present, by name, with the study's strengths and what was not reported; nothing when there is nothing", () => {
  const html = renderMateria(prospect, paper, { kind: "unknown" }, null);
  assert.match(html, /<strong>Interrupção precoce:<\/strong> Parou por futilidade/);
  assert.match(html, /<strong>Sem mascaramento:<\/strong>/);
  assert.match(html, /<strong>A favor:<\/strong> Randomizado/);
  assert.match(html, /<strong>Não informado:<\/strong>/);
  assert.doesNotMatch(html, /Centro único|Retrospectivo/, "only the flags present");
  assert.doesNotMatch(renderMateria({ ...prospect, aFavor: [], sinaisDeAlerta: [], naoInformado: [] }, paper, { kind: "unknown" }, null), /Quanto confiar/);
  assert.doesNotMatch(html, /Matéria escrita|Como foi feito|Limitações|Para o pediatra/);
});

test("what the engine reads keeps what the page shows above the body, so selection still sees the design and the sample", () => {
  const html = renderMateria(prospect, paper, { kind: "unknown" }, null);
  const text = materiaText(prospect, html);
  for (const part of [prospect.perguntaClinica, prospect.achado, prospect.desenhoDetalhe, prospect.populacaoCenario, "17,9 vs 17,4"]) assert.ok(text.includes(part), part);
});

test("the summary on cards is Em um minuto and its grade", () => {
  const c = confiancaDaMateria(prospect, paper, "resumo", now);
  assert.equal(minutoEmLinha(c.minuto!), `${prospect.achado.replace(/\.$/, "")}. Muda algo agora? Pode informar a discussão.`);
  assert.equal(minutoEmLinha({ achado: "Achado.", mudaAlgo: "alinhado-a-diretriz", diretriz: "ERS 2024" }), "Achado. Muda algo agora? Alinhado a diretriz (ERS 2024).");
});

test("a matéria written before the single structure shows on its card only what its stored body does not say; a translation's card stays whole", () => {
  const old: Confianca = {
    feitura: "materia", minuto: { achado: "Achado.", paraQuem: "Pediatras", mudaAlgo: "nao", diretriz: null }, populacao: { idade: "1 a 5 anos", doenca: "Sibilância", cenario: "Ambulatório" },
    desenho: "coorte", desenhoDetalhe: "coorte retrospectiva", limitacao: "Centro único.", conflitos: "Não informado", aplicabilidade: "Depende de estrutura.", textoLido: "resumo", preprint: false, datas: null,
  };
  assert.equal(corpoJaDiz(old), true);
  assert.deepEqual(fichaRows({ confianca: old, estado: "artigo-revisado" }).map((r) => r.label), ["Estágio da evidência", "Conflitos de interesse declarados", "O que se transfere ao contexto brasileiro"]);
  assert.equal(corpoJaDiz({ ...old, feitura: "traducao" }), false);
  assert.ok(fichaRows({ confianca: { ...old, feitura: "traducao" }, estado: null }).some((r) => r.label === "População"));
  assert.equal(corpoJaDiz(confiancaDaMateria(prospect, paper, "resumo", now)), false);
});
