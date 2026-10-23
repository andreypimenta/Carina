// A special's text and its studies, as its page and the admin's preview show them (../especiais.ts
// parseBody): headings, paragraphs, lists, and each citation as a superscript number that leads to its study.
import type { ReactNode } from "react";
import { parseBody, type Inline, type Referencia } from "../especiais.ts";

const TEXT = "text-[17px] leading-[1.8] tracking-[0.012em] text-(--prose-ink) xl:text-[18px]";

/** A run of text with its citations: consecutive studies share one superscript. */
function Inlines({ parts }: { parts: Inline[] }) {
  const out: ReactNode[] = [];
  let refs: number[] = [];
  const flush = (key: number) => {
    if (!refs.length) return;
    out.push(
      <sup key={`r${key}`} className="ml-px whitespace-nowrap text-[0.72em] font-semibold">
        {refs.map((n, i) => (
          <span key={n}>
            {i > 0 && ","}
            <a href={`#ref-${n}`} className="text-accent hover:underline">{n}</a>
          </span>
        ))}
      </sup>,
    );
    refs = [];
  };
  parts.forEach((p, i) => {
    if ("ref" in p) {
      refs.push(p.ref);
      return;
    }
    flush(i);
    // "texto [3]." reads "texto³.": the space before a citation goes with it.
    const next = parts[i + 1];
    out.push(<span key={i}>{next && "ref" in next ? p.text.replace(/\s+$/, "") : p.text}</span>);
  });
  flush(parts.length);
  return <>{out}</>;
}

export function EspecialBody({ body }: { body: string }) {
  return (
    <div className="space-y-5">
      {parseBody(body).map((g, i) => {
        if (g.type === "heading") return <h2 key={i} className="!mt-11 text-[21px] font-bold leading-[1.4] text-ink xl:text-[23px]">{g.text}</h2>;
        if (g.type === "list") {
          return (
            <ul key={i} className={`${TEXT} space-y-2`}>
              {g.items.map((item, j) => (
                <li key={j} className="flex gap-3">
                  <span className="mt-[0.75em] size-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                  <span><Inlines parts={item} /></span>
                </li>
              ))}
            </ul>
          );
        }
        return <p key={i} className={TEXT}><Inlines parts={g.text} /></p>;
      })}
    </div>
  );
}

/** "Holinger PH, Kutnick SL, Schild JA, et al." */
const authors = (names: string[]) => (names.length > 3 ? `${names.slice(0, 3).join(", ")}, et al.` : names.join(", "));

/** The studies the text cites, numbered as it cites them. */
export function References({ refs, compact = false }: { refs: Referencia[]; compact?: boolean }) {
  return (
    <ol className={compact ? "space-y-3" : "space-y-4"}>
      {refs.map((r) => (
        <li key={r.n} id={`ref-${r.n}`} className="flex scroll-mt-24 gap-3 text-[13.5px] leading-[1.65] text-ink-2 target:rounded-control target:bg-accent-soft">
          <span className="num w-6 shrink-0 text-right font-semibold text-accent">{r.n}</span>
          <span className="min-w-0">
            {r.authors.length > 0 && <span>{authors(r.authors)}. </span>}
            <span className="text-ink">{r.title}.</span>{" "}
            <em>{r.journal}</em>
            {r.year && <span> {r.year}</span>}.
            <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-4">
              <span className="rounded-full bg-bg-sunk px-2 py-px text-ink-3">{r.kind}</span>
              <a className="hover:text-accent" href={`https://pubmed.ncbi.nlm.nih.gov/${r.pmid}/`} target="_blank" rel="noreferrer">PubMed {r.pmid}</a>
              {r.doi && <a className="break-all hover:text-accent" href={`https://doi.org/${r.doi}`} target="_blank" rel="noreferrer">DOI {r.doi}</a>}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}
