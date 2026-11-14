/*
 * Runs inside the preview frame (tusq://localhost/fs/<file>?view): imports the
 * component file from the page's own address, mounts what it exports and
 * shows what goes wrong on the way. The frame has no access to the app; what
 * it wants from it (open a link, reload) it asks for with postMessage, and
 * the same way it tells the app what the page looks like: its background
 * colour, for the toolbar, and the width the component is made for.
 */
import "@tailwindcss/browser";
import { Component, createElement, type ComponentType, type ReactNode } from "react";
import { createRoot } from "react-dom/client";

const FILE = decodeURIComponent(location.pathname.split("/").pop() ?? "");
const SCROLL_KEY = `tusq.scroll:${location.pathname}`;

const STYLE = `
#tusq-error {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 2147483647;
  max-height: 70vh; overflow: auto; box-sizing: border-box; padding: 18px 22px 20px;
  background: #1c1c1f; color: #e4e4e7; border-top: 3px solid #f87171;
  font: 13px/1.5 ui-monospace, "SFMono-Regular", "JetBrains Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace;
  text-align: left; box-shadow: 0 -8px 30px rgb(0 0 0 / .3);
}
#tusq-error.alone { top: 0; max-height: none; border-top: 0; }
#tusq-error h1 { margin: 0 28px 2px 0; font: inherit; font-weight: 700; color: #f87171; }
#tusq-error .where { color: #a1a1aa; margin-bottom: 10px; }
#tusq-error pre { margin: 10px 0 0; font: inherit; white-space: pre-wrap; overflow-wrap: anywhere; }
#tusq-error pre.message { margin-top: 0; color: #fafafa; }
#tusq-error pre.frame { padding: 10px 12px; border-radius: 6px; background: #111113; white-space: pre; overflow-x: auto; }
#tusq-error pre.stack, #tusq-error .hint { color: #a1a1aa; }
#tusq-error .hint { margin-top: 12px; font-family: system-ui, sans-serif; }
#tusq-error button {
  position: absolute; top: 12px; right: 14px; width: 26px; height: 26px; padding: 0;
  border: 0; border-radius: 5px; background: transparent; color: #a1a1aa; font: 18px/1 system-ui, sans-serif; cursor: pointer;
}
#tusq-error button:hover { background: #2e2e33; color: #fafafa; }
`;

interface Position {
  file?: string;
  line?: number;
  column?: number;
  frame?: string;
}

const root = document.getElementById("root")!;

/** The app asks for the component's width when it opens a file (not on reloads). */
const MEASURE = new URLSearchParams(location.search).has("measure");

const probe = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
probe.canvas.width = probe.canvas.height = 1;

/** Any CSS colour (Tailwind writes oklch) as red, green, blue, alpha. */
function rgba(color: string): [number, number, number, number] {
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = "transparent";
  probe.fillStyle = color;
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
  return [r, g, b, a / 255];
}

const COLOR = /(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\([^()]*\)|#[0-9a-f]{3,8}\b/i;

/**
 * The element at the top edge of the page, in its middle. Found by geometry
 * rather than by hit testing, which finds nothing while the frame is unseen
 * (that is when the page is measured).
 */
function topElement(): Element {
  const x = document.documentElement.clientWidth / 2;
  let el: Element = document.getElementById("tusq-error") ?? document.body;
  for (let depth = 0; depth < 12; depth++) {
    const child = [...el.children].reverse().find((c) => {
      const box = c.getBoundingClientRect();
      return box.height > 0 && box.top <= 1 && box.bottom > 1 && box.left <= x && box.right >= x;
    });
    if (!child) break;
    el = child;
  }
  return el;
}

/** The colour at the top edge of the page, which the app's toolbar adjoins. */
function background(): string {
  const layers: string[] = [];
  for (let e: Element | null = topElement(); e; e = e.parentElement) {
    const style = getComputedStyle(e);
    // A gradient counts with its first colour.
    layers.push((style.backgroundImage.includes("gradient") && style.backgroundImage.match(COLOR)?.[0]) || style.backgroundColor);
  }
  let [r, g, b] = [255, 255, 255]; // an empty page is white
  for (const layer of layers.reverse()) {
    const [lr, lg, lb, a] = rgba(layer);
    [r, g, b] = [lr * a + r * (1 - a), lg * a + g * (1 - a), lb * a + b * (1 - a)];
  }
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

/**
 * The width the component is made for: that of its widest part with a
 * maximum width (a centred column, say), plus what surrounds it. Null for a
 * layout that takes whatever it gets – then only the viewer can decide.
 * Measured while the frame is far wider than any design.
 */
function naturalWidth(): number | null {
  let best = 0;
  for (const el of [...root.querySelectorAll("*")].slice(0, 3000)) {
    const style = getComputedStyle(el);
    if (!style.maxWidth.endsWith("px") || style.position === "fixed" || style.position === "absolute") continue;
    const width = el.getBoundingClientRect().width;
    if (width < parseFloat(style.maxWidth) - 1) continue; // does not reach its limit
    let around = 0;
    for (let p = el.parentElement; p; p = p.parentElement) {
      const ps = getComputedStyle(p);
      for (const side of [ps.paddingLeft, ps.paddingRight, ps.borderLeftWidth, ps.borderRightWidth]) around += parseFloat(side) || 0;
    }
    best = Math.max(best, width + around);
  }
  return best ? Math.ceil(best) : null;
}

let mounted = 0; // when something came onto the page: the component or an error
let styled = false; // Tailwind has written its style sheet for what is on the page
let ready = false; // the app has been told that the page can be shown
let reported = "";

/** How long to wait for Tailwind before taking the page as it is (it may have nothing to add). */
const STYLE_TIMEOUT = 400;

/**
 * Tells the app what the page looks like: once as soon as it looks right
 * (with the width, if asked for), then whenever its background changes.
 */
function report() {
  if (!mounted || (!ready && !styled && performance.now() - mounted < STYLE_TIMEOUT)) return;
  const colour = background();
  if (ready && colour === reported) return;
  parent.postMessage({ tusq: "page", first: !ready, background: colour, width: !ready && MEASURE ? naturalWidth() : null }, "*");
  ready = true;
  reported = colour;
}

// Looks again after every change to the page, without waiting: timers are slowed down while the
// window is still hidden, messages are not.
const tick = new MessageChannel();
let pending = false;
tick.port1.onmessage = () => {
  pending = false;
  report();
};
function reportSoon() {
  if (pending) return;
  pending = true;
  tick.port2.postMessage(null);
}
new MutationObserver((records) => {
  // Tailwind answers what React puts on the page by rewriting its style sheet in the head.
  if (root.hasChildNodes() && records.some((r) => document.head.contains(r.target) && r.target !== document.head)) styled = true;
  reportSoon();
}).observe(document.documentElement, {
  subtree: true,
  childList: true,
  attributes: true,
  characterData: true,
});

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text: string) {
  const el = document.createElement(tag);
  el.className = className;
  el.textContent = text;
  return el;
}

/** Shows an error over the page; the newest one wins. */
function showError(title: string, error: unknown, hint = "") {
  if (!document.getElementById("tusq-style")) {
    const style = element("style", "", STYLE);
    style.id = "tusq-style";
    document.head.append(style);
  }
  document.getElementById("tusq-error")?.remove();

  const err = error instanceof Error ? error : new Error(String(error));
  const at: Position = (err as Error & { tusq?: Position }).tusq ?? {};
  const panel = element("div", root.hasChildNodes() ? "" : "alone", "");
  panel.id = "tusq-error";
  panel.setAttribute("role", "alert");

  const close = element("button", "", "×");
  close.title = "Dismiss";
  close.addEventListener("click", () => panel.remove());
  panel.append(close, element("h1", "", title));
  if (at.file) panel.append(element("div", "where", at.line ? `${at.file}:${at.line}:${at.column}` : at.file));
  panel.append(element("pre", "message", err.message || String(error)));
  if (at.frame) panel.append(element("pre", "frame", at.frame));
  else if (err.stack && !("tusq" in err)) panel.append(element("pre", "stack", err.stack));
  if (hint) panel.append(element("div", "hint", hint));
  document.body.append(panel);
  mounted ||= performance.now();
  styled = true; // the error panel brings its own styles
  reportSoon();
}

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    showError("The component failed to render", error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** A React component: a function or class, or what memo/forwardRef/lazy return. */
const isComponent = (value: unknown): value is ComponentType =>
  typeof value === "function" || (typeof value === "object" && value !== null && "$$typeof" in value);

/** The default export, else the first export that looks like a component. */
function pick(module: Record<string, unknown>): ComponentType | null {
  if (isComponent(module.default)) return module.default;
  const name = Object.keys(module).find((key) => /^[A-Z]/.test(key) && isComponent(module[key]));
  return name ? (module[name] as ComponentType) : null;
}

function restoreScroll() {
  const y = Number(sessionStorage.getItem(SCROLL_KEY));
  if (!y) return;
  // Tailwind writes its styles after the first render; the page is only then as long as it was.
  const restore = () => window.scrollTo(0, y);
  requestAnimationFrame(restore);
  setTimeout(restore, 120);
}
window.addEventListener("pagehide", () => sessionStorage.setItem(SCROLL_KEY, String(window.scrollY)));

window.addEventListener("error", (e) => showError("Error", e.error ?? e.message));
window.addEventListener("unhandledrejection", (e) => showError("Unhandled promise rejection", e.reason));

// Web links open in the browser, not in the frame.
document.addEventListener("click", (e) => {
  const a = (e.target as Element).closest?.("a[href]");
  const href = a?.getAttribute("href") ?? "";
  if (!a || href.startsWith("#")) return;
  e.preventDefault();
  if (/^https?:/i.test(href)) parent.postMessage({ tusq: "open-url", url: href }, "*");
});
document.addEventListener("keydown", (e) => {
  if (e.key === "F5" || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "r")) {
    e.preventDefault();
    parent.postMessage({ tusq: "reload" }, "*");
  }
});

try {
  const module = (await import(/* @vite-ignore */ location.pathname)) as Record<string, unknown>;
  const component = pick(module);
  if (component) {
    createRoot(root).render(createElement(Boundary, null, createElement(component)));
    restoreScroll();
    mounted = performance.now();
    setTimeout(reportSoon, STYLE_TIMEOUT + 20);
  } else {
    // A file that mounts itself into #root is fine too; give it a moment.
    setTimeout(() => {
      if (root.hasChildNodes()) {
        restoreScroll();
        mounted = performance.now();
        styled = true;
        reportSoon();
      } else showError("Nothing to show", `${FILE} does not export a React component.`, "Tusq shows the default export, or the first exported component.");
    }, 300);
  }
} catch (error) {
  const failedToLoad = error instanceof TypeError && !(error as { tusq?: unknown }).tusq;
  showError(
    error instanceof SyntaxError ? "Syntax error" : `${FILE} could not be loaded`,
    error,
    failedToLoad
      ? "A module could not be loaded. react, react-dom, lucide-react and recharts come with Tusq; other packages are fetched from esm.sh and need a network connection."
      : "",
  );
}
