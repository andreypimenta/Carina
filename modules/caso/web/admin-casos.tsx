// The case of the week in the admin: a new case for one of the next editions, and every case with its state.
import { useState } from "react";
import { useLoaderData, useNavigate, type LoaderFunctionArgs } from "react-router";
import { SITE } from "@aihot/site";
import { adminGet } from "@aihot/web/lib/admin.server";
import { useAdminAction } from "@aihot/web/features/admin/action";
import { bj } from "@aihot/web/features/admin/format";
import { AdminPage, Badge, Button, Card, DataTable } from "@aihot/web/features/admin/ui";
import { editionLabel, STATUS_LABEL, type AdminCasos } from "../caso.ts";
import { CasoForm, emptyDraft, payload } from "./CasoForm.tsx";

export async function loader({ request }: LoaderFunctionArgs) {
  return adminGet<AdminCasos>(request, "/api/admin/caso");
}

export const meta = () => [{ title: `Caso da semana · Painel do ${SITE.bareName}` }];

function NewCaso({ weeks }: { weeks: string[] }) {
  const { run, pending } = useAdminAction();
  const navigate = useNavigate();
  const [draft, setDraft] = useState(() => emptyDraft(weeks[0] ?? ""));
  const create = async () => {
    const out = await run<{ id: number }>("POST", "/api/admin/caso", payload(draft), { label: "create", success: "Caso salvo como rascunho" });
    if (out) navigate(`/admin/caso/${out.id}`);
  };
  if (!weeks.length) return <Card title="Novo caso"><p className="text-[13px] text-ink-4">As próximas edições já têm caso.</p></Card>;
  return (
    <CasoForm
      draft={draft}
      onChange={setDraft}
      weeks={weeks}
      saved={null}
      footer={(
        <div className="flex items-center gap-3">
          <p className="text-[12.5px] text-ink-4">Fica como rascunho até você publicar.</p>
          <Button tone="primary" busy={pending === "create"} disabled={draft.title.trim().length < 3 || draft.body.trim().length < 10} onClick={create}>Salvar rascunho</Button>
        </div>
      )}
    />
  );
}

export default function CasosAdmin() {
  const { rows, weeks } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  return (
    <AdminPage title="Caso da semana" subtitle="Um caso curto com uma pergunta ao leitor em cada edição semanal; a resposta sai na edição seguinte.">
      <Card className="mb-6" title={`Casos · ${rows.length}`} pad={false}>
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          onRowClick={(r) => navigate(`/admin/caso/${r.id}`)}
          empty="Nenhum caso ainda"
          columns={[
            { key: "week", label: "Edição", render: (r) => <span className="num whitespace-nowrap text-ink-2">{`${editionLabel(r.week)} · ${r.week}`}</span> },
            { key: "title", label: "Título", render: (r) => <div className="truncate font-medium text-ink">{r.title}</div> },
            { key: "status", label: "Estado", render: (r) => <Badge tone={r.status === "publicado" ? "ok" : "warn"}>{STATUS_LABEL[r.status]}</Badge> },
            { key: "answer", label: "Resposta", render: (r) => (r.hasAnswer ? <span className="text-ink-3">Escrita</span> : <span className="text-amber">Falta</span>) },
            { key: "updated", label: "Atualizado", render: (r) => <span className="num text-ink-3">{bj(r.updatedAt)}</span> },
          ]}
        />
      </Card>
      <h2 className="mb-3 text-[15px] font-semibold text-ink">Novo caso</h2>
      <NewCaso weeks={weeks} />
    </AdminPage>
  );
}
