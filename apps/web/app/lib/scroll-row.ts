/** The scroll offset that centres the tab in the row, kept within the row's range. */
export function centeredScrollLeft(scroller: { scrollLeft: number; clientWidth: number; scrollWidth: number; getBoundingClientRect(): { left: number } }, tab: { getBoundingClientRect(): { left: number; width: number } }) {
  const row = scroller.getBoundingClientRect();
  const t = tab.getBoundingClientRect();
  const target = scroller.scrollLeft + (t.left - row.left) - (scroller.clientWidth - t.width) / 2;
  return Math.max(0, Math.min(target, scroller.scrollWidth - scroller.clientWidth));
}
