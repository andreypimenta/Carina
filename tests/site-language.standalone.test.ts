// The site's language check (lib/text.ts): text already in Portuguese stands as reader copy, anything else
// is translated. Failure cases: a Spanish, Italian or French headline passes for Portuguese because the
// languages share words; a language the source declares is ignored in favour of the text.
import assert from "node:assert/strict";
import { test } from "node:test";
import { isSiteLanguage, looksPortuguese } from "@aihot/backend/lib/text";

test("Portuguese reads as the site's language", () => {
  for (const text of [
    "FDA libera software de IA para detecção de nódulos pulmonares",
    "Novo modelo de IA para radiologia reduz o tempo de laudo em 30%",
    "Estudo randomizado mostra que o escriba ambiental não aumenta erros de documentação",
    "Anvisa publica nova resolução sobre software como dispositivo médico",
  ]) assert.equal(looksPortuguese(text), true, text);
});

test("English, Spanish, French and Italian do not", () => {
  for (const text of [
    "FDA clears AI software for lung nodule detection",
    "New AI model for radiology cuts reporting time by 30%",
    "Nuevo modelo de IA para radiología",
    "La FDA aprueba un nuevo software de inteligencia artificial para la detección de cáncer",
    "Un nouveau modèle d'IA pour la radiologie est disponible dans les hôpitaux",
    "Nuovo modello di IA per la radiologia approvato per gli ospedali",
    "",
    "https://example.org/post @handle #tag",
  ]) assert.equal(looksPortuguese(text), false, text);
});

test("a language the source declares decides; without one, the text does", () => {
  assert.equal(isSiteLanguage("pt-BR", "FDA clears AI software"), true);
  assert.equal(isSiteLanguage("pt", "FDA clears AI software"), true);
  assert.equal(isSiteLanguage("en", "Novo modelo de IA para radiologia reduz o tempo de laudo"), false);
  assert.equal(isSiteLanguage("es", "Novo modelo de IA para radiologia reduz o tempo de laudo"), false);
  assert.equal(isSiteLanguage(null, "Novo modelo de IA para radiologia reduz o tempo de laudo"), true);
  assert.equal(isSiteLanguage(undefined, "Nuevo modelo de IA para radiología"), false);
  assert.equal(isSiteLanguage(" ", "FDA clears AI software for lung nodule detection"), false);
});
