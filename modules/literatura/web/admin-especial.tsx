// One special in the admin: its text to read or edit beside the studies it cites, what the citation check
// finds, its theme and search to write it again, and the steps from draft to the site: approve, publish,
// back to draft, discard.
import { useEffect, useState } from "react";
import { Link, useLoaderData, useRevalidator, type LoaderFunctionArgs } from "react-router";
import { SITE } from "@aihot/site";
import { adminGet } from "@aihot/web/lib/admin.server";
import { useAdminAction } from "@aihot/web/features/admin/action";
import { bj } from "@aihot/web/features/admin/format";
import { AdminPage, Button, Card, Field, Input, KV, ReasonDialog, Textarea } from "@aihot/web/features/admin/ui";
import { FORMATS, pmidList, type AdminEspecial, type Trecho } from "../especiais.ts";
import { EspecialBody } from "./Body.tsx";
import { StatusBadge } from "./StatusBadge.tsx";

export async function loader({ request, params }: LoaderFunctionArgs) {
  return adminGet<AdminEspecial>(request, `/api/admin/especiais/${encodeURIComponent(params.id ?? "")}`);
}

export const meta = () => [{ title: `Especial · Painel do ${SITE.bareName}` }];

const ACTION_LABEL: Record<string, string> = {
  "especial.create": "Criou", "especial.rewrite": "Pediu nova escrita", "especial.edit": "Editou", "especial.approve": "Aprovou",
  "especial.reopen": "Voltou ao rascunho", "especial.publish": "Publicou", "especial.discard": "Descartou",
};

function Trechos({ items, empty }: { items: Trecho[]; empty: string }) {
  if (!items.length) return <p className="text-[13px] text-ink-4">{empty}</p>;
  return (
    <ul className="space-y-3">
      {items.map((t, i) => (
        <li key={i} className="rounded-control bg-bg-sunk px-3 py-2.5 text-[13px] leading-relaxed">
          <div className="text-ink-2">{t.text}</div>
          <div className="mt-1 text-[12px] font-medium text-hot">{t.reason}</div>
        </li>
      ))}
    </ul>
  );
}

function Studies({ e }: { e: AdminEspecial }) {
  return (
    <ol className="space-y-3">
      {e.refs.map((r) => (
        <li key={r.n} id={`ref-${r.n}`} className="scroll-mt-6 rounded-control px-2 py-1.5 text-[12.5px] leading-[1.6] target:bg-accent-soft">
          <div className="flex gap-2">
            <span className="num w-6 shrink-0 text-right font-semibold text-accent">{r.n}</span>
            <div className="min-w-0">
              <div className="text-ink">{r.title}</div>
              <div className="text-ink-3">{[r.authors.slice(0, 3).join(", ") + (r.authors.length > 3 ? " et al." : ""), r.journal, r.year].filter(Boolean).join(" · ")}</div>
              <div className="mt-0.5 flex flex-wrap gap-x-2.5 text-[11.5px] text-ink-4">
                <span className="text-ink-3">{r.kind}</span>
                {r.citations !== undefined && <span>{r.citations === 1 ? "citado 1 vez" : `citado ${r.citations} vezes`}</span>}
                <a className="hover:text-accent" href={`https://pubmed.ncbi.nlm.nih.gov/${r.pmid}/`} target="_blank" rel="noreferrer">PMID {r.pmid}</a>
                {r.doi && <a className="break-all hover:text-accent" href={`https://doi.org/${r.doi}`} target="_blank" rel="noreferrer">DOI</a>}
              </div>
              {r.abstract && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-[11.5px] text-ink-4 hover:text-ink-2">Resumo</summary>
                  <p className="mt-1 text-[12px] leading-[1.65] text-ink-3">{r.abstract}</p>
                </details>
              )}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function EspecialAdmin() {
  const e = useLoaderData<typeof loader>();
  const { run, pending } = useAdminAction();
  const revalidator = useRevalidator();
  const base = `/api/admin/especiais/${e.id}`;
  const writing = e.status === "rascunho" && e.writing === "pendente";
  const editable = e.status === "rascunho" && !writing;
  const [title, setTitle] = useState(e.title ?? "");
  const [dek, setDek] = useState(e.dek ?? "");
  const [body, setBody] = useState(e.body ?? "");
  const [theme, setTheme] = useState(e.theme);
  const [query, setQuery] = useState(e.query);
  const [pmids, setPmids] = useState(e.pmids.join(", "));
  const [tab, setTab] = useState<"edit" | "preview">(editable ? "edit" : "preview");
  const [dialog, setDialog] = useState<null | "approve" | "publish" | "discard">(null);
  const dirty = editable && (title !== (e.title ?? "") || dek !== (e.dek ?? "") || body !== (e.body ?? ""));

  // A fresh view (after a command or the writing) replaces what the boxes hold.
  useEffect(() => {
    setTitle(e.title ?? "");
    setDek(e.dek ?? "");
    setBody(e.body ?? "");
    setTheme(e.theme);
    setQuery(e.query);
    setPmids(e.pmids.join(", "));
  }, [e.version]);

  // While the worker writes, the page looks again every few seconds.
  useEffect(() => {
    if (!writing) return;
    const t = setInterval(() => revalidator.revalidate(), 6000);
    return () => clearInterval(t);
  }, [writing, revalidator]);

  const command = (action: string, extra: Record<string, unknown>, success: string) =>
    run("POST", `${base}/${action}`, { version: e.version, ...extra }, { label: action, success });

  const actions = (
    <>
      {e.status === "publicado" && e.slug && <Link to={`/especiais/${e.slug}`} className="text-[13px] font-medium text-accent hover:underline">Ver no site</Link>}
      {e.status === "rascunho" && (
        <Button tone="primary" disabled={dirty || e.writing !== "pronto" || !e.body} title={dirty ? "Salve as alterações antes de aprovar" : undefined} onClick={() => setDialog("approve")}>Aprovar</Button>
      )}
      {e.status === "aprovado" && <Button tone="primary" onClick={() => setDialog("publish")}>Publicar</Button>}
      {e.status === "aprovado" && <Button busy={pending === "reopen"} onClick={() => command("reopen", {}, "De volta ao rascunho")}>Voltar ao rascunho</Button>}
      {e.status !== "descartado" && <Button tone="ghost" onClick={() => setDialog("discard")}>{e.status === "publicado" ? "Retirar do ar" : "Descartar"}</Button>}
    </>
  );

  return (
    <AdminPage
      title={e.title ?? e.theme}
      subtitle={
        <span className="inline-flex flex-wrap items-center gap-2">
          <StatusBadge status={e.status} writing={e.writing} />
          <span>{`${FORMATS[e.format].name} · ${e.theme}`}</span>
          <Link to="/admin/especiais" className="text-ink-4 hover:text-ink-2">‹ Todos os especiais</Link>
        </span>
      }
      actions={actions}
    >
      {writing && (
        <div className="mb-5 rounded-panel bg-accent-soft px-4 py-3 text-[13.5px] text-accent ring-1 ring-accent/20">
          O sistema está buscando os estudos no PubMed e escrevendo o rascunho. Esta página se atualiza sozinha. Se a escrita não terminar, peça para escrever de novo abaixo.
        </div>
      )}
      {e.status === "rascunho" && e.writing === "falhou" && (
        <div className="mb-5 rounded-panel bg-hot-soft px-4 py-3 text-[13.5px] text-hot ring-1 ring-hot/25">{`A escrita falhou: ${e.error ?? "erro desconhecido"}. Ajuste o tema ou a busca abaixo e peça de novo.`}</div>
      )}
      {e.status === "aprovado" && (
        <div className="mb-5 rounded-panel bg-surface px-4 py-3 text-[13.5px] text-ink-2 ring-1 ring-line">{`Aprovado por ${e.approvedBy ?? "—"} em ${bj(e.approvedAt, true)}. O texto está fixo; para mudar, volte ao rascunho (e aprove de novo). Ele só aparece no site quando você publicar.`}</div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-6">
          <Card
            title="Texto"
            right={editable && (
              <div className="flex gap-1">
                {(["edit", "preview"] as const).map((t) => (
                  <button key={t} type="button" onClick={() => setTab(t)} className={`rounded-full px-3 py-1 text-[12.5px] ${tab === t ? "bg-ink text-bg" : "text-ink-3 hover:text-ink"}`}>
                    {t === "edit" ? "Editar" : "Prévia"}
                  </button>
                ))}
              </div>
            )}
          >
            {!e.body && !writing && <p className="text-[13px] text-ink-4">Ainda não há texto.</p>}
            {tab === "edit" && editable ? (
              <div className="space-y-4">
                <Field label="Título"><Input value={title} onChange={(ev) => setTitle(ev.target.value)} maxLength={300} /></Field>
                <Field label="Linha fina"><Textarea value={dek} onChange={(ev) => setDek(ev.target.value)} rows={2} maxLength={600} /></Field>
                <Field label="Texto" hint="Parágrafos separados por linha em branco. “## ” abre um intertítulo; “- ” um item de lista. Cite os estudos pelo número entre colchetes: [3], [3, 5].">
                  <Textarea value={body} onChange={(ev) => setBody(ev.target.value)} rows={26} className="font-mono !text-[12.5px] !leading-[1.7]" />
                </Field>
                <div className="flex items-center justify-end gap-3">
                  {dirty && <span className="text-[12.5px] text-amber">Alterações não salvas</span>}
                  <Button tone="primary" disabled={!dirty} busy={pending === "edit"} onClick={() => run("PATCH", base, { version: e.version, title, dek, body }, { label: "edit", success: "Texto salvo" })}>Salvar</Button>
                </div>
              </div>
            ) : (
              e.body && (
                <article>
                  <h2 className="text-[24px] font-bold leading-[1.35] text-ink">{title}</h2>
                  {dek && <p className="mt-3 text-[16px] leading-[1.7] text-ink-2">{dek}</p>}
                  <div className="mt-6 border-t border-line pt-5"><EspecialBody body={body} /></div>
                </article>
              )
            )}
          </Card>

          {e.body && (
            <Card title={`Checagem de citações${e.warnings.length ? ` · ${e.warnings.length}` : ""}`}>
              <p className="mb-3 text-[12.5px] leading-relaxed text-ink-4">Confere o texto salvo: cada trecho precisa citar estudos da lista, e todo nome, número e ano dele precisa aparecer nos estudos que cita.</p>
              <Trechos items={e.warnings} empty="Nenhum problema no texto salvo." />
            </Card>
          )}
          {e.discarded.length > 0 && (
            <Card title={`Trechos descartados ao escrever · ${e.discarded.length}`}>
              <p className="mb-3 text-[12.5px] leading-relaxed text-ink-4">O sistema tirou do rascunho o que o modelo escreveu sem apoio nos estudos citados. Se algum trecho estiver certo, confira no estudo e escreva-o de novo no texto.</p>
              <Trechos items={e.discarded} empty="" />
            </Card>
          )}

          <Card title="Tema e busca">
            <div className="space-y-3">
              <Field label="Tema"><Input value={theme} onChange={(ev) => setTheme(ev.target.value)} disabled={e.status !== "rascunho"} maxLength={200} /></Field>
              <Field label="Busca no PubMed"><Textarea value={query} onChange={(ev) => setQuery(ev.target.value)} disabled={e.status !== "rascunho"} rows={4} className="font-mono !text-[12.5px]" /></Field>
              <Field label="PMIDs obrigatórios" hint="Entram na lista mesmo que a busca não os traga; separe por espaço ou vírgula.">
                <Input value={pmids} onChange={(ev) => setPmids(ev.target.value)} disabled={e.status !== "rascunho"} className="font-mono !text-[12.5px]" />
              </Field>
              {e.status === "rascunho" && (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[12.5px] text-ink-4">Escrever de novo busca os estudos outra vez e substitui o título, a linha fina e o texto.</p>
                  <Button busy={pending === "rewrite"} onClick={() => command("rewrite", { theme, query, pmids: pmidList(pmids) }, "O sistema começou a escrever de novo")}>Escrever de novo</Button>
                </div>
              )}
            </div>
          </Card>

          <Card title="Histórico">
            <KV items={[["Criado", `${bj(e.createdAt, true)} · ${e.createdBy}`], ["Publicado", e.publishedAt ? bj(e.publishedAt, true) : null], ["Edição semanal", e.issueKey]]} />
            <ul className="mt-4 space-y-1.5 text-[12.5px] text-ink-3">
              {e.history.map((h, i) => (
                <li key={i}>
                  <span className="num text-ink-4">{bj(h.created_at, true)}</span> · {h.actor} · {ACTION_LABEL[h.action] ?? h.action}
                  {h.reason && <span className="text-ink-4">{` · ${h.reason}`}</span>}
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="min-w-0">
          <div className="lg:sticky lg:top-6">
            <Card title={`Referências · ${e.refs.length}`} scrollable className="lg:!max-h-[calc(100dvh-3rem)]">
              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                {e.refs.length ? <Studies e={e} /> : <p className="text-[13px] text-ink-4">{writing ? "Buscando os estudos…" : "Nenhum estudo ainda."}</p>}
              </div>
            </Card>
          </div>
        </div>
      </div>

      <ReasonDialog
        open={dialog === "approve"}
        title="Aprovar este especial"
        description={`O texto fica fixo e o especial pode ser publicado. ${e.warnings.length ? `A checagem ainda aponta ${e.warnings.length} ${e.warnings.length === 1 ? "problema" : "problemas"} no texto.` : "A checagem não aponta problemas."}`}
        requireReason={false}
        confirmLabel="Aprovar"
        onClose={() => setDialog(null)}
        onSubmit={async (reason) => (await command("approve", { reason: reason || undefined }, "Especial aprovado")) !== null}
      />
      <ReasonDialog
        open={dialog === "publish"}
        title="Publicar este especial"
        description="Ele ganha uma página no site, entra na lista de especiais e vai para a próxima edição semanal."
        requireReason={false}
        confirmLabel="Publicar"
        onClose={() => setDialog(null)}
        onSubmit={async (reason) => (await command("publish", { reason: reason || undefined }, "Especial publicado")) !== null}
      />
      <ReasonDialog
        open={dialog === "discard"}
        title={e.status === "publicado" ? "Retirar este especial do ar" : "Descartar este especial"}
        description={e.status === "publicado" ? "A página sai do site e da edição semanal que o trouxe. Não pode ser desfeito." : "O especial fica guardado como descartado e não pode mais ser editado nem publicado."}
        danger
        confirmLabel={e.status === "publicado" ? "Retirar do ar" : "Descartar"}
        onClose={() => setDialog(null)}
        onSubmit={async (reason) => (await command("discard", { reason }, e.status === "publicado" ? "Especial retirado do ar" : "Especial descartado")) !== null}
      />
    </AdminPage>
  );
}
