// What the module tells readers, shared by the page (web/) and the messages (backend/): the consent a reader
// gives, and the words a WhatsApp reply may use. The consent stored with each address is this sentence.
import { EDITION_WHEN, SITE } from "@aihot/site";

/** The sentence a reader ticks to subscribe (LGPD): what is sent, how often, and how to leave. */
export const CONSENT = `Quero receber a edição semanal do ${SITE.bareName}, ${EDITION_WHEN.weekly} (horário de Brasília), nos contatos que informei. Uso estes dados só para esse envio e posso sair quando quiser, pelo link de cada mensagem ou respondendo SAIR no WhatsApp.`;

/** Whole WhatsApp messages (case and accents aside) that take the number off the list, and that confirm it. */
export const LEAVE_WORDS = ["SAIR", "PARAR"];
export const CONFIRM_WORDS = ["SIM", "CONFIRMAR"];
