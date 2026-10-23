// The congress agenda: the congresses of industry/congressos.json on their own page (/agenda) and, when one is
// near, in the weekly issue (backend/congressos.ts).
import { defineModule } from "@aihot/contracts/modules";

export default defineModule({
  name: "agenda",
  pages: [{ path: "agenda", file: "web/agenda.tsx" }],
});
