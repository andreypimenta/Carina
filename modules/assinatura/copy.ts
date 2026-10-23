// What the module tells readers, shared by the page (web/) and the messages (backend/): the consent a reader
// gives, and the words a WhatsApp message may use. The consent stored with each address is one of these sentences.
import { EDITION_WHEN, SITE } from "@aihot/site";

/** The sentence a reader ticks to subscribe an e-mail (LGPD): what is sent, how often, and how to leave. */
export const CONSENT = `Quero receber a edição semanal do ${SITE.bareName}, ${EDITION_WHEN.weekly} (horário de Brasília), neste e-mail. Uso este dado só para esse envio e posso sair quando quiser, pelo link de cada mensagem.`;

/** The line closing each issue in the feeds and the Agent answers, before the address of /assine. */
export const CLOSING = `Receba a edição semanal do ${SITE.bareName} ${EDITION_WHEN.weekly}, de graça, por e-mail ou WhatsApp:`;

/** The message a reader sends the journal's number to receive the edition there. */
export const JOIN_TEXT = `QUERO ${SITE.name.toUpperCase()}`;

/** The sentence beside the WhatsApp button (LGPD): sending JOIN_TEXT is the reader's consent. */
export const WHATSAPP_CONSENT = `Ao mandar “${JOIN_TEXT}” para o número do ${SITE.bareName}, você pede a edição semanal ${EDITION_WHEN.weekly} (horário de Brasília) nesse WhatsApp. Usamos o número só para esse envio, e você sai quando quiser respondendo SAIR.`;

/** Whole WhatsApp messages (case and accents aside) that take the number off the list. */
export const LEAVE_WORDS = ["SAIR", "PARAR"];
