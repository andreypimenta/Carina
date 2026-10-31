// 站点的字标和圆环标记：页面用 Wordmark 画站名（size 是高度，单位像素，或一个 CSS 长度），RingMark 是小标记，转起来就是加载动画。
// Wordmark 是 Logo（mark.svg 的形状，内联画出，不多一次请求）加站名排字。
import { SITE } from "../site.ts";
import { MARK_PATH, MARK_VIEWBOX } from "./mark.ts";

/** The logo, in teal; a lighter teal on the dark theme. Sized by the caller (height; the width follows). */
export function LogoMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox={MARK_VIEWBOX} className={`text-[#0e7c86] dark:text-[#3fb3bc] ${className}`} fill="none" aria-hidden="true">
      <path d={MARK_PATH} stroke="currentColor" strokeWidth="7" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** size: the height in pixels, or a CSS length (such as a clamp()) for a name that grows with the screen. */
export function Wordmark({ size = 24, className = "", title = SITE.name }: { size?: number | string; className?: string; title?: string }) {
  const fontSize = typeof size === "number" ? Math.round(size * 0.92) : `calc(${size} * 0.92)`;
  // The logo stands on the baseline and is as tall as the capitals.
  return (
    <span className={`inline-flex items-baseline font-black leading-none tracking-[-0.03em] ${className}`} style={{ fontSize }} aria-label={title} role="img">
      <LogoMark className="mr-[0.28em] h-[0.72em] w-auto shrink-0" />
      <span aria-hidden="true">{SITE.name}</span>
    </span>
  );
}

/** A ring with a dot; spinning, it is the loader. */
export function RingMark({ className = "", spinning = false }: { className?: string; spinning?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <g style={spinning ? { transformOrigin: "12px 12px", animation: "spin-slow 1.1s linear infinite" } : undefined}>
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeDasharray="42 15" />
      </g>
      <circle cx="12" cy="12" r="2.6" fill="currentColor" />
    </svg>
  );
}
