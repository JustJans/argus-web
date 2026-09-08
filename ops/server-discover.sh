#!/bin/sh
# The Sunday round: look for employers the lists do not name yet, then work out what is wrong
# with the ones already on the list that bring nothing. Once a week is enough: the big sweep has
# already been done, so what a Sunday finds is what appeared during the week. Wikidata gives
# the names — every company it places in one of the site's countries with a website, by what
# the company does and by how many it employs — and the hunter finds each one's careers pages
# and how to read them. Domains already hunted are left out, so the queue is what is new.
# What it finds goes to builder/state/found/hunted.yml, which the builder reads next to
# config/ and never commits, so a pull never fights it. Nothing happens while
# builder/state/STOP exists.
#   sh ops/server-discover.sh [how many at most] [how many at a time]
set -e
cd "$(dirname "$0")/.."
[ -e builder/state/STOP ] && { echo "[$(date -u +%FT%TZ)] STOP is in place"; exit 0; }
echo "[$(date -u +%FT%TZ)] discover at $(git rev-parse --short HEAD)"

A_WEEK=${1:-2000}                                # domains hunted in one run, at most
LANES=${2:-6}                                    # domains looked at at a time
queue=builder/state/found/hunt-queue.txt
touch builder/state/hunted-done.txt

node builder/tools/domains-wikidata.mjs

# The hosts where Web Data Commons already saw an employer publishing vacancies are worth more
# than a company picked out of a register, so they go first. The list is in the repository
# because the quads it comes from are five gigabytes and live on one machine.
if [ -s builder/config/hunt-wdc.txt ]; then
  cat builder/config/hunt-wdc.txt "$queue" > "$queue.new" && mv "$queue.new" "$queue"
fi

node builder/tools/hunt.mjs --file "$queue" --take "$A_WEEK" --lanes "$LANES" --write

# Then the ones already on the list that are giving nothing, or failing: each goes down the
# same ladder of questions until one answers, and the answer is kept with its date. A source the
# ladder finds alive has its failures wiped, so no useful site is ever lost to a run of silly
# failures — only a host that answers nothing, or a wall, keeps its strikes.
node builder/tools/triage.mjs --all --out builder/state/triage.tsv
