/**
 * Building blocks of a source view. Every piece of markup is built twice in
 * one go: as highlighted HTML (`h`) and as plain text (`t`), so "Copy" can
 * hand out the pretty-printed source.
 *
 * Everything that ends up in the DOM goes through `esc` first, so the result
 * can be assigned to innerHTML without further sanitising.
 */

export const INDENT = "  ";

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const escAttr = (s: string) => esc(s).replace(/"/g, "&quot;");

/** A fragment as highlighted HTML and as plain text. */
export interface S {
  h: string;
  t: string;
}

export const EMPTY: S = { h: "", t: "" };
export const cat = (...parts: S[]): S => ({
  h: parts.map((p) => p.h).join(""),
  t: parts.map((p) => p.t).join(""),
});
/** Literal display text `d` in a highlight class. */
export const lit = (cls: string, d: string): S => ({ h: `<span class="${cls}">${esc(d)}</span>`, t: d });
export const plain = (d: string): S => ({ h: esc(d), t: d });

/** One line of the view. */
export const line = (s: S, cls = "") => `<div class="ln${cls}">${s.h}</div>`;

/**
 * A foldable node: its opening line, the lines of its children (`inner`) and
 * its closing line. `path` identifies the node across re-renders (fold.ts);
 * the closing text is shown after the "…" while the node is folded.
 */
export function foldBlock(path: string, open: S, close: S, inner: string): string {
  return (
    `<div class="node" data-p="${path}">` +
    `<div class="ln open"><button class="tw" tabindex="-1" aria-label="Fold" aria-expanded="true"></button>` +
    `${open.h}<span class="ellip" data-close="${escAttr(close.t)}"></span></div>` +
    `<div class="kids">${inner}</div>` +
    `<div class="ln close">${close.h}</div>` +
    `</div>`
  );
}

/**
 * What a document looks like: pretty-printed (`text` is what "Copy" hands
 * out, `count` goes into the toolbar), or – if it could not be parsed – as
 * written, with the parser's message.
 */
export type ViewResult =
  | { ok: true; html: string; text: string; count: number }
  | { ok: false; html: string; lines: number; error: string };

/** The fallback view: `highlighted` is the source text as HTML. */
export function rawView(src: string, highlighted: string, error: string): ViewResult {
  return {
    ok: false,
    html: `<pre class="raw">${highlighted}</pre>`,
    lines: src === "" ? 0 : src.split("\n").length,
    error,
  };
}

const fmt = new Intl.NumberFormat("en");
export const formatNumber = (n: number) => fmt.format(n);
export const plural = (n: number, word: string) => `${fmt.format(n)} ${word}${n === 1 ? "" : "s"}`;
