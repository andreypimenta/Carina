// Operations alerts. The person reading them is the site owner, not an engineer: each
// message says what readers see, whether it heals by itself and what, if anything, the owner must do.
//   now   — readers are affected and it has not healed: sent at once, repeated hourly, recovery reported.
//   today — money at risk or only the owner can act: sent at once, repeated at most daily, recovery reported.
//   later — other follow-ups: one 09:00 message a day, meant to be handed to the AI.
// A site's responder (modules.ts) filters findings for the owner, preserving repeat and recovery
// tracking for messages it returns and replacing the default digest policy.
// Delivery goes through sendAlert (ops chat, internal-chat fallback; off unless FEISHU_INTERNAL_ENABLED).
import { addDays, beijingAt, beijingDate, isValidDate } from "@aihot/contracts/time";
import { ALERTS, EDITION_TIMES } from "@aihot/site";
import { sql } from "../db.ts";
import { beijingDay, beijingStamp, duration, formatAlert, formatRecovery, sendAlert, type Finding, type Level } from "../notify/feishu.ts";
import { stepsOnService } from "../editorial/models.ts";
import { backupConfigured } from "./backup.ts";
import { GROUPING_WARN_AFTER_MS, waitingSelectedNews } from "./grouping.ts";
import { upstreamFindings } from "../media/upstream.ts";
import { responder, serverModules } from "../modules.ts";
import { sourceHealth, sourceHealthList } from "../sources/health.ts";

const REPEAT_MS: Record<Exclude<Level, "later">, number> = { now: 3600_000, today: 24 * 3600_000 };

// Valves default off: read at call time, only an explicit "true" turns them on.
const collecting = () => process.env.COLLECT_ENABLED === "true";
const modelsOn = () => process.env.MODEL_CALLS_ENABLED === "true";
/**
 * How long the site may go without a new article before it counts as stalled (ALERT_QUIET_MINUTES, else
 * the site's own setting; small source lists are quieter). At most a day: the check looks one day back.
 */
const QUIET_MINUTES = Math.min(Number(process.env.ALERT_QUIET_MINUTES || ALERTS.quietMinutes), 1440);

/** Everything wrong right now, with its level. */
export async function collectFindings(now = Date.now()): Promise<Finding[]> {
  const out: Finding[] = [];

  // Readers affected now
  // Content flow, judged by outcome: whatever broke (worker, egress proxy, models, queues), readers see
  // a site that stops changing. Skipped for 20 minutes after the worker starts, and where the valves are off.
  const [hb] = await sql<{ value: { startedAt?: string } }[]>`SELECT value FROM settings WHERE key = 'heartbeat.worker'`;
  const settled = !hb?.value.startedAt || now - Date.parse(hb.value.startedAt) > 20 * 60_000;
  if (settled && collecting()) {
    const [last] = await sql<{ at: Date | null }[]>`SELECT max(a.discovered_at) AS at FROM articles a
      JOIN sources s ON s.id = a.source_id WHERE s.participation_mode = 'editorial' AND a.discovered_at > now() - interval '1 day'`;
    if (!last?.at || now - last.at.getTime() > QUIET_MINUTES * 60_000) {
      // A site without an enabled source has nothing to collect.
      const [anySource] = await sql`SELECT 1 FROM sources WHERE enabled AND participation_mode = 'editorial' LIMIT 1`;
      if (anySource) {
        out.push({
          key: "content.collect",
          level: "now",
          title: "O site parou de receber artigos novos",
          impact: last?.at ? `Os leitores não veem artigos novos: o último foi coletado em ${beijingStamp(last.at)}` : "Os leitores não veem artigos novos: nenhum artigo coletado em um dia",
          heals: ALERTS.usualFlow ? `Não, ${ALERTS.usualFlow}` : "Não",
          action: "Abra uma manutenção o quanto antes",
          detail: `editorial articles.discovered_at sem valor novo há mais de ${QUIET_MINUTES} min (sinais de Em alta são avaliados à parte); verifique sources.schedule, o proxy de saída e as falhas de coleta`,
          since: last?.at ?? undefined,
        });
      }
    }
  }
  if (settled && collecting() && modelsOn()) {
    const waiting = (await waitingSelectedNews()).filter((item) => now - item.since.getTime() >= GROUPING_WARN_AFTER_MS);
    if (waiting.length) {
      const manual = waiting.filter((item) => item.recovery === "manual").length;
      const receipt = waiting.some((item) => item.recovery === "receipt");
      out.push({
        key: "content.grouping",
        level: "now",
        title: "Notícias da Seleção presas na confirmação de duplicidade, ainda não publicadas",
        impact: `${waiting.length} ${waiting.length === 1 ? "notícia que atingiu" : "notícias que atingiram"} os critérios da Seleção ${waiting.length === 1 ? "espera" : "esperam"} confirmação há mais de 10 min e ainda não ${waiting.length === 1 ? "entrou" : "entraram"} na Seleção; os leitores podem ver essas atualizações com atraso`,
        heals: manual ? `${manual} ${manual === 1 ? "precisa" : "precisam"} de ação manual para se resolver${manual < waiting.length ? "; as demais ainda estão se recuperando sozinhas" : ""}`
          : receipt ? "Ainda aguardando recuperação automática; requisições pagas com resultado desconhecido são liberadas uma vez automaticamente após 30 min" : "Ainda haverá novas tentativas automáticas, mas a espera já passou do normal",
        action: manual ? "Encaminhe para a IA tratar; requisições pagas com resultado desconhecido precisam ter cobrança e resultado conferidos antes de decidir liberá-las" : "Encaminhe para a IA verificar o motivo da espera, para não acumular mais",
        detail: waiting.slice(0, 8).map((item) => `${item.articleId} (${duration(now - item.since.getTime())})${item.receiptId ? ` recibo #${item.receiptId}` : ""}${item.error ? `: ${item.error.slice(0, 120)}` : ""}`).join("; "),
        since: waiting[0]!.since,
      });
    }
    const [p] = await sql<{ waiting: number; oldest: Date | null; failed: number }[]>`
      SELECT count(*) FILTER (WHERE processing_state = 'new' AND discovered_at < now() - interval '2 hours')::int AS waiting,
             min(discovered_at) FILTER (WHERE processing_state = 'new') AS oldest,
             count(*) FILTER (WHERE processing_state = 'failed' AND discovered_at > now() - interval '3 hours')::int AS failed
      FROM articles WHERE processing_state IN ('new', 'failed') AND discovered_at > now() - interval '2 days'`;
    if (p!.waiting >= 10 || p!.failed >= 20) {
      const errors = await sql<{ error: string; n: number }[]>`
        SELECT left(coalesce(processing_error, '(nenhum)'), 120) AS error, count(*)::int AS n FROM articles
        WHERE processing_state IN ('new', 'failed') AND discovered_at > now() - interval '3 hours' AND processing_error IS NOT NULL
        GROUP BY 1 ORDER BY 2 DESC LIMIT 3`;
      out.push({
        key: "content.process",
        level: "now",
        title: "Conteúdo novo travado, não chega ao site",
        impact: [p!.waiting >= 10 && `${p!.waiting} artigos novos esperam há mais de 2 h e ainda não foram processados`, p!.failed >= 20 && `${p!.failed} artigos novos falharam no processamento nas últimas 3 h`]
          .filter(Boolean)
          .join("; ") + "; a Seleção e o Em alta vão ficar sem conteúdo",
        heals: p!.waiting >= 10 ? "Sim, o processamento é retomado quando o serviço voltar" : "Não, é preciso corrigir e reprocessar esses artigos",
        action: "Encaminhe para a IA tratar",
        detail: errors.map((e) => `${e.error} (${e.n})`).join("; ") || "nenhum erro registrado",
        since: p!.waiting >= 10 && p!.oldest ? p!.oldest : undefined,
      });
    }
    out.push(...await dailyReportFindings(now));
  }

  // Money, and things only the owner can do
  out.push(...(await providerFindings()));

  // Content-group pushes the Feishu webhook refused (a removed bot, a changed address); nothing resends them.
  const [refused] = await sql<{ n: number; target: string | null; response: string | null }[]>`
    SELECT count(*)::int AS n, max(t.note) AS target, left(max(d.response), 200) AS response FROM deliveries d JOIN notify_targets t ON t.key = d.target_key
    WHERE d.status = 'failed' AND d.updated_at > now() - interval '1 day'`;
  if (refused!.n > 0) {
    out.push({
      key: "deliveries.failed",
      level: "today",
      title: "Envios para o grupo de conteúdo do Feishu não saíram",
      impact: `${refused!.n} ${refused!.n === 1 ? "notificação não chegou" : "notificações não chegaram"} a ${refused!.target ?? "o grupo de conteúdo"} nas últimas 24 h`,
      heals: "Não, não há reenvio automático",
      action: "Encaminhe para a IA tratar; se o bot de envio foi removido do grupo, você precisa adicioná-lo de volta",
      detail: refused!.response ?? "",
    });
  }

  if (backupConfigured()) {
    const [b] = await sql<{ value: { at: string; uploaded: boolean; filesError?: string } }[]>`SELECT value FROM settings WHERE key = 'backup.last'`;
    // A failed archive updates backup.last too. Reuse the run history so repeated failures cannot
    // reset the age; before the first success, count from the first attempt rather than from now.
    const [runs] = await sql<{ last_ok: Date | null; first_attempt: Date | null }[]>`
      SELECT max(finished_at) FILTER (WHERE status = 'ok') AS last_ok, min(started_at) AS first_attempt
      FROM job_runs WHERE job = 'ops.backup'`;
    const lastOk = Math.max(runs?.last_ok?.getTime() ?? 0, b?.value.uploaded ? Date.parse(b.value.at) : 0);
    const since = lastOk || runs?.first_attempt?.getTime() || now;
    const age = now - since;
    const state = b?.value.filesError ? `banco de dados enviado, falha ao empacotar os anexos: ${b.value.filesError}` : b?.value.uploaded === false ? "não enviado" : "";
    if (age > 50 * 3600_000) {
      out.push({
        key: "backup.failed",
        level: "today",
        title: "O backup do banco de dados falhou por dois dias seguidos",
        impact: lastOk ? `Se o servidor tiver um problema, os dados das últimas ${duration(age)} podem não ser recuperados por completo` : "Ainda não há backup completo bem-sucedido; se o servidor tiver um problema, os dados podem não ser recuperados",
        heals: "Não",
        action: "Encaminhe para a IA tratar",
        detail: `${lastOk ? "Último sucesso" : "Primeira tentativa de backup"} ${beijingStamp(since)}${state ? `; ${state}` : ""}; veja o histórico de execuções de ops.backup`,
        since: new Date(since),
      });
    } else if (!b || !b.value.uploaded || age > 30 * 3600_000) {
      out.push({ key: "backup.stale", level: "later", title: "O backup do banco de dados não tem sucesso há mais de um dia", detail: b ? `Última tentativa ${beijingStamp(b.value.at)}${state ? ` (${state})` : ""}; veja ops.backup` : "Ainda não há registro de backup bem-sucedido" });
    }
  }

  out.push(...(await upstreamFindings(now)));

  // What the site's modules find.
  for (const m of serverModules()) if (m.alerts) out.push(...(await m.alerts(now)));

  // Follow-ups
  if (collecting()) {
    for (const group of await sourceHealth(now)) {
      if (group.failing.length) out.push({
        key: `sources.failing.${group.mode}`, level: "later", title: `${group.name}: ${sourcesCount(group.failing.length)} com falhas de coleta seguidas`,
        detail: sourceHealthList(group.failing, s => `${s.fail_count} falhas seguidas${s.last_error ? `, ${s.last_error}` : ""}`) + "; encaminhe para a IA verificar os erros de coleta",
      });
      if (group.unstable.length) out.push({
        key: `sources.unstable.${group.mode}`, level: "later", title: `${group.name}: ${sourcesCount(group.unstable.length)} com falhas de coleta repetidas`,
        detail: sourceHealthList(group.unstable, s => `${s.failed}/${s.runs} falhas nos últimos 7 dias`) + "; verifique mesmo que a última tenha dado certo, para não continuar perdendo conteúdo",
      });
      if (group.silent.length) out.push({
        key: `sources.silent.${group.mode}`, level: "later", title: `${group.name}: ${sourcesCount(group.silent.length)} sem conteúdo novo há 7 dias`,
        detail: sourceHealthList(group.silent, s => `${s.runs} coletas e 0 itens novos nos últimos 7 dias`) + "; compare com o site original para distinguir atualização pouco frequente de coleta quebrada",
      });
      if (group.quality.length) out.push({
        key: `sources.quality.${group.mode}`, level: "later", title: `${group.name}: ${sourcesCount(group.quality.length)} com qualidade dos artigos a verificar`,
        detail: sourceHealthList(group.quality, s => `nos últimos 7 dias, ${s.undated} sem data de publicação e ${s.repeated} revisados repetidamente`) + "; sem data, uma notícia pode ser tratada como artigo histórico; revisões repetidas pedem conferir se o corpo está misturando conteúdo que muda",
      });
      if (group.detailFailures.length) out.push({
        key: `sources.details.${group.mode}`, level: "later", title: `${group.name}: ${sourcesCount(group.detailFailures.length)} com falha ao completar a página de detalhe`,
        detail: sourceHealthList(group.detailFailures, s => `${s.detail_failures} nos últimos 7 dias`) + "; veja o endereço de detalhe e o erro no histórico de coleta",
      });
    }
  }
  const [r] = await sql<{ receipts: number; services: string | null; deliveries: number }[]>`
    SELECT (SELECT count(*)::int FROM receipts WHERE status = 'unknown') AS receipts,
           (SELECT string_agg(DISTINCT service || '/' || purpose, ', ') FROM receipts WHERE status = 'unknown') AS services,
           (SELECT count(*)::int FROM deliveries WHERE status = 'unknown') AS deliveries`;
  if (r!.receipts > 0) {
    out.push({ key: "receipts.unknown", level: "later", title: `${r!.receipts} ${r!.receipts === 1 ? "requisição paga com resultado" : "requisições pagas com resultado"} ainda não confirmado`, detail: `${r!.services}; pode afetar o processamento de conteúdo, veja o impacto na página "Execução" do Painel; requisições que continuam desconhecidas após a recuperação automática precisam ser conferidas antes de liberar` });
  }
  if (r!.deliveries > 0) out.push({ key: "deliveries.unknown", level: "later", title: `${r!.deliveries} ${r!.deliveries === 1 ? "envio" : "envios"} para o grupo de conteúdo do Feishu sem confirmação de entrega`, detail: "Na página \"Execução\" do Painel, confira se chegou ao grupo e depois marque ou reenvie" });

  // Runnable jobs (deferred ones excluded) that have waited more than two hours.
  const queues = await sql<{ name: string; n: number; oldest: Date }[]>`
    SELECT name, count(*)::int AS n, min(start_after) AS oldest FROM pgboss.job
    WHERE state IN ('created', 'retry') AND start_after <= now() AND name NOT LIKE 'cron.%' GROUP BY 1`;
  for (const q of queues) {
    if (now - q.oldest.getTime() > 2 * 3600_000) {
      out.push({ key: `queue.${q.name}`, level: "later", title: `Tarefa em segundo plano na fila há mais de 2 h: ${q.name}`, detail: `${q.n} aguardando; a mais antiga espera há ${duration(now - q.oldest.getTime())}` });
    }
  }

  // The site's modules' follow-ups.
  for (const m of serverModules()) if (m.followUps) out.push(...(await m.followUps(now)));
  return out;
}

/** "1 fonte", "3 fontes". */
const sourcesCount = (n: number) => `${n} ${n === 1 ? "fonte" : "fontes"}`;

/** What stops when a model service refuses us: the steps that default to its models, else a pointer to the admin. */
function modelStops(service: string): string {
  const steps = stepsOnService(service);
  return steps.length ? `Pararam: ${steps.join(", ")}` : "Pararam as etapas que usam este fornecedor de modelos (veja \"Modelos e avaliação\" no Painel); conteúdo novo pode não entrar na Seleção";
}
/** `stops` is for the services that are not models; a model service's follows from the steps that use it. */
const PROVIDERS: Record<string, { name: string; where: string; stops?: string }> = {
  llm: { name: "Serviço de modelos padrão", where: "o console do fornecedor de modelos" },
  zhipu: { name: "Zhipu", where: "a plataforma aberta da Zhipu" },
  dashscope: { name: "Alibaba Cloud Model Studio (Bailian)", where: "o console do Alibaba Cloud Model Studio" },
  deepseek: { name: "DeepSeek", where: "a plataforma aberta da DeepSeek" },
  mimo: { name: "Xiaomi MiMo", where: "a plataforma aberta da Xiaomi MiMo" },
  socialdata: { name: "SocialData", stops: "Conteúdo novo do X (Twitter) não chega", where: "o painel da SocialData" },
  jina: { name: "Jina", stops: "Alguns artigos ficam sem o corpo", where: "o painel da Jina" },
  dajiala: { name: "Dajiala", stops: "Artigos novos de contas do WeChat não chegam", where: "o painel da Dajiala" },
};
export const providerName = (service: string) => PROVIDERS[service]?.name ?? service;
export const providerStops = (service: string) => {
  const p = PROVIDERS[service];
  return p ? (p.stops ?? modelStops(service)) : "As funções relacionadas pararam";
};
export const providerConsole = (service: string) => PROVIDERS[service]?.where ?? `o painel de ${service}`;

/** Paid services that refuse us (no balance, a dead key), and daily budgets used up. */
async function providerFindings(): Promise<Finding[]> {
  const out: Finding[] = [];
  const refused = await sql<{ service: string; n: number; last: string }[]>`
    SELECT service, count(*)::int AS n, (array_agg(left(error, 200) ORDER BY started_at DESC))[1] AS last FROM receipt_attempts
    WHERE status = 'failed' AND started_at > now() - interval '1 hour'
      AND error ~* '(HTTP 40[123]\\M|insufficient|balance|arrear|good standing|欠费|余额)'
    GROUP BY 1 HAVING count(*) >= 3`;
  for (const p of refused) {
    out.push({
      key: `provider.refused.${p.service}`,
      level: "today",
      owner: true,
      title: `${providerName(p.service)} recusa o serviço: talvez falta de saldo ou conta inválida`,
      impact: providerStops(p.service),
      heals: "Não",
      action: `Veja o saldo e o status da conta em ${providerConsole(p.service)}; depois de recarregar ou regularizar, o sistema continua sozinho; se ambos estiverem normais, abra uma manutenção para achar a causa`,
      detail: `${p.n} recusas na última hora: ${p.last}`,
    });
  }
  const capped = await sql<{ service: string; per_day: number; used: number }[]>`
    SELECT b.service, b.per_day, count(a.id)::int AS used FROM budgets b
    JOIN receipt_attempts a ON a.service = b.service AND a.origin = 'live' AND a.started_at > now() - interval '1 day'
    WHERE b.per_day > 0 GROUP BY 1, 2 HAVING count(a.id) >= b.per_day`;
  for (const c of capped) {
    out.push({
      key: `budget.day.${c.service}`,
      level: "later",
      title: `${providerName(c.service)}: a cota de chamadas das últimas 24 h acabou`,
      impact: `${providerStops(c.service)}, até a cota se liberar com o tempo`,
      heals: "Sim, a cota se recompõe numa janela móvel de 24 h",
      action: "Desta vez não precisa fazer nada; se acontecer com frequência, decida se aumenta a cota",
      detail: `${c.used} chamadas em 24 h, limite ${c.per_day} (tabela budgets)`,
    });
  }
  return out;
}

interface AlertState {
  [key: string]: { title: string; since: string; sentAt: string };
}

const DAILY_PREFIX = "report.daily:";
const dailyDate = (key: string) => key.startsWith(DAILY_PREFIX) && isValidDate(key.slice(DAILY_PREFIX.length))
  ? key.slice(DAILY_PREFIX.length) : undefined;

async function alertState(): Promise<AlertState> {
  const [row] = await sql<{ value: AlertState }[]>`SELECT value FROM settings WHERE key = 'alerts.state'`;
  const state = { ...(row?.value ?? {}) };
  // The old shared key recorded its first alert date in since. Keep its reminder timing on upgrade.
  const legacy = state["report.daily"];
  if (legacy && Number.isFinite(Date.parse(legacy.since))) {
    const date = beijingDate(legacy.since);
    state[`${DAILY_PREFIX}${date}`] ??= { ...legacy, title: `As notas diárias de ${date} ainda não foram geradas` };
    delete state["report.daily"];
  }
  return state;
}

async function dailyReportFindings(now: number): Promise<Finding[]> {
  const today = beijingDate(now);
  const state = await alertState();
  const [activity] = await sql<{ first_report: string | null; first_attempt: Date | null }[]>`
    SELECT (SELECT min(key) FROM reports WHERE kind = 'daily') AS first_report,
           (SELECT min(started_at) FROM job_runs WHERE job = 'reports.compose') AS first_attempt`;
  const starts = [activity?.first_report, activity?.first_attempt && beijingDate(activity.first_attempt)]
    .filter((date): date is string => !!date && isValidDate(date)).sort();
  const start = starts[0] ?? today;
  // Bound new gap discovery, but never expire an already announced missing edition.
  const dates = new Set(Object.keys(state).map(dailyDate).filter((date): date is string => !!date));
  for (let date = addDays(today, -6); date <= today; date = addDays(date, 1)) {
    if (date >= start) dates.add(date);
  }
  const overdue = [...dates].filter(date => now >= beijingAt(date, EDITION_TIMES.daily).getTime() + 2 * 3600_000).sort();
  if (!overdue.length) return [];
  const published = new Set((await sql<{ key: string }[]>`SELECT key FROM reports WHERE kind = 'daily' AND key IN ${sql(overdue)}`).map(r => r.key));
  return overdue.filter(date => !published.has(date)).map(date => ({
    key: `${DAILY_PREFIX}${date}`, level: "now",
    title: `As notas diárias de ${date} ainda não foram geradas`, impact: `Os leitores não veem as notas diárias de ${date}`,
    heals: "Ainda não foi recuperado; veja o histórico de execuções para saber se é preciso gerar manualmente",
    action: "Abra uma manutenção o quanto antes",
    detail: `reports daily ${date} não existe; veja o histórico de execuções de reports.compose`,
  }));
}

/**
 * Every 10 minutes: new problems and recoveries of the now/today levels go out; follow-ups wait for 09:00.
 * With a responder, only what it hands back goes out, and what it still holds is not reported as recovered.
 */
export async function checkAlerts(now = Date.now()) {
  const all = await collectFindings(now);
  const r = responder();
  const { tell, held } = r ? await r.take(all, now) : { tell: all, held: [] as string[] };
  const found = tell.filter((f) => f.level !== "later");
  const state = await alertState();
  const sent: string[] = [];
  for (const f of found) {
    const open = state[f.key];
    if (open && now - Date.parse(open.sentAt) <= REPEAT_MS[f.level as Exclude<Level, "later">]) continue;
    const since = open ? new Date(open.since) : (f.since ?? new Date(now));
    const msg = formatAlert(f, since, now, !!open);
    await sendAlert(msg.title, msg.lines);
    state[f.key] = { title: f.title, since: since.toISOString(), sentAt: new Date(now).toISOString() };
    sent.push(f.key);
  }
  for (const [key, open] of Object.entries(state)) {
    if (found.some((f) => f.key === key) || held.includes(key)) continue;
    // Suppressed findings (valves, startup grace or responder policy) are not evidence of recovery.
    const date = dailyDate(key);
    if (date) {
      const [report] = await sql`SELECT 1 FROM reports WHERE kind = 'daily' AND key = ${date}`;
      if (!report) continue;
    }
    const msg = formatRecovery(open.title, new Date(open.since), now);
    await sendAlert(msg.title, msg.lines);
    sent.push(`${key}:recovered`);
    delete state[key];
  }
  await sql`INSERT INTO settings (key, value, updated_by) VALUES ('alerts.state', ${sql.json(state as never)}, 'alerts')
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`;
  return { open: Object.keys(state), sent };
}

/** 09:00 (without a responder): one message with the follow-ups; nothing when there are none. */
export async function sendDigest(now = Date.now()) {
  const items = (await collectFindings(now)).filter((f) => f.level === "later");
  const lines = items.map((f, i) => `${i + 1}. ${f.title}${f.detail ? `\n   ${f.detail}` : ""}`);
  if (!lines.length) return { items: 0 };
  await sendAlert(`📋 Relatório diário do sistema · ${beijingDay(now)}`, ["Os itens abaixo precisam de acompanhamento; o impacto está em cada um. Você pode encaminhar a mensagem inteira para a IA tratar.", ...lines]);
  return { items: lines.length };
}
