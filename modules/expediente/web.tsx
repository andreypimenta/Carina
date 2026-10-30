// The masthead on the web: a line at the foot of every public page and a row on the 我的 page lead to it.
import { Link } from "react-router";
import { defineWebModule } from "@aihot/web/modules";
import type { CalloutPlace } from "@aihot/web/modules";
import { IconUsers } from "@aihot/web/components/icons";

function Callout({ at }: { at: CalloutPlace }) {
  if (at !== "foot") return null;
  return (
    <p className="-mt-2 pb-6 text-center text-[12.5px] text-ink-4">
      <Link to="/expediente" prefetch="intent" className="hover:text-accent">Expediente: quem faz o jornal e como as matérias são escolhidas</Link>
    </p>
  );
}

export default defineWebModule({
  name: "expediente",
  tools: [{ to: "/expediente", label: "Expediente", icon: <IconUsers size={20} /> }],
  Callout,
});
