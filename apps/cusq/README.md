# Cusq

**CSV and TSV files as a tidy table – no spreadsheet needed.**

Cusq lays a CSV or TSV file out as a table you can sort, filter and search. Whoever just wants to look at the
data does not have to start a spreadsheet program. The window takes the width the table needs.

say “Cask” /kɑːsk/ · part of [Qiew](../../README.md) and [be spex](https://be-spex.github.io) – small, focused apps for Linux

## Install

### With APT (Debian, Ubuntu, Linux Mint)

Once, add the be spex repository:

```sh
curl -fsSLO https://be-spex.github.io/packages/be-spex-archive-keyring.deb
sudo apt install ./be-spex-archive-keyring.deb && sudo apt update
```

Then:

```sh
sudo apt install cusq
```

Updates arrive with `sudo apt upgrade`.

### AppImage

Download `Cusq_*_amd64.AppImage` from the [latest Cusq release](https://github.com/be-spex/Qiew/releases?q=cusq-v),
make it executable (`chmod +x Cusq_*_amd64.AppImage`) and start it.

Cusq updates itself: it checks for a newer version and offers to replace the AppImage in place. That update
is built into Cusq and does not use zsync, so tools that rely on AppImageUpdate cannot update it.

An AppImage has no menu entry of its own. To get one (and a file association), use an AppImage manager such
as [Gear Lever](https://flathub.org/apps/it.mijorus.gearlever),
[AppImageLauncher](https://github.com/TheAssassin/AppImageLauncher) or
[appimaged](https://github.com/probonopd/go-appimage). With APT you get both without extra tools.

### Other ways

Take the `.deb` from the same release and run `sudo apt install ./cusq_*_amd64.deb`.

Requirements: Ubuntu 24.04+, Linux Mint 22+ or Debian 13+ (x86_64).

## Features

- **Reads what people write** – comma, semicolon, tab or pipe (detected), quotes, doubled quotes, line breaks
  inside cells, byte order mark, UTF-8/UTF-16/Windows-1252.
- **Numbers and dates as such** – a column with only numbers is right-aligned, shows the same count of decimals
  in every row and, for quantities, thousands separators (postcodes, identifiers and numbers with leading zeros
  stay as written). Dates (`2026-11-14`, `14.11.2026`, with time) show in your language and sort by time.
- **Sort** – click a column heading: ascending, descending, back to file order; numbers by value, text
  naturally, empty cells last.
- **Filter** – a field under every heading: `text` (contains), `=exact`, `!not`, `>5` `<=10` (also for dates),
  `/regex/`. Combine filters across columns.
- **Full text search** – Ctrl+F searches all cells, shows only matching rows and marks the hits.
- **Large files** – only the rows in view are drawn.
- **Export** – the table as shown (filtered, sorted) as CSV, never over the file shown.

Like every Qiew viewer: read-only, one file at a time, live reload, copy, About box, four colour schemes, and the
question whether it should become the default viewer.

## Usage

- **Open a file:** drag it onto the window, `cusq data.csv` or double-click. Cusq handles `.csv` and `.tsv`.
- **Header row:** the first row is the header; the toolbar button switches that off (columns are then A, B, C …).
- **Rows:** click selects a row, Ctrl+C copies it (tab separated). The toolbar's funnel clears filters, sorting
  and search. `--line <n>` marks that line of the file.


## Try it

`example.csv` next to `run.sh` shows the common cases:

```sh
apps/cusq/run.sh apps/cusq/example.csv
```

## Working with CodeDeck

Cusq stays a program of its own; [CodeDeck](https://github.com/be-spex) uses it the way it uses any viewer. The
common part (`--line`, `--geometry`, standard input, `--reuse`) is described in the [Qiew README](../../README.md#working-with-codedeck).

## License

MIT – see [LICENSE](../../LICENSE).
