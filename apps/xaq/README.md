# Xtaq

Read-only XML source viewer, binary `xtaq` (Tauri 2 + Vanilla TS). Sibling of [Marq](../Marq),
built on the same frame. It shows the *source*, nothing is rendered or executed.

- Open: drag & drop (any file), CLI argument (`xtaq pom.xml`), file association
  (`.xml`, `.wsdl`, `.xsd`, `.xsl`, `.xslt`; `.html`/`.xhtml` under "Open with" only)
- Pretty print: re-indented tree, namespaces/attributes/CDATA/comments/PIs/DOCTYPE highlighted;
  text content stays as written, mixed content (`<p>a <b>b</b></p>`) is kept on one line
- Fold: click the triangle (or the `…` of a folded node), Alt+click folds the whole subtree;
  toolbar buttons expand/collapse everything (the root stays open). Fold state survives a live reload
- Fallback: if the input is not well-formed XML (typically HTML), the original text is shown
  unchanged, only highlighted, with the parser's message in a banner
- Encodings: UTF-8, BOM (UTF-16/8), or the charset from the XML declaration (else Windows-1252)
- Live reload when another program changes the file (incl. atomic saves)
- Toolbar: back (left); element count (centre); fold/unfold, search, copy (formatted XML), colour scheme (right)
- Search: Ctrl+F, ↑/↓, Enter/Shift+Enter or F3; matches in folded nodes unfold them
- Colour schemes: Soft Light, Soft Dark, Sepia, Slate / Nord; the choice is kept
- Default handler on Linux: asks once on first start for XML; or run `xtaq --register-default`
- Zero-Touch: the backend only reads (`fs::read`), nothing is ever written

## Build

```sh
npm install
npm run tauri dev -- -- path/to/file.xml   # development
npm run tauri build                         # .deb/.rpm/AppImage (Linux), .msi (Windows), .dmg (macOS)
```

Layout: `src/xml.ts` (parse, pretty print, highlighting, raw fallback), `src/fold.ts` (folding),
`src/main.ts` (rendering, drag & drop, history), `src-tauri/src/lib.rs` (commands, decoding, watcher),
`src-tauri/tauri.conf.json` (window, CSP, file association).

The icons in `src-tauri/icons` are still Marq's; replace them before a release.
