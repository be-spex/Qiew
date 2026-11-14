# Cusq

**CSV and TSV files as a tidy table – no spreadsheet needed.**

> **Not released yet.** The viewer works from source (`apps/cusq/run.sh apps/cusq/example.csv`); there is no release and no
> package so far.

Cusq lays a CSV or TSV file out as a table you can sort, filter and search. Whoever just wants to look at the
data does not have to start a spreadsheet program. The window takes the width the table needs.

say “Cask” /kɑːsk/ · part of [Qiew](../../README.md) and [be spex](https://be-spex.github.io) – small, focused apps for Linux

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
