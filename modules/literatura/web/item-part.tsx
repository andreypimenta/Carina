// Why a matéria can be trusted, on its page (backend/confianca.ts materiaParts): "Em um minuto" and the study's
// card between the summary and the text, and at the end how it was made and its public corrections. A preprint's
// warning opens its body (backend/materia.ts preprintNote), so here it is only a line of the card.
import { EXPEDIENTE, SITE } from "@aihot/site";
import type { ItemPagePart } from "@aihot/web/modules";
import {
  dataBr, DESENHO_LABEL, IMPLICACAO_LABEL, linhaRevisao, PREPRINT_LABEL, TEXTO_LIDO_LABEL, type Implicacao, type MateriaPart,
} from "../confianca.ts";

const GRADE_TONE: Record<Implicacao, string> = {
  nao: "bg-bg-sunk text-ink-2 ring-line-strong",
  "pode-informar-discussao": "bg-amber-soft text-amber-ink ring-amber/30",
  "alinhado-a-diretriz": "bg-ok-soft text-ok-ink ring-ok/30",
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] font-semibold text-ink-3">{label}</dt>
      <dd className="mt-0.5 text-[14.5px] leading-[1.65] text-ink-2">{children}</dd>
    </div>
  );
}

function Top({ data }: { data: unknown }) {
  const c = (data as MateriaPart).confianca;
  if (!c) return null;
  const m = c.minuto;
  return (
    <div className="mt-7 space-y-4">
      {m && (
        <section aria-labelledby="em-um-minuto" className="rounded-panel bg-accent-soft/50 px-5 py-4 ring-1 ring-inset ring-accent/15">
          <h2 id="em-um-minuto" className="text-[12px] font-semibold tracking-[0.1em] text-accent">EM UM MINUTO</h2>
          <dl className="mt-3 space-y-3">
            <div>
              <dt className="text-[12px] font-semibold text-ink-3">O achado</dt>
              <dd className="mt-0.5 text-[16.5px] leading-[1.65] text-ink">{m.achado}</dd>
            </div>
            <Row label="Para quem importa">{m.paraQuem}</Row>
            <Row label="Muda algo agora?">
              <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[13px] font-semibold ring-1 ring-inset ${GRADE_TONE[m.mudaAlgo]}`}>{IMPLICACAO_LABEL[m.mudaAlgo]}</span>
              {m.diretriz && <span className="ml-2 text-[13.5px] text-ink-3">{m.diretriz}</span>}
              <span className="mt-1.5 block text-[12.5px] leading-relaxed text-ink-4">
                {`Grau do que o próprio ${c.feitura === "pagina" ? "documento" : "estudo"} sustenta, não uma recomendação do ${SITE.bareName}.`}
              </span>
            </Row>
          </dl>
        </section>
      )}
      <section aria-label={c.feitura === "pagina" ? "Sobre a fonte" : "Ficha do estudo"} className="rounded-panel border border-line px-5 py-4">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {c.populacao && <Row label="População">{[c.populacao.idade, c.populacao.doenca, c.populacao.cenario].join(" · ")}</Row>}
          {c.desenho && <Row label={c.feitura === "pagina" ? "Documento" : "Desenho"}>{c.desenhoDetalhe ? `${DESENHO_LABEL[c.desenho]} (${c.desenhoDetalhe})` : DESENHO_LABEL[c.desenho]}</Row>}
          {c.limitacao && <Row label="Principal limitação">{c.limitacao}</Row>}
          {c.preprint && <Row label="Revisão por pares"><span className="font-semibold text-amber-ink">{PREPRINT_LABEL}</span></Row>}
          <Row label="Texto lido">{TEXTO_LIDO_LABEL[c.textoLido]}</Row>
          {c.datas && (
            <Row label="Datas do documento">
              {`Publicado: ${c.datas.publicado ? dataBr(c.datas.publicado) : "não informado"} · Revisado: ${c.datas.revisado ? dataBr(c.datas.revisado) : "não informado pela fonte"} · Conferido pelo ${SITE.bareName}: ${dataBr(c.datas.conferido)}`}
            </Row>
          )}
        </dl>
      </section>
    </div>
  );
}

function End({ data }: { data: unknown }) {
  const { confianca, correcoes } = data as MateriaPart;
  if (!confianca && !correcoes.length) return null;
  return (
    <div className="mt-6 space-y-5 border-t border-line pt-5">
      {confianca && (
        <section aria-labelledby="como-foi-feita">
          <h2 id="como-foi-feita" className="text-[13px] font-semibold text-ink">Como esta matéria foi feita</h2>
          <p className="mt-1 text-[13.5px] leading-[1.7] text-ink-3">{linhaRevisao(confianca, EXPEDIENTE.editor.name)}</p>
        </section>
      )}
      {correcoes.length > 0 && (
        <section aria-labelledby="correcoes">
          <h2 id="correcoes" className="text-[13px] font-semibold text-ink">Correções</h2>
          <ol className="mt-2 space-y-2.5">
            {correcoes.map((c) => (
              <li key={c.id} className="text-[13.5px] leading-[1.7] text-ink-2">
                <time dateTime={c.data} className="mono mr-1.5 text-ink-3">{dataBr(c.data)}</time>
                {c.oQueMudou} <span className="text-ink-3">Por quê: {c.porque}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

const part: ItemPagePart = { Top, End };
export default part;
