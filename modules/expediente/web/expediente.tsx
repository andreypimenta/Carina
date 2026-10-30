// The masthead page: the editor (only the details the site filled in, none at all without a name) and the
// site's text on how the articles are chosen and written, with the way to sign up at the end.
import { Link } from "react-router";
import { EDITION_WHEN, EXPEDIENTE, SITE } from "@aihot/site";
import copy from "@aihot/site/pages/expediente.md?raw";
import { edgeTtl } from "@aihot/web/lib/api.server";
import { pageMeta } from "@aihot/web/lib/seo";
import { prepareCopy } from "@aihot/web/lib/site-copy";
import { ReadingLayout } from "@aihot/web/components/ui/Page";
import { PhoneBar } from "@aihot/web/components/shell/PhoneBar";
import type { Screen } from "@aihot/web/components/shell/screens";

export const handle: Screen = { tab: "me", name: "Expediente" };

const PAGE = prepareCopy(copy);

export function headers() {
  return edgeTtl(300);
}

export function meta() {
  return pageMeta({ title: PAGE.doc.title, description: PAGE.doc.intro ?? `Quem faz ${SITE.name}.`, path: "/expediente", image: "/og/pages/expediente.png" });
}

function Editor() {
  const { name, role, crm, bio, photo } = EXPEDIENTE.editor;
  if (!name) return null;
  return (
    <section aria-label="Editor responsável" className="card mt-6 flex items-start gap-4 px-5 py-5 sm:px-6">
      {photo && <img src={photo} alt="" width={72} height={72} className="size-[72px] shrink-0 rounded-full object-cover" />}
      <div className="min-w-0">
        <div className="text-[12px] font-semibold tracking-[0.08em] text-accent">EDITOR RESPONSÁVEL</div>
        <h2 className="mt-1 text-[19px] font-bold leading-snug text-ink">{name}</h2>
        {(role || crm) && <p className="mt-0.5 text-[13.5px] text-ink-3">{[role, crm].filter(Boolean).join(" · ")}</p>}
        {bio && <p className="mt-2.5 text-[14.5px] leading-[1.75] text-ink-2">{bio}</p>}
      </div>
    </section>
  );
}

export default function ExpedientePage() {
  return (
    <>
      <PhoneBar back={{ to: "/more", label: "Meu" }} title={PAGE.doc.title} />
      <ReadingLayout>
        <article className="pb-14 pt-3 lg:pt-2">
          <div className="mb-2.5 text-[12px] font-semibold text-accent">{SITE.name}</div>
          <h1 data-page-title="" className="text-[26px] font-bold leading-[1.35] text-ink lg:text-[32px]">{PAGE.doc.title}</h1>
          {PAGE.doc.intro && <p className="mt-4 text-[15px] leading-[1.8] text-ink-3 xl:text-[16px]">{PAGE.doc.intro}</p>}
          <Editor />
          <div className="prose prose-compact mt-8" dangerouslySetInnerHTML={{ __html: PAGE.rendered.html }} />
          <p className="mt-10 border-t border-line pt-5 text-[14px] text-ink-3">
            {`A edição semanal sai ${EDITION_WHEN.weekly}, de graça. `}<Link to="/assine" className="font-semibold text-accent hover:underline">Assine</Link>
          </p>
        </article>
      </ReadingLayout>
    </>
  );
}
