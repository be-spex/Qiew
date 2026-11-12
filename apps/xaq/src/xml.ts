/**
 * XML source view. The document is parsed with the browser's own XML parser;
 * on success it is rebuilt as an indented, syntax-highlighted tree whose
 * elements can be folded. If the parser rejects the input (or it is HTML that
 * is not well-formed), the original text is shown unchanged, only highlighted.
 *
 * Everything that ends up in the DOM goes through `esc` first, so the result
 * can be assigned to innerHTML without further sanitising.
 *
 * Every piece of markup is built twice in one go: as highlighted HTML (`h`)
 * and as plain text (`t`), so "Copy" can hand out the pretty-printed source.
 */

const INDENT = "  ";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s: string) => esc(s).replace(/"/g, "&quot;");

export type ViewResult =
  | { ok: true; html: string; text: string; elements: number }
  | { ok: false; html: string; lines: number; error: string };

/** A fragment as highlighted HTML and as plain text. */
interface S {
  h: string;
  t: string;
}

const EMPTY: S = { h: "", t: "" };
const cat = (...parts: S[]): S => ({ h: parts.map((p) => p.h).join(""), t: parts.map((p) => p.t).join("") });
/** Literal display text `d` in a highlight class. */
const lit = (cls: string, d: string): S => ({ h: `<span class="${cls}">${esc(d)}</span>`, t: d });
const plain = (d: string): S => ({ h: esc(d), t: d });

const ENTITY = /(&(?:amp|lt|gt|quot);)/;
/** Escaped text with its predefined entities picked out. */
function rich(cls: string, escaped: string): S {
  const h = escaped
    .split(ENTITY)
    .map((p, i) => (i % 2 ? `<span class="x-ent">${p}</span>` : esc(p)))
    .join("");
  return { h: `<span class="${cls}">${h}</span>`, t: escaped };
}
/** Escapes `data` as XML text and highlights it. */
const textS = (data: string): S => (data ? rich("x-text", esc(data)) : EMPTY);

function nameS(qname: string, cls: string): S {
  const i = qname.indexOf(":");
  if (i < 0) return lit(cls, qname);
  return cat(lit("x-ns", qname.slice(0, i + 1)), lit(cls, qname.slice(i + 1)));
}

function openTag(el: Element, selfClose: boolean): S {
  const parts: S[] = [lit("x-p", "<"), nameS(el.tagName, "x-tag")];
  for (const a of Array.from(el.attributes)) {
    const decl = a.name === "xmlns" || a.name.startsWith("xmlns:");
    parts.push(
      plain(" "),
      decl ? lit("x-xmlns", a.name) : nameS(a.name, "x-attr"),
      lit("x-p", '="'),
      rich("x-val", escAttr(a.value)),
      lit("x-p", '"'),
    );
  }
  parts.push(lit("x-p", selfClose ? "/>" : ">"));
  return cat(...parts);
}

/** Closing tag; its name is also stored on the fold marker (see fold.ts). */
const closeTag = (el: Element): S => cat(lit("x-p", "</"), nameS(el.tagName, "x-tag"), lit("x-p", ">"));

const isText = (n: Node) => n.nodeType === Node.TEXT_NODE || n.nodeType === Node.CDATA_SECTION_NODE;

const commentS = (n: Node): S => lit("x-com", `<!--${n.nodeValue}-->`);
const piS = (n: ProcessingInstruction): S =>
  lit("x-pi", `<?${n.target}${n.data ? " " + n.data : ""}?>`);

/** Removes the indentation shared by all lines but the first (text was trimmed). */
function dedent(s: string): string {
  const lines = s.split("\n");
  let min = Infinity;
  for (const l of lines.slice(1)) {
    if (l.trim() === "") continue;
    min = Math.min(min, l.length - l.trimStart().length);
  }
  if (!isFinite(min) || min === 0) return s;
  return lines.map((l, i) => (i === 0 ? l : l.slice(Math.min(min, l.length - l.trimStart().length)))).join("\n");
}

class Builder {
  lines: string[] = [];
  elements = 0;

  /** Children on one line, in source order; used for text-only and mixed content. */
  inline(nodes: Node[], tidy: boolean): S {
    const last = nodes.length - 1;
    const parts: S[] = [];
    nodes.forEach((n, i) => {
      switch (n.nodeType) {
        case Node.TEXT_NODE: {
          let d = n.nodeValue ?? "";
          if (i === 0) d = d.trimStart();
          if (i === last) d = d.trimEnd();
          parts.push(textS(tidy ? dedent(d) : d));
          break;
        }
        case Node.CDATA_SECTION_NODE:
          parts.push(lit("x-cdata", `<![CDATA[${n.nodeValue}]]>`));
          break;
        case Node.COMMENT_NODE:
          parts.push(commentS(n));
          break;
        case Node.PROCESSING_INSTRUCTION_NODE:
          parts.push(piS(n as ProcessingInstruction));
          break;
        case Node.ELEMENT_NODE: {
          const el = n as Element;
          this.elements++;
          const kids = Array.from(el.childNodes);
          parts.push(
            kids.length === 0
              ? openTag(el, true)
              : cat(openTag(el, false), this.inline(kids, false), closeTag(el)),
          );
          break;
        }
      }
    });
    return cat(...parts);
  }

  private line(s: S, depth: number, cls = ""): string {
    // Continuation lines of multi-line text keep the source's own layout.
    this.lines.push(INDENT.repeat(depth) + s.t);
    return `<div class="ln${cls}">${s.h}</div>`;
  }

  /** A comment, processing instruction or other single "line" node. */
  leaf(s: S, depth: number): string {
    return this.line(s, depth);
  }

  element(el: Element, depth: number, path: string): string {
    this.elements++;
    const kids = Array.from(el.childNodes);

    if (kids.length === 0) return this.line(openTag(el, true), depth);

    const texts = kids.filter(isText);
    const others = kids.filter((n) => !isText(n));
    const realText = texts.some(
      (n) => n.nodeType === Node.CDATA_SECTION_NODE || (n.nodeValue ?? "").trim() !== "",
    );

    // Mixed content: the text is significant, so lay it out exactly as written.
    if (others.length > 0 && realText) {
      return this.line(cat(openTag(el, false), this.inline(kids, false), closeTag(el)), depth);
    }

    if (others.length === 0) {
      if (!realText) return this.line(cat(openTag(el, false), closeTag(el)), depth);
      const body = this.inline(kids, true);
      if (!body.t.includes("\n")) {
        return this.line(cat(openTag(el, false), body, closeTag(el)), depth);
      }
      // Multi-line text: foldable block with the text indented below the tag.
      return this.block(el, depth, path, () => {
        this.lines.push(...body.t.split("\n").map((l) => INDENT.repeat(depth + 1) + l));
        return `<div class="ln">${body.h}</div>`;
      });
    }

    // Element-only content: one child per line, foldable.
    return this.block(el, depth, path, () => {
      let html = "";
      kids.forEach((n, i) => {
        if (n.nodeType === Node.ELEMENT_NODE) html += this.element(n as Element, depth + 1, `${path}.${i}`);
        else if (n.nodeType === Node.COMMENT_NODE) html += this.leaf(commentS(n), depth + 1);
        else if (n.nodeType === Node.PROCESSING_INSTRUCTION_NODE)
          html += this.leaf(piS(n as ProcessingInstruction), depth + 1);
      });
      return html;
    });
  }

  private block(el: Element, depth: number, path: string, children: () => string): string {
    const open = openTag(el, false);
    const close = closeTag(el);
    this.lines.push(INDENT.repeat(depth) + open.t);
    const inner = children();
    this.lines.push(INDENT.repeat(depth) + close.t);
    return (
      `<div class="node" data-p="${path}">` +
      `<div class="ln open"><button class="tw" tabindex="-1" aria-label="Fold" aria-expanded="true"></button>` +
      `${open.h}<span class="ellip" data-close="${escAttr(close.t)}"></span></div>` +
      `<div class="kids">${inner}</div>` +
      `<div class="ln close">${close.h}</div>` +
      `</div>`
    );
  }
}

/** Extracts the first match of `re` from `src`; the DOM does not keep these parts. */
const XML_DECL = /^﻿?\s*(<\?xml\b[^?]*\?>)/;
const DOCTYPE = /<!DOCTYPE\b[^[>]*(?:\[[\s\S]*?\])?\s*>/i;

function parseErrorText(err: Element): string {
  const raw = (err.textContent ?? "").replace(/\s+/g, " ").trim();
  const m = raw.match(/error (?:on )?line \d+[^]*?(?= Below is a rendering|$)/i);
  return (m ? m[0] : raw).slice(0, 300);
}

/** Highlights text as written; tolerant, never fails (used when parsing fails). */
const TOKEN =
  /<!--[\s\S]*?(?:-->|$)|<!\[CDATA\[[\s\S]*?(?:\]\]>|$)|<\?[\s\S]*?(?:\?>|$)|<![\s\S]*?(?:>|$)|<\/?[A-Za-z_][^\s/>]*(?:"[^"]*"|'[^']*'|[^>"'])*>?|&#?\w+;/g;
const ATTR = /([^\s=/<>"']+)(\s*=\s*)("[^"]*"|'[^']*'|[^\s"'>]+)?/g;

function rawTag(tag: string): string {
  const m = tag.match(/^(<\/?)([^\s/>]+)([\s\S]*?)(\/?>)?$/);
  if (!m) return esc(tag);
  const [, open, name, attrs, end = ""] = m;
  const html = nameS(name, "x-tag").h;
  let rest = "";
  let last = 0;
  for (const a of attrs.matchAll(ATTR)) {
    rest += esc(attrs.slice(last, a.index));
    const attrName = a[1] === "xmlns" || a[1].startsWith("xmlns:") ? lit("x-xmlns", a[1]).h : nameS(a[1], "x-attr").h;
    rest += attrName + `<span class="x-p">${esc(a[2])}</span>`;
    if (a[3]) rest += `<span class="x-val">${esc(a[3])}</span>`;
    last = a.index + a[0].length;
  }
  rest += esc(attrs.slice(last));
  return `<span class="x-p">${esc(open)}</span>${html}${rest}<span class="x-p">${esc(end)}</span>`;
}

export function highlightRaw(src: string): string {
  let out = "";
  let last = 0;
  for (const m of src.matchAll(TOKEN)) {
    const tok = m[0];
    out += esc(src.slice(last, m.index));
    last = m.index + tok.length;
    if (tok.startsWith("<!--")) out += `<span class="x-com">${esc(tok)}</span>`;
    else if (tok.startsWith("<![CDATA[")) out += `<span class="x-cdata">${esc(tok)}</span>`;
    else if (tok.startsWith("<?")) out += `<span class="x-pi">${esc(tok)}</span>`;
    else if (tok.startsWith("<!")) out += `<span class="x-doctype">${esc(tok)}</span>`;
    else if (tok.startsWith("<")) out += rawTag(tok);
    else out += `<span class="x-ent">${esc(tok)}</span>`;
  }
  return out + esc(src.slice(last));
}

function raw(src: string, error: string): ViewResult {
  return {
    ok: false,
    html: `<pre class="raw">${highlightRaw(src)}</pre>`,
    lines: src === "" ? 0 : src.split("\n").length,
    error,
  };
}

/** Parses decoded XML text; returns the parser's message if it is not well-formed. */
export function parseXml(src: string): Document | string {
  // The text is already decoded; a declared charset (e.g. UTF-16) would only confuse the parser.
  const parseSrc = src.replace(/^(﻿?\s*<\?xml\b[^?]*?)\sencoding\s*=\s*("[^"]*"|'[^']*')/, "$1");
  const doc = new DOMParser().parseFromString(parseSrc, "application/xml");
  const err = doc.getElementsByTagNameNS("*", "parsererror")[0];
  return err ? parseErrorText(err) : doc;
}

export function renderXml(src: string): ViewResult {
  try {
    const doc = parseXml(src);
    if (typeof doc === "string") return raw(src, doc);

    const b = new Builder();
    let html = "";
    const decl = src.match(XML_DECL);
    if (decl) html += b.leaf(lit("x-pi", decl[1]), 0);

    Array.from(doc.childNodes).forEach((n, i) => {
      switch (n.nodeType) {
        case Node.DOCUMENT_TYPE_NODE: {
          const dt = n as DocumentType;
          html += b.leaf(lit("x-doctype", src.match(DOCTYPE)?.[0] ?? `<!DOCTYPE ${dt.name}>`), 0);
          break;
        }
        case Node.ELEMENT_NODE:
          html += b.element(n as Element, 0, String(i));
          break;
        case Node.COMMENT_NODE:
          html += b.leaf(commentS(n), 0);
          break;
        case Node.PROCESSING_INSTRUCTION_NODE:
          html += b.leaf(piS(n as ProcessingInstruction), 0);
          break;
      }
    });
    return { ok: true, html, text: b.lines.join("\n") + "\n", elements: b.elements };
  } catch (e) {
    return raw(src, `Interner Fehler: ${e}`);
  }
}
