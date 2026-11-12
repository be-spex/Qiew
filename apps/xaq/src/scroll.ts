/**
 * Scrolling of the XML view. On its own the document scrolls with the window;
 * in the mapping layout (three columns) the XML column scrolls by itself.
 * Everything that reads or sets the XML view's scroll position goes through here.
 */

const pane = () => document.getElementById("pane-xml")!;

export const isMapping = () => document.body.classList.contains("mapping");

function scroller(): Element {
  return isMapping() ? pane() : (document.scrollingElement ?? document.documentElement);
}

export const xmlScrollTop = () => scroller().scrollTop;

export function setXmlScrollTop(y: number) {
  scroller().scrollTop = y;
}

export function scrollXmlBy(dy: number) {
  scroller().scrollBy({ top: dy });
}

/** `cb` runs whenever the XML view scrolls, in either layout. */
export function onXmlScroll(cb: () => void) {
  window.addEventListener("scroll", cb, { passive: true });
  pane().addEventListener("scroll", cb, { passive: true });
}

/** A place in the XML view: the line at the top edge and how far it sticks out above it. */
export interface XmlAnchor {
  line: Element | null;
  offset: number;
  top: number; // plain scrollTop, if the line is gone (reload) or there is none (raw view)
}

/** Upper edge of the visible content: below the sticky title and toolbar. */
const contentTop = () => document.getElementById("toolbar")!.getBoundingClientRect().bottom;

export function xmlAnchor(): XmlAnchor {
  const doc = document.getElementById("doc")!;
  const box = doc.getBoundingClientRect();
  const y = contentTop() + 1;
  const hit = document.elementFromPoint(box.left + Math.min(60, box.width / 2), y);
  const line = hit && doc.contains(hit) ? hit.closest(".ln") : null;
  return { line, offset: line ? line.getBoundingClientRect().top - y + 1 : 0, top: xmlScrollTop() };
}

export function restoreXmlAnchor(a: XmlAnchor) {
  const line = a.line;
  if (line && line.isConnected && line.getClientRects().length > 0) {
    scrollXmlBy(line.getBoundingClientRect().top - contentTop() - a.offset);
  } else {
    setXmlScrollTop(a.top);
  }
}
