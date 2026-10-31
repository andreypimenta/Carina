// The section a reader asks to read first: one of the journal's sections (abas, industry/taxonomy.ts AREAS),
// or none, both in the journal's order. Chosen at sign-up and on the page behind the e-mail's "Preferências"
// link; the edition e-mail puts that section first, and the admin counts readers by it.
import { AREA_KEYS, AREA_LABELS, isAreaKey, type AreaKey } from "@aihot/contracts/taxonomy";

/** The choices, as the forms list them: both first, the default. */
export const INTERESTS: ReadonlyArray<{ key: AreaKey | null; label: string }> = [
  { key: null, label: "Ambos" },
  ...AREA_KEYS.map((key) => ({ key, label: AREA_LABELS[key] })),
];

/** What a form sent, as kept: a section's key, or null (both) for anything else. */
export const interestOf = (raw: unknown): AreaKey | null => (isAreaKey(raw) ? raw : null);

/** An edition's sections with the reader's own first; the rest keep the journal's order. */
export function orderSections<T extends { label: string }>(sections: readonly T[], interest: string | null): T[] {
  const first = isAreaKey(interest) ? AREA_LABELS[interest] : null;
  return first ? [...sections.filter((s) => s.label === first), ...sections.filter((s) => s.label !== first)] : [...sections];
}
