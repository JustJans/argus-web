#!/bin/sh
# Refreshes the pile and publishes the site. Runs from cron on the home server every six
# hours: pulls the latest code, installs packages only when the lock file changed, builds
# the pile and the site, and pushes the site to the gh-pages branch. Stops at the first
# failure, so a build that found nothing usable never replaces a good site.
set -e
cd "$(dirname "$0")/.."
before=$(git rev-parse HEAD)
git pull -q --ff-only
after=$(git rev-parse HEAD)
if [ ! -d node_modules ] || { [ "$before" != "$after" ] && ! git diff --quiet "$before" "$after" -- package-lock.json; }; then
  npm ci --silent --no-audit --no-fund
fi
echo "[$(date -u +%FT%TZ)] refresh at $(git rev-parse --short HEAD)"
node builder/build-pile.mjs --out builder/out --explain
node builder/build-site.mjs --data builder/out --out site
node builder/publish.mjs
