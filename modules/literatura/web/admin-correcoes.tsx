// A matéria's public corrections: the editor adds one (the day, what changed and why) for a substantive change,
// and it shows at the end of the matéria; the latest ones, with a way to delete one added by mistake.
import { useState } from "react";
import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { beijingDate } from "@aihot/contracts/time";
import { SITE } from "@aihot/site";
import { adminGet } from "@aihot/web/lib/admin.server";
import { useAdminAction } from "@aihot/web/features/admin/action";
import { toast } from "@aihot/web/features/admin/toast";
import { bj } from "@aihot/web/features/admin/format";
import { AdminPage, Button, Card, DataTable, Field, Input, Textarea } from "@aihot/web/features/admin/ui";
import { dataBr, type AdminCorrecao } from "../confianca.ts";

export async function loader({ request }: LoaderFunctionArgs) {
  return adminGet<{ rows: AdminCorrecao[] }>(request, "/api/admin/literatura/correcoes");
}

export const meta = () => [{ title: `Correções · Painel do ${SITE.bareName}` }];

function AddForm() {
  const { run, pending } = useAdminAction();
  const [item, setItem] = useState("");
  const [data, setData] = useState(() => beijingDate(new Date()));
  const [what, setWhat] = useState("");
  const [why, setWhy] = useState("");
  const add = async () => {
    const out = await run<{ articleId: string }>("POST", "/api/admin/literatura/correcoes", { item, data, oQueMudou: what, porque: why }, { label: "add" });
    if (!out) return;
    setItem("");
    setWhat("");
    setWhy("");
    toast(`Correção publicada no fim da matéria ${out.articleId}`, "ok");
  };
  return (
    <Card title="Registrar uma correção">
      <div className="grid gap-4 lg:grid-cols-[1fr_180px]">
        <Field label="Matéria" hint="O endereço da matéria (…/items/<id>) ou o id.">
          <Input value={item} onChange={(e) => setItem(e.target.value)} placeholder="https://…/items/…" maxLength={500} />
        </Field>
        <Field label="Data">
          <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </Field>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Field label="O que mudou" hint="Por exemplo: “O número de pacientes era 84, não 48.”">
          <Textarea value={what} onChange={(e) => setWhat(e.target.value)} rows={3} maxLength={1000} />
        </Field>
        <Field label="Por quê" hint="Por exemplo: “Erro de transcrição do resumo.”">
          <Textarea value={why} onChange={(e) => setWhy(e.target.value)} rows={3} maxLength={1000} />
        </Field>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-[12.5px] text-ink-4">
          Para mudanças de substância (um número, uma conclusão, a população). Corrija o texto da matéria pelo ajuste manual do conteúdo e registre aqui o que mudou: a nota aparece publicamente no fim da matéria.
        </p>
        <Button tone="primary" busy={pending === "add"} disabled={!item.trim() || !what.trim() || !why.trim()} onClick={add}>Publicar correção</Button>
      </div>
    </Card>
  );
}

export default function CorrecoesAdmin() {
  const { rows } = useLoaderData<typeof loader>();
  const { run, pending } = useAdminAction();
  const remove = async (r: AdminCorrecao) => {
    if (!window.confirm("Apagar esta correção? Ela deixa de aparecer na matéria.")) return;
    await run("DELETE", `/api/admin/literatura/correcoes/${r.id}`, undefined, { label: `del-${r.id}`, success: "Correção apagada" });
  };
  return (
    <AdminPage title="Correções" subtitle="Histórico público de correções: cada nota aparece no fim da matéria, com a data, o que mudou e por quê.">
      <AddForm />
      <Card className="mt-6" title="Últimas correções" pad={false}>
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          empty="Nenhuma correção registrada"
          columns={[
            { key: "title", label: "Matéria", render: (r) => (
              <div className="min-w-0">
                <Link to={`/items/${r.articleId}`} className="block truncate font-medium text-ink hover:text-accent">{r.title || r.articleId}</Link>
                <div className="text-[12px] text-ink-3">{`${dataBr(r.data)} · ${r.oQueMudou}`}</div>
                <div className="text-[12px] text-ink-4">{`Por quê: ${r.porque}`}</div>
              </div>
            ) },
            { key: "at", label: "Registrada", render: (r) => <span className="num text-ink-3">{`${bj(r.at)} · ${r.actor}`}</span> },
            { key: "del", label: "", render: (r) => <Button size="sm" busy={pending === `del-${r.id}`} onClick={() => void remove(r)}>Apagar</Button> },
          ]}
        />
      </Card>
    </AdminPage>
  );
}
