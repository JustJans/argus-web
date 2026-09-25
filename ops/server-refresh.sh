#!/bin/sh
# Builds the site from the store and publishes it. Runs from cron every three hours: pulls
# the latest code, installs the packages when the lock file changed (ops/modules.sh, under the
# crawler's lock so its modules are never replaced under it), builds the pile from what the
# crawler has already read (no network), builds the site and pushes it to the gh-pages branch.
# Stops at the first failure, so a pile that shrank never replaces a good site, and a
# publication that could not install its packages waits for the next one: the crawler's next
# run installs them. Nothing happens while builder/state/STOP exists.
set -e
cd "$(dirname "$0")/.."
[ -e builder/state/STOP ] && { echo "[$(date -u +%FT%TZ)] STOP is in place"; exit 0; }
git pull -q --ff-only
if ! sh ops/modules.sh --check; then
  flock -w 900 builder/state/crawl.lock sh ops/modules.sh || { echo "[$(date -u +%FT%TZ)] the packages are not installed yet (the crawler kept its lock): not publishing"; exit 1; }
fi
echo "[$(date -u +%FT%TZ)] refresh at $(git rev-parse --short HEAD)"
started=$(date +%s)
node builder/build-pile.mjs --out builder/out --explain
node builder/build-site.mjs --data builder/out --out site
node builder/publish.mjs
echo "[$(date -u +%FT%TZ)] published in $(( $(date +%s) - started )) s"
