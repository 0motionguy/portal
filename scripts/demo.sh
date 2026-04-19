#!/usr/bin/env bash
# Portal demo — one-click reproduction of the visitportal.dev one-pager flow.
# Starts trending-demo, runs the three CLI commands + conformance, cleans up.
#
# Usage:
#   bash scripts/demo.sh          # uses PORT=3075 by default
#   PORT=4000 bash scripts/demo.sh
#
# Requires: Node 22+, pnpm 10+, curl. Run from the monorepo root.

set -euo pipefail

PORT="${PORT:-3075}"
BASE="http://127.0.0.1:$PORT"
MANIFEST_URL="$BASE/portal"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

SERVER_PID=""
cleanup() {
  if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

section() { printf "\n\033[1m== %s ==\033[0m\n" "$1"; }
ok()      { printf "  \033[32mOK\033[0m  %s\n" "$1"; }
fail()    { printf "  \033[31mFAIL\033[0m %s\n" "$1"; exit 1; }

START_TS=$(date +%s)

section "1. Start trending-demo on port $PORT"
PORT="$PORT" PORTAL_PUBLIC_URL="$BASE" \
  pnpm --filter trending-demo start > /tmp/trending-demo.log 2>&1 &
SERVER_PID=$!
ok "pid=$SERVER_PID log=/tmp/trending-demo.log"

section "2. Wait for /healthz (10s timeout)"
WAITED=0
until curl -sf "$BASE/healthz" > /dev/null 2>&1; do
  sleep 0.2
  WAITED=$((WAITED + 1))
  if [ "$WAITED" -gt 50 ]; then
    echo "--- trending-demo.log ---"
    cat /tmp/trending-demo.log || true
    fail "healthz never returned 200 within 10s"
  fi
done
ok "healthz 200 after ${WAITED}x200ms"

section "3. visit-portal info $MANIFEST_URL"
T0=$(date +%s)
pnpm --filter @visitportal/cli exec tsx src/cli.ts info "$MANIFEST_URL"
ok "info done in $(( $(date +%s) - T0 ))s"

section "4. visit-portal call top_gainers --params '{\"limit\":3}'"
T0=$(date +%s)
pnpm --filter @visitportal/cli exec tsx src/cli.ts call "$MANIFEST_URL" top_gainers --params '{"limit":3}' --json
ok "call done in $(( $(date +%s) - T0 ))s"

section "5. visit-portal conformance"
T0=$(date +%s)
pnpm --filter @visitportal/cli exec tsx src/cli.ts conformance "$MANIFEST_URL"
ok "conformance done in $(( $(date +%s) - T0 ))s"

section "6. pnpm conformance (live)"
T0=$(date +%s)
pnpm conformance "$MANIFEST_URL"
ok "live conformance done in $(( $(date +%s) - T0 ))s"

ELAPSED=$(( $(date +%s) - START_TS ))
printf "\n\033[1mDEMO COMPLETE · %ss total · all checks passed\033[0m\n" "$ELAPSED"
