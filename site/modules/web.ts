// What the site's modules add to the web pages (site/modules/index.ts).
import type { WebModule } from "@aihot/web/modules";
import literatura from "@aihot/literatura/web";
import assinatura from "@aihot/assinatura/web";
import agenda from "@aihot/agenda/web";
import caso from "@aihot/caso/web";
import expediente from "@aihot/expediente/web";

export const WEB_MODULES: readonly WebModule[] = [caso, literatura, agenda, assinatura, expediente];
