# Roadmap and where each change plugs in

The structure is built for the changes already known. Each item names the seam.

## Sources
- **More feeds** (France Travail, Norway's NAV, Poland's CBOP: each needs an account or a signed request from the owner): one file each in
  `builder/adapters/`, registered in the `adapters` list of `builder/build-pile.mjs`. A feed
  that carries occupation codes puts them in `codes` (`isco` or `ssyk`) and the gate uses
  them; one that does not is classified by title. Keys go in GitHub Actions secrets and are
  read from `process.env` inside the adapter.
- **More company boards**: `node builder/tools/scout.mjs --collect` then `--probe` reads Common Crawl's
  index for every board on the eight ATS hosts and writes `builder/config/companies-found.yml`
  (thousands); `--write` writes it from what the probes answered so far; `builder/tools/discover.mjs
  "Company name"` probes one name. Re-run the scout monthly (Common Crawl publishes a new index every
  month); Workable allows about a thousand calls a day, so its slugs take several daily runs.
- **More careers sites**: `node builder/tools/scout-wdc.mjs` reads Web Data Commons' JobPosting
  extraction (`builder/state/wdc/`, 5 GB, downloaded once) and writes `builder/config/careers-found.yml`;
  `scout-careers.mjs [--tlds es,de] [--limit N]` walks a domain list the slow way (resumable, hours
  long); a site by hand goes into `careers.yml` with its sitemap.
- **One company by domain**: `node builder/tools/hunt.mjs acme.com [--write]` finds the careers
  pages, the platform and the adverts; Workday and Oracle sites read once `builder/config/vendors.yml`
  says so.
- **Licensed backfill that pays per click** (Jooble, Careerjet): a `live` adapter kind is
  reserved; it would answer from a small serverless function, not from the builder, and
  feed the same `judge()` on the client. Needs a signed agreement first.
- **Switching a source off in an emergency**: `enabled: false` on its entry in the index is
  honoured by the client at load (to be wired in `app/main.js` when the first case arises).

## The engine in the browser
- Today the title rules run in the browser from Argus's own `text.mjs` and `filters.mjs`
  (bundled by `builder/build-site.mjs` into `v/<hash>/lib/engine.js`). Years, degree and language
  demands are read at build time (`builder/screens.mjs`) and travel as `y`, `dg`, `lg`.
- When Argus ships a browser-safe engine entry (its `requirements.mjs` reads a file at
  import today), `app/lib/gates.js` is the single place to swap the precomputed facts for
  the engine's screens over the excerpts.

## The profile code
- Version byte first; catalogues append-only; a new field means a new version with the old
  decoder kept (`docs/CODEC.md`). Free terms are capped at eight of 24 bytes.
- A QR of the link, and a short-code service, are deliberate non-goals for now.

## Growth
- **Countries**: append to `catalogues/countries.json`; shards appear by themselves.
- **Families**: a family is an ISCO-08 unit group. To add one, append an entry to
  `catalogues/families.json` (id = the code, its group, a short label) and rerun
  `builder/isco-esco.mjs` so `catalogues/codes/isco.json` carries its ESCO titles; job titles
  ESCO lacks (Catalan) go in the entry's `extra_terms`. Never reorder: the position is the bit
  in the profile code.
- **Languages, degrees, vetoes, levels**: append to their catalogue; never reorder.
- **Deploy**: today `builder/publish.mjs` pushes `site/` to `gh-pages`; the workflows in
  `ops/workflows/` move to `.github/workflows/` once the token can create them, and Pages
  switches back to "GitHub Actions" as the source. Then no commits carry data.
- **Cache**: scripts and styles are published under `v/<content hash>/` and the pages point
  there; the last three versions stay published. GitHub Pages caches every file for ten
  minutes and a reload revalidates only the page, so this is what keeps a fresh page from
  running yesterday's script (`builder/fingerprint.mjs`). The pile and the catalogues keep
  their addresses and are fetched with `cache: no-cache`.

## Decided
- **No memory of what you have seen.** Without accounts there is nothing to tie it to, and
  keeping a list on the visitor's device would break "nothing stored". Every visit shows the
  whole list again, on purpose.

## Decisions waiting for the owner
- **A Spanish interface**: the texts sit in the pages today; a strings file would come first.

## Money and law (when, and only when, wanted)
- Ads: a certified consent tool before the first ad, the legal notice with the owner's
  identity, and the fiscal registrations. `app/index.html` has room for a slot; no page may carry a
  third-party script. See the plan's legal section.
