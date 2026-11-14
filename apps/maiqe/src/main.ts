/*
 * Maiqe – the diagrams a Mermaid file describes, each on a card of its own with its own zoom,
 * and the text one click away. Mermaid is part of the app and draws offline. Toolbar, search,
 * colour schemes and the About box come from the frame.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import mermaid from "mermaid";
import "./styles.css";
import { setApp } from "@qiew/frame/app";
import { setExportAvailable, setExportContent } from "@qiew/frame/export";
import { plural } from "@qiew/frame/fragment";
import { onRevealRequest, revealElement, revealLaunchLine, revealTextLine } from "@qiew/frame/launch";
import { openInitial } from "@qiew/frame/reveal";
import { closeSearch, initSearch, refreshSearch } from "@qiew/frame/search";
import { initToolbar, updateToolbar } from "@qiew/frame/toolbar";
import { VIEWS, effectiveView } from "@qiew/frame/views";
import { type Part, kindName, split } from "./split";

setApp("maiqe");
initToolbar();

interface Doc {
  path: string;
  content: string;
}

const DROP_HERE = "Drop Mermaid File Here";
const PAD = 20; // px around a diagram on its stage
const MIN = 0.1;
const MAX = 8;

const empty = document.getElementById("empty")!;
const cards = document.getElementById("cards")!;
const source = document.getElementById("doc")!;
const sourceBtn = document.getElementById("source-btn")!;

let current: Doc | null = null;
let parts: Part[] = [];
let showSource = false;
let generation = 0; // a render pass that was overtaken stops
let active = 0; // the diagram the toolbar's export means

/** Per card: the diagram's own size and where it lies on the stage. */
interface View {
  el: HTMLElement;
  stage: HTMLElement;
  canvas: HTMLElement;
  w: number;
  h: number;
  scale: number;
  x: number;
  y: number;
  /** Follows the stage (window resize) until the reader zooms or moves by hand. */
  fitted: boolean;
  svg: string;
}
let views: (View | null)[] = [];
/** The last drawing of every diagram that worked, to keep showing it while the text has an error. */
let lastGood: (string | undefined)[] = [];

initSearch(source);

// ---- drawing -----------------------------------------------------------------------------

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const isDark = () => VIEWS.find((v) => v.id === effectiveView())!.dark;

const ICON = {
  minus: `<svg viewBox="0 0 24 24"><path d="M6 12h12"/></svg>`,
  plus: `<svg viewBox="0 0 24 24"><path d="M6 12h12M12 6v12"/></svg>`,
  fit: `<svg viewBox="0 0 24 24"><path d="M5 9V5h4M19 9V5h-4M5 15v4h4M19 15v4h-4"/></svg>`,
  expand: `<svg viewBox="0 0 24 24"><path d="M14 5h5v5M19 5l-6 6M10 19H5v-5M5 19l6-6"/></svg>`,
  save: `<svg viewBox="0 0 24 24"><path d="M12 4.5v10M7.5 10.5l4.5 4.5 4.5-4.5"/><path d="M5 15.5v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2"/></svg>`,
};

function cardHtml(p: Part, i: number, many: boolean): string {
  const title = p.title ?? (many ? `Diagram ${i + 1}` : kindName(p.kind));
  const chip = p.title || many ? `<span class="chip">${esc(kindName(p.kind))}</span>` : "";
  return (
    `<article class="card" data-i="${i}" tabindex="0" aria-label="${esc(title)}">` +
    `<header class="card-head">${many ? `<span class="num">${i + 1}</span>` : ""}<h2>${esc(title)}</h2>${chip}<span class="grow"></span>` +
    `<div class="zoom" role="group" aria-label="Zoom">` +
    `<button data-act="out" title="Zoom out (−)" aria-label="Zoom out">${ICON.minus}</button>` +
    `<button class="pct" data-act="actual" title="Actual size (0)" aria-label="Zoom level; click for actual size">100%</button>` +
    `<button data-act="in" title="Zoom in (+)" aria-label="Zoom in">${ICON.plus}</button><i></i>` +
    `<button data-act="fit" title="Fit to the card (F)" aria-label="Fit to the card" aria-pressed="true">${ICON.fit}</button>` +
    `<button data-act="expand" title="Fill the window (Enter)" aria-label="Fill the window" aria-pressed="false">${ICON.expand}</button><i></i>` +
    `<button data-act="save" title="Save this diagram as SVG" aria-label="Save this diagram as SVG">${ICON.save}</button>` +
    `</div></header><div class="stage"><div class="canvas"></div></div></article>`
  );
}

/** Mermaid's SVG scales with its container; here it has its own size and the card does the scaling. */
function measure(canvas: HTMLElement): { w: number; h: number } {
  const svg = canvas.querySelector("svg");
  if (!svg) return { w: 0, h: 0 };
  const box = svg.viewBox.baseVal;
  const w = box && box.width ? box.width : svg.getBoundingClientRect().width;
  const h = box && box.height ? box.height : svg.getBoundingClientRect().height;
  svg.setAttribute("width", String(w));
  svg.setAttribute("height", String(h));
  svg.style.maxWidth = "none";
  return { w, h };
}

function apply(v: View) {
  // The SVG itself takes the size, so it is drawn sharp at every zoom level (a scaled layer would blur).
  const svg = v.canvas.querySelector("svg");
  svg?.setAttribute("width", String(v.w * v.scale));
  svg?.setAttribute("height", String(v.h * v.scale));
  v.canvas.style.transform = `translate(${Math.round(v.x)}px, ${Math.round(v.y)}px)`;
  v.el.querySelector(".pct")!.textContent = `${Math.round(v.scale * 100)}%`;
  v.el.querySelector('[data-act="fit"]')!.setAttribute("aria-pressed", String(v.fitted));
}

const expanded = (v: View) => v.el.classList.contains("expanded");

/** The whole diagram on the stage: as large as fits, never larger than drawn (unless it fills the window). */
function fit(v: View) {
  if (!v.w || !v.h) return;
  const width = v.stage.clientWidth - 2 * PAD;
  if (expanded(v)) {
    const height = v.stage.clientHeight - 2 * PAD;
    v.scale = Math.min(width / v.w, height / v.h, 3);
  } else {
    const tallest = Math.max(220, window.innerHeight * 0.72);
    v.scale = Math.min(1, width / v.w, (tallest - 2 * PAD) / v.h);
    v.stage.style.height = `${Math.max(120, Math.ceil(v.h * v.scale) + 2 * PAD)}px`;
  }
  v.x = (v.stage.clientWidth - v.w * v.scale) / 2;
  v.y = (v.stage.clientHeight - v.h * v.scale) / 2;
  v.fitted = true;
  apply(v);
}

/** Zooms by `factor` around a point of the stage (default: its centre). */
function zoom(v: View, factor: number, cx = v.stage.clientWidth / 2, cy = v.stage.clientHeight / 2) {
  const next = Math.min(MAX, Math.max(MIN, v.scale * factor));
  v.x = cx - (cx - v.x) * (next / v.scale);
  v.y = cy - (cy - v.y) * (next / v.scale);
  v.scale = next;
  v.fitted = false;
  apply(v);
}

function setExpanded(v: View, yes: boolean) {
  for (const other of views) {
    if (other && other !== v && expanded(other)) setExpanded(other, false);
  }
  v.el.classList.toggle("expanded", yes);
  document.body.classList.toggle("has-expanded", yes);
  v.el.querySelector('[data-act="expand"]')!.setAttribute("aria-pressed", String(yes));
  if (!yes) v.stage.style.height = "";
  fit(v);
  if (yes) v.el.focus();
}

async function draw() {
  if (!current) return;
  const pass = ++generation;
  parts = split(current.content);
  const many = parts.length > 1;
  const wasExpanded = views.findIndex((v) => v && expanded(v));
  const kept = views.map((v) => (v && !v.fitted ? { scale: v.scale, x: v.x, y: v.y } : null));

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: isDark() ? "dark" : "default",
    // The window's own font: it is there, which the fonts Mermaid asks for by default need not be.
    fontFamily: getComputedStyle(document.body).fontFamily,
  });
  cards.innerHTML = parts.map((p, i) => cardHtml(p, i, many)).join("");
  document.body.classList.remove("has-expanded");
  views = parts.map(() => null);
  lastGood.length = parts.length;
  active = Math.min(active, Math.max(0, parts.length - 1));

  for (let i = 0; i < parts.length; i++) {
    const el = cards.children[i] as HTMLElement;
    const stage = el.querySelector<HTMLElement>(".stage")!;
    const canvas = el.querySelector<HTMLElement>(".canvas")!;
    let svg: string | undefined;
    let error = "";
    try {
      svg = (await mermaid.render(`maiqe-${pass}-${i}`, parts[i].text)).svg;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      // Mermaid leaves its error drawing behind.
      document.getElementById(`dmaiqe-${pass}-${i}`)?.remove();
      document.getElementById(`maiqe-${pass}-${i}`)?.remove();
    }
    if (pass !== generation) return;
    if (svg) lastGood[i] = svg;
    const shown = svg ?? lastGood[i];
    if (error) {
      const at = parts[i].line > 1 ? ` (the diagram starts at line ${parts[i].line} of the file)` : "";
      el.insertAdjacentHTML(
        "beforeend",
        `<pre class="err${shown ? "" : " only"}"><b>${shown ? "This diagram has an error – showing the last version that worked" : "This diagram cannot be drawn"}${at}</b>${esc(error)}</pre>`,
      );
    }
    if (!shown) {
      stage.remove();
      el.querySelector(".zoom")?.remove();
      continue;
    }
    canvas.innerHTML = shown;
    const { w, h } = measure(canvas);
    const v: View = { el, stage, canvas, w, h, scale: 1, x: 0, y: 0, fitted: true, svg: shown };
    views[i] = v;
    fit(v);
    const k = kept[i];
    if (k) {
      // A live reload keeps the reader's zoom and place.
      Object.assign(v, k, { fitted: false });
      apply(v);
    }
    if (i === wasExpanded) setExpanded(v, true);
  }
  setExportAvailable(views.some(Boolean));
}

// ---- showing -----------------------------------------------------------------------------

function applyMode() {
  const open = current !== null;
  cards.hidden = !open || showSource;
  source.hidden = !open || !showSource;
  empty.hidden = open;
  sourceBtn.setAttribute("aria-pressed", String(showSource));
  sourceBtn.title = showSource ? "Show diagrams (Ctrl+U)" : "Show text (Ctrl+U)";
  if (!showSource) {
    closeSearch();
    // Cards measured while hidden have no size.
    for (const v of views) if (v?.fitted) fit(v);
  } else refreshSearch();
}

function render(redraw = true) {
  if (!current) return;
  source.textContent = current.content;
  const lines = current.content === "" ? 0 : current.content.split("\n").length;
  const n = split(current.content).length;
  updateToolbar(current.content, `${plural(n, "Diagram")} · ${plural(lines, "Line")}`);
  applyMode();
  if (redraw) return draw();
}

function showMessage(text: string, isError = false) {
  cards.hidden = true;
  source.hidden = true;
  updateToolbar(null, "");
  closeSearch();
  empty.hidden = false;
  empty.textContent = text;
  empty.classList.toggle("error", isError);
}

async function open(path: string) {
  try {
    current = await invoke<Doc>("open_file", { path });
    lastGood = [];
    views = [];
    active = 0;
    await render();
    revealLaunchLine(reveal);
  } catch (err) {
    current = null;
    showMessage(`Datei konnte nicht gelesen werden:\n${err}`, true);
  }
}

/** Line n of the file: the card of the diagram it belongs to, or the line itself in the text view. */
function reveal(line: number) {
  if (showSource) {
    revealTextLine(source, line);
    return;
  }
  let at = -1;
  parts.forEach((p, i) => {
    if (p.line <= line) at = i;
  });
  const el = cards.children[Math.max(at, 0)];
  if (el) revealElement(el);
}
onRevealRequest(reveal);

function toggleSource() {
  if (!current) return;
  showSource = !showSource;
  applyMode();
}
sourceBtn.addEventListener("click", toggleSource);

// ---- interaction -------------------------------------------------------------------------

const viewOf = (target: EventTarget | null) => {
  const el = (target as Element | null)?.closest?.<HTMLElement>(".card");
  const i = el ? Number(el.dataset.i) : -1;
  return i >= 0 ? { v: views[i], i } : { v: null, i: -1 };
};

function act(v: View, i: number, what: string) {
  active = i;
  if (what === "in") zoom(v, 1.25);
  else if (what === "out") zoom(v, 0.8);
  else if (what === "actual") zoom(v, 1 / v.scale);
  else if (what === "fit") fit(v);
  else if (what === "expand") setExpanded(v, !expanded(v));
  else if (what === "save") document.getElementById("export-btn")?.click();
}

cards.addEventListener("click", (e) => {
  const btn = (e.target as Element).closest<HTMLElement>(".zoom button");
  const { v, i } = viewOf(e.target);
  if (i >= 0) active = i;
  if (btn && v) act(v, i, btn.dataset.act!);
});

cards.addEventListener("dblclick", (e) => {
  const { v } = viewOf(e.target);
  if (!v || !(e.target as Element).closest(".stage")) return;
  const box = v.stage.getBoundingClientRect();
  if (v.fitted) zoom(v, v.scale < 1 ? 1 / v.scale : 2, e.clientX - box.left, e.clientY - box.top);
  else fit(v);
});

// Ctrl+wheel (and pinch, which arrives as such) zooms at the pointer; the plain wheel scrolls the page.
cards.addEventListener(
  "wheel",
  (e) => {
    const { v } = viewOf(e.target);
    if (!v || !(e.target as Element).closest(".stage")) return;
    if (!e.ctrlKey && !expanded(v)) return;
    e.preventDefault();
    const box = v.stage.getBoundingClientRect();
    // A wheel notch is a clear step; a pinch arrives in many small ones.
    zoom(v, Math.exp(-Math.max(-50, Math.min(50, e.deltaY)) * 0.006), e.clientX - box.left, e.clientY - box.top);
  },
  { passive: false },
);

// Drag to move.
cards.addEventListener("pointerdown", (e) => {
  const { v, i } = viewOf(e.target);
  const stage = (e.target as Element).closest<HTMLElement>(".stage");
  if (!v || !stage || e.button !== 0) return;
  active = i;
  const from = { x: e.clientX - v.x, y: e.clientY - v.y };
  let moved = false;
  stage.setPointerCapture(e.pointerId);
  const move = (m: PointerEvent) => {
    if (!moved && Math.hypot(m.clientX - e.clientX, m.clientY - e.clientY) < 3) return;
    moved = true;
    stage.classList.add("panning");
    v.x = m.clientX - from.x;
    v.y = m.clientY - from.y;
    v.fitted = false;
    apply(v);
  };
  const up = () => {
    stage.classList.remove("panning");
    stage.removeEventListener("pointermove", move);
    stage.removeEventListener("pointerup", up);
    stage.removeEventListener("pointercancel", up);
  };
  stage.addEventListener("pointermove", move);
  stage.addEventListener("pointerup", up);
  stage.addEventListener("pointercancel", up);
});

document.addEventListener(
  "keydown",
  (e) => {
    if (!current) return;
    if (e.ctrlKey && e.key.toLowerCase() === "u") {
      e.preventDefault();
      toggleSource();
      return;
    }
    // Search works on the text: switch to it, the frame's handler opens the search field.
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f" && !showSource) {
      showSource = true;
      applyMode();
      return;
    }
    if (showSource || e.ctrlKey || e.altKey || e.metaKey || document.activeElement instanceof HTMLInputElement) return;
    // Keys for the card that has the focus (or fills the window).
    const full = views.findIndex((v) => v && expanded(v));
    const { v, i } = full >= 0 ? { v: views[full], i: full } : viewOf(document.activeElement);
    if (!v) return;
    const key = e.key;
    if (key === "+" || key === "=") act(v, i, "in");
    else if (key === "-") act(v, i, "out");
    else if (key === "0") act(v, i, "actual");
    else if (key.toLowerCase() === "f") act(v, i, "fit");
    else if (key === "Enter" && document.activeElement === v.el) act(v, i, "expand");
    else if (key === "Escape" && expanded(v)) setExpanded(v, false);
    else return;
    e.preventDefault();
  },
  true,
);
document.getElementById("search-btn")!.addEventListener(
  "click",
  () => {
    if (!showSource) {
      showSource = true;
      applyMode();
    }
  },
  true,
);

let resizeFrame = 0;
addEventListener("resize", () => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => {
    for (const v of views) if (v?.fitted) fit(v);
  });
});

// The diagrams follow the colour scheme: redraw when it changes.
let dark = isDark();
const themeChanged = () => {
  if (isDark() === dark) return;
  dark = isDark();
  lastGood = [];
  draw();
};
new MutationObserver(themeChanged).observe(document.documentElement, { attributes: true, attributeFilter: ["data-view"] });
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", themeChanged);

setExportContent(() => {
  const v = views[active] ?? views.find(Boolean);
  if (!v) return "";
  const svg = v.canvas.querySelector("svg")!.cloneNode(true) as SVGSVGElement;
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  svg.setAttribute("width", String(v.w));
  svg.setAttribute("height", String(v.h));
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(svg)}\n`;
});

// ---- files -------------------------------------------------------------------------------

getCurrentWebview().onDragDropEvent((event) => {
  const p = event.payload;
  if (p.type === "enter" || p.type === "over") {
    document.body.classList.add("dragging");
    empty.textContent = DROP_HERE;
    empty.classList.remove("error");
    empty.hidden = false;
  } else {
    document.body.classList.remove("dragging");
    empty.hidden = current !== null;
    if (p.type === "drop" && p.paths[0]) open(p.paths[0]);
  }
});

listen<Doc>("file-changed", ({ payload }) => {
  if (current && payload.path === current.path) {
    current = payload;
    render();
  }
});
listen<string>("open-file", ({ payload }) => open(payload));

openInitial(empty, open);
