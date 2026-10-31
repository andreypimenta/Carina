// The admin's view of the readers: whether each channel can send, how many addresses there are by channel
// and status and by the group whose link brought them (with the link to send a group and retention after 8 weeks),
// how readers took each e-mailed edition (people's clicks, scanners filtered out; recurring readers; the case of
// the week; leavings and complaints; share-button clicks; interest by section), each edition's sends (with a way
// to send again those that failed or may not have arrived, after checking), the latest addresses and the whole list as CSV.
import { useState } from "react";
import { useLoaderData, type LoaderFunctionArgs } from "react-router";
import { SITE } from "@aihot/site";
import { adminGet } from "@aihot/web/lib/admin.server";
import { useAdminAction } from "@aihot/web/features/admin/action";
import { bj } from "@aihot/web/features/admin/format";
import { copyText } from "@aihot/web/lib/clipboard";
import { AdminPage, Badge, Button, Card, DataTable, Field, FilterChips, Input, ReasonDialog, Stat } from "@aihot/web/features/admin/ui";
import { formatPhone, type Channel } from "../address.ts";
import { groupTag, INDIQUE_GROUP, signupPath } from "../group.ts";
import { INTERESTS } from "../interest.ts";
import type { AdminEdition, AdminOverview, Reading } from "../types.ts";

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

const groupName = (tag: string | null) => (tag === INDIQUE_GROUP ? "indique (Indique a um colega)" : tag ?? "sem marcação");

/** Sign-ups by the group whose link brought them, most confirmed first, and the link to send a new group. */
function Groups({ rows, retention }: { rows: AdminOverview["groups"]; retention: Reading["retention"] }) {
  const kept = new Map(retention.map((r) => [r.group, r]));
  const [name, setName] = useState("");
  const [copied, setCopied] = useState(false);
  const tag = groupTag(name);
  const link = tag ? `${window.location.origin}${signupPath(tag)}` : null;
  const by = new Map<string | null, Record<string, number>>();
  for (const r of rows) by.set(r.group, { ...by.get(r.group), [r.status]: r.n });
  const groups = [...by].sort(([, a], [, b]) => (b.confirmed ?? 0) - (a.confirmed ?? 0));
  return (
    <Card title="Por grupo" className="mt-5">
      <p className="text-[13px] text-ink-3">
        Mande a cada grupo de WhatsApp o link com a marcação dele: quem se inscreve por ele fica com essa marcação, e a contagem aparece aqui. A marcação nomeia o grupo, não a pessoa, e não aparece no site.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="w-[260px] max-w-full">
          <Field label="Nome do grupo">
            <Input value={name} onChange={(e) => { setName(e.target.value); setCopied(false); }} placeholder="residentes SP" maxLength={80} />
          </Field>
        </div>
        {link && (
          <>
            <code className="mb-2 break-all font-mono text-[12.5px] text-ink">{link}</code>
            <Button size="sm" onClick={async () => { await copyText(link); setCopied(true); }}>{copied ? "Copiado" : "Copiar link"}</Button>
          </>
        )}
      </div>
      {groups.length > 0 && (
        <table className="mt-4 w-full text-[13px]">
          <thead>
            <tr className="text-left text-ink-4"><th className="py-1.5 font-medium">Grupo</th><th className="py-1.5 text-right font-medium">Confirmados</th><th className="py-1.5 text-right font-medium">Aguardando</th><th className="py-1.5 text-right font-medium">Saíram</th><th className="py-1.5 text-right font-medium" title="Dos que confirmaram há 8 semanas ou mais, quantos continuavam na lista 8 semanas depois">Retidos em 8 semanas</th></tr>
          </thead>
          <tbody>
            {groups.map(([group, n]) => (
              <tr key={group ?? ""} className="border-t border-line">
                <td className={`py-1.5 ${group ? "font-mono text-ink" : "text-ink-4"}`}>{groupName(group)}</td>
                <td className="num py-1.5 text-right font-semibold text-ink">{n.confirmed ?? 0}</td>
                <td className="num py-1.5 text-right text-ink-3">{n.pending ?? 0}</td>
                <td className="num py-1.5 text-right text-ink-3">{n.unsubscribed ?? 0}</td>
                <td className="num py-1.5 text-right text-ink-2">{share(kept.get(group)?.retained ?? 0, kept.get(group)?.cohort ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

/** "12 de 40 (30%)", or a dash with nothing to count. */
const share = (n: number, of: number) => (of > 0 ? `${n} de ${of} (${Math.round((100 * n) / of)}%)` : "—");

const BUTTON: Record<string, string> = { whatsapp: "Mandar no WhatsApp", copiar: "Copiar link", indique: "Indique a um colega" };
const interestName = (key: string | null) => INTERESTS.find((o) => o.key === key)?.label ?? key ?? "Ambos";

/** How readers took the e-mailed editions: clicks taken for a person's only, as backend/reads.ts tells them apart. */
function ReadingCard({ r }: { r: Reading }) {
  const th = "py-1.5 text-right font-medium";
  const td = "num py-1.5 text-right";
  return (
    <Card title="Leitura do e-mail" className="mt-5">
      <p className="text-[13px] text-ink-3">
        Contamos cliques, não aberturas: o Apple Mail e outros abrem as imagens de todo e-mail sozinhos. Cada link do e-mail passa pelo site, que conta o clique e segue para o destino. Cliques de antivírus e filtros de e-mail ficam de fora: pedidos HEAD ou de pré-carregamento, navegadores de robôs, faixas de IP de filtros de e-mail (Microsoft, Proofpoint, Mimecast, Barracuda), cliques nos primeiros 30 segundos depois do envio e 5 ou mais cliques em 10 segundos no mesmo e-mail. Nada do leitor é guardado além da contagem.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Leitores recorrentes" value={r.recurring.readers}
          hint={`clicaram em pelo menos 2 das últimas ${r.recurring.editions} edições · de ${r.recurring.eligible} que receberam 2 ou mais`} />
        <Stat label="Botões de compartilhar · 30 dias" value={r.buttons.reduce((n, b) => n + b.clicks, 0)}
          hint={`${r.buttons.map((b) => `${b.clicks} ${BUTTON[b.button] ?? b.button}`).join(" · ") || "nenhum clique"}. Cliques no botão, não encaminhamentos confirmados.`} />
        <Stat label="Reclamações e devoluções" value={r.resendWebhook ? "Contadas" : "Sem webhook"} tone={r.resendWebhook ? "ok" : "warn"}
          hint={r.resendWebhook ? "Webhook do Resend ligado" : "Defina RESEND_WEBHOOK_SECRET e aponte o webhook do Resend (docs/assinatura.md)"} />
      </div>
      {r.editions.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead>
              <tr className="text-left text-ink-4">
                <th className="py-1.5 font-medium">Edição</th>
                <th className={th}>Entregues</th>
                <th className={th} title="Leitores com ao menos um clique de pessoa, sobre os entregues">Clicaram</th>
                <th className={th} title="E-mails clicados só por robôs, filtrados">Só robôs</th>
                <th className={th} title="Respostas tocadas no e-mail, sobre os entregues da edição com caso">Caso: respostas</th>
                <th className={th} title="Cliques no link do Indique a um colega no e-mail">Indique (cliques)</th>
                <th className={th} title="Saíram tendo esta como a última edição recebida">Saídas</th>
                <th className={th}>Reclamações</th>
              </tr>
            </thead>
            <tbody>
              {r.editions.map((e) => (
                <tr key={e.edition_key} className="border-t border-line">
                  <td className="num py-1.5 font-semibold text-ink">{e.edition_key}</td>
                  <td className={`${td} text-ink`}>{e.delivered}</td>
                  <td className={`${td} font-semibold text-ink`}>{share(e.clicked, e.delivered)}</td>
                  <td className={`${td} text-ink-4`}>{e.scanned}</td>
                  <td className={`${td} text-ink-2`}>{e.caso ? share(e.answered, e.delivered) : "sem caso"}</td>
                  <td className={`${td} text-ink-2`}>{e.indique}</td>
                  <td className={`${td} text-ink-2`}>{share(e.left_after, e.delivered)}</td>
                  <td className={`${td} text-ink-2`}>{r.resendWebhook ? share(e.complained, e.delivered) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-4 text-[13px] text-ink-4">Nenhuma edição enviada por e-mail ainda.</p>
      )}
      <h3 className="mt-6 text-[13.5px] font-semibold text-ink">Interesse por seção</h3>
      <p className="mt-1 text-[12.5px] text-ink-4">A seção que cada leitor de e-mail escolheu para vir primeiro, e quanto clicou nas últimas 4 edições.</p>
      <table className="mt-2 w-full text-[13px]">
        <thead>
          <tr className="text-left text-ink-4"><th className="py-1.5 font-medium">Primeiro</th><th className={th}>Confirmados</th><th className={th}>Clicaram nas últimas 4</th></tr>
        </thead>
        <tbody>
          {INTERESTS.map((o) => {
            const row = r.interests.find((i) => i.interest === o.key);
            return (
              <tr key={o.key ?? ""} className="border-t border-line">
                <td className="py-1.5 text-ink">{interestName(o.key)}</td>
                <td className={`${td} font-semibold text-ink`}>{row?.confirmed ?? 0}</td>
                <td className={`${td} text-ink-2`}>{share(row?.clicked ?? 0, row?.delivered ?? 0)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
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
            hint={c === "email" ? "NEWSLETTER_EMAIL_ENABLED, RESEND_API_KEY, NEWSLETTER_FROM" : d.whatsappNumberProblem ?? "NEWSLETTER_WHATSAPP_ENABLED, NEWSLETTER_WHATSAPP_NUMBER, EVOLUTION_*"} />
        ))}
      </div>

      <Groups rows={d.groups} retention={d.reading.retention} />

      <ReadingCard r={d.reading} />

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
            { key: "g", label: "Grupo", render: (r) => (r.group_tag ? <span className="font-mono text-[12.5px]">{r.group_tag}</span> : null) },
            { key: "i", label: "Primeiro", render: (r) => (r.channel === "email" && r.interest ? interestName(r.interest) : null) },
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
