import type { HotEntryView } from "@aihot/contracts/site";

/** Change against six hours before the ranking: up in the hot tone, down quiet, new stories marked new, none while sources are behind. */
export function Delta({ trend, pct, className = "" }: { trend: HotEntryView["trend"]; pct: number | null; className?: string }) {
  const base = `inline-flex h-[22px] shrink-0 items-center gap-0.5 rounded-full px-2 text-[11.5px] font-medium tabular-nums ${className}`;
  if (trend === "unknown") return <span className={`${base} bg-bg-sunk text-ink-4 dark:bg-bg-muted/60`} title="A coleta de algumas fontes está atrasada; por enquanto não comparamos com 6 horas atrás">Sem comparação</span>;
  if (trend === "new" || pct === null) return <span className={`${base} bg-accent-soft text-accent`}>Novo</span>;
  if (trend === "flat") return <span className={`${base} bg-bg-sunk text-ink-4 dark:bg-bg-muted/60`} title="Em relação a 6 horas atrás">Estável</span>;
  const up = trend === "up";
  return (
    <span className={`${base} ${up ? "bg-hot-soft text-hot" : "bg-bg-sunk text-ink-4 dark:bg-bg-muted/60"}`} title="Em relação a 6 horas atrás">
      {up ? "↑" : "↓"} {Math.abs(Math.round(pct))}%
    </span>
  );
}
