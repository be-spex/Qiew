/**
 * Scrolling of the document view. On its own the document scrolls with the
 * window; in the split layout (three columns) its column `#pane-doc` scrolls
 * by itself. Everything that reads or sets the document's scroll position
 * goes through here.
 */

const pane = () => document.getElementById("pane-doc");

export const isSplit = () => document.body.classList.contains("split");

function scroller(): Element {
  return (isSplit() && pane()) || document.scrollingElement || document.documentElement;
}

export const docScrollTop = () => scroller().scrollTop;

export function setDocScrollTop(y: number) {
  scroller().scrollTop = y;
}

export function scrollDocBy(dy: number) {
  scroller().scrollBy({ top: dy });
}

/** `cb` runs whenever the document view scrolls, in either layout. */
export function onDocScroll(cb: () => void) {
  window.addEventListener("scroll", cb, { passive: true });
  pane()?.addEventListener("scroll", cb, { passive: true });
}

/** A place in the document: the line at the top edge and how far it sticks out above it. */
export interface DocAnchor {
  line: Element | null;
  offset: number;
  top: number; // plain scrollTop, if the line is gone (reload) or there is none (raw view)
}

/** Upper edge of the visible content: below the sticky title and toolbar. */
const contentTop = () => document.getElementById("toolbar")!.getBoundingClientRect().bottom;

export function docAnchor(): DocAnchor {
  const doc = document.getElementById("doc")!;
  const box = doc.getBoundingClientRect();
  const y = contentTop() + 1;
  const hit = document.elementFromPoint(box.left + Math.min(60, box.width / 2), y);
  const line = hit && doc.contains(hit) ? hit.closest(".ln") : null;
  return { line, offset: line ? line.getBoundingClientRect().top - y + 1 : 0, top: docScrollTop() };
}

export function restoreDocAnchor(a: DocAnchor) {
  const line = a.line;
  if (line && line.isConnected && line.getClientRects().length > 0) {
    scrollDocBy(line.getBoundingClientRect().top - contentTop() - a.offset);
  } else {
    setDocScrollTop(a.top);
  }
}
