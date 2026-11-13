# Screenshots

Takes the screenshots of Marq, Xaq and Jayq from their real frontends – for the websites and the READMEs –
so they can be redone whenever the look of an app changes.

```sh
node tools/screenshots/shoot.mjs                 # everything, light and dark, into tools/screenshots/out/
node tools/screenshots/shoot.mjs --shot jayq-split --theme nord
node tools/screenshots/shoot.mjs --readme --site # also into apps/<app>/docs/images/ and ../be-spex.github.io/public/shots/
```

| Option | |
| --- | --- |
| `--shot <name>` | only this image (repeatable); names are listed in `shots.mjs` |
| `--theme <name>` | `light`, `dark`, `sepia` or `nord` (repeatable); default light and dark |
| `--no-build` | use the existing `apps/<app>/dist` instead of building first |
| `--readme` | also copy the PNGs to `apps/<app>/docs/images/` |
| `--site [dir]` | also write WebP files (`cwebp`, package `webp`) to `<dir>/public/shots/` |
| `--out <dir>` | where the PNGs go |

## How it works

- `apps/<app>` is built and served as it is; a headless Chromium (DevTools protocol, Node 22, no extra
  packages) opens it at the window size in `shots.mjs`, at 2x. No display, no Tauri.
- `mock-tauri.js` replaces the Tauri runtime: it hands out the demo file from `demo/` and answers the few
  backend commands the frontends use.
- jq filters are not faked: they run in the real engine (`jayq --jq-worker`; set `JAYQ_BIN` to use a
  freshly built binary instead of the installed one).

## Changing or adding an image

- Content: edit the files in `demo/` – only invented data, nothing private.
- A new image: add an entry to `SHOTS` in `shots.mjs` (app, demo file, size, steps). `views` picks another
  colour scheme for a theme, e.g. `{ dark: "nord" }`.
- After a change of the look: run with `--readme --site`, check the images, then commit them in the repository
  of the app and of the website.

Image sizes must match `width`/`height` of the shot in `be-spex.github.io/src/data/apps.ts`: 1720×1240 for
the viewer, 2880×1240 for the split view.
