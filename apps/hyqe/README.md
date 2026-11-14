# Hyqe

**HTML pages, shown as pages – without starting a browser.**

Hyqe shows an HTML file the way a browser would – styles, scripts and images next to it included – but starts in a
blink and is nothing more than a viewer: a report, a dashboard or a prototype an AI assistant wrote. One click
switches to the (coloured) source.

say “HY-kuh” /ˈhaɪkə/ · part of [Qiew](../../README.md) and [be spex](https://be-spex.github.io) – small, focused apps for Linux

## Install

### With APT (Debian, Ubuntu, Linux Mint)

Once, add the be spex repository:

```sh
curl -fsSLO https://be-spex.github.io/packages/be-spex-archive-keyring.deb
sudo apt install ./be-spex-archive-keyring.deb && sudo apt update
```

Then:

```sh
sudo apt install hyqe
```

Updates arrive with `sudo apt upgrade`.

### AppImage

Download `Hyqe_*_amd64.AppImage` from the [latest Hyqe release](https://github.com/be-spex/Qiew/releases?q=hyqe-v),
make it executable (`chmod +x Hyqe_*_amd64.AppImage`) and start it.

Hyqe updates itself: it checks for a newer version and offers to replace the AppImage in place. That update
is built into Hyqe and does not use zsync, so tools that rely on AppImageUpdate cannot update it.

An AppImage has no menu entry of its own. To get one (and a file association), use an AppImage manager such
as [Gear Lever](https://flathub.org/apps/it.mijorus.gearlever),
[AppImageLauncher](https://github.com/TheAssassin/AppImageLauncher) or
[appimaged](https://github.com/probonopd/go-appimage). With APT you get both without extra tools.

### Other ways

Take the `.deb` from the same release and run `sudo apt install ./hyqe_*_amd64.deb`.

Requirements: Ubuntu 24.04+, Linux Mint 22+ or Debian 13+ (x86_64).

## Features

- **A real page** – the file runs in a frame of its own origin, with JavaScript, the style sheets, scripts, fonts and
  images that lie next to it (relative paths work), and `localStorage`.
- **Kept apart** – the page cannot reach the app or files outside its project folder; web links open in your
  browser, never inside the viewer.
- **Source one click away** – the button in the toolbar (or Ctrl+U) shows the HTML with syntax colours; the
  line count and search work there too.
- **Live reload** – follows the file *and* every file the page loads (CSS, JS, images, also ones that appear
  later); F5 reloads by hand.
- **Colour of the page** – the toolbar takes the page's background colour, light or dark.
- **Search in the page** – Ctrl+F finds text in the rendered page (the engine's own find), in the source with
  highlights and match count.

Like every Qiew viewer: read-only, one file at a time, live reload, copy, About box, four colour schemes, and the
question whether it should become the default viewer.

## Usage

- **Open a file:** drag it onto the window, `hyqe page.html` or double-click. Hyqe handles `.html` and `.htm`;
  on first start it asks whether it should become your default viewer for them – note that this replaces your
  browser for local HTML files, so answer with care (you are asked once, the answer is kept).
- **Source:** the `</>` button or Ctrl+U. `--line <n>` opens the source at that line.
- **Not included:** printing, developer tools, downloads, forms that need a server.


## Try it

`example.html` next to `run.sh` shows the common cases:

```sh
apps/hyqe/run.sh apps/hyqe/example.html
```

## Working with CodeDeck

Hyqe stays a program of its own; [CodeDeck](https://github.com/be-spex) uses it the way it uses any viewer. The
common part (`--line`, `--geometry`, standard input, `--reuse`) is described in the [Qiew README](../../README.md#working-with-codedeck).

## License

MIT – see [LICENSE](../../LICENSE).
