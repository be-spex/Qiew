/*
 * Hyqe – an HTML page as a browser shows it, in a frame of its own origin (the backend's
 * protocol.rs serves the files next to it), and its source one click away. Toolbar, search,
 * colour schemes and the About box come from the frame.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";
import "./styles.css";
import { setApp } from "@qiew/frame/app";
import { plural } from "@qiew/frame/fragment";
import { onRevealRequest, revealLaunchLine, revealTextLine } from "@qiew/frame/launch";
import { openInitial } from "@qiew/frame/reveal";
import { closeSearch, initSearch, refreshSearch } from "@qiew/frame/search";
import { initToolbar, updateToolbar } from "@qiew/frame/toolbar";

setApp("hyqe");
initToolbar();

interface Doc {
  path: string;
  url: string; // address of the page, see the backend's protocol.rs
  content: string;
}

const EXT = /\.(html?|xhtml)$/i;
const DROP_HERE = "Drop HTML File Here";

const empty = document.getElementById("empty")!;
const page = document.getElementById("page") as HTMLIFrameElement;
const source = document.getElementById("doc")!;
const reloadBtn = document.getElementById("reload-btn")!;
const sourceBtn = document.getElementById("source-btn")!;
const searchBox = document.getElementById("search")!;
const searchInput = document.getElementById("search-input") as HTMLInputElement;
const searchCount = document.getElementById("search-count")!;
let current: Doc | null = null;
let showSource = false;
let load = 0; // every load gets an address of its own, so the frame really loads again
let findTimer: number | undefined;

initSearch(source);

// ---- colours -----------------------------------------------------------------------------

/** The toolbar takes the page's background and a text colour that reads on it. */
function setColours(background: string | null) {
  const root = document.documentElement;
  const rgb = background?.match(/^rgba?\((\d+), (\d+), (\d+)/)?.slice(1).map(Number);
  if (!rgb || showSource) {
    for (const name of ["--bg", "--fg", "--accent", "color-scheme"]) root.style.removeProperty(name);
    return;
  }
  const dark = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255 < 0.5;
  root.style.setProperty("--bg", `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`);
  root.style.setProperty("--fg", dark ? "#e2e4e9" : "#24292f");
  root.style.setProperty("--accent", dark ? "#539bf5" : "#0969da");
  root.style.setProperty("color-scheme", dark ? "dark" : "light");
  getCurrentWindow().setTheme(dark ? "dark" : "light").catch(() => {});
}
let pageBackground: string | null = null;

// ---- source ------------------------------------------------------------------------------

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Light highlighting: comments, tags, attribute names and values. Nothing is parsed or run. */
function highlight(html: string): string {
  const re = /<!--[\s\S]*?-->|<![^>]*>|<\/?[A-Za-z][^\s>/]*(?:"[^"]*"|'[^']*'|[^>"'])*>?/g;
  let out = "";
  let last = 0;
  for (const m of html.matchAll(re)) {
    out += esc(html.slice(last, m.index));
    last = m.index + m[0].length;
    const tag = m[0];
    if (tag.startsWith("<!--")) out += `<span class="c">${esc(tag)}</span>`;
    else if (tag.startsWith("<!")) out += `<span class="d">${esc(tag)}</span>`;
    else {
      const head = tag.match(/^<\/?[^\s>/]+/)![0];
      const rest = tag.slice(head.length);
      let attrs = "";
      for (const t of rest.matchAll(/("[^"]*"|'[^']*')|([^\s=<>"'/]+)(?=\s*=)|([\s\S])/g)) {
        attrs += t[1] ? `<span class="s">${esc(t[1])}</span>` : t[2] ? `<span class="a">${esc(t[2])}</span>` : esc(t[3]);
      }
      out += `<span class="t">${esc(head)}</span>${attrs}`;
    }
  }
  return out + esc(html.slice(last));
}

function renderSource() {
  if (current) source.innerHTML = highlight(current.content);
  refreshSearch();
}

// ---- showing -----------------------------------------------------------------------------

function applyMode() {
  const open = current !== null;
  page.hidden = !open || showSource;
  source.hidden = !open || !showSource;
  empty.hidden = open;
  reloadBtn.hidden = !open || showSource;
  sourceBtn.setAttribute("aria-pressed", String(showSource));
  sourceBtn.title = showSource ? "Show page (Ctrl+U)" : "Show source (Ctrl+U)";
  closeSearch();
  setColours(pageBackground);
  if (showSource) renderSource();
}

function updateStats() {
  if (!current) return updateToolbar(null, "");
  updateToolbar(current.content, plural(current.content === "" ? 0 : current.content.split("\n").length, "Line"));
}

function reload() {
  if (!current) return;
  page.src = `${current.url}?view=${++load}`;
}

function showMessage(text: string, isError = false) {
  page.hidden = true;
  page.removeAttribute("src");
  source.hidden = true;
  updateToolbar(null, "");
  reloadBtn.hidden = true;
  pageBackground = null;
  setColours(null);
  empty.hidden = false;
  empty.textContent = text;
  empty.classList.toggle("error", isError);
}

async function open(path: string) {
  try {
    current = await invoke<Doc>("open_file", { path });
    pageBackground = null;
    updateStats();
    applyMode();
    reload();
  } catch (err) {
    current = null;
    showMessage(`Datei konnte nicht gelesen werden:\n${err}`, true);
  }
}

sourceBtn.addEventListener("click", () => {
  showSource = !showSource;
  applyMode();
});
reloadBtn.addEventListener("click", reload);
document.addEventListener("keydown", (e) => {
  if (e.key === "F5" || (e.ctrlKey && e.key.toLowerCase() === "r")) {
    e.preventDefault();
    reload();
  } else if (e.ctrlKey && e.key.toLowerCase() === "u" && current) {
    e.preventDefault();
    showSource = !showSource;
    applyMode();
  }
});

// ---- search inside the page --------------------------------------------------------------
// The page lives in another origin, so the frame's DOM search cannot reach it: the page
// searches itself (window.find) when asked, see the bridge in the backend's protocol.rs.

function find(back = false) {
  const text = searchInput.value;
  page.contentWindow?.postMessage({ hyqe: "find", text, back }, "*");
}

function pageSearchOpen() {
  searchBox.hidden = false;
  document.body.classList.add("searching");
  searchInput.focus();
  searchInput.select();
}

function initPageSearch() {
  searchInput.addEventListener("input", () => {
    if (showSource) return;
    clearTimeout(findTimer);
    findTimer = window.setTimeout(() => find(), 120);
  });
  searchInput.addEventListener("keydown", (e) => {
    if (showSource) return;
    if (e.key === "Enter" || e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      find(e.key === "ArrowUp" || (e.key === "Enter" && e.shiftKey));
    }
  });
  const hide = () => {
    searchBox.hidden = true;
    document.body.classList.remove("searching");
    page.contentWindow?.postMessage({ hyqe: "find", text: "" }, "*");
  };
  // In page mode the toolbar buttons drive window.find; in source mode the frame's search does.
  for (const [id, back] of [["search-next", false], ["search-prev", true]] as const) {
    document.getElementById(id)!.addEventListener("click", () => !showSource && find(back), true);
  }
  document.getElementById("search-close")!.addEventListener("click", () => !showSource && hide(), true);
  document.getElementById("search-btn")!.addEventListener(
    "click",
    (e) => {
      if (showSource) return;
      e.stopImmediatePropagation();
      if (searchBox.hidden) pageSearchOpen();
      else hide();
    },
    true,
  );
  document.addEventListener(
    "keydown",
    (e) => {
      if (showSource || !current) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        e.stopImmediatePropagation();
        pageSearchOpen();
      } else if (e.key === "Escape" && !searchBox.hidden) {
        e.stopImmediatePropagation();
        hide();
      }
    },
    true,
  );
}
initPageSearch();

// What the page reports and asks for (the bridge script); it cannot act on the app itself.
window.addEventListener("message", (e) => {
  if (e.source !== page.contentWindow) return;
  const data = e.data as { hyqe?: string; url?: unknown; background?: unknown; ok?: unknown } | null;
  if (data?.hyqe === "open-url" && typeof data.url === "string" && /^(https?|mailto):/i.test(data.url)) {
    openUrl(data.url);
  } else if (data?.hyqe === "reload") reload();
  else if (data?.hyqe === "search") pageSearchOpen();
  else if (data?.hyqe === "found") {
    searchCount.textContent = searchInput.value && !data.ok ? "No results" : "";
    searchBox.classList.toggle("no-results", Boolean(searchInput.value) && !data.ok);
  } else if (data?.hyqe === "page") {
    pageBackground = typeof data.background === "string" ? data.background : null;
    // A page without a background of its own is painted by the frame's, so give it the page's canvas.
    page.style.background = pageBackground ?? "#fff";
    if (!showSource) setColours(pageBackground);
  }
});

getCurrentWebview().onDragDropEvent((event) => {
  const p = event.payload;
  if (p.type === "enter" || p.type === "over") {
    document.body.classList.add("dragging");
    empty.textContent = DROP_HERE;
    empty.classList.remove("error");
    empty.hidden = false;
    page.hidden = true; // a frame would swallow the drop target's look
    source.hidden = true;
  } else {
    document.body.classList.remove("dragging");
    if (p.type === "drop") {
      const file = p.paths.find((f) => EXT.test(f));
      if (file) open(file);
      else if (!current) showMessage("Nur .html- und .htm-Dateien, bitte.");
    }
    if (current) applyMode();
  }
});

// The page or one of the files it loaded changed.
listen<string | null>("file-changed", ({ payload }) => {
  if (!current) return;
  if (payload !== null) {
    current.content = payload;
    updateStats();
    if (showSource) renderSource();
  }
  reload();
});
listen<string>("open-file", ({ payload }) => open(payload));
onRevealRequest((line) => showSource && revealTextLine(source, line));

openInitial(empty, async (path) => {
  await open(path);
  // `--line` asks for a line of the source: switch to it.
  revealLaunchLine((line) => {
    showSource = true;
    applyMode();
    revealTextLine(source, line);
  });
});
