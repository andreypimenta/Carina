// The weekly edition's case of the week: a block after the front page (web/CasoView.tsx).
import type { ReportPagePart } from "@aihot/web/modules";
import type { CasoPart } from "../caso.ts";
import { CasoView } from "./CasoView.tsx";

const part: ReportPagePart = { Block: ({ data }) => <CasoView part={data as CasoPart} /> };
export default part;
