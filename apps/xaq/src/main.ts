import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import "./styles.css";
import { initToolbar, setBackEnabled, updateToolbar } from "./toolbar";
import { closeSearch, initSearch, refreshSearch } from "./search";
import { collapsedPaths, initFold, restoreFolds, setAllCollapsed } from "./fold";
import { renderXml } from "./xml";

initToolbar();

interface Doc {
  path: string;
  content: string;
}

const DROP_HINT = "Drop XML File Here";

const empty = document.getElementById("empty")!;
const notice = document.getElementById("notice")!;
const article = document.getElementById("doc")!;
let current: Doc | null = null;

initSearch(article);
initFold(article);
document.getElementById("fold-btn")!.addEventListener("click", () => setAllCollapsed(article, true));
document.getElementById("unfold-btn")!.addEventListener("click", () => setAllCollapsed(article, false));

const fmt = new Intl.NumberFormat("en");
const plural = (n: number, word: string) => `${fmt.format(n)} ${word}${n === 1 ? "" : "s"}`;

/** `keepState` (live reload): keep scroll position and folded nodes. */
function render(doc: Doc, keepState: boolean) {
  const scroll = keepState ? window.scrollY : 0;
  const folds = keepState ? collapsedPaths(article) : null;

  const view = renderXml(doc.content);
  article.innerHTML = view.html;
  if (view.ok && folds) restoreFolds(article, folds);

  notice.hidden = view.ok;
  if (!view.ok) {
    notice.textContent = `Kein wohlgeformtes XML – Rohansicht. ${view.error}`.trim();
  }

  empty.hidden = true;
  article.hidden = false;
  updateToolbar(
    view.ok ? view.text : doc.content,
    view.ok ? plural(view.elements, "Element") : `Raw · ${plural(view.lines, "Line")}`,
    view.ok,
  );
  window.scrollTo(0, scroll);
  refreshSearch();
}

function showMessage(text: string, isError = false) {
  article.hidden = true;
  notice.hidden = true;
  updateToolbar(null, "", false);
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
 * Opens a file. "push" adds a history entry (drops), "replace" reuses
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

getCurrentWebview().onDragDropEvent((event) => {
  const p = event.payload;
  if (p.type === "enter" || p.type === "over") {
    document.body.classList.add("dragging");
    empty.textContent = DROP_HINT;
    empty.classList.remove("error");
    empty.hidden = false;
  } else {
    document.body.classList.remove("dragging");
    empty.hidden = current !== null;
    // Any file is accepted: XML comes with many extensions (.wsdl, .csproj, .plist …).
    if (p.type === "drop" && p.paths[0]) open(p.paths[0]);
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
