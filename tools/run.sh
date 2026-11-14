#!/bin/sh
# Builds an app as it is in the working tree and starts it:
#
#   tools/run.sh <app> [--release] [file]      (or apps/<app>/run.sh [--release] [file])
#
# Without --release a debug build (quick to build; never asks to become the
# default viewer), with it the optimized build that is also packaged.
# Both carry their frontend with them, no dev server is needed.
set -e
root=$(cd "$(dirname "$0")/.." && pwd)
app=$1
[ -d "$root/apps/$app/src-tauri" ] || { echo "usage: $0 <app> [--release] [file]" >&2; exit 2; }
shift

profile=debug
if [ "$1" = --release ]; then
  profile=release
  shift
fi

(
  cd "$root"
  if [ "$profile" = release ]; then
    npm run --silent tauri --workspace "apps/$app" -- build --no-bundle
  else
    npm run --silent tauri --workspace "apps/$app" -- build --debug --no-bundle
  fi
) >&2

exec "$root/target/$profile/$app" "$@"
