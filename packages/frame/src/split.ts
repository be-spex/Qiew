/**
 * Split view: a three-column layout with the document on the left, an
 * editable transformation (a stylesheet, a filter …) in the middle and its
 * result on the right. What the transformation is and how it runs is up to
 * the app; this module owns the layout, the editor and the result column.
 *
 * Expects the backend commands `read_text`, `save_text` and `set_wide`.
 */
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { appId } from "./app";
import { initFold } from "./fold";
import { docAnchor, isSplit, restoreDocAnchor, type DocAnchor } from "./scroll";
import { flashDone } from "./toolbar";

/** A transformation result: as shown, as text to copy or save, with a file extension to save it under. */
export interface Output {
  html: string;
  text: string;
  ext: string;
  /** Duration of the transformation itself, in milliseconds. */
  ms: number;
}

export interface SplitOptions {
  /** Text of the open document, or null. */
  source: () => string | null;
  /** Shown when Run is pressed without a document. */
  noSource: string;
  /** What the editor starts with. */
  initial: string;
  /** Runs the transformation; an Error's message is shown in the result column. */
  run: (source: string, code: string) => Output | Promise<Output>;
  /** Pretty-prints the editor's content; an Error's message is shown in the result column. */
  format?: (code: string) => string;
  /** File dialog filter of "Load", e.g. `{ name: "XSLT", extensions: ["xsl", "xslt"] }`. */
  loadFilter: { name: string; extensions: string[] };
}

const $ = (id: string) => document.getElementById(id)!;

let opts: SplitOptions;
let editor: HTMLTextAreaElement;
let result: HTMLElement;
let duration: HTMLElement;
let output: Output | null = null;
/** Where the document view stood before the split layout was opened. */
let before: DocAnchor | null = null;
/** Counts runs, so a slow one that was overtaken does not show its result. */
let runs = 0;

function setOutput(o: Output | null) {
  output = o;
  for (const id of ["result-save-btn", "result-copy-btn"]) ($(id) as HTMLButtonElement).disabled = !o;
}

function showError(text: string) {
  setOutput(null);
  duration.textContent = "";
  result.innerHTML = "";
  const box = document.createElement("div");
  box.className = "result-error";
  box.textContent = text;
  result.append(box);
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

function formatMs(ms: number): string {
  // WebKit coarsens performance.now(), fractions of a millisecond are noise.
  return ms < 1 ? "< 1 ms" : `${Math.round(ms).toLocaleString("en")} ms`;
}

async function run() {
  const src = opts.source();
  if (src === null) return showError(opts.noSource);
  const mine = ++runs;
  let out: Output;
  try {
    out = await opts.run(src, editor.value);
  } catch (e) {
    if (mine === runs) showError(message(e));
    return;
  }
  if (mine !== runs) return;
  duration.textContent = `Transformed in ${formatMs(out.ms)}`;
  result.innerHTML = out.html;
  result.scrollTop = 0;
  setOutput(out);
}

function prettyPrint() {
  let text: string;
  try {
    text = opts.format!(editor.value);
  } catch (e) {
    return showError(message(e));
  }
  if (text === editor.value) return;
  editor.focus();
  editor.select();
  // execCommand keeps the change on the undo stack (Ctrl+Z restores the old layout).
  if (!document.execCommand("insertText", false, text)) editor.value = text;
  editor.scrollTop = 0;
  editor.setSelectionRange(0, 0);
}

async function saveResult() {
  if (!output) return;
  const { text, ext } = output;
  const path = await saveDialog({
    defaultPath: `transformed.${ext}`,
    filters: [
      { name: ext.toUpperCase(), extensions: [ext] },
      { name: "All Files", extensions: ["*"] },
    ],
  });
  if (!path) return;
  try {
    await invoke("save_text", { path, content: text });
    flashDone($("result-save-btn"));
  } catch (err) {
    showError(`Ergebnis konnte nicht gespeichert werden:\n${err}`);
  }
}

async function copyResult() {
  if (!output) return;
  try {
    await writeText(output.text);
    flashDone($("result-copy-btn"));
  } catch (err) {
    console.error(`${appId()}: copy failed`, err);
  }
}

async function loadFile() {
  const path = await openDialog({
    multiple: false,
    directory: false,
    filters: [opts.loadFilter, { name: "All Files", extensions: ["*"] }],
  });
  if (!path) return;
  try {
    const doc = await invoke<{ content: string }>("read_text", { path });
    editor.value = doc.content;
    editor.scrollTop = 0;
    editor.setSelectionRange(0, 0);
  } catch (err) {
    showError(`${opts.loadFilter.name} konnte nicht gelesen werden:\n${err}`);
  }
}

/**
 * Keeps the document view on `anchor` while the layout and then the window
 * size change: line wrapping moves the content, so a plain scrollTop would drift.
 */
function holdDocPosition(anchor: DocAnchor, resized: Promise<unknown>) {
  restoreDocAnchor(anchor);
  const onResize = () => restoreDocAnchor(anchor);
  window.addEventListener("resize", onResize);
  // The window manager may apply the new size a little after the call returns.
  resized.finally(() =>
    setTimeout(() => {
      window.removeEventListener("resize", onResize);
      restoreDocAnchor(anchor);
    }, 700),
  );
}

function setActive(on: boolean) {
  // Leaving goes back to where the document view stood before the split was opened.
  const anchor = on ? (before = docAnchor()) : (before ?? docAnchor());
  if (!on) before = null;
  document.body.classList.toggle("split", on);
  $("pane-editor").hidden = !on;
  $("pane-result").hidden = !on;
  $("split-btn").setAttribute("aria-pressed", String(on));
  const resized = invoke("set_wide", { wide: on }).catch((e) => console.error(`${appId()}: resize failed`, e));
  holdDocPosition(anchor, resized);
  if (on) editor.focus();
}

/** Tab indents in the editor instead of leaving it; Ctrl+Enter runs. */
function initEditorKeys() {
  editor.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      run();
    } else if (e.key === "Tab" && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
      e.preventDefault();
      // execCommand keeps the edit on the textarea's undo stack.
      if (!document.execCommand("insertText", false, "  ")) editor.setRangeText("  ", editor.selectionStart, editor.selectionEnd, "end");
    }
  });
}

export function initSplit(options: SplitOptions) {
  opts = options;
  editor = $("editor") as HTMLTextAreaElement;
  result = $("result");
  duration = $("duration");
  editor.value = opts.initial;

  initFold(result);
  initEditorKeys();
  setOutput(null);

  $("split-btn").addEventListener("click", () => setActive(!isSplit()));
  $("split-close-btn").addEventListener("click", () => setActive(false));
  $("editor-load-btn").addEventListener("click", () => loadFile());
  $("run-btn").addEventListener("click", run);
  const formatBtn = document.getElementById("editor-format-btn");
  if (opts.format) formatBtn?.addEventListener("click", prettyPrint);
  else if (formatBtn) formatBtn.hidden = true;
  $("result-save-btn").addEventListener("click", () => saveResult());
  $("result-copy-btn").addEventListener("click", () => copyResult());
}
