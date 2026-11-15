/**
 * Wide content. The text keeps its reading column, but what does not fit into it (tables, images,
 * diagrams) may break out of it: centred on the column, as wide as it needs to be, at most as wide
 * as the window. Whoever wants the whole width for everything switches the page to full width.
 */
const KEY = "marq.fullwidth";
const $ = (id: string) => document.getElementById(id)!;

let article: HTMLElement;
let queued = false;

/** The width of the SVG a diagram was drawn with, in pixels. */
function diagramWidth(block: HTMLElement): number {
  const svg = block.querySelector("svg");
  if (!svg) return 0;
  const max = /max-width:\s*([\d.]+)px/.exec(svg.getAttribute("style") ?? "");
  if (max) return Number(max[1]);
  return svg.viewBox.baseVal?.width || svg.getBoundingClientRect().width;
}

function layout() {
  queued = false;
  const cs = getComputedStyle(article);
  const column = article.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);

  for (const table of article.querySelectorAll<HTMLElement>("table")) {
    table.classList.remove("breakout");
    if (table.scrollWidth > table.clientWidth + 1) table.classList.add("breakout");
  }
  for (const img of article.querySelectorAll<HTMLImageElement>("img")) {
    const explicit = img.hasAttribute("width");
    img.classList.toggle("breakout", !explicit && img.naturalWidth > column + 1);
  }
  for (const block of article.querySelectorAll<HTMLElement>(".mermaid-block")) {
    const w = diagramWidth(block);
    block.style.setProperty("--natural", `${Math.ceil(w)}px`);
    block.classList.toggle("breakout", w > column + 1);
  }
}

/** Measures again, once, after the current changes (render, loaded image, drawn diagram, resize). */
export function layoutWide() {
  if (queued || !article) return;
  queued = true;
  requestAnimationFrame(layout);
}

function setFull(full: boolean) {
  document.body.classList.toggle("fullwidth", full);
  $("width-btn").setAttribute("aria-pressed", String(full));
  $("width-btn").title = full ? "Reading width (Ctrl+Shift+B)" : "Full width (Ctrl+Shift+B)";
  localStorage.setItem(KEY, full ? "1" : "0");
  layoutWide();
}

export function initWide(doc: HTMLElement) {
  article = doc;
  const toggle = () => setFull(!document.body.classList.contains("fullwidth"));
  $("width-btn").addEventListener("click", toggle);
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "b") {
      e.preventDefault();
      toggle();
    }
  });
  // Images report their size when loaded.
  article.addEventListener("load", layoutWide, true);
  // The column changes with the window and with the pinned outline.
  new ResizeObserver(layoutWide).observe(article);
  setFull(localStorage.getItem(KEY) === "1");
}
