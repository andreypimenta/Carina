// One case of the week in the admin: its form, saved at any time (a published case shows the change at once,
// so the answer can be written during the week), and its steps: publish, take off the site, delete a draft.
import { useEffect, useState } from "react";
import { Link, useLoaderData, useNavigate, type LoaderFunctionArgs } from "react-router";
import { SITE } from "@aihot/site";
import { adminGet } from "@aihot/web/lib/admin.server";
import { useAdminAction } from "@aihot/web/features/admin/action";
import { bj } from "@aihot/web/features/admin/format";
import { AdminPage, Badge, Button, Card, KV, ReasonDialog } from "@aihot/web/features/admin/ui";
import { editionLabel, nextWeek, STATUS_LABEL, type AdminCaso } from "../caso.ts";
import { CasoForm, payload, type CasoDraft } from "./CasoForm.tsx";

export async function loader({ request, params }: LoaderFunctionArgs) {
  return adminGet<AdminCaso>(request, `/api/admin/caso/${encodeURIComponent(params.id ?? "")}`);
}

export const meta = () => [{ title: `Caso da semana · Painel do ${SITE.bareName}` }];

const ACTION_LABEL: Record<string, string> = {
  "caso.create": "Criou", "caso.edit": "Editou", "caso.publish": "Publicou", "caso.withdraw": "Retirou do ar", "caso.delete": "Apagou",
};

const draftOf = (c: AdminCaso): CasoDraft => ({
  week: c.week, title: c.title, body: c.body, question: c.question, options: c.options, correct: c.correct, answer: c.answer ?? "", imageCaption: c.image?.caption ?? "",
});

export default function CasoAdmin() {
  const c = useLoaderData<typeof loader>();
  const { run, pending } = useAdminAction();
  const navigate = useNavigate();
  const base = `/api/admin/caso/${c.id}`;
  const [draft, setDraft] = useState(() => draftOf(c));
  const [dialog, setDialog] = useState<null | "publish" | "withdraw" | "delete">(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftOf(c));

  // A fresh view (after a command) replaces what the form holds.
  useEffect(() => setDraft(draftOf(c)), [c.version]);

  const command = (action: string, success: string) => run("POST", `${base}/${action}`, { version: c.version }, { label: action, success });
  const published = c.status === "publicado";

  const actions = (
    <>
      {!published && <Button tone="primary" disabled={dirty} title={dirty ? "Salve as alterações antes de publicar" : undefined} onClick={() => setDialog("publish")}>Publicar</Button>}
      {published && <Button tone="ghost" onClick={() => setDialog("withdraw")}>Retirar do ar</Button>}
      {!published && <Button tone="ghost" onClick={() => setDialog("delete")}>Apagar</Button>}
    </>
  );

  return (
    <AdminPage
      title={c.title}
      subtitle={
        <span className="inline-flex flex-wrap items-center gap-2">
          <Badge tone={published ? "ok" : "warn"}>{STATUS_LABEL[c.status]}</Badge>
          <span>{`Edição de ${editionLabel(c.week)} · resposta em ${editionLabel(nextWeek(c.week) ?? c.week)}`}</span>
          <Link to="/admin/caso" className="text-ink-4 hover:text-ink-2">‹ Todos os casos</Link>
        </span>
      }
      actions={actions}
    >
      {published && (
        <div className="mb-5 rounded-panel bg-surface px-4 py-3 text-[13.5px] text-ink-2 ring-1 ring-line">
          {`Publicado: aparece na edição de ${editionLabel(c.week)}${c.hasAnswer ? `, e a resposta na de ${editionLabel(nextWeek(c.week) ?? c.week)}` : ""}. O que você salvar aqui aparece nelas em um ou dois minutos.`}
        </div>
      )}
      <CasoForm
        draft={draft}
        onChange={setDraft}
        weeks={c.weeks}
        saved={c.image}
        footer={(
          <div className="flex items-center gap-3">
            {dirty && <span className="text-[12.5px] text-amber">Alterações não salvas</span>}
            <Button tone="primary" disabled={!dirty} busy={pending === "edit"} onClick={() => run("PATCH", base, { ...payload(draft), version: c.version }, { label: "edit", success: "Caso salvo" })}>Salvar</Button>
          </div>
        )}
      />

      <Card className="mt-6" title="Histórico">
        <KV items={[["Criado", `${bj(c.createdAt, true)} · ${c.createdBy}`], ["Publicado", c.publishedAt ? bj(c.publishedAt, true) : null]]} />
        <ul className="mt-4 space-y-1.5 text-[12.5px] text-ink-3">
          {c.history.map((h, i) => (
            <li key={i}>
              <span className="num text-ink-4">{bj(h.created_at, true)}</span> · {h.actor} · {ACTION_LABEL[h.action] ?? h.action}
            </li>
          ))}
        </ul>
      </Card>

      <ReasonDialog
        open={dialog === "publish"}
        title="Publicar este caso"
        description={`Ele aparece na edição de ${editionLabel(c.week)}, e a resposta, quando escrita, na seguinte.${c.hasAnswer ? "" : " Ainda não há resposta; dá para escrevê-la depois."}`}
        requireReason={false}
        confirmLabel="Publicar"
        onClose={() => setDialog(null)}
        onSubmit={async () => (await command("publish", "Caso publicado")) !== null}
      />
      <ReasonDialog
        open={dialog === "withdraw"}
        title="Retirar este caso do ar"
        description="Ele sai da sua edição, e a resposta sai da seguinte. Volta a ser rascunho e pode ser publicado de novo."
        requireReason={false}
        danger
        confirmLabel="Retirar do ar"
        onClose={() => setDialog(null)}
        onSubmit={async () => (await command("withdraw", "Caso retirado do ar")) !== null}
      />
      <ReasonDialog
        open={dialog === "delete"}
        title="Apagar este caso"
        description="O caso e a imagem são apagados. Não pode ser desfeito."
        requireReason={false}
        danger
        confirmLabel="Apagar"
        onClose={() => setDialog(null)}
        onSubmit={async () => {
          const out = await run("POST", `${base}/delete`, { version: c.version }, { label: "delete", success: "Caso apagado", revalidate: false });
          if (out) navigate("/admin/caso");
          return out !== null;
        }}
      />
    </AdminPage>
  );
}
