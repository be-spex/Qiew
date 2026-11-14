#!/bin/bash
# Takes the screenshots of Tusq: tusq-light.png and tusq-dark.png, 1720×1240 (860×620 at 2x).
#
#   tools/screenshots/tusq.sh [--readme] [--site [dir]] [--out <dir>]
#
# Unlike the other viewers, Tusq is photographed as the real app: what it shows runs in a frame
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

(cd "$root" && npm run --silent tauri --workspace apps/tusq -- build --debug --no-bundle) >&2

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
    eval "$(xdotool search --class tusq | tail -1 | xargs xdotool getwindowgeometry --shell)"
    import -window root -crop "$3x$4+$X+$Y" +repage "$2"
    kill $pid
  ' "$root/target/debug/tusq" "$here/demo/TrailStats.tsx" "$out/tusq-$theme.png" $W $H
  echo "$out/tusq-$theme.png"
}
for theme in light dark; do
  shoot $theme
  [ -n "$readme" ] && mkdir -p "$root/apps/tusq/docs/images" && cp "$out/tusq-$theme.png" "$root/apps/tusq/docs/images/"
  [ -n "$site" ] && cwebp -quiet -q 90 "$out/tusq-$theme.png" -o "$site/public/shots/tusq-$theme.webp"
done
exit 0
