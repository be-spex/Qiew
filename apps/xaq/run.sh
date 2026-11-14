#!/bin/sh
# Builds xaq as it is in the working tree and starts it: ./run.sh [--release] [file]
exec "$(dirname "$0")/../../tools/run.sh" xaq "$@"
