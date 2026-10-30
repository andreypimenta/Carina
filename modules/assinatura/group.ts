// The group a sign-up came from: the tag in /assine?g=<tag>, which the editor puts on the link sent to each
// WhatsApp group, kept with the address so the admin can count sign-ups by group. A tag names a group, never a
// person, and is shown only in the admin.

/** The tag on the link a reader passes on from "Indique a um colega". */
export const INDIQUE_GROUP = "indique";

/** "Residentes SP 2026" → "residentes-sp-2026": lowercase letters, digits and dashes, at most 40; null when nothing is left. */
export function groupTag(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const tag = raw.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40).replace(/^-+|-+$/g, "");
  return tag || null;
}

/** /assine with its group's tag, or without one when the tag comes to nothing. */
export function signupPath(tag: string | null): string {
  return tag ? `/assine?${new URLSearchParams({ g: tag })}` : "/assine";
}
