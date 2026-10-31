// The sections a reader asks to read first: some of the journal's sections (abas, industry/taxonomy.ts AREAS),
// or none, all in the journal's order. Chosen at sign-up and on the page behind the e-mail's "Preferências"
// link; the edition e-mail puts those sections first, and the admin counts readers by them. Kept as the
// section keys in the journal's order, joined by commas ("cirurgia,via-aerea"); null: none chosen.
import { AREA_KEYS, AREA_LABELS, type AreaKey } from "@aihot/contracts/taxonomy";

/** The choices, as the forms list them: all (none first), the default, then each section. */
export const INTERESTS: ReadonlyArray<{ key: AreaKey | null; label: string }> = [
  { key: null, label: "Todas" },
  ...AREA_KEYS.map((key) => ({ key, label: AREA_LABELS[key] })),
];

/** The sections a kept value names, in the journal's order; unknown keys are dropped. */
export function interestKeys(interest: string | null | undefined): AreaKey[] {
  const keys = new Set((interest ?? "").split(","));
  return AREA_KEYS.filter((k) => keys.has(k));
}

/**
 * What a form sent (a section key, a list of them, or a kept value), as kept: the sections in the journal's
 * order, or null when it names none or every one (all read in the journal's order).
 */
export function interestOf(raw: unknown): string | null {
  const keys = interestKeys((Array.isArray(raw) ? raw : [raw]).filter((k) => typeof k === "string").join(","));
  return keys.length && keys.length < AREA_KEYS.length ? keys.join(",") : null;
}

/** A kept value's name: its sections' labels, "+"-joined. */
export const interestName = (interest: string | null) => interestKeys(interest).map((k) => AREA_LABELS[k]).join(" + ") || INTERESTS[0]!.label;

/** An edition's sections with the reader's own first; the rest keep the journal's order. */
export function orderSections<T extends { label: string }>(sections: readonly T[], interest: string | null): T[] {
  const first = new Set(interestKeys(interest).map((k) => AREA_LABELS[k]));
  return [...sections.filter((s) => first.has(s.label)), ...sections.filter((s) => !first.has(s.label))];
}
