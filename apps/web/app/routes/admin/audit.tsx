import { SITE } from "@aihot/site";
import { Form, Link, useSearchParams } from "react-router";
import type { Route } from "./+types/audit";
import type { AdminAudit, AdminAuditRow } from "@aihot/contracts/admin";
import { adminGet } from "../../lib/admin.server";
import { bj } from "../../features/admin/format";
import { AdminPage, Card, DataTable, Input, Json, Pager } from "../../features/admin/ui";


export async function loader({ request }: Route.LoaderArgs) {
  return adminGet<AdminAudit>(request, `/api/admin/audit${new URL(request.url).search}`);
}

export const meta: Route.MetaFunction = () => [{ title: `Registro de auditoria · Painel do ${SITE.bareName}` }];

function subjectLink(subject: string | null) {
  if (!subject) return null;
  const [kind, id] = [subject.slice(0, subject.indexOf(":")), subject.slice(subject.indexOf(":") + 1)];
  if (kind === "content") return <Link className="text-accent" to={`/admin/content/${id}`}>{subject}</Link>;
  if (kind === "source") return <Link className="text-accent" to={`/admin/sources/${encodeURIComponent(id)}`}>{subject}</Link>;
  return <span className="font-mono text-[12px]">{subject}</span>;
}

export default function Audit({ loaderData }: Route.ComponentProps) {
  const [sp] = useSearchParams();
  return (
    <AdminPage title="Registro de auditoria" subtitle="Todas as ações manuais: quem, quando, o que mudou e por quê.">
      <Form method="get" className="mb-4 flex max-w-xl gap-2">
        <Input name="action" defaultValue={sp.get("action") ?? ""} placeholder="Prefixo da ação, por exemplo content. ou source." aria-label="Filtrar por ação" />
        <Input name="subject" defaultValue={sp.get("subject") ?? ""} placeholder="Objeto, por exemplo source:openai-blog" aria-label="Filtrar por objeto" />
      </Form>
      <Card pad={false}>
        <DataTable
          rows={loaderData.rows}
          rowKey={(r) => r.id}
          empty="Nenhum registro"
          columns={[
            { key: "t", label: "Horário", render: (r) => <span className="num whitespace-nowrap">{bj(r.created_at, true)}</span> },
            { key: "a", label: "Ação", render: (r) => <span className="font-mono text-[12.5px] text-ink">{r.action}</span> },
            { key: "s", label: "Objeto", render: (r) => subjectLink(r.subject) },
            { key: "who", label: "Quem", render: (r) => r.actor },
            { key: "r", label: "Motivo", render: (r) => <span className="text-ink-2">{r.reason}</span> },
            { key: "d", label: "Mudança", render: (r) => (r.before || r.after ? <Json value={{ before: r.before, after: r.after }} label="Antes e depois" /> : null) },
          ]}
        />
      </Card>
      <Pager page={loaderData.page} hasMore={loaderData.rows.length === 100} />
    </AdminPage>
  );
}
