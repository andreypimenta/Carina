// Site navigation in one place: the desktop sidebar's sections and the phone tab bar's tabs, the engine's
// and the site's modules'.
import type { ReactNode } from "react";
import { NAV } from "@aihot/site";
import { webModules } from "../../site-modules";
import {
  IconBolt, IconBookmark, IconDoc, IconFlame, IconGrid, IconHeart, IconHistory, IconList, IconMessage, IconPlug, IconUser,
} from "../icons";

export interface NavItem {
  to: string;
  label: string;
  icon: (p: { size?: number }) => ReactNode;
  /** Shows the unread dot while the changelog has news. */
  changelog?: boolean;
}

const SECTIONS: Array<{ title: string; items: NavItem[] }> = [
  {
    title: "Conteúdo",
    items: [
      { to: "/", label: "Edição semanal", icon: IconDoc },
      { to: "/selecao", label: "Seleção", icon: IconBolt },
      { to: "/all", label: "Todas as notícias", icon: IconList },
      { to: "/hot", label: "Em alta", icon: IconFlame },
      { to: "/topics", label: "Tópicos", icon: IconGrid },
      { to: "/starred", label: "Salvos", icon: IconBookmark },
    ],
  },
  {
    title: "Mais",
    items: [
      { to: "/agent", label: "Integração com agentes", icon: IconPlug },
      { to: "/about", label: "Sobre", icon: IconHeart },
      { to: "/changelog", label: "Novidades", icon: IconHistory, changelog: true },
      { to: "/feedback", label: "Feedback", icon: IconMessage },
    ],
  },
];

/** Whether an engine page is a way in from the navigation (site.ts NAV.hidden); a hidden page still opens. */
export const inNav = (to: string) => !(NAV.hidden as readonly string[]).includes(to);

const UP = {
  "/hot": { name: "Em alta", back: "Em alta", returnTo: "Voltar a Em alta", tab: "hot" },
  "/topics": { name: "Tópicos", back: "Tópicos", returnTo: "Voltar aos tópicos", tab: "me" },
} as const;

/**
 * Where pages under a navigation entry lead back up to: the entry, or Seleção in its place while the site hides
 * it. `name` is for breadcrumbs and desktop back links, `back` for the phone bar, `returnTo` for a "voltar" link,
 * `tab` the phone tab it sits under, `crumbs` its breadcrumb after the site's home.
 */
export function navUp(entry: keyof typeof UP): {
  to: string; name: string; back: string; returnTo: string; tab: TabKey; crumbs: Array<{ name: string; path: string }>;
} {
  if (!inNav(entry)) return { to: "/selecao", name: "Seleção", back: "Seleção", returnTo: "Voltar à Seleção", tab: "featured", crumbs: [] };
  return { to: entry, ...UP[entry], crumbs: [{ name: UP[entry].name, path: entry }] };
}

/**
 * The sidebar: the engine's sections with the modules' between 内容 and 更多; a module naming a section
 * that is already there adds to it.
 */
export function sidebar(): Array<{ title: string; items: NavItem[] }> {
  const [content, ...rest] = SECTIONS;
  const more = rest.pop()!;
  const sections = [content!, ...rest].map((s) => ({ ...s, items: s.items.filter((i) => inNav(i.to)) }));
  for (const m of webModules()) {
    if (!m.sidebar) continue;
    const section = sections.find((s) => s.title === m.sidebar!.section);
    if (section) section.items.push(...m.sidebar.items);
    else sections.push({ title: m.sidebar.section, items: [...m.sidebar.items] });
  }
  return [...sections, more];
}

/**
 * A sidebar entry is lit on its pages; the weekly edition, the front page, also covers the daily notes and the
 * monthly review.
 */
export function sidebarIsActive(item: NavItem, pathname: string): boolean {
  if (item.to === "/") return pathname === "/" || /^\/(daily|weekly|monthly)(\/|$)/.test(pathname);
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

/**
 * The phone tab bar: the edition (the front page) first, 全部 lives beside 精选 as a switch, 热点 is a tab, and "我的" at /more holds
 * 收藏, 外观, the tools and the site's own pages. Which tab a page sits under is declared by the page
 * itself (components/shell/screens.ts).
 */
export type TabKey =
  | "featured"
  | "hot"
  | "daily"
  | "me"
  // A module's tab.
  | (string & {});

export interface Tab {
  key: TabKey;
  to: string;
  label: string;
  icon: (p: { size?: number }) => ReactNode;
  changelog?: boolean;
}

const ENGINE_TABS: Tab[] = [
  { key: "daily", to: "/", label: "Edição", icon: IconDoc },
  { key: "featured", to: "/selecao", label: "Seleção", icon: IconBolt },
  { key: "hot", to: "/hot", label: "Em alta", icon: IconFlame },
  { key: "me", to: "/more", label: "Meu", icon: IconUser, changelog: true },
];

/** The tab bar: the engine's, the modules' before 我的. */
export function tabs(): Tab[] {
  return [...ENGINE_TABS.slice(0, -1).filter((t) => inNav(t.to)), ...webModules().flatMap((m) => m.tabs ?? []), ENGINE_TABS.at(-1)!];
}
