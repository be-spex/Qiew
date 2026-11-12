# Jayq (read: Jake)

Read-only JSON source viewer with a jq filter view, binary `jayq` (Tauri 2 + Vanilla TS). Sibling of
[Xaq](../xaq) and [Marq](../marq), built on the same frame. It shows the *source*: nothing is evaluated –
except a jq filter you run yourself.

- Open: drag & drop (any file), CLI argument (`jayq data.json`), file association
  (`.json`, `.jsonl`, `.ndjson`, `.geojson`)
- Pretty print: re-indented tree with keys, strings, numbers and literals highlighted. Values stay as
  written: numbers keep their spelling (`1.0`, `1e3`, integers beyond 2^53), strings their escapes,
  objects their key order and duplicate keys
- Several values in one file (JSON Lines, the output of jq) are shown one after the other
- Fold: click the triangle (or the `…` of a folded node), Alt+click folds the whole subtree;
  toolbar buttons expand/collapse everything (the outermost level stays open). Fold state survives a live reload
- Fallback: if the input is not valid JSON (comments, trailing commas, single quotes …), the original text
  is shown unchanged, only highlighted, with line, column and what was expected in a banner
- Encodings: UTF-8, or UTF-16/UTF-8 with BOM
- Live reload when another program changes the file (incl. atomic saves)
- Toolbar: value count and filter view (centre); fold/unfold, search, copy (formatted JSON),
  colour scheme (right)
- jq filter: the button next to the value count widens the window to the full screen width and splits it
  into JSON | jq | Result. The jq column starts with the identity filter `.`, is editable (Tab indents) and
  can load a `.jq` file; Run or Ctrl+Enter applies the filter, the result column shows the outputs and the
  duration and can save them to a file or copy them to the clipboard. As with jq, the filter is applied to
  every value of the input and may yield any number of outputs.
  Clicking the button again restores the previous window size and the previous position in the JSON
- Search: Ctrl+F, ↑/↓, Enter/Shift+Enter or F3; matches in folded nodes unfold them
- Colour schemes: Soft Light, Soft Dark, Sepia, Slate / Nord; the choice is kept
- Default handler on Linux: asks once on first start for JSON; or run `jayq --register-default`
- Zero-Touch: the files shown are only read (`fs::read`), never written; the only write is saving a
  filter result to a file chosen in the save dialog (and the AppImage replacing itself when you accept an update)

## The jq engine

The filter runs in [jaq](https://github.com/01mf02/jaq), a jq implementation in Rust that is built into
`jayq` – no `jq` needs to be installed. jaq covers the jq language and nearly all of its standard library;
its README lists the differences, which are in corner cases.
Numbers pass through unchanged (`1.50` stays `1.50`, large integers keep all digits). Not available:
`input`/`inputs`, `$ENV`, modules and command-line options such as `--slurp` or `--arg`.

A filter never runs inside the viewer: `jayq` starts itself a second time as a worker
(`jayq --jq-worker <filter>`, JSON on stdin). A filter that does not end is stopped after 10 seconds or as
soon as the next run starts, endless recursion only takes the worker down, and more than 64 MB of output
is not shown.

## Install

`sudo apt install jayq` from the [be-spex package repository](https://be-spex.github.io/packages/), or the
`.deb` / AppImage from the [releases](https://github.com/be-spex/Qiew/releases) (tags `jayq-v…`).
See the [repository README](../../README.md) for details, building and releasing.

```sh
npm run tauri --workspace apps/jayq -- dev -- -- path/to/file.json
```

Layout: `src/json.ts` (parse, pretty print, highlighting, raw fallback), `src/filter.ts` (jq for the split
view), `src/main.ts` (wiring), `src-tauri/src/jq.rs` (jq engine, worker process), `src-tauri/src/lib.rs`
(commands), `src-tauri/tauri.conf.json` (window, CSP, file association). Everything else comes from the frame.

The app icon's SVG source is `src-tauri/icons/icon.svg`.
