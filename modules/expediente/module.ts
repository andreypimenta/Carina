// The masthead: who edits the journal and how its articles are chosen and written (/expediente), so a doctor
// knows who signs what they read. The text is the site's (site/pages/expediente.md), the editor's details
// too (EXPEDIENTE in site/site.ts).
import { defineModule } from "@aihot/contracts/modules";

export default defineModule({
  name: "expediente",
  pages: [{ path: "expediente", file: "web/expediente.tsx" }],
});
