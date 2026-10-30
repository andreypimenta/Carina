// The case of the week: a short clinical case for each weekly edition, with its question to the reader, and
// its answer in the next edition. Written in the admin (backend/casos.ts); its pictures are answered by the api.
import { defineModule } from "@aihot/contracts/modules";

export default defineModule({
  name: "caso",
  adminPages: [
    { path: "admin/caso", file: "web/admin-casos.tsx" },
    { path: "admin/caso/:id", file: "web/admin-caso.tsx" },
  ],
  apiPaths: [/^\/caso\/imagens\/[^/]+$/],
});
