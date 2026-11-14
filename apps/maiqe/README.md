# Maiqe

**Mermaid diagrams, drawn – straight from the text file.**

> **Not released yet.** The viewer works from source (`apps/maiqe/run.sh apps/maiqe/example.mmd`); there is no release
> and no package so far.

Maiqe draws the diagrams a Mermaid file describes: flowcharts, sequence, class and state diagrams, timelines and
the rest. Every diagram lies on a card of its own with its own zoom; the text is one click away. It follows the
file as an assistant or you write it.

say “MY-kuh” /ˈmaɪkə/ · part of [Qiew](../../README.md) and [be spex](https://be-spex.github.io) – small, focused apps for Linux

## Features

- **Every diagram type Mermaid knows** – Mermaid is part of Maiqe and draws offline; nothing in the file is run
  (`securityLevel: strict`).
- **Several diagrams in one file** – each gets a card with its number, title and type. Diagrams are told apart by
  their opening keyword (`flowchart`, `sequenceDiagram` …) or, in Markdown files, by their ```` ```mermaid ````
  fences; the title comes from front matter (`title:`), a `%% comment` above the diagram or the heading above
  the fence.
- **Zoom per diagram** – a small control on every card: − / + , the level (click for 100 %), fit to the card and
  fill the window. Ctrl+wheel or pinch zooms at the pointer, drag moves, double-click zooms in or fits again.
  Diagrams stay sharp at every level.
- **Text one click away** – the `</>` button or Ctrl+U shows the file's text; search (Ctrl+F) works there.
- **Errors where they are** – a diagram with a syntax error shows Mermaid's message on its card and, while you
  are editing, the last version that worked; the other diagrams are not affected.
- **Live reload** – follows the file; zoom and position of every card stay.
- **Colour schemes** – the diagrams follow the light or dark scheme of the window.
- **Export** – every card saves its diagram as SVG.

Like every Qiew viewer: read-only, one file at a time, copy, About box, and the question whether it should become
the default viewer for `.mmd` and `.mermaid`.

## Usage

- **Open a file:** drag it onto the window, `maiqe diagram.mmd`, or double-click. `--line <n>` shows the card of
  the diagram that line belongs to.
- **Keys** (for the card that has the focus or fills the window): `+` `−` zoom, `0` actual size, `F` fit, Enter
  fill the window, Esc back.

## Try it

`example.mmd` next to `run.sh` has two diagrams:

```sh
apps/maiqe/run.sh apps/maiqe/example.mmd
```

## Working with CodeDeck

Maiqe stays a program of its own; [CodeDeck](https://github.com/be-spex) uses it the way it uses any viewer. The
common part (`--line`, `--geometry`, standard input, `--reuse`) is described in the [Qiew README](../../README.md#working-with-codedeck).

## License

MIT – see [LICENSE](../../LICENSE). Diagrams are drawn by [Mermaid](https://mermaid.js.org) (MIT).
