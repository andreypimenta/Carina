// The Monday source-health report for the ops chat. It goes through the same gated channel as the
// alerts (off unless FEISHU_INTERNAL_ENABLED).
import { sql } from "../db.ts";
import { sendAlert } from "../notify/feishu.ts";
import { serverModules } from "../modules.ts";
import { sourceHealth, sourceHealthList } from "../sources/health.ts";

/** The change from b to a: "+12%", "—" without a b. Also the modules' reports. */
export const pct = (a: number, b: number) => (b ? `${a >= b ? "+" : ""}${(((a - b) / b) * 100).toFixed(0)}%` : "—");
/** A count with thousands separators. */
export const n = (v: number) => v.toLocaleString("pt-BR");

/** Monday 09:00: how the sources did over the last seven days. */
export async function sourceHealthWeekly(now = Date.now()) {
  const since = new Date(now - 7 * 86400_000);
  const before = new Date(now - 14 * 86400_000);
  const [[counts], [items], groups] = await Promise.all([
    sql<{ enabled: number; failing: number; degraded: number; added: number }[]>`
      SELECT count(*) FILTER (WHERE enabled)::int AS enabled,
             count(*) FILTER (WHERE enabled AND health = 'failing')::int AS failing,
             count(*) FILTER (WHERE enabled AND health = 'degraded')::int AS degraded,
             count(*) FILTER (WHERE created_at >= ${since})::int AS added
      FROM sources`,
    sql<{ week: number; prev: number; selected: number }[]>`
      SELECT count(*) FILTER (WHERE discovered_at >= ${since})::int AS week,
             count(*) FILTER (WHERE discovered_at >= ${before} AND discovered_at < ${since})::int AS prev,
             (SELECT count(*)::int FROM publications p WHERE p.selected AND p.visibility <> 'withdrawn' AND p.discovered_at >= ${since}) AS selected
      FROM articles WHERE discovered_at >= ${before}`,
    sourceHealth(now),
  ]);
  const lines = [
    `Coletados nesta semana: ${n(items!.week)} itens (semana anterior: ${n(items!.prev)}, ${pct(items!.week, items!.prev)}), dos quais ${n(items!.selected)} na Seleção`,
    `Fontes ativas: ${counts!.enabled}, ${counts!.added} novas nesta semana; ${counts!.failing} com falha de coleta, ${counts!.degraded} instáveis`,
  ];
  // The modules' own collectors, a line each.
  for (const m of serverModules()) if (m.sourceHealth) lines.push(...(await m.sourceHealth(now)));
  for (const group of groups) {
    lines.push("", `${group.name}: ${group.sources.length} fontes ativas; ${n(group.sources.reduce((sum, s) => sum + s.items, 0))} itens nesta semana; ${group.failing.length} com falhas seguidas, ${group.unstable.length} com falhas repetidas, ${group.silent.length} sem novidade há 7 dias`);
    if (group.failing.length) lines.push(`Falha de coleta: ${sourceHealthList(group.failing, s => `${s.fail_count} falhas seguidas${s.last_error ? ` (${s.last_error})` : ""}`, Infinity)}`);
    if (group.unstable.length) lines.push(`Instáveis: ${sourceHealthList(group.unstable, s => `${s.failed}/${s.runs} falhas`, Infinity)}`);
    if (group.silent.length) lines.push(`Sem novidade há 7 dias (compare com o site original; pode ser só atualização pouco frequente): ${sourceHealthList(group.silent, s => `${s.runs} coletas`, Infinity)}`);
    if (group.quality.length) lines.push(`Qualidade dos artigos a verificar: ${sourceHealthList(group.quality, s => `${s.undated} sem data de publicação, ${s.repeated} revisados repetidamente`, Infinity)}`);
    if (group.detailFailures.length) lines.push(`Falha ao completar a página de detalhe: ${sourceHealthList(group.detailFailures, s => `${s.detail_failures}`, Infinity)}`);
  }
  const failing = counts!.failing;
  const silent = groups.reduce((sum, g) => sum + g.silent.length, 0);
  const followUp = counts!.failing > 0 || groups.some(g => g.failing.length || g.unstable.length || g.silent.length || g.quality.length || g.detailFailures.length);
  lines.push("", followUp ? "Se precisar agir, encaminhe esta mensagem para a IA; os detalhes estão nas páginas \"Fontes\" e \"Execução\" do Painel." : "Nenhuma fonte precisa de ação.");
  await sendAlert("📊 Relatório semanal das fontes", lines);
  return { failing, silent };
}
