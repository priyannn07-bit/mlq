#!/bin/sh
# Compiles the C backend. Falls back to the prebuilt binary if gcc is unavailable.
set -e
cd "$(dirname "$0")/.."
mkdir -p bin
if command -v gcc >/dev/null 2>&1; then
  gcc -O2 -Wall -static -o bin/scheduler backend/scheduler.c 2>/dev/null \
    || gcc -O2 -Wall -o bin/scheduler backend/scheduler.c
  echo "Compiled bin/scheduler with gcc"
elif [ -f bin/scheduler ]; then
  echo "gcc not found - using prebuilt bin/scheduler"
else
  echo "ERROR: no gcc and no prebuilt bin/scheduler" >&2; exit 1
fi
chmod +x bin/scheduler
