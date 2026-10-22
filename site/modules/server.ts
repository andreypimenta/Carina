// The backend of the site's modules, installed by the api and the worker when they start (site/modules/index.ts).
import type { ServerModule } from "@aihot/backend/modules";
import literatura from "@aihot/literatura/server";
import assinatura from "@aihot/assinatura/server";

export const SERVER_MODULES: readonly ServerModule[] = [literatura, assinatura];
