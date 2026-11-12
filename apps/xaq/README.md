# Xaq (read: Zack)

Read-only XML source viewer, binary `xaq` (Tauri 2 + Vanilla TS). Sibling of [Marq](https://github.com/Skrrytch/Marq),
built on the same frame. It shows the *source*, nothing is rendered or executed – except an XSLT you run
yourself in the mapping view.

- Open: drag & drop (any file), CLI argument (`xaq pom.xml`), file association
  (`.xml`, `.wsdl`, `.xsd`, `.xsl`, `.xslt`; `.html`/`.xhtml` under "Open with" only)
- Pretty print: re-indented tree, namespaces/attributes/CDATA/comments/PIs/DOCTYPE highlighted;
  text content stays as written, mixed content (`<p>a <b>b</b></p>`) is kept on one line
- Fold: click the triangle (or the `…` of a folded node), Alt+click folds the whole subtree;
  toolbar buttons expand/collapse everything (the root stays open). Fold state survives a live reload
- Fallback: if the input is not well-formed XML (typically HTML), the original text is shown
  unchanged, only highlighted, with the parser's message in a banner
- Encodings: UTF-8, BOM (UTF-16/8), or the charset from the XML declaration (else Windows-1252)
- Live reload when another program changes the file (incl. atomic saves)
- Toolbar: back (left); element count and mapping view (centre); fold/unfold, search, copy (formatted XML),
  colour scheme (right)
- XSLT mapping: the button next to the element count widens the window to the full screen width and splits it
  into XML | XSLT | Transformed XML. The XSLT column starts with an identity transform, is editable
  (Tab indents), can load a stylesheet file and pretty-print it (text content such as `xsl:text` stays as
  written); Run or Ctrl+Enter runs the transformation, the result column shows the output and the duration
  and can save it to a file or copy it to the clipboard. Engine is the webview's XSLTProcessor (libxslt, XSLT 1.0); since the
  stylesheet comes from the editor, relative `xsl:include`/`xsl:import` and `document()` are not resolved.
  Clicking the button again restores the previous window size and the previous position in the XML
- Search: Ctrl+F, ↑/↓, Enter/Shift+Enter or F3; matches in folded nodes unfold them
- Colour schemes: Soft Light, Soft Dark, Sepia, Slate / Nord; the choice is kept
- Default handler on Linux: asks once on first start for XML; or run `xaq --register-default`
- Zero-Touch: the files shown are only read (`fs::read`), never written; the only write is saving a
  mapping result to a file chosen in the save dialog

## Install

Packages for x86_64 are attached to each [release](https://github.com/Skrrytch/Xaq/releases)
(built against glibc 2.39: Ubuntu 24.04+, Debian 13+, Fedora 40+, current Arch).

```sh
# Debian / Ubuntu
sudo apt install ./Xaq_0.3.0_amd64.deb

# Fedora / openSUSE
sudo dnf install ./Xaq-0.3.0-1.x86_64.rpm
```

## Build

```sh
npm install
npm run tauri dev -- -- path/to/file.xml   # development
npm run tauri build                         # .deb/.rpm/AppImage (Linux), .msi (Windows), .dmg (macOS)
```

Layout: `src/xml.ts` (parse, pretty print, highlighting, raw fallback), `src/fold.ts` (folding),
`src/main.ts` (rendering, drag & drop, history),
`src/mapping.ts` (XSLT mapping view), `src/scroll.ts` (scrolling in either layout), `src-tauri/src/lib.rs` (commands, decoding, watcher),
`src-tauri/tauri.conf.json` (window, CSP, file association).

The app icon's SVG source is `src-tauri/icons/icon.svg`.
