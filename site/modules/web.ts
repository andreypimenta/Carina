// What the site's modules add to the web pages (site/modules/index.ts).
import type { WebModule } from "@aihot/web/modules";
import literatura from "@aihot/literatura/web";

export const WEB_MODULES: readonly WebModule[] = [literatura];
