// A paper added by PMID or DOI, outside the saved searches: the worker takes it like a paper they find, and the
// latest additions with what became of each.
import { useState } from "react";
import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { SITE } from "@aihot/site";
import { adminGet } from "@aihot/web/lib/admin.server";
import { useAdminAction } from "@aihot/web/features/admin/action";
import { toast } from "@aihot/web/features/admin/toast";
import { bj } from "@aihot/web/features/admin/format";
import { AdminPage, Badge, Button, Card, DataTable, Field, Input } from "@aihot/web/features/admin/ui";
import type { AdicionarPedido, AdminAdicionados } from "../adicionar.ts";

export async function loader({ request }: LoaderFunctionArgs) {
  return adminGet<AdminAdicionados>(request, "/api/admin/literatura/adicionados");
}

export const meta = () => [{ title: `Adicionar artigo · Painel do ${SITE.bareName}` }];

/** What became of a paper (backend/collect.ts). */
const STATUS: Record<string, string> = {
  integral: "Texto integral traduzido",
  "materia-full": "Matéria (texto completo)",
  "materia-abstract": "Matéria (resumo)",
  "aguardando-pmc": "Aguardando o PMC",
  "aguardando-modelo": "Chamadas de modelo desligadas",
  "fonte-pausada": "Fonte pausada",
  "sem-texto": "Sem resumo nem texto",
  erratum: "Errata",
  idioma: "Idioma fora da lista",
  falhou: "Falhou",
};

function AddForm() {
  const { run, pending } = useAdminAction();
  const [id, setId] = useState("");
  const [select, setSelect] = useState(true);
  const [reason, setReason] = useState("");
  const add = async () => {
    const out = await run<AdicionarPedido>("POST", "/api/admin/literatura/adicionar", { id, select, reason }, { label: "add" });
    if (!out) return;
    setId("");
    toast(out.queued ? `PMID ${out.pmid} na fila: ${out.title}` : `PMID ${out.pmid} já tinha sido recebido; não é escrito de novo${select && out.existing?.articleId ? " (marcado como Seleção)" : ""}`, "ok");
  };
  return (
    <Card title="Adicionar artigo por PMID/DOI">
      <div className="grid gap-4 lg:grid-cols-2">
        <Field label="PMID ou DOI" hint="42215001, 10.1016/j.ijporl.2026.112853 ou o link doi.org.">
          <Input value={id} onChange={(e) => setId(e.target.value)} placeholder="PMID ou DOI" maxLength={300} />
        </Field>
        <Field label="Motivo (opcional)" hint="Fica no registro de auditoria.">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
        </Field>
      </div>
      <label className="mt-4 inline-flex items-center gap-2 text-[13.5px]">
        <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={select} onChange={(e) => setSelect(e.target.checked)} />
        Marcar Seleção = sim (como no ajuste manual)
      </label>
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-[12.5px] text-ink-4">
          O artigo segue o caminho das buscas salvas: texto integral se a licença permitir, senão matéria própria. Entra como notícia de agora, na próxima nota diária e na edição da semana. Um PMID já recebido não é escrito de novo.
        </p>
        <Button tone="primary" busy={pending === "add"} disabled={!id.trim()} onClick={add}>Adicionar artigo</Button>
      </div>
    </Card>
  );
}

export default function AdicionarAdmin() {
  const { rows } = useLoaderData<typeof loader>();
  return (
    <AdminPage title="Adicionar artigo" subtitle="Um artigo do PubMed que as buscas salvas não trouxeram. O worker o escreve em instantes; atualize a página para ver o resultado.">
      <AddForm />
      <Card className="mt-6" title="Últimos acrescentados" pad={false}>
        <DataTable
          rows={rows}
          rowKey={(r) => `${r.at}-${r.pmid}`}
          empty="Nenhum artigo acrescentado ainda"
          columns={[
            { key: "title", label: "Artigo", render: (r) => (
              <div className="min-w-0">
                <div className="truncate font-medium text-ink">{r.title || `PMID ${r.pmid}`}</div>
                <div className="font-mono text-[11.5px] text-ink-4">{`PMID ${r.pmid}`}</div>
              </div>
            ) },
            { key: "status", label: "Resultado", render: (r) => (
              <span className="flex flex-wrap gap-1">
                <Badge tone={r.status === "falhou" ? "bad" : r.articleId ? "ok" : "warn"} title={r.error ?? undefined}>{STATUS[r.status] ?? r.status}</Badge>
                {r.existing && <Badge>Já recebido</Badge>}
                {r.selected && <Badge tone="accent">Seleção</Badge>}
              </span>
            ) },
            { key: "item", label: "Item", render: (r) => (r.articleId ? <Link to={`/admin/content/${r.articleId}`} className="font-mono text-[12px] text-accent">{r.articleId}</Link> : "—") },
            { key: "at", label: "Quando", render: (r) => <span className="num text-ink-3">{`${bj(r.at)} · ${r.actor}`}</span> },
          ]}
        />
      </Card>
    </AdminPage>
  );
}
