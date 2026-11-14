import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { openUrl } from "@tauri-apps/plugin-opener";
import "./styles.css";
import { setApp } from "@qiew/frame/app";
import { plural } from "@qiew/frame/fragment";
import { openInitial } from "@qiew/frame/reveal";
import { initToolbar, updateToolbar } from "@qiew/frame/toolbar";
import { getCurrentWindow } from "@tauri-apps/api/window";

setApp("tusq");
initToolbar();

interface Doc {
  path: string;
  url: string; // address of the preview page, see the backend's protocol.rs
  content: string;
}

const EXT = /\.(tsx|jsx|ts|js|mjs)$/i;
const DROP_HERE = "Drop TSX or JSX File Here";

const empty = document.getElementById("empty")!;
const frame = document.getElementById("doc") as HTMLIFrameElement;
const reloadBtn = document.getElementById("reload-btn")!;
let current: Doc | null = null;
let load = 0; // every load gets an address of its own, so the frame really loads again

/** Width of the window for a component that takes whatever width it gets. */
const DEFAULT_WIDTH = 1280;
const MIN_WIDTH = 640;
/** How long to wait for the preview to say what it looks like. */
const PAGE_TIMEOUT = 2500;
let pageShown: (() => void) | null = null; // waits for the preview's first report

/**
 * The toolbar takes its colours from the component: the page's background,
 * and a text colour that reads on it. Without a page it follows the system.
 */
function setColours(background: string | null) {
  const root = document.documentElement;
  const rgb = background?.match(/^rgb\((\d+), (\d+), (\d+)\)$/)?.slice(1).map(Number);
  if (!rgb) {
    for (const name of ["--bg", "--fg", "--accent", "color-scheme"]) root.style.removeProperty(name);
    return;
  }
  const dark = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255 < 0.5;
  root.style.setProperty("--bg", background);
  root.style.setProperty("--fg", dark ? "#e2e4e9" : "#24292f");
  root.style.setProperty("--accent", dark ? "#539bf5" : "#0969da");
  root.style.setProperty("color-scheme", dark ? "dark" : "light");
  // Lets the system window frame follow where the platform supports it.
  getCurrentWindow().setTheme(dark ? "dark" : "light").catch(() => {});
}

/**
 * (Re)loads the preview: the component runs in a frame of another origin,
 * which the backend builds from the files on disk. The page keeps its scroll
 * position across reloads by itself.
 *
 * `measure` (a file was opened): the preview also reports the width the
 * component is made for and the window takes it; the promise resolves once
 * that is done, so the window appears in its final shape.
 */
function show(measure = false): Promise<void> {
  if (!current) return Promise.resolve();
  document.body.classList.toggle("measuring", measure);
  frame.src = `${current.url}?view=${++load}${measure ? "&measure" : ""}`;
  empty.hidden = true;
  frame.hidden = false;
  updateToolbar(current.content, plural(current.content.split("\n").length, "Line"));
  reloadBtn.hidden = false;
  if (!measure) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      if (pageShown !== done) return;
      pageShown = null;
      document.body.classList.remove("measuring");
      resolve();
    };
    pageShown = done;
    setTimeout(done, PAGE_TIMEOUT);
  });
}

function showMessage(text: string, isError = false) {
  frame.hidden = true;
  frame.removeAttribute("src");
  updateToolbar(null, "");
  reloadBtn.hidden = true;
  setColours(null);
  empty.hidden = false;
  empty.textContent = text;
  empty.classList.toggle("error", isError);
}

async function open(path: string) {
  try {
    current = await invoke<Doc>("open_file", { path });
    await show(true);
  } catch (err) {
    current = null;
    showMessage(`Datei konnte nicht gelesen werden:\n${err}`, true);
  }
}

reloadBtn.addEventListener("click", () => show());
document.addEventListener("keydown", (e) => {
  if (e.key === "F5" || (e.ctrlKey && e.key.toLowerCase() === "r")) {
    e.preventDefault();
    show();
  }
});

// What the preview asks for and reports (runtime/host.ts); it cannot act on the app itself.
window.addEventListener("message", async (e) => {
  if (e.source !== frame.contentWindow) return;
  const data = e.data as { tusq?: string; url?: unknown; first?: unknown; background?: unknown; width?: unknown } | null;
  if (data?.tusq === "reload") show();
  else if (data?.tusq === "open-url" && typeof data.url === "string" && /^https?:\/\//i.test(data.url)) openUrl(data.url);
  else if (data?.tusq === "page") {
    setColours(typeof data.background === "string" ? data.background : null);
    if (data.first && pageShown) {
      const width = typeof data.width === "number" ? Math.max(data.width, MIN_WIDTH) : DEFAULT_WIDTH;
      await invoke("fit_width", { width }).catch(() => {});
      pageShown();
    }
  }
});

getCurrentWebview().onDragDropEvent((event) => {
  const p = event.payload;
  if (p.type === "enter" || p.type === "over") {
    document.body.classList.add("dragging");
    empty.textContent = DROP_HERE;
    empty.classList.remove("error");
    empty.hidden = false;
    frame.hidden = true; // a frame would swallow the drop target's look
  } else {
    document.body.classList.remove("dragging");
    empty.hidden = current !== null;
    frame.hidden = current === null;
    if (p.type === "drop") {
      const file = p.paths.find((f) => EXT.test(f));
      if (file) open(file);
      else if (!current) showMessage("Nur .tsx- und .jsx-Dateien, bitte.");
    }
  }
});

// The entry file or one of the files it imports changed.
listen<string | null>("file-changed", ({ payload }) => {
  if (!current) return;
  if (payload !== null) current.content = payload;
  show();
});
listen<string>("open-file", ({ payload }) => open(payload));

openInitial(empty, open);
