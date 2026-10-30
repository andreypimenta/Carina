// The backend of the site's modules, installed by the api and the worker when they start (site/modules/index.ts).
import type { ServerModule } from "@aihot/backend/modules";
import literatura from "@aihot/literatura/server";
import assinatura from "@aihot/assinatura/server";
import agenda from "@aihot/agenda/server";
import caso from "@aihot/caso/server";
import instagram from "@aihot/instagram/server";

export const SERVER_MODULES: readonly ServerModule[] = [caso, literatura, agenda, assinatura, instagram];
