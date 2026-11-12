/**
 * JSON source view. The text is parsed by a small parser of its own instead
 * of JSON.parse, because the view shows the source: numbers keep their
 * spelling (`1.0`, `1e3`, integers beyond 2^53), strings their escapes,
 * objects their key order and duplicate keys. Several values in a row
 * (JSON Lines, the output of jq) are shown one after the other.
 *
 * On success the document is rebuilt as an indented, syntax-highlighted tree
 * whose objects and arrays can be folded. If it is not valid JSON, the
 * original text is shown unchanged, only highlighted.
 *
 * The markup is built from the frame's fragments (HTML and plain text at once).
 */
import {
  EMPTY, INDENT, cat, esc, foldBlock, line, lit, rawView,
  type S, type ViewResult,
} from "@qiew/frame/fragment";

type Node =
  | { kind: "object"; entries: { key: string; value: Node }[] }
  | { kind: "array"; items: Node[] }
  /** `raw` is the token as written, e.g. `"a\nb"`, `1.50`, `null`. */
  | { kind: "string" | "number" | "literal"; raw: string };

class ParseError extends Error {
  constructor(public pos: number, message: string) {
    super(message);
  }
}

const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
const LITERAL = /true|false|null/y;
const WS = /[ \t\n\r]*/y;
/** Everything up to the closing quote; control characters must be escaped. */
const STRING = /"(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"/y;

class Parser {
  i = 0;
  constructor(private src: string) {}

  private match(re: RegExp): string | null {
    re.lastIndex = this.i;
    const m = re.exec(this.src);
    if (!m) return null;
    this.i += m[0].length;
    return m[0];
  }

  skipWs() {
    this.match(WS);
  }

  atEnd() {
    return this.i >= this.src.length;
  }

  private fail(expected: string): never {
    const found = this.atEnd() ? "das Ende des Textes" : `„${this.src[this.i]}“`;
    throw new ParseError(this.i, `${expected} erwartet, aber ${found} gefunden`);
  }

  private string(what: string): string {
    const start = this.i;
    const s = this.match(STRING);
    if (s !== null) return s;
    if (this.src[start] !== '"') this.fail(what);
    // Find out what is wrong with the string, for the message.
    for (let j = start + 1; j < this.src.length; j++) {
      const c = this.src[j];
      if (c === '"') break;
      if (c < " ") throw new ParseError(j, "Steuerzeichen (z. B. Zeilenumbruch) in einer Zeichenkette; es muss maskiert sein");
      if (c === "\\") {
        const m = /^\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4})/.exec(this.src.slice(j, j + 6));
        if (!m) throw new ParseError(j, "ungültige Escape-Sequenz in einer Zeichenkette");
        j += m[0].length - 1;
      }
    }
    throw new ParseError(start, "die Zeichenkette wird nicht geschlossen");
  }

  value(): Node {
    this.skipWs();
    const c = this.src[this.i];
    if (c === "{") {
      this.i++;
      const entries: { key: string; value: Node }[] = [];
      this.skipWs();
      if (this.src[this.i] === "}") {
        this.i++;
        return { kind: "object", entries };
      }
      for (;;) {
        this.skipWs();
        const key = this.string("Schlüssel (Zeichenkette)");
        this.skipWs();
        if (this.src[this.i] !== ":") this.fail("„:“");
        this.i++;
        entries.push({ key, value: this.value() });
        this.skipWs();
        const sep = this.src[this.i];
        if (sep === ",") this.i++;
        else if (sep === "}") {
          this.i++;
          return { kind: "object", entries };
        } else this.fail("„,“ oder „}“");
      }
    }
    if (c === "[") {
      this.i++;
      const items: Node[] = [];
      this.skipWs();
      if (this.src[this.i] === "]") {
        this.i++;
        return { kind: "array", items };
      }
      for (;;) {
        items.push(this.value());
        this.skipWs();
        const sep = this.src[this.i];
        if (sep === ",") this.i++;
        else if (sep === "]") {
          this.i++;
          return { kind: "array", items };
        } else this.fail("„,“ oder „]“");
      }
    }
    if (c === '"') return { kind: "string", raw: this.string("Wert") };
    const number = this.match(NUMBER);
    if (number !== null) return { kind: "number", raw: number };
    const literal = this.match(LITERAL);
    if (literal !== null) return { kind: "literal", raw: literal };
    this.fail("Wert");
  }
}

/** All values of a JSON text (usually one). Throws a ParseError. */
function parse(src: string): Node[] {
  const p = new Parser(src);
  const values: Node[] = [];
  if (src.startsWith("﻿")) p.i = 1;
  p.skipWs();
  while (!p.atEnd()) {
    values.push(p.value());
    p.skipWs();
  }
  return values;
}

const ESCAPE = /(\\(?:u[0-9a-fA-F]{4}|.))/;
/** A string token with its escape sequences picked out. */
function stringS(raw: string, cls: string): S {
  const h = raw
    .split(ESCAPE)
    .map((p, i) => (i % 2 ? `<span class="j-esc">${esc(p)}</span>` : esc(p)))
    .join("");
  return { h: `<span class="${cls}">${h}</span>`, t: raw };
}

const punct = (d: string) => lit("x-p", d);
const COMMA = punct(",");

class Builder {
  lines: string[] = [];
  values = 0;

  private line(s: S, depth: number): string {
    this.lines.push(INDENT.repeat(depth) + s.t);
    return line(s);
  }

  /** `prefix` is the key of an object member (`"name": `), `comma` follows unless it is the last one. */
  value(node: Node, depth: number, path: string, prefix: S, comma: boolean): string {
    this.values++;
    const end = comma ? COMMA : EMPTY;
    switch (node.kind) {
      case "string":
        return this.line(cat(prefix, stringS(node.raw, "j-str"), end), depth);
      case "number":
        return this.line(cat(prefix, lit("j-num", node.raw), end), depth);
      case "literal":
        return this.line(cat(prefix, lit("j-lit", node.raw), end), depth);
      case "object": {
        const n = node.entries.length;
        if (n === 0) return this.line(cat(prefix, punct("{}"), end), depth);
        return this.block(cat(prefix, punct("{")), cat(punct("}"), end), depth, path, () =>
          node.entries
            .map((e, i) =>
              this.value(e.value, depth + 1, `${path}.${i}`, cat(stringS(e.key, "j-key"), punct(": ")), i < n - 1),
            )
            .join(""),
        );
      }
      case "array": {
        const n = node.items.length;
        if (n === 0) return this.line(cat(prefix, punct("[]"), end), depth);
        return this.block(cat(prefix, punct("[")), cat(punct("]"), end), depth, path, () =>
          node.items.map((v, i) => this.value(v, depth + 1, `${path}.${i}`, EMPTY, i < n - 1)).join(""),
        );
      }
    }
  }

  private block(open: S, close: S, depth: number, path: string, children: () => string): string {
    this.lines.push(INDENT.repeat(depth) + open.t);
    const inner = children();
    this.lines.push(INDENT.repeat(depth) + close.t);
    return foldBlock(path, open, close, inner);
  }
}

/** Highlights text as written; tolerant, never fails (used when parsing fails). */
const TOKEN = /"(?:[^"\\\n]|\\.)*"?|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\b(?:true|false|null)\b|[{}[\],:]/g;

export function highlightRaw(src: string): string {
  let out = "";
  let last = 0;
  for (const m of src.matchAll(TOKEN)) {
    const tok = m[0];
    out += esc(src.slice(last, m.index));
    last = m.index + tok.length;
    if (tok.startsWith('"')) {
      const isKey = /^\s*:/.test(src.slice(last, last + 20));
      out += stringS(tok, isKey ? "j-key" : "j-str").h;
    } else if (/^[-\d]/.test(tok)) out += lit("j-num", tok).h;
    else if (/^[a-z]/.test(tok)) out += lit("j-lit", tok).h;
    else out += punct(tok).h;
  }
  return out + esc(src.slice(last));
}

function lineAndColumn(src: string, pos: number): string {
  const before = src.slice(0, pos);
  const lineNo = before.split("\n").length;
  const col = pos - (before.lastIndexOf("\n") + 1) + 1;
  return `Zeile ${lineNo}, Spalte ${col}`;
}

export function renderJson(src: string): ViewResult {
  let values: Node[];
  try {
    values = parse(src);
  } catch (e) {
    const message =
      e instanceof ParseError
        ? `${lineAndColumn(src, e.pos)}: ${e.message}.`
        : e instanceof RangeError
          ? "Zu tief verschachtelt."
          : `Interner Fehler: ${e}`;
    return rawView(src, highlightRaw(src), message);
  }
  const b = new Builder();
  const html = values.map((v, i) => b.value(v, 0, String(i), EMPTY, false)).join("");
  return { ok: true, html, text: b.lines.length ? b.lines.join("\n") + "\n" : "", count: b.values };
}
