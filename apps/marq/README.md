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
- Zero-Touch: the backend only uses `fs::read_to_string`, nothing is ever written (except the AppImage
  replacing itself when you accept an update)

## Install

`sudo apt install marq` from the [be-spex package repository](https://be-spex.github.io/packages/), or the
`.deb` / AppImage from the [releases](https://github.com/be-spex/Qiew/releases) (tags `marq-v…`).
See the [repository README](../../README.md) for details, building and releasing.

```sh
npm run tauri --workspace apps/marq -- dev -- -- path/to/file.md
```

Layout: `src/main.ts` (rendering, drag & drop, links), `src-tauri/src/lib.rs` (commands),
`src-tauri/tauri.conf.json` (window, CSP, asset scope, file association). Toolbar, search, colour schemes,
watcher and window handling come from the frame.
