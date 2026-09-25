#!/bin/sh
# One hour of crawling: reads the sources whose last pass is older than their cadence and
# writes what they gave to the store. Publishes nothing. Runs from cron every hour under
# flock, so two runs never overlap; holding that lock, it first installs the packages when the
# lock file changed and the publication could not (ops/modules.sh). Stops at once when
# builder/state/STOP exists.
set -e
cd "$(dirname "$0")/.."
[ -e builder/state/STOP ] && { echo "[$(date -u +%FT%TZ)] STOP is in place"; exit 0; }
sh ops/modules.sh
node builder/crawl.mjs --minutes 55
