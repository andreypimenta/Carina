// A special's state in the admin: its status, and while it is a draft, where its writing is.
import { Badge } from "@aihot/web/features/admin/ui";
import { STATUS_LABEL, type EspecialStatus, type EspecialWriting } from "../especiais.ts";

const TONE: Record<EspecialStatus, "accent" | "warn" | "ok" | "muted"> = { rascunho: "warn", aprovado: "accent", publicado: "ok", descartado: "muted" };

export function StatusBadge({ status, writing }: { status: EspecialStatus; writing: EspecialWriting }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge tone={TONE[status]}>{STATUS_LABEL[status]}</Badge>
      {status === "rascunho" && writing === "pendente" && <Badge tone="info">Escrevendo…</Badge>}
      {status === "rascunho" && writing === "falhou" && <Badge tone="bad">A escrita falhou</Badge>}
    </span>
  );
}
