#!/bin/bash
# Takes the screenshots of an app as the real app, light and dark: <app>-light.png, <app>-dark.png.
#
#   tools/screenshots/real.sh <app> <file> [--size WxH] [--readme] [--site [dir]] [--out <dir>]
#
# For Hyqe, Cusq and Dirq (and anything else whose window cannot be stood in for by a browser
# alone). <file> is shown; --size is the window in logical pixels (default 1160x780), the images
# are twice that. Needs xvfb-run, xdotool and ImageMagick (import); --site also cwebp.
set -e
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/.." && cd .. && pwd)
out=$here/out
app=$1; file=$2; shift 2
size=1160x780; readme=; site=
while [ $# -gt 0 ]; do
  case $1 in
    --size) size=$2; shift ;;
    --readme) readme=1 ;;
    --site) site=$root/../bespex.github.io; case ${2:-} in ""|--*) ;; *) site=$2; shift ;; esac ;;
    --out) out=$2; shift ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done
mkdir -p "$out"
file=$(realpath "$file")

(cd "$root" && npm run --silent tauri --workspace "apps/$app" -- build --debug --no-bundle) >&2
target=$(cd "$root" && cargo metadata --format-version 1 --no-deps | sed -n 's/.*"target_directory":"\([^"]*\)".*/\1/p')

w=${size%x*}; h=${size#*x}
W=$((w * 2)); H=$((h * 2))
shoot() { # <light|dark>
  local theme=$1 gtk=Adwaita
  [ "$theme" = dark ] && gtk=Adwaita:dark
  xvfb-run -a -s "-screen 0 $((W + 400))x$((H + 300))x24" env GDK_SCALE=2 GTK_THEME=$gtk \
      WEBKIT_DISABLE_COMPOSITING_MODE=1 WEBKIT_DISABLE_DMABUF_RENDERER=1 bash -c '
    "$0" --geometry "$5" "$1" >/dev/null 2>&1 & pid=$!
    sleep 7
    xdotool mousemove 1 1 # off the content, or a row shows its hover
    sleep 1
    eval "$(xdotool search --class "$6" | tail -1 | xargs xdotool getwindowgeometry --shell)"
    import -window root -crop "$3x$4+$X+$Y" +repage "$2"
    kill $pid
  ' "${target:-$root/target}/debug/$app" "$file" "$out/$app-$theme.png" $W $H "${W}x${H}+0+0" "$app"
  echo "$out/$app-$theme.png"
}
for theme in light dark; do
  shoot $theme
  [ -n "$readme" ] && mkdir -p "$root/apps/$app/docs/images" && cp "$out/$app-$theme.png" "$root/apps/$app/docs/images/"
  [ -n "$site" ] && cwebp -quiet -q 90 "$out/$app-$theme.png" -o "$site/public/shots/$app-$theme.webp"
done
exit 0
