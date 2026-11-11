# Marq

Read-only Markdown viewer, binary `marq` (Tauri 2 + Vanilla TS + markdown-it + github-markdown-css).

- Open: drag & drop, CLI argument (`marq README.md`), file association (`.md`, `.markdown`)
- Default handler on Linux: asks once on first start; or run `marq --register-default`
  (uses `xdg-mime`, works on Cinnamon, KDE, GNOME)
- Live reload when another program changes the file (incl. atomic saves)
- Toolbar: back (left); character/word count (centre); search, copy, colour scheme (right)
- Back/forward through followed links: toolbar, context menu, Alt+←/→, mouse buttons
- Colour schemes: Soft Light, Soft Dark, Sepia, Slate / Nord; the choice is kept
- Search: Ctrl+F or toolbar icon; ↑/↓, Enter/Shift+Enter or F3 step from the visible area, Esc closes
- Zero-Touch: the backend only uses `fs::read_to_string`, nothing is ever written

```sh
npm install
npm run tauri dev -- -- path/to/file.md   # development
npm run tauri build                         # .deb/.rpm/AppImage (Linux), .msi (Windows), .dmg (macOS)
```

Layout: `src-tauri/src/lib.rs` (commands + watcher), `src/main.ts` (rendering, drag & drop, links),
`src-tauri/tauri.conf.json` (window, CSP, asset scope, file association).
