// An article opened from /assine: as lean as the edition it came from (WebModule.ownChrome), with the text,
// the link to the original, the buttons that send this page to WhatsApp or copy it, and the sign-up form at the
// end. Its only way back is to that edition; nothing leads into the rest of the site.
import { data, Link, useLoaderData, useSearchParams, type LoaderFunctionArgs, type MetaArgs } from "react-router";
import type { SiteItemDetail } from "@aihot/contracts/site";
import { SITE } from "@aihot/site";
import { Wordmark } from "@aihot/site/brand/Logo.tsx";
import { IconArrowLeft, IconExternal } from "@aihot/web/components/icons";
import { ArticleBody } from "@aihot/web/features/item/ArticleBody";
import { apiGet, cachedPage, loadOr404 } from "@aihot/web/lib/api.server";
import { fullDateTime } from "@aihot/web/lib/format";
import { pageMeta, titled } from "@aihot/web/lib/seo";
import { groupTag, signupPath } from "../group.ts";
import type { SignupChannels } from "../types.ts";
import { materiaUrl, ShareLink } from "./ShareLink.tsx";
import { SignupForm } from "./SignupForm.tsx";

export { pageHeaders as headers } from "@aihot/web/lib/api.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const key = params.key ?? "";
  if (!/^\d{4}-W\d{2}$/.test(key)) throw data({ message: "not_found" }, { status: 404 });
  const [item, channels] = await Promise.all([
    loadOr404<SiteItemDetail>(`/api/site/items/${encodeURIComponent(params.item ?? "")}`, { signal: request.signal }),
    apiGet<SignupChannels>("/api/assinatura", { signal: request.signal }),
  ]);
  return cachedPage(600, { key, item, channels });
}

// The article's own page (/items/<id>) is the one to index; this one is for readers of the shared link.
export function meta({ loaderData, location }: MetaArgs<typeof loader>) {
  if (!loaderData) return [{ title: titled("Conteúdo não encontrado") }, { name: "robots", content: "noindex" }];
  const { item } = loaderData;
  return pageMeta({ title: item.title, description: item.summary ?? undefined, path: location.pathname, image: `/og/items/${item.id}.png`, type: "article", noindex: true });
}

export default function AssineMateria() {
  const { key, item, channels } = useLoaderData<typeof loader>();
  const group = groupTag(useSearchParams()[0].get("g"));
  const isX = item.channel === "x" && !!item.x;
  const lang = item.bodyLanguage;
  const bodyHtml = lang === "zh" ? (item.body?.zh ?? item.body?.original) : (item.body?.original ?? item.body?.zh);
  const bodyLabel = !item.body ? null : lang === "zh" && item.body.zhKind === "translation" ? "Texto · tradução por IA" : lang === "original" && item.hasTranslation ? "Texto · original" : "Texto";
  const shownAt = item.publishedAt ?? item.discoveredAt;
  return (
    <div className="report-shell min-h-dvh">
      <header className="mx-auto flex w-full max-w-[1160px] items-center justify-between gap-3 px-[var(--gutter-l)] py-4 lg:px-10">
        <Wordmark size={22} className="text-ink" />
        <span className="text-[12px] tracking-[0.12em] text-ink-4">EDIÇÃO SEMANAL · GRÁTIS</span>
      </header>
      <main className="mx-auto w-full max-w-[var(--page-max-reading)] px-[var(--gutter-l)] pb-12">
        <Link to={signupPath(group, `/assine/${key}`)} className="-ml-1.5 inline-flex h-8 items-center gap-1.5 rounded-full px-1.5 text-[13px] text-ink-3 transition-colors hover:text-ink">
          <IconArrowLeft size={16} /> Voltar à edição
        </Link>
        <article className="pb-6 pt-4">
          <div className="mb-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-ink-3">
            <span className="font-semibold text-ink-2">{isX ? item.x!.authorName : item.source.name}</span>
            {isX && <span>· @{item.x!.handle} · X</span>}
            <span>·</span>
            {!item.publishedAt && <span>Coletado em</span>}
            <time dateTime={shownAt} className="mono">{fullDateTime(shownAt)}</time>
          </div>
          {!isX && <h1 className="text-[26px] font-bold leading-[1.38] tracking-[-0.01em] text-ink lg:text-[32px] lg:leading-[1.34]">{item.title}</h1>}
          {item.summary && (!isX || item.summary.replace(/\s+/g, " ").trim() !== item.title) && (
            <section className={isX ? "mt-4" : "mt-7"}>
              <div className="mb-2 text-[12px] font-semibold text-accent">{item.readingMode === "summary-only" ? "Resumo" : "Resumo por IA"}</div>
              <p className="text-[18px] leading-[1.7] text-ink">{item.summary}</p>
            </section>
          )}
          {item.body && bodyHtml && (
            <section className="mt-9 border-t border-line pt-4">
              <div className="mb-6 text-[12px] text-ink-4">{bodyLabel}</div>
              {item.hasTranslation && lang === "zh" && !item.body.complete && (
                <p className="mb-5 rounded-control bg-bg-sunk px-3 py-2 text-[13px] text-ink-3">A tradução ainda está incompleta; veja o texto completo no original.</p>
              )}
              <ArticleBody html={bodyHtml} />
            </section>
          )}
          <a
            href={item.links.original}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-8 inline-flex h-10 items-center gap-1.5 rounded-full border border-line-strong bg-surface px-4 text-[13.5px] font-medium text-ink-2 transition-colors hover:border-ink-4 hover:text-ink"
          >
            {isX ? "Ver o post no X" : `Ler o original em ${item.source.name}`} <IconExternal size={14} />
          </a>
          <ShareLink url={materiaUrl(key, item.id)} label="Copiar link" whatsapp={item.title} className="mt-6" />
        </article>
        <SignupForm channels={channels} title={`Gostou? Receba ${SITE.name} toda semana`} />
        <footer className="mt-10 flex flex-wrap justify-center gap-x-5 gap-y-2 text-[12.5px] text-ink-4">
          <Link to="/privacy" className="hover:text-accent">Política de privacidade</Link>
          <Link to="/terms" className="hover:text-accent">Termos de uso</Link>
        </footer>
      </main>
    </div>
  );
}
