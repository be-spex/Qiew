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
