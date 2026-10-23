// The literature module: PubMed papers as the site's own articles or as republished open-access texts (their
// articles are ordinary items of two sources, backend/collect.ts), and the journal's specials written from
// PubMed references, with their pages and their admin (especiais.ts).
import { defineModule } from "@aihot/contracts/modules";

export default defineModule({
  name: "literatura",
  pages: [
    { path: "especiais", file: "web/especiais.tsx" },
    { path: "especiais/:slug", file: "web/especial.tsx" },
  ],
  adminPages: [
    { path: "admin/especiais", file: "web/admin-especiais.tsx" },
    { path: "admin/especiais/:id", file: "web/admin-especial.tsx" },
  ],
});
