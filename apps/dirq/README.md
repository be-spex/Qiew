# Dirq

**Diffs and patches, side by side – like a diff tool.**

> **Not released yet.** The viewer works from source (`apps/dirq/run.sh apps/dirq/example.patch`); there is no release and no
> package so far.

Dirq (read: Dirk) shows a diff or patch file the way a diff tool would: old and new text next to each other,
the changed words marked, the files in a list on the left and the patch's own data – subject, author, message –
in a header on top.

say “Dirk” /dɜːk/ · part of [Qiew](../../README.md) and [be spex](https://be-spex.github.io) – small, focused apps for Linux

## Features

- **Side by side or unified** – switch in the toolbar; the choice is kept. Changed words are marked inside
  changed lines; removed and added blocks line up row by row.
- **A header for the patch** – subject, author, date and commit, the message, trailers (`Co-Authored-By`,
  `Reviewed-by` …) and the totals as numbers and a bar.
- **Files at a glance** – list with status (modified, added, deleted, renamed, copied), `+`/`−` counts and the
  common folder cut off; click to jump. Files fold; very long ones start folded.
- **Navigate the changes** – F7 / Shift+F7 or the arrows jump to the next or previous change.
- **Ignore whitespace** – changes in blanks only show as unchanged.
- **Formats** – `git diff`, `git format-patch`, IntelliJ IDEA "Create Patch", Subversion and plain `diff -u`:
  renames, mode changes, binary files, "no newline at end of file". What is not a unified diff is shown as written.
- **Search, copy, export** – Ctrl+F; copy the patch text; export the view as one HTML file.

Like every Qiew viewer: read-only, one file at a time, live reload, copy, About box, four colour schemes, and the
question whether it should become the default viewer.

## Usage

- **Open a file:** drag it onto the window, `dirq change.patch`, `git diff | dirq -` or double-click. Dirq
  handles `.diff` and `.patch`. `--line <n>` shows that line of the patch file.
- **Keys:** F7 / Shift+F7 next / previous change, Ctrl+F search.


## Try it

`example.patch` next to `run.sh` shows the common cases:

```sh
apps/dirq/run.sh apps/dirq/example.patch
```

## Working with CodeDeck

Dirq stays a program of its own; [CodeDeck](https://github.com/be-spex) uses it the way it uses any viewer. The
common part (`--line`, `--geometry`, standard input, `--reuse`) is described in the [Qiew README](../../README.md#working-with-codedeck).

## License

MIT – see [LICENSE](../../LICENSE).
