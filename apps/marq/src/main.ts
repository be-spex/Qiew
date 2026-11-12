import MarkdownIt from "markdown-it";
import DOMPurify from "dompurify";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { openUrl } from "@tauri-apps/plugin-opener";
import "github-markdown-css/github-markdown.css";
import "./styles.css";
import { setApp } from "@qiew/frame/app";
import { closeSearch, initSearch, refreshSearch } from "@qiew/frame/search";
import { initToolbar, setBackEnabled, updateToolbar } from "./toolbar";

setApp("marq");
initToolbar();

interface Doc {
  path: string;
  dir: string;
  content: string;
}

const MD_EXT = /\.(md|markdown|mdown|mkd)$/i;
const ABSOLUTE = /^([a-z][a-z0-9+.-]*:|\/\/)/i; // has a scheme or is protocol-relative

const md = new MarkdownIt({ html: true, linkify: true, typographer: false });

// GitHub-style heading ids, so in-document links like [x](#setup) work.
md.core.ruler.push("heading_ids", (state) => {
  const seen = new Map<string, number>();
  state.tokens.forEach((tok, i) => {
    if (tok.type !== "heading_open") return;
    const text = state.tokens[i + 1]?.content ?? "";
    const base = text.toLowerCase().trim().replace(/[^\p{L}\p{N}\s-]/gu, "").replace(/\s/g, "-");
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    tok.attrSet("id", n ? `${base}-${n}` : base);
  });
});

const empty = document.getElementById("empty")!;
const article = document.getElementById("doc")!;
let current: Doc | null = null;

initSearch(article);

function joinPath(dir: string, rel: string): string {
  const sep = dir.includes("\\") && !dir.includes("/") ? "\\" : "/";
  const parts = dir.split(/[\\/]/);
  for (const seg of decodeURI(rel).split(/[\\/]/)) {
    if (seg === "..") parts.pop();
    else if (seg !== "." && seg !== "") parts.push(seg);
  }
  return parts.join(sep);
}

function render(doc: Doc, keepScroll: boolean) {
  const scroll = keepScroll ? window.scrollY : 0;
  article.innerHTML = DOMPurify.sanitize(md.render(doc.content));

  // Relative images resolve against the Markdown file, served via asset://.
  article.querySelectorAll<HTMLImageElement>("img[src]").forEach((img) => {
    const src = img.getAttribute("src")!;
    if (!ABSOLUTE.test(src)) img.src = convertFileSrc(joinPath(doc.dir, src));
  });

  empty.hidden = true;
  article.hidden = false;
  updateToolbar(doc.content, article);
  window.scrollTo(0, scroll);
  refreshSearch();
}

function showMessage(text: string, isError = false) {
  article.hidden = true;
  updateToolbar(null, article);
  closeSearch();
  empty.hidden = false;
  empty.textContent = text;
  empty.classList.toggle("error", isError);
}

/*
 * Navigation history. Every opened file becomes an entry in the webview's own
 * history (pushState), so the context menu's "Back", the mouse back button,
 * Alt+Left and the toolbar button all go the same way. Entries carry the
 * scroll position, kept up to date while reading.
 */
interface NavState {
  path: string;
  idx: number;
  scroll: number;
}
history.scrollRestoration = "manual";
let navIdx = 0;

/**
 * Opens a file. "push" adds a history entry (links, drops), "replace" reuses
 * the current one (first file), "none" leaves history alone (Back/Forward).
 */
async function open(path: string, mode: "push" | "replace" | "none" = "push", scroll = 0) {
  try {
    const doc = await invoke<Doc>("open_file", { path });
    if (mode === "push" && history.state) {
      navIdx++;
      history.pushState({ path: doc.path, idx: navIdx, scroll: 0 } satisfies NavState, "");
    } else if (mode !== "none") {
      history.replaceState({ path: doc.path, idx: navIdx, scroll: 0 } satisfies NavState, "");
    }
    current = doc;
    render(doc, false);
    window.scrollTo(0, scroll);
  } catch (err) {
    current = null;
    showMessage(`Datei konnte nicht gelesen werden:\n${err}`, true);
  }
  setBackEnabled(navIdx > 0);
}

window.addEventListener("popstate", (e) => {
  const st = e.state as NavState | null;
  if (!st?.path) return;
  navIdx = st.idx;
  open(st.path, "none", st.scroll);
});

let scrollTimer: number | undefined;
window.addEventListener("scroll", () => {
  clearTimeout(scrollTimer);
  scrollTimer = window.setTimeout(() => {
    if (history.state) history.replaceState({ ...history.state, scroll: window.scrollY }, "");
  }, 150);
}, { passive: true });

document.addEventListener("keydown", (e) => {
  if (e.altKey && e.key === "ArrowLeft") history.back();
  else if (e.altKey && e.key === "ArrowRight") history.forward();
});
// Mouse back/forward buttons.
window.addEventListener("mouseup", (e) => {
  if (e.button === 3) history.back();
  else if (e.button === 4) history.forward();
});

// Links: anchors scroll, web links go to the browser, relative .md files open here.
article.addEventListener("click", (e) => {
  const a = (e.target as Element).closest("a");
  if (!a || !current) return;
  const href = a.getAttribute("href") ?? "";
  e.preventDefault();
  if (href.startsWith("#")) {
    document.getElementById(decodeURIComponent(href.slice(1)))?.scrollIntoView();
  } else if (/^(https?:|mailto:)/i.test(href)) {
    openUrl(href);
  } else if (!ABSOLUTE.test(href)) {
    const file = href.split("#")[0];
    if (MD_EXT.test(file)) open(joinPath(current.dir, file));
  }
});

getCurrentWebview().onDragDropEvent((event) => {
  const p = event.payload;
  if (p.type === "enter" || p.type === "over") {
    document.body.classList.add("dragging");
    empty.textContent = "Drop Markdown File Here";
    empty.classList.remove("error");
    empty.hidden = false;
  } else {
    document.body.classList.remove("dragging");
    empty.hidden = current !== null;
    if (p.type === "drop") {
      const file = p.paths.find((f) => MD_EXT.test(f));
      if (file) open(file);
      else if (!current) showMessage("Nur .md-Dateien, bitte.");
    }
  }
});

listen<Doc>("file-changed", ({ payload }) => {
  if (current && payload.path === current.path) {
    current = payload;
    render(payload, true);
  }
});
listen<string>("open-file", ({ payload }) => open(payload));

invoke<string | null>("initial_file").then((path) => {
  if (path) open(path, "replace");
});
