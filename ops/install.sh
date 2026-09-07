#!/bin/sh
# Sets the home server up for the crawler: moves what the old build had cached into the store
# (once, so the first crawl is not a cold start) and puts this project's lines into the
# schedule. Every other line of the crontab is left exactly as it was — the machine runs other
# things. Safe to run again.
#   sh ops/install.sh
set -e
cd "$(dirname "$0")/.."
echo "[$(date -u +%FT%TZ)] install at $(git rev-parse --short HEAD)"
[ -d node_modules ] || npm ci --silent --no-audit --no-fund
node builder/tools/migrate-store.mjs

# Only the lines that name this project are replaced; the rest of the crontab is untouched.
tmp=$(mktemp)
crontab -l 2>/dev/null | grep -v 'argus-web' > "$tmp" || true
grep -v '^#' ops/crontab | grep . >> "$tmp"
crontab "$tmp"
rm -f "$tmp"
echo "this project's lines in the schedule:"
crontab -l | grep argus-web
echo "next: node builder/crawl.mjs --minutes 50   (the first fill; --status says how it goes)"
