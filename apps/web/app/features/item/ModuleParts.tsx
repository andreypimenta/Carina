// The modules' parts of an article (WebModule.itemPage) at one place of the page, from what each module's
// server part returned for it (SiteItemDetail.modules).
import type { SiteItemDetail } from "@aihot/contracts/site";
import { loadParts } from "../../site-modules";

const PARTS = await loadParts((m) => m.itemPage);

export function ItemModuleParts({ at, item }: { at: "top" | "end"; item: SiteItemDetail }) {
  return PARTS.map(({ name, part }) => {
    const Block = at === "top" ? part.Top : part.End;
    const data = item.modules?.[name];
    return Block && data !== undefined ? <Block key={name} data={data} item={item} /> : null;
  });
}
