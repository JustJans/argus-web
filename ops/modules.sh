#!/bin/sh
# Installs the packages when package-lock.json is not the one they were last installed from
# (or node_modules is missing), and remembers which one that was, so new code never runs on
# old packages even when an install had to wait. Run only by a script that holds
# builder/state/crawl.lock, so the crawler never has its modules replaced under it: the hourly
# crawl calls it first thing, and the publication under the same lock.
#   sh ops/modules.sh           install if needed
#   sh ops/modules.sh --check   exit 0 when nothing needs installing, 1 when something does
set -e
cd "$(dirname "$0")/.."
want=$(sha256sum package-lock.json | cut -c1-64)
have=$(cat builder/state/installed-lock 2>/dev/null || true)
[ -d node_modules ] && [ "$want" = "$have" ] && exit 0
[ "$1" = "--check" ] && exit 1
echo "[$(date -u +%FT%TZ)] installing the packages of lock $(echo "$want" | cut -c1-12)"
npm ci --silent --no-audit --no-fund
mkdir -p builder/state
echo "$want" > builder/state/installed-lock
