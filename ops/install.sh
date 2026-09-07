#!/bin/sh
# Sets the home server up for the crawler: moves what the old build had cached into the store
# (once, so the first crawl is not a cold start) and installs the schedule. Safe to run again.
#   sh ops/install.sh
set -e
cd "$(dirname "$0")/.."
echo "[$(date -u +%FT%TZ)] install at $(git rev-parse --short HEAD)"
[ -d node_modules ] || npm ci --silent --no-audit --no-fund
node builder/tools/migrate-store.mjs
crontab ops/crontab
echo "the schedule now reads:"
crontab -l | grep argus-web
echo "next: node builder/crawl.mjs --minutes 50   (the first fill; --status says how it goes)"
