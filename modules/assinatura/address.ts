// The addresses a reader may give, as the module keeps them: an e-mail in lower case, a WhatsApp number in
// E.164 (+5511987654321), from the sender of a WhatsApp message. The sign-up form reads an e-mail too, to
// say what is wrong before sending; the backend decides. Plain
// functions, no backend code: the web imports them too.

export type Channel = "email" | "whatsapp";

/** An e-mail as stored, or null when it is not one. */
export function normalizeEmail(input: string): string | null {
  const email = input.trim().toLowerCase();
  if (email.length > 200 || !/^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[a-z]{2,}$/.test(email)) return null;
  return email;
}

/**
 * The forms WhatsApp may give a Brazilian mobile in: with the ninth digit and without it (older accounts
 * keep the eight-digit number). Other numbers have one form.
 */
export function phoneVariants(e164: string): string[] {
  const m = /^\+55([1-9][1-9])(\d{8,9})$/.exec(e164);
  if (!m) return [e164];
  const [, ddd, number] = m as unknown as [string, string, string];
  if (number.length === 9 && number.startsWith("9")) return [e164, `+55${ddd}${number.slice(1)}`];
  if (number.length === 8 && /^[6-9]/.test(number)) return [e164, `+55${ddd}9${number}`];
  return [e164];
}

/** "+55 (11) 98765-4321": a stored number as a reader writes it. */
export function formatPhone(e164: string): string {
  const m = /^\+55([1-9][1-9])(\d{4,5})(\d{4})$/.exec(e164);
  return m ? `+55 (${m[1]}) ${m[2]}-${m[3]}` : e164;
}
