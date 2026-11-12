/**
 * XSLT mapping: a three-column layout with the XML on the left, an editable
 * stylesheet in the middle and the transformation result on the right.
 *
 * The transformation runs in the webview's own XSLTProcessor (libxslt in
 * WebKit, i.e. XSLT 1.0). The stylesheet comes from the editor text, so
 * relative xsl:include/xsl:import and document() cannot be resolved.
 */
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { initFold } from "./fold";
import { isMapping, restoreXmlAnchor, xmlAnchor, type XmlAnchor } from "./scroll";
import { flashDone } from "./toolbar";
import { parseXml, renderXml } from "./xml";

const XSL_NS = "http://www.w3.org/1999/XSL/Transform";

/** Starting point: copies the input unchanged. */
const IDENTITY = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Identity transform: copies the message 1:1. -->
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:output method="xml" encoding="UTF-8"/>

  <xsl:template match="@*|node()">
    <xsl:copy>
      <xsl:apply-templates select="@*|node()"/>
    </xsl:copy>
  </xsl:template>
</xsl:stylesheet>
`;

const $ = (id: string) => document.getElementById(id)!;

let source: () => string | null;
let editor: HTMLTextAreaElement;
let result: HTMLElement;
let duration: HTMLElement;
/** Last transformation result as shown (formatted if it is XML), with a file extension to save it under. */
let output: { text: string; ext: string } | null = null;
/** Where the XML view stood before the mapping layout was opened. */
let before: XmlAnchor | null = null;

function setOutput(o: typeof output) {
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

const outputMethod = (xsl: Document) =>
  xsl.getElementsByTagNameNS(XSL_NS, "output")[0]?.getAttribute("method") ?? "xml";

/** The result document as text, the way the stylesheet's xsl:output asks for it. */
function serialize(doc: Document, xsl: Document): string {
  const output = xsl.getElementsByTagNameNS(XSL_NS, "output")[0];
  const method = outputMethod(xsl);
  // WebKit wraps text output into an XHTML document with a single <pre>.
  if (method === "text") return doc.getElementsByTagName("pre")[0]?.textContent ?? doc.documentElement?.textContent ?? "";
  const body = new XMLSerializer().serializeToString(doc);
  const decl = method === "xml" && output?.getAttribute("omit-xml-declaration") !== "yes" && !body.startsWith("<?xml");
  return decl ? `<?xml version="1.0" encoding="UTF-8"?>\n${body}` : body;
}

function formatMs(ms: number): string {
  // WebKit coarsens performance.now(), fractions of a millisecond are noise.
  return ms < 1 ? "< 1 ms" : `${Math.round(ms).toLocaleString("en")} ms`;
}

function run() {
  const src = source();
  if (src === null) return showError("Kein XML geladen.");
  const xml = parseXml(src);
  if (typeof xml === "string") return showError(`XML ist nicht wohlgeformt: ${xml}`);
  const xsl = parseXml(editor.value);
  if (typeof xsl === "string") return showError(`XSLT ist nicht wohlgeformt: ${xsl}`);

  let out: string;
  const t0 = performance.now();
  try {
    const proc = new XSLTProcessor();
    proc.importStylesheet(xsl);
    const doc = proc.transformToDocument(xml);
    // WebKit reports stylesheet errors only on the console and returns null.
    if (!doc) throw new Error("ungültiges Stylesheet oder Laufzeitfehler (Details in der Konsole)");
    out = serialize(doc, xsl);
  } catch (e) {
    return showError(`Transformation fehlgeschlagen: ${e instanceof Error ? e.message : e}`);
  }
  duration.textContent = `Transformed in ${formatMs(performance.now() - t0)}`;

  const view = renderXml(out);
  result.innerHTML = view.html;
  result.scrollTop = 0;
  const method = outputMethod(xsl);
  setOutput({ text: view.ok ? view.text : out, ext: method === "text" ? "txt" : method === "html" ? "html" : "xml" });
}

/** Re-indents the stylesheet; text content (xsl:text, literal text) stays as written. */
function prettyPrint() {
  const view = renderXml(editor.value, true);
  if (!view.ok) return showError(`XSLT ist nicht wohlgeformt: ${view.error}`);
  if (view.text === editor.value) return;
  editor.focus();
  editor.select();
  // execCommand keeps the change on the undo stack (Ctrl+Z restores the old layout).
  if (!document.execCommand("insertText", false, view.text)) editor.value = view.text;
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
    console.error("xaq: copy failed", err);
  }
}

async function loadStylesheet() {
  const path = await openDialog({
    multiple: false,
    directory: false,
    filters: [
      { name: "XSLT", extensions: ["xsl", "xslt"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });
  if (!path) return;
  try {
    const doc = await invoke<{ content: string }>("read_text", { path });
    editor.value = doc.content;
    editor.scrollTop = 0;
    editor.setSelectionRange(0, 0);
  } catch (err) {
    showError(`XSLT konnte nicht gelesen werden:\n${err}`);
  }
}

/**
 * Keeps the XML view on `anchor` while the layout and then the window size
 * change: line wrapping moves the content, so a plain scrollTop would drift.
 */
function holdXmlPosition(anchor: XmlAnchor, resized: Promise<unknown>) {
  restoreXmlAnchor(anchor);
  const onResize = () => restoreXmlAnchor(anchor);
  window.addEventListener("resize", onResize);
  // The window manager may apply the new size a little after the call returns.
  resized.finally(() =>
    setTimeout(() => {
      window.removeEventListener("resize", onResize);
      restoreXmlAnchor(anchor);
    }, 700),
  );
}

function setActive(on: boolean) {
  // Leaving goes back to where the XML view stood before the mapping was opened.
  const anchor = on ? (before = xmlAnchor()) : (before ?? xmlAnchor());
  if (!on) before = null;
  document.body.classList.toggle("mapping", on);
  $("pane-xslt").hidden = !on;
  $("pane-result").hidden = !on;
  $("mapping-btn").setAttribute("aria-pressed", String(on));
  const resized = invoke("set_wide", { wide: on }).catch((e) => console.error("xaq: resize failed", e));
  holdXmlPosition(anchor, resized);
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

/** `getSource` returns the text of the open XML document, or null. */
export function initMapping(getSource: () => string | null) {
  source = getSource;
  editor = $("xslt-editor") as HTMLTextAreaElement;
  result = $("result");
  duration = $("duration");
  editor.value = IDENTITY;

  initFold(result);
  initEditorKeys();
  setOutput(null);

  $("mapping-btn").addEventListener("click", () => setActive(!isMapping()));
  $("mapping-close-btn").addEventListener("click", () => setActive(false));
  $("xslt-load-btn").addEventListener("click", () => loadStylesheet());
  $("xslt-run-btn").addEventListener("click", run);
  $("xslt-format-btn").addEventListener("click", prettyPrint);
  $("result-save-btn").addEventListener("click", () => saveResult());
  $("result-copy-btn").addEventListener("click", () => copyResult());
}
