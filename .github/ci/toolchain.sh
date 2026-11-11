#!/usr/bin/env bash
# Locate Node.js and pnpm on a self-hosted runner and export them for the
# following steps. One implementation, used by every job (no duplication).
#
# The r630 keeps its toolchain under ~/tools (no sudo, no system package).
# If the runner ever moves to GitHub-hosted images, `command -v node` finds
# the pre-installed toolchain first and this script is a no-op.
set -euo pipefail

add_path() { [ -d "$1" ] && case ":$PATH:" in *":$1:"*) ;; *) PATH="$1:$PATH" ;; esac; }

add_path "$HOME/tools/pnpm"
add_path "$HOME/.local/opt/bin"
for candidate in "$HOME"/tools/node-v*-linux-x64/bin; do
  [ -d "$candidate" ] && add_path "$candidate"
done
add_path "$HOME/.nvm/versions/node/$(ls "$HOME/.nvm/versions/node" 2>/dev/null | sort -V | tail -1)/bin"

export PATH
export PNPM_HOME="${PNPM_HOME:-$HOME/tools/pnpm}"

if ! command -v node >/dev/null 2>&1; then
  echo "::error::node not found — install Node >= 22 under \$HOME/tools or on PATH"
  exit 1
fi
if ! command -v pnpm >/dev/null 2>&1; then
  echo "::error::pnpm not found — install the standalone binary under \$HOME/tools/pnpm"
  exit 1
fi

echo "node $(node -v) — pnpm $(pnpm -v) — $(uname -sm)"
