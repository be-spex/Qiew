# Qiew

Quick viewers for Linux: small, read-only, one file at a time. They open what you drop on them or
double-click, show it nicely, follow the file when it changes – and never write to it.

| App | Shows | |
| --- | --- | --- |
| [Marq](apps/marq) | Markdown, rendered | links, images, back/forward |
| [Xaq](apps/xaq) | XML source, pretty-printed and foldable | XSLT mapping view |
| [Jayq](apps/jayq) | JSON source, pretty-printed and foldable | jq filter view |

All of them: search (Ctrl+F), copy, four colour schemes, live reload, file association.

## Install

With APT (Debian, Ubuntu, Mint) from the [be-spex package repository](https://be-spex.github.io/packages/):

```sh
sudo apt install marq xaq jayq
```

Or take the `.deb` or the AppImage (x86_64) of an app from the [releases](https://github.com/be-spex/Qiew/releases);
the AppImage runs as it is and offers updates itself. Both are built on Ubuntu 24.04 (glibc 2.39:
Ubuntu 24.04+, Linux Mint 22+, Debian 13+).

## Build

Tauri 2 + Vanilla TypeScript; one npm workspace and one Cargo workspace for all apps.

```sh
npm install
npm run tauri --workspace apps/xaq -- dev -- -- path/to/file.xml   # development
npm run tauri --workspace apps/xaq -- build                        # .deb and AppImage (Linux)
npm run check                                                       # type-check and build everything
```

## Layout

```
apps/<app>/            an app: index.html, src/ (frontend), src-tauri/ (backend, window, bundle)
packages/frame/        @qiew/frame – frontend shared by the apps
crates/frame/          qiew-frame – backend shared by the apps
.github/workflows/     release.yml: builds and publishes one app per tag
```

The frame is what makes a new viewer cheap:

- `packages/frame`: colour schemes (`views`), toolbar and copy (`toolbar`), search (`search`), page and
  toolbar styles (`base.css`); for source views also the markup fragments (`fragment`), folding (`fold`),
  the viewer itself – open, drop, live reload, history – (`viewer`), the split view with editor and result
  (`split`) and their styles (`source.css`). An app adds its parser and highlighter.
- `crates/frame`: window placement and widening, file watcher, reading text in any encoding,
  default-handler registration, moving the directories of an old identifier, AppImage update check.

## Release

Each app has its own version and its own tag. Bump the version in `apps/<app>/package.json`,
`apps/<app>/src-tauri/tauri.conf.json` and `apps/<app>/src-tauri/Cargo.toml`, commit, then

```sh
git tag xaq-v0.3.1 && git push origin xaq-v0.3.1
```

[`release.yml`](.github/workflows/release.yml) builds the app, publishes the release `xaq-v0.3.1` and
updates `xaq.json` in the release `updater`, which is where the AppImages look for a newer version.
The package repository picks up the `.deb` within half an hour.

Marq and Xaq started in repositories of their own; their history is part of this one (tags `marq-v*`, `xaq-v*`).
