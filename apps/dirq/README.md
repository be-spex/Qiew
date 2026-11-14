# Dirq

**Diffs and patches, side by side – like a diff tool.**

Dirq (read: Dirk) shows a diff or patch file the way a diff tool would: old and new text next to each other,
the changed words marked, the files in a list on the left and the patch's own data – subject, author, message –
in a header on top.

say “Dirk” /dɜːk/ · part of [Qiew](../../README.md) and [be spex](https://be-spex.github.io) – small, focused apps for Linux

## Install

### With APT (Debian, Ubuntu, Linux Mint)

Once, add the be spex repository:

```sh
curl -fsSLO https://be-spex.github.io/packages/be-spex-archive-keyring.deb
sudo apt install ./be-spex-archive-keyring.deb && sudo apt update
```

Then:

```sh
sudo apt install dirq
```

Updates arrive with `sudo apt upgrade`.

### AppImage

Download `Dirq_*_amd64.AppImage` from the [latest Dirq release](https://github.com/be-spex/Qiew/releases?q=dirq-v),
make it executable (`chmod +x Dirq_*_amd64.AppImage`) and start it.

Dirq updates itself: it checks for a newer version and offers to replace the AppImage in place. That update
is built into Dirq and does not use zsync, so tools that rely on AppImageUpdate cannot update it.

An AppImage has no menu entry of its own. To get one (and a file association), use an AppImage manager such
as [Gear Lever](https://flathub.org/apps/it.mijorus.gearlever),
[AppImageLauncher](https://github.com/TheAssassin/AppImageLauncher) or
[appimaged](https://github.com/probonopd/go-appimage). With APT you get both without extra tools.

### Other ways

Take the `.deb` from the same release and run `sudo apt install ./dirq_*_amd64.deb`.

Requirements: Ubuntu 24.04+, Linux Mint 22+ or Debian 13+ (x86_64).

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
