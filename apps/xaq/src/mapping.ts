/**
 * XSLT mapping: a three-column layout with the XML on the left, an editable
 * stylesheet in the middle and the transformation result on the right.
 *
 * The transformation runs in the webview's own XSLTProcessor (libxslt in
 * WebKit, i.e. XSLT 1.0). The stylesheet comes from the editor text, so
 * relative xsl:include/xsl:import and document() cannot be resolved.
 */
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { initFold } from "./fold";
import { isMapping, setXmlScrollTop, xmlScrollTop } from "./scroll";
import { scrollShadow } from "./toolbar";
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

function showError(text: string) {
  duration.textContent = "";
  result.innerHTML = "";
  const box = document.createElement("div");
  box.className = "result-error";
  box.textContent = text;
  result.append(box);
}

/** The result document as text, the way the stylesheet's xsl:output asks for it. */
function serialize(doc: Document, xsl: Document): string {
  const output = xsl.getElementsByTagNameNS(XSL_NS, "output")[0];
  const method = output?.getAttribute("method") ?? "xml";
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

function setActive(on: boolean) {
  const scroll = xmlScrollTop();
  document.body.classList.toggle("mapping", on);
  $("pane-xslt").hidden = !on;
  $("pane-result").hidden = !on;
  $("mapping-btn").setAttribute("aria-pressed", String(on));
  setXmlScrollTop(scroll);
  invoke("set_wide", { wide: on }).catch((e) => console.error("xaq: resize failed", e));
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
  scrollShadow($("xslt-toolbar"), editor);
  scrollShadow($("result-toolbar"), $("pane-result"));

  $("mapping-btn").addEventListener("click", () => setActive(!isMapping()));
  $("xslt-load-btn").addEventListener("click", () => loadStylesheet());
  $("xslt-run-btn").addEventListener("click", run);
}
