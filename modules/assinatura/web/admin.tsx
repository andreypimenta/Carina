// The admin's view of the readers: whether each channel can send, how many addresses there are by channel
// and status, each edition's sends (with a way to send again those that failed or may not have arrived,
// after checking), the latest addresses and the whole list as CSV.
import { useState } from "react";
import { useLoaderData, type LoaderFunctionArgs } from "react-router";
import { SITE } from "@aihot/site";
import { adminGet } from "@aihot/web/lib/admin.server";
import { useAdminAction } from "@aihot/web/features/admin/action";
import { bj } from "@aihot/web/features/admin/format";
import { AdminPage, Badge, Button, Card, DataTable, FilterChips, ReasonDialog, Stat } from "@aihot/web/features/admin/ui";
import { formatPhone, type Channel } from "../address.ts";
import type { AdminEdition, AdminOverview } from "../types.ts";

export async function loader({ request }: LoaderFunctionArgs) {
  return adminGet<AdminOverview>(request, `/api/admin/assinatura${new URL(request.url).search}`);
}

export const meta = () => [{ title: `Inscritos · Painel do ${SITE.bareName}` }];

const CHANNEL: Record<Channel, string> = { email: "E-mail", whatsapp: "WhatsApp" };
const STATUS: Record<string, string> = { pending: "Aguardando confirmação", confirmed: "Confirmado", unsubscribed: "Saiu" };
const SEND: Record<string, string> = { pending: "na fila", sending: "enviando", sent: "enviados", failed: "falharam", unknown: "sem confirmação de entrega", skipped: "pulados" };
const TONE: Record<string, "ok" | "warn" | "muted"> = { confirmed: "ok", pending: "warn", unsubscribed: "muted" };

function EditionRow({ e }: { e: AdminEdition }) {
  const { run } = useAdminAction();
  const [open, setOpen] = useState(false);
  const stuck = (e.sends.failed ?? 0) + (e.sends.unknown ?? 0);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-line px-4 py-3 text-[13px] last:border-b-0">
      <span className="num font-semibold text-ink">{e.edition_key}</span>
      <Badge>{CHANNEL[e.channel]}</Badge>
      <span className="text-ink-3">planejada {bj(e.planned_at)} para {e.recipients}</span>
      <span className="text-ink-2">{Object.entries(e.sends).map(([s, n]) => `${n} ${SEND[s] ?? s}`).join(" · ") || "nenhum envio"}</span>
      {e.last_error && <span className="max-w-[420px] truncate text-[12px] text-ink-4" title={e.last_error}>{e.last_error}</span>}
      {stuck > 0 && <Button size="sm" onClick={() => setOpen(true)}>Enviar de novo ({stuck})</Button>}
      <ReasonDialog
        open={open}
        title={`Enviar de novo · ${e.edition_key} · ${CHANNEL[e.channel]}`}
        description="Os envios que falharam ou que podem ter chegado voltam para a fila. Quem já recebeu e está entre os sem confirmação de entrega vai receber outra vez: confira antes na instância ou no Resend."
        confirmLabel="Enviar de novo"
        onClose={() => setOpen(false)}
        onSubmit={async (reason) => (await run("POST", "/api/admin/assinatura/reenviar", { edition: e.edition_key, channel: e.channel, reason }, { success: "Envios de volta à fila" })) !== null}
      />
    </div>
  );
}

export default function AssinaturaAdmin() {
  const d = useLoaderData<typeof loader>();
  const total = (channel: Channel, status?: string) => d.counts.filter((c) => c.channel === channel && (!status || c.status === status)).reduce((n, c) => n + c.n, 0);
  return (
    <AdminPage
      title="Inscritos"
      subtitle="Leitores da edição semanal por e-mail e WhatsApp. Só endereços confirmados recebem a edição."
      actions={<a className="text-[13px] font-medium text-accent" href="/api/admin/assinatura/inscritos.csv">Exportar CSV</a>}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(["email", "whatsapp"] as const).map((c) => (
          <Stat key={c} label={`${CHANNEL[c]} · confirmados`} value={total(c, "confirmed")} hint={`${total(c, "pending")} aguardando · ${total(c, "unsubscribed")} saíram`} />
        ))}
        {(["email", "whatsapp"] as const).map((c) => (
          <Stat key={`${c}-ready`} label={`Envio por ${CHANNEL[c]}`} value={d.ready[c] ? "Ligado" : "Desligado"} tone={d.ready[c] ? "ok" : "warn"}
            hint={c === "email" ? "NEWSLETTER_EMAIL_ENABLED, RESEND_API_KEY, NEWSLETTER_FROM" : "NEWSLETTER_WHATSAPP_ENABLED, NEWSLETTER_WHATSAPP_NUMBER, EVOLUTION_*"} />
        ))}
      </div>

      <Card title="Edições enviadas" className="mt-5" pad={false}>
        {d.editions.length ? d.editions.map((e) => <EditionRow key={`${e.edition_key}-${e.channel}`} e={e} />) : <p className="px-4 py-5 text-[13px] text-ink-4">Nenhuma edição enviada ainda.</p>}
      </Card>

      <div className="mt-6 flex flex-wrap gap-3">
        <FilterChips param="channel" options={[{ value: "", label: "Todos os canais" }, { value: "email", label: "E-mail" }, { value: "whatsapp", label: "WhatsApp" }]} />
        <FilterChips param="status" options={[{ value: "", label: "Todos" }, ...Object.entries(STATUS).map(([value, label]) => ({ value, label }))]} />
      </div>
      <Card className="mt-3" pad={false}>
        <DataTable
          rows={d.subscribers}
          rowKey={(r) => r.id}
          empty="Nenhum inscrito"
          columns={[
            { key: "a", label: "Endereço", render: (r) => <span className="font-mono text-[12.5px] text-ink">{r.channel === "whatsapp" ? formatPhone(r.address) : r.address}</span> },
            { key: "c", label: "Canal", render: (r) => CHANNEL[r.channel] },
            { key: "s", label: "Status", render: (r) => <Badge tone={TONE[r.status] ?? "muted"} title={r.confirm_error ?? undefined}>{STATUS[r.status] ?? r.status}</Badge> },
            { key: "t", label: "Inscrição", render: (r) => <span className="num whitespace-nowrap">{bj(r.created_at, true)}</span> },
            { key: "ok", label: "Confirmação", render: (r) => (r.confirmed_at ? <span className="num whitespace-nowrap">{bj(r.confirmed_at, true)}</span> : r.confirm_error ? <span className="text-[12px] text-ink-4" title={r.confirm_error}>falhou</span> : null) },
            { key: "out", label: "Saída", render: (r) => (r.unsubscribed_at ? <span className="num whitespace-nowrap">{bj(r.unsubscribed_at, true)} · {r.left_by}</span> : null) },
          ]}
        />
      </Card>
      {d.subscribers.length === 500 && <p className="mt-2 text-[12.5px] text-ink-4">Mostrando os 500 mais recentes; a lista completa está no CSV.</p>}
    </AdminPage>
  );
}
