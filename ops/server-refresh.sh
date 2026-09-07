#!/bin/sh
# Builds the site from the store and publishes it. Runs from cron every three hours: pulls
# the latest code, installs packages only when the lock file changed, builds the pile from
# what the crawler has already read (no network), builds the site and pushes it to the
# gh-pages branch. Stops at the first failure, so a pile that shrank never replaces a good
# site. Nothing happens while builder/state/STOP exists.
set -e
cd "$(dirname "$0")/.."
[ -e builder/state/STOP ] && { echo "[$(date -u +%FT%TZ)] STOP is in place"; exit 0; }
before=$(git rev-parse HEAD)
git pull -q --ff-only
after=$(git rev-parse HEAD)
if [ ! -d node_modules ] || { [ "$before" != "$after" ] && ! git diff --quiet "$before" "$after" -- package-lock.json; }; then
  # The crawler must not have its modules replaced under it: wait for its lock.
  flock -w 900 builder/state/crawl.lock npm ci --silent --no-audit --no-fund
fi
echo "[$(date -u +%FT%TZ)] refresh at $(git rev-parse --short HEAD)"
node builder/build-pile.mjs --out builder/out --explain
node builder/build-site.mjs --data builder/out --out site
node builder/publish.mjs
