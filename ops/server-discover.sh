#!/bin/sh
# Looks for employers the lists do not name yet, once a day. Wikidata gives the queue (every
# company it places in one of the site's countries, with a website and a staff count: names, no
# key, no account) and the hunter takes a slice of it, finding each company's careers pages and
# how to read them. What it finds goes to builder/state/found/hunted.yml, which the builder
# reads next to config/ and which is never committed, so a pull never fights it. The queue is
# asked for again when it is nearly all hunted. Nothing happens while builder/state/STOP exists.
set -e
cd "$(dirname "$0")/.."
[ -e builder/state/STOP ] && { echo "[$(date -u +%FT%TZ)] STOP is in place"; exit 0; }
echo "[$(date -u +%FT%TZ)] discover at $(git rev-parse --short HEAD)"

A_DAY=400                                        # domains hunted per run
queue=builder/state/found/hunt-queue.txt
done=builder/state/hunted-done.txt
touch "$done"

left=0
[ -s "$queue" ] && left=$(awk -F, 'NR==FNR{d[$1];next}!($1 in d)' "$done" "$queue" | grep -c . || true)
echo "$left domains left in the queue"
if [ "$left" -lt 100 ]; then
  node builder/tools/domains-wikidata.mjs
fi

node builder/tools/hunt.mjs --file "$queue" --take "$A_DAY" --lanes 6 --write
