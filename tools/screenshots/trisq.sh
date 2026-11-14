#!/bin/bash
# Takes the screenshots of Trisq: trisq-light.png and trisq-dark.png, 1720×1240 (860×620 at 2x).
#
#   tools/screenshots/trisq.sh [--readme] [--site [dir]] [--out <dir>]
#
# Unlike the other viewers, Trisq is photographed as the real app: what it shows runs in a frame
# served by its backend, which a browser alone cannot stand in for. Needs xvfb-run, xdotool and
# ImageMagick (import, convert); --site also cwebp. Light and dark are the system's colour
# preference, which the demo component follows.
set -e
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/.." && cd .. && pwd)
out=$here/out
readme=; site=
while [ $# -gt 0 ]; do
  case $1 in
    --readme) readme=1 ;;
    --site) site=$root/../be-spex.github.io; case ${2:-} in ""|--*) ;; *) site=$2; shift ;; esac ;;
    --out) out=$2; shift ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done
mkdir -p "$out"

(cd "$root" && npm run --silent tauri --workspace apps/trisq -- build --debug --no-bundle) >&2
# Where cargo builds to: target/ here, unless configured otherwise.
target=$(cd "$root" && cargo metadata --format-version 1 --no-deps | sed -n 's/.*"target_directory":"\([^"]*\)".*/\1/p')

W=1720; H=1240
shoot() { # <light|dark>
  local theme=$1 gtk=Adwaita
  [ "$theme" = dark ] && gtk=Adwaita:dark
  xvfb-run -a -s "-screen 0 2000x1400x24" env GDK_SCALE=2 GTK_THEME=$gtk \
      WEBKIT_DISABLE_COMPOSITING_MODE=1 WEBKIT_DISABLE_DMABUF_RENDERER=1 bash -c '
    "$0" "$1" >/dev/null 2>&1 & pid=$!
    sleep 7
    xdotool mousemove 1999 1399 # off the component, or a chart shows its tooltip
    sleep 1
    eval "$(xdotool search --class trisq | tail -1 | xargs xdotool getwindowgeometry --shell)"
    import -window root -crop "$3x$4+$X+$Y" +repage "$2"
    kill $pid
  ' "${target:-$root/target}/debug/trisq" "$here/demo/TrailStats.tsx" "$out/trisq-$theme.png" $W $H
  echo "$out/trisq-$theme.png"
}
for theme in light dark; do
  shoot $theme
  [ -n "$readme" ] && mkdir -p "$root/apps/trisq/docs/images" && cp "$out/trisq-$theme.png" "$root/apps/trisq/docs/images/"
  [ -n "$site" ] && cwebp -quiet -q 90 "$out/trisq-$theme.png" -o "$site/public/shots/trisq-$theme.webp"
done
exit 0
