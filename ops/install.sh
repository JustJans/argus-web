#!/bin/sh
# Sets the home server up: installs the packages and puts this project's lines into the
# schedule. Every other line of the crontab is left exactly as it was — the machine runs other
# things. Safe to run again: the store is never touched.
#   sh ops/install.sh
set -e
cd "$(dirname "$0")/.."
echo "[$(date -u +%FT%TZ)] install at $(git rev-parse --short HEAD)"
mkdir -p builder/state
flock builder/state/crawl.lock sh ops/modules.sh

# Only this project's own lines (those that cd into it) are replaced; the rest of the crontab is
# untouched, comments that merely mention it included.
tmp=$(mktemp)
crontab -l 2>/dev/null | grep -v -F 'cd $HOME/argus-web &&' > "$tmp" || true
grep -v '^#' ops/crontab | grep . >> "$tmp"
crontab "$tmp"
rm -f "$tmp"
echo "this project's lines in the schedule:"
crontab -l | grep -F 'cd $HOME/argus-web &&'
echo "next: node builder/crawl.mjs --minutes 50   (the first fill; --status says how it goes)"
