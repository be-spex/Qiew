/**
 * XSLT mapping: the frame's split view with the XML on the left, an editable
 * stylesheet in the middle and the transformation result on the right.
 *
 * The transformation runs in the webview's own XSLTProcessor (libxslt in
 * WebKit, i.e. XSLT 1.0). The stylesheet comes from the editor text, so
 * relative xsl:include/xsl:import and document() cannot be resolved.
 */
import { initSplit, type Output } from "@qiew/frame/split";
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

function run(src: string, stylesheet: string): Output {
  const xml = parseXml(src);
  if (typeof xml === "string") throw new Error(`XML ist nicht wohlgeformt: ${xml}`);
  const xsl = parseXml(stylesheet);
  if (typeof xsl === "string") throw new Error(`XSLT ist nicht wohlgeformt: ${xsl}`);

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
    throw new Error(`Transformation fehlgeschlagen: ${e instanceof Error ? e.message : e}`);
  }
  const ms = performance.now() - t0;

  const view = renderXml(out);
  const method = outputMethod(xsl);
  return {
    html: view.html,
    // Formatted if the result is XML.
    text: view.ok ? view.text : out,
    ext: method === "text" ? "txt" : method === "html" ? "html" : "xml",
    ms,
  };
}

/** Re-indents the stylesheet; text content (xsl:text, literal text) stays as written. */
function format(stylesheet: string): string {
  const view = renderXml(stylesheet, true);
  if (!view.ok) throw new Error(`XSLT ist nicht wohlgeformt: ${view.error}`);
  return view.text;
}

/** `source` returns the text of the open XML document, or null. */
export function initMapping(source: () => string | null) {
  initSplit({
    source,
    noSource: "Kein XML geladen.",
    initial: IDENTITY,
    run,
    format,
    loadFilter: { name: "XSLT", extensions: ["xsl", "xslt"] },
  });
}
