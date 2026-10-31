// The case of the week as the edition shows it: last week's answer, then this week's case and its question.
// The admin's preview draws the same. A reader who tapped a choice in the e-mail arrives with ?resposta=<letter>,
// and the choice is marked.
import { useSearchParams } from "react-router";
import { Kicker } from "@aihot/web/components/ui/Kicker";
import { optionLetter, paragraphs, type CasoPart } from "../caso.ts";

function Choices({ options, correct, chosen = null }: { options: string[]; correct: number | null; chosen?: number | null }) {
  if (!options.length) return null;
  return (
    <ol className="mt-3 space-y-1.5">
      {options.map((o, i) => (
        <li key={i} className={`flex gap-2.5 text-[15.5px] leading-[1.6] ${i === correct || i === chosen ? "font-semibold text-ink" : "text-ink-2"}`}>
          <span className={`w-5 shrink-0 font-bold ${i === correct ? "text-accent" : "text-ink-4"}`}>{optionLetter(i)}</span>
          <span>
            {o}
            {i === correct && <span className="ml-1.5 text-accent" aria-label="alternativa correta">✓</span>}
            {i === chosen && <span className="ml-1.5 text-[13px] font-semibold text-accent">← sua resposta</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

const Prose = ({ text }: { text: string }) => (
  <div className="mt-3 max-w-[46em] space-y-3 text-[15.5px] leading-[1.85] text-ink-2 @[880px]:text-[16.5px]">
    {paragraphs(text).map((p, i) => <p key={i}>{p}</p>)}
  </div>
);

export function CasoView({ part }: { part: CasoPart }) {
  const { caso, resposta } = part;
  const [params] = useSearchParams();
  const letter = params.get("resposta");
  const chosen = caso && letter ? caso.options.findIndex((_, i) => optionLetter(i) === letter) : -1;
  return (
    <section id="caso" aria-label="Caso da semana" className="scroll-mt-[calc(var(--bar-h)+1.5rem)] border-b border-line py-8 @[880px]:py-10">
      {resposta && (
        <div id="caso-resposta" className={caso ? "mb-8 border-b border-line pb-8" : ""}>
          <Kicker>Resposta do caso da semana passada</Kicker>
          <h2 className="mt-4 text-[20px] font-black leading-[1.3] tracking-[-0.01em] text-ink @[880px]:text-[22px]">{resposta.title}</h2>
          <p className="mt-3 text-[15.5px] font-semibold leading-[1.6] text-ink">{resposta.question}</p>
          <Choices options={resposta.options} correct={resposta.correct} />
          <Prose text={resposta.answer} />
        </div>
      )}
      {caso && (
        <div>
          <Kicker>Caso da semana</Kicker>
          <h2 className="mt-4 text-[22px] font-black leading-[1.3] tracking-[-0.01em] text-ink @[880px]:text-[26px]">{caso.title}</h2>
          <Prose text={caso.body} />
          {caso.image && (
            <figure className="mt-5 max-w-[640px]">
              <img src={caso.image.url} width={caso.image.width} height={caso.image.height} alt={caso.image.caption ?? caso.title} loading="lazy" className="h-auto w-full rounded-panel bg-bg-sunk ring-1 ring-line" />
              {caso.image.caption && <figcaption className="mt-2 text-[13px] leading-[1.6] text-ink-3">{caso.image.caption}</figcaption>}
            </figure>
          )}
          <div className="mt-5 rounded-panel bg-accent-soft/60 p-5 ring-1 ring-accent/15 @[880px]:p-6">
            <p className="text-[17px] font-bold leading-[1.5] text-ink">{caso.question}</p>
            <Choices options={caso.options} correct={null} chosen={chosen >= 0 ? chosen : null} />
            <p className="mt-3 text-[13.5px] leading-[1.6] text-ink-3">
              {chosen >= 0 ? `Você escolheu ${letter}. A resposta sai na próxima edição, ${caso.answerOn}.` : `Discuta no seu grupo. A resposta sai na próxima edição, ${caso.answerOn}.`}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
