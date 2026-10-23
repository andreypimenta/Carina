// The specials in the admin: a new one from a theme and a PubMed search, and every one with its state.
import { useState } from "react";
import { useLoaderData, useNavigate, type LoaderFunctionArgs } from "react-router";
import { SITE } from "@aihot/site";
import { adminGet } from "@aihot/web/lib/admin.server";
import { useAdminAction } from "@aihot/web/features/admin/action";
import { bj } from "@aihot/web/features/admin/format";
import { AdminPage, Button, Card, DataTable, Field, Input, Select, Textarea } from "@aihot/web/features/admin/ui";
import { FORMATS, type AdminEspeciais, type EspecialFormat } from "../especiais.ts";
import { StatusBadge } from "./StatusBadge.tsx";

export async function loader({ request }: LoaderFunctionArgs) {
  return adminGet<AdminEspeciais>(request, "/api/admin/especiais");
}

export const meta = () => [{ title: `Especiais · Painel do ${SITE.bareName}` }];

function NewEspecial({ searches }: { searches: AdminEspeciais["searches"] }) {
  const { run, pending } = useAdminAction();
  const navigate = useNavigate();
  const [format, setFormat] = useState<EspecialFormat>("linha-do-tempo");
  const [theme, setTheme] = useState("");
  const [query, setQuery] = useState("");
  const create = async () => {
    const out = await run<{ id: number }>("POST", "/api/admin/especiais", { format, theme, query }, { label: "create", success: "Rascunho criado; o sistema começou a escrever" });
    if (out) navigate(`/admin/especiais/${out.id}`);
  };
  return (
    <Card title="Novo especial">
      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <Field label="Formato" hint={FORMATS[format].pitch}>
          <Select value={format} onChange={(e) => setFormat(e.target.value as EspecialFormat)}>
            {Object.entries(FORMATS).map(([key, f]) => <option key={key} value={key}>{f.name}</option>)}
          </Select>
        </Field>
        <Field label="Tema" hint="Como o leitor vai reconhecer o assunto, em português.">
          <Input value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="Estenose subglótica pediátrica" maxLength={200} />
        </Field>
      </div>
      <div className="mt-4 space-y-2">
        <Field label="Partir de uma busca salva (opcional)" hint="Copia a busca do módulo de literatura para o campo abaixo, onde você pode ajustá-la.">
          <Select value="" onChange={(e) => setQuery(searches.find((s) => s.id === e.target.value)?.term ?? query)}>
            <option value="">Escolher uma busca salva…</option>
            {searches.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Busca no PubMed" hint="Na sintaxe do PubMed; teste em pubmed.ncbi.nlm.nih.gov. O sistema reúne nela os estudos mais antigos, classificações, consensos, revisões sistemáticas, ensaios, séries e os mais relevantes.">
          <Textarea value={query} onChange={(e) => setQuery(e.target.value)} rows={4} className="font-mono !text-[12.5px]" placeholder='("Laryngostenosis"[Mesh] OR "subglottic stenosis"[tiab]) AND (child*[tiab] OR infant*[tiab] OR "Child"[Mesh])' />
        </Field>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-[12.5px] text-ink-4">O rascunho fica só no painel. Nada vai ao site sem a sua aprovação e a publicação.</p>
        <Button tone="primary" busy={pending === "create"} disabled={theme.trim().length < 3 || query.trim().length < 3} onClick={create}>Criar rascunho</Button>
      </div>
    </Card>
  );
}

export default function EspeciaisAdmin() {
  const { rows, searches } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  return (
    <AdminPage title="Especiais" subtitle="Textos especiais escritos a partir de estudos do PubMed: ficam como rascunho até você aprovar e publicar.">
      <NewEspecial searches={searches} />
      <Card className="mt-6" title="Especiais" pad={false}>
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          onRowClick={(r) => navigate(`/admin/especiais/${r.id}`)}
          empty="Nenhum especial ainda"
          columns={[
            { key: "title", label: "Título", render: (r) => (
              <div className="min-w-0">
                <div className="truncate font-medium text-ink">{r.title ?? r.theme}</div>
                <div className="text-[12px] text-ink-4">{`${FORMATS[r.format].name} · ${r.theme}`}</div>
              </div>
            ) },
            { key: "status", label: "Estado", render: (r) => <StatusBadge status={r.status} writing={r.writing} /> },
            { key: "updated", label: "Atualizado", render: (r) => <span className="num text-ink-3">{bj(r.updatedAt)}</span> },
            { key: "published", label: "Publicado", render: (r) => <span className="num text-ink-3">{r.publishedAt ? bj(r.publishedAt, true) : "—"}</span> },
          ]}
        />
      </Card>
    </AdminPage>
  );
}
