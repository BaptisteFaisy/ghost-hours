#!/usr/bin/env bash
# Locate Node.js and pnpm on a self-hosted runner and export them for the
# following steps. One implementation, used by every job (no duplication).
#
# The build server keeps its toolchain under ~/tools (no sudo, no system
# package). If the runner ever moves to a hosted image, `command -v node`
# finds the pre-installed toolchain first and this script changes nothing.
#
# Sourced, never executed: it must not enable `errexit` in the caller's shell,
# and every helper returns 0 so a missing directory is not a failure.
set -uo pipefail

add_path() {
  [ -d "$1" ] || return 0
  case ":$PATH:" in
    *":$1:"*) ;;
    *) PATH="$1:$PATH" ;;
  esac
  return 0
}

add_path "$HOME/tools/pnpm"
add_path "$HOME/.local/opt/bin"

if [ -d "$HOME/tools" ]; then
  for candidate in "$HOME"/tools/node-v*-linux-x64/bin; do
    add_path "$candidate"
  done
fi

if [ -d "$HOME/.nvm/versions/node" ]; then
  newest="$(ls "$HOME/.nvm/versions/node" 2>/dev/null | sort -V | tail -1 || true)"
  if [ -n "$newest" ]; then
    add_path "$HOME/.nvm/versions/node/$newest/bin"
  fi
fi

export PATH
export PNPM_HOME="${PNPM_HOME:-$HOME/tools/pnpm}"

if ! command -v node >/dev/null 2>&1; then
  echo "::error::node not found — install Node >= 22 under \$HOME/tools or on PATH"
  return 1 2>/dev/null || exit 1
fi
if ! command -v pnpm >/dev/null 2>&1; then
  echo "::error::pnpm not found — install the standalone binary under \$HOME/tools/pnpm"
  return 1 2>/dev/null || exit 1
fi

echo "node $(node -v) — pnpm $(pnpm -v) — $(uname -sm)"
