#!/usr/bin/env bash
# Build a fully static export of Synforma (no API routes) into ./out.
# Usage: NEXT_PUBLIC_BASE_PATH=/Experimentation scripts/build-static.sh
set -euo pipefail
cd "$(dirname "$0")/.."
API_DIR="app/api"
STASH="$(mktemp -d)/api"
restore() { if [ -d "$STASH" ]; then rm -rf "$API_DIR"; mv "$STASH" "$API_DIR"; fi; }
trap restore EXIT
# Route handlers with POST cannot be statically exported; the client falls back to the heuristic planner when the API is absent.
mv "$API_DIR" "$STASH"
SYNFORMA_STATIC=1 npx next build
echo "Static export written to ./out (base path: ${NEXT_PUBLIC_BASE_PATH:-/})"
