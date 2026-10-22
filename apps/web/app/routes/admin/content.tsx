import { SITE } from "@aihot/site";
import { Form, Link, useNavigate, useSearchParams } from "react-router";
import type { Route } from "./+types/content";
import type { AdminContentRow, AdminContentSearch } from "@aihot/contracts/admin";
import { adminGet } from "../../lib/admin.server";
import { VISIBILITY_LABEL } from "../../features/admin/labels";
import { AdminPage, Badge, Button, Card, DataTable, Empty, Input, Time } from "../../features/admin/ui";


export async function loader({ request }: Route.LoaderArgs) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (!q) return { q, rows: [] as AdminContentRow[] };
  const { rows } = await adminGet<AdminContentSearch>(request, `/api/admin/content?q=${encodeURIComponent(q)}`);
  return { q, rows };
}

export const meta: Route.MetaFunction = () => [{ title: `Diagnóstico de conteúdo · Painel do ${SITE.bareName}` }];

export default function Content({ loaderData }: Route.ComponentProps) {
  const { q, rows } = loaderData;
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  return (
    <AdminPage title="Diagnóstico de conteúdo" subtitle="Encontre qualquer item por ID, link do original ou título e veja o caminho completo da fonte até a publicação; retirada, só resumo, correção manual e reprocessamento ficam na página de detalhes.">
      <Form method="get" className="mb-5 flex max-w-2xl gap-2">
        <Input name="q" defaultValue={sp.get("q") ?? ""} placeholder="ID do item, URL ou palavra do título" aria-label="Buscar conteúdo" autoFocus />
        <Button type="submit" tone="primary">Buscar</Button>
      </Form>
      {q && (
        <Card pad={false} title={`Resultados para “${q}”`} right={<span>{rows.length === 50 ? "Mostrando só os 50 mais recentes" : `${rows.length} ${rows.length === 1 ? "item" : "itens"}`}</span>}>
          <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            onRowClick={(r) => navigate(`/admin/content/${r.id}`)}
            empty="Nada encontrado. A URL é normalizada antes da comparação; o título aceita trechos em português ou inglês."
            columns={[
              {
                key: "t",
                label: "Título",
                render: (r) => (
                  <div className="min-w-[320px]">
                    <Link to={`/admin/content/${r.id}`} className="font-medium text-ink hover:text-accent" onClick={(e) => e.stopPropagation()}>{r.title}</Link>
                    <div className="font-mono text-[11.5px] text-ink-4">{r.id}</div>
                  </div>
                ),
              },
              { key: "src", label: "Fonte", render: (r) => <span className="whitespace-nowrap">{r.source}</span> },
              {
                key: "st",
                label: "Status",
                render: (r) => (
                  <span className="flex flex-wrap gap-1">
                    {r.selected && <Badge tone="accent">Seleção</Badge>}
                    {r.visibility && <Badge tone={r.visibility === "public" ? "muted" : "warn"}>{VISIBILITY_LABEL[r.visibility] ?? r.visibility}</Badge>}
                    {!r.visibility && <Badge>{r.processing_state}</Badge>}
                  </span>
                ),
              },
              { key: "sc", label: "Nota", align: "right", render: (r) => r.score ?? "—" },
              { key: "d", label: "Descoberta", render: (r) => <Time at={r.discovered_at} /> },
            ]}
          />
        </Card>
      )}
      {!q && <Empty>Digite um ID, link ou título para buscar.</Empty>}
    </AdminPage>
  );
}
