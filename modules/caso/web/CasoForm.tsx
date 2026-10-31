// The editor's form for a case, new or saved: the edition, the case, its picture, the question with optional
// choices, and the answer, which can wait for the week. Under it, the case and the answer as the editions show them.
import { useRef, useState } from "react";
import { toast } from "@aihot/web/features/admin/toast";
import { Button, Card, Field, Input, Select, Textarea } from "@aihot/web/features/admin/ui";
import { DEFAULT_QUESTION, editionLabel, MAX_IMAGE_BYTES, MAX_OPTIONS, nextWeek, optionLetter, type CasoImagem } from "../caso.ts";
import { CasoView } from "./CasoView.tsx";

export interface CasoDraft {
  week: string;
  title: string;
  body: string;
  question: string;
  options: string[];
  correct: number | null;
  answer: string;
  imageCaption: string;
  /** A new picture as a data URL; null takes the saved one off; undefined keeps it. */
  image?: string | null;
}

export const emptyDraft = (week: string): CasoDraft => ({ week, title: "", body: "", question: "", options: [], correct: null, answer: "", imageCaption: "" });

/** The draft as the api takes it: the choices left blank out, and the right one still pointing at its own. */
export function payload(draft: CasoDraft): CasoDraft {
  const kept = draft.options.flatMap((o, i) => (o.trim() ? [i] : []));
  const correct = draft.correct === null ? -1 : kept.indexOf(draft.correct);
  return { ...draft, options: kept.map((i) => draft.options[i]!), correct: correct < 0 ? null : correct };
}

const readFile = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

export function CasoForm({ draft, onChange, weeks, saved, footer }: {
  draft: CasoDraft;
  onChange: (draft: CasoDraft) => void;
  /** The editions it can be for. */
  weeks: string[];
  /** The picture already saved, shown until the editor replaces or removes it. */
  saved: CasoImagem | null;
  footer: React.ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState(false);
  const set = (change: Partial<CasoDraft>) => onChange({ ...draft, ...change });
  const picture = draft.image === undefined ? saved?.url ?? null : draft.image;
  const options = draft.options;
  const setOption = (i: number, value: string) => set({ options: options.map((o, j) => (j === i ? value : o)) });
  const removeOption = (i: number) => set({
    options: options.filter((_, j) => j !== i),
    correct: draft.correct === i ? null : draft.correct !== null && draft.correct > i ? draft.correct - 1 : draft.correct,
  });
  const shown = payload(draft);
  const image = picture ? { url: picture, width: saved?.width ?? 1600, height: saved?.height ?? 1200, caption: draft.imageCaption.trim() || null } : null;

  return (
    <div className="space-y-6">
      <Card title="Caso">
        <div className="mb-4 rounded-panel bg-amber-soft px-4 py-3 text-[13px] leading-relaxed text-ink-2 ring-1 ring-amber/25">
          Antes de enviar, tire do texto e da imagem tudo o que identifique o paciente: nome, iniciais, prontuário, datas, cidade, hospital,
          rosto, tatuagens e o que estiver escrito na imagem. O sistema apaga os dados do arquivo (local, data, aparelho), mas não vê o que
          aparece nela. Use só casos com o consentimento que a sua instituição exige.
        </div>
        <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          <Field label="Edição" hint="A resposta sai na edição seguinte.">
            <Select value={draft.week} onChange={(e) => set({ week: e.target.value })}>
              {weeks.map((w) => <option key={w} value={w}>{`${editionLabel(w)} · ${w}`}</option>)}
            </Select>
          </Field>
          <Field label="Título">
            <Input value={draft.title} onChange={(e) => set({ title: e.target.value })} maxLength={200} placeholder="Lactente com estridor que piora ao chorar" />
          </Field>
        </div>
        <div className="mt-4 space-y-4">
          <Field label="Caso" hint="Curto: o que o leitor precisa para decidir. Parágrafos separados por linha em branco.">
            <Textarea value={draft.body} onChange={(e) => set({ body: e.target.value })} rows={7} maxLength={5000} />
          </Field>
          <div>
            <span className="mb-1 block text-[12.5px] font-medium text-ink-2">Imagem (opcional)</span>
            <div className="flex flex-wrap items-start gap-4">
              {picture
                ? <img src={picture} alt="" className="h-32 w-auto max-w-[240px] rounded-control bg-bg-sunk object-contain ring-1 ring-line" />
                : <div className="flex h-32 w-[180px] items-center justify-center rounded-control bg-bg-sunk text-[12.5px] text-ink-4 ring-1 ring-line">Sem imagem</div>}
              <div className="min-w-[220px] flex-1 space-y-2">
                <input
                  ref={input}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return toast("A imagem precisa ser PNG, JPG ou WebP", "error");
                    if (file.size > MAX_IMAGE_BYTES) return toast(`Imagem de no máximo ${MAX_IMAGE_BYTES / 1024 / 1024} MB`, "error");
                    set({ image: await readFile(file) });
                  }}
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => input.current?.click()}>{picture ? "Trocar imagem" : "Escolher imagem"}</Button>
                  {picture && <Button size="sm" tone="ghost" onClick={() => set({ image: null })}>Tirar imagem</Button>}
                </div>
                <Field label="Legenda (opcional)" hint="O que a imagem mostra; também é lida por quem não a vê.">
                  <Input value={draft.imageCaption} onChange={(e) => set({ imageCaption: e.target.value })} maxLength={300} placeholder="Laringoscopia: lesão em…" />
                </Field>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card title="Pergunta">
        <div className="space-y-4">
          <Field label="Pergunta ao leitor" hint={`Em branco, fica “${DEFAULT_QUESTION}”.`}>
            <Input value={draft.question} onChange={(e) => set({ question: e.target.value })} maxLength={300} placeholder={DEFAULT_QUESTION} />
          </Field>
          <div>
            <span className="mb-1 block text-[12.5px] font-medium text-ink-2">Alternativas (opcional)</span>
            <p className="mb-2 text-[12px] text-ink-4">Sem alternativas, a pergunta fica aberta. Marque a certa para ela aparecer destacada na resposta.</p>
            <div className="space-y-2">
              {options.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-5 text-center text-[13px] font-bold text-ink-4">{optionLetter(i)}</span>
                  <Input value={o} onChange={(e) => setOption(i, e.target.value)} maxLength={300} />
                  <label className="flex shrink-0 items-center gap-1.5 text-[12.5px] text-ink-3">
                    <input type="radio" name="correct" checked={draft.correct === i} onChange={() => set({ correct: i })} />
                    certa
                  </label>
                  <Button size="sm" tone="ghost" aria-label={`Tirar a alternativa ${optionLetter(i)}`} onClick={() => removeOption(i)}>×</Button>
                </div>
              ))}
            </div>
            {options.length < MAX_OPTIONS && (
              <Button size="sm" className="mt-2" onClick={() => set({ options: options.length ? [...options, ""] : ["", ""] })}>
                {options.length ? "Mais uma alternativa" : "Dar alternativas"}
              </Button>
            )}
          </div>
        </div>
      </Card>

      <Card title="Resposta">
        <Field label="Resposta e discussão (pode esperar)" hint={`Sai na edição seguinte, ${editionLabel(nextWeek(draft.week) ?? draft.week)}. Enquanto estiver em branco, aquela edição sai sem a resposta.`}>
          <Textarea value={draft.answer} onChange={(e) => set({ answer: e.target.value })} rows={7} maxLength={8000} />
        </Field>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button tone="ghost" onClick={() => setPreview(!preview)}>{preview ? "Esconder a prévia" : "Ver como sai na edição"}</Button>
        {footer}
      </div>
      {preview && (
        <Card title="Prévia">
          <div className="@container">
            <p className="text-[12px] text-ink-4">{`Na edição de ${editionLabel(draft.week)}:`}</p>
            <CasoView part={{
              caso: { week: draft.week, title: draft.title, body: draft.body, image, question: draft.question.trim() || DEFAULT_QUESTION, options: shown.options, answerOn: editionLabel(nextWeek(draft.week) ?? draft.week) },
              resposta: null,
            }} />
            {draft.answer.trim() && (
              <>
                <p className="mt-6 text-[12px] text-ink-4">{`Na edição de ${editionLabel(nextWeek(draft.week) ?? draft.week)}:`}</p>
                <CasoView part={{
                  caso: null,
                  resposta: { week: draft.week, title: draft.title, question: draft.question.trim() || DEFAULT_QUESTION, options: shown.options, correct: shown.correct, answer: draft.answer },
                }} />
              </>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
