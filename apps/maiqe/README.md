# Maiqe

**Mermaid diagrams, drawn – straight from the text file.**

Maiqe draws the diagrams a Mermaid file describes: flowcharts, sequence, class and state diagrams, timelines and
the rest. Every diagram lies on a card of its own with its own zoom; the text is one click away. It follows the
file as an assistant or you write it.

say “MY-kuh” /ˈmaɪkə/ · part of [Qiew](../../README.md) and [be spex](https://be-spex.github.io) – small, focused apps for Linux

## Install

### With APT (Debian, Ubuntu, Linux Mint)

Once, add the be spex repository:

```sh
curl -fsSLO https://be-spex.github.io/packages/be-spex-archive-keyring.deb
sudo apt install ./be-spex-archive-keyring.deb && sudo apt update
```

Then:

```sh
sudo apt install maiqe
```

Updates arrive with `sudo apt upgrade`.

### AppImage

Download `Maiqe_*_amd64.AppImage` from the [latest Maiqe release](https://github.com/be-spex/Qiew/releases?q=maiqe-v),
make it executable (`chmod +x Maiqe_*_amd64.AppImage`) and start it.

Maiqe updates itself: it checks for a newer version and offers to replace the AppImage in place. That update
is built into Maiqe and does not use zsync, so tools that rely on AppImageUpdate cannot update it.

An AppImage has no menu entry of its own. To get one (and a file association), use an AppImage manager such
as [Gear Lever](https://flathub.org/apps/it.mijorus.gearlever),
[AppImageLauncher](https://github.com/TheAssassin/AppImageLauncher) or
[appimaged](https://github.com/probonopd/go-appimage). With APT you get both without extra tools.

### Other ways

Take the `.deb` from the same release and run `sudo apt install ./maiqe_*_amd64.deb`.

Requirements: Ubuntu 24.04+, Linux Mint 22+ or Debian 13+ (x86_64).

## Features

- **Every diagram type Mermaid knows** – Mermaid is part of Maiqe and draws offline; nothing in the file is run
  (`securityLevel: strict`).
- **Same drawing as Marq** – Marq draws the diagrams of a Markdown file in the text and hands one over to
  Maiqe with a click, at that diagram.
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
