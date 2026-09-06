# Argus Web

A free, public job portal for engineers and technicians in Europe. Search the public list of
offers with filters that are your whole profile, or hand it your CV: it is read **in your
browser**, never uploaded, and it ticks the occupations, degrees and languages it names. Your
filters pack into a short code — your "plate" — that lives after the `#` of the address, to
copy, paste or bookmark. No account, no email, nothing stored anywhere.

It is the web companion of [Argus](https://github.com/JustJans/argus), the Telegram job-search
bot, and reuses its matching engine: the same title, location, years-of-experience, degree
and language rules, run client-side.

## Status

**Working: Spain, Sweden, Czechia, Lithuania and Latvia.** Live at <https://justjans.github.io/argus-web/>: search the
pile by words and filters — country, occupations by ISCO group, date, level, languages,
degrees, title words, deal-breakers — let your CV tick them, and carry them as a short code. Every advert past
its deadline is hidden; the page says when the pile was last rebuilt. A home server rebuilds
and publishes the pile every six hours with `ops/server-refresh.sh` (the GitHub Actions
workflows wait in `ops/workflows/` until the repository's token can create them).

Sources read today: Lanbide (Basque Country), Feina Activa (Catalonia), the Junta de
Castilla y León, the SEF of Murcia, Arbetsförmedlingen (Sweden, by occupation code), the
Czech Labour Office (by CZ-ISCO code), Lithuania's Employment Service (by LPK code), Latvia's
NVA, and the company boards listed in `builder/config/companies.yml`. Spanish supply is thin
on purpose until a licensed feed covers the private market; every source's licence is shown
on the page. Feeds that need an account or a signed request (France Travail, Norway's NAV,
Poland's CBOP) wait for the owner.

## Running it yourself

```
npm ci
npm test                                  # the builder's pure parts, no network
node builder/build-pile.mjs --explain     # reads every source, writes builder/out
node builder/build-site.mjs               # assembles site/ (the app plus the pile)
node builder/publish.mjs                  # publishes site/ to the gh-pages branch
node ops/serve.mjs site 8787              # or preview it at http://localhost:8787/
```

`--limit N` stops each source after N adverts for a quick look; `--explain` writes one line
per dropped advert with the reason to `builder/out/explain.txt`.

## What it will be

- **Scope:** classic engineering and technical occupations (ISCO-08 groups 214, 215, 216,
  311, 312, 313, 315), all of Europe. The families are those ISCO unit groups themselves, shown
  by minor group: engineers, architects/planners/surveyors, technicians, supervisors, plant
  operators, ship and aircraft crews. Their job titles in twelve languages come from ESCO.
- **Sources:** only job data whose written terms allow republishing, each offer linking to
  the page it lives on — public employment services with open licences (France Travail,
  Sweden's JobTech, Norway's NAV, Czechia, Lithuania, Latvia, Spanish regions), documented
  public applicant-tracking APIs (Lever, Greenhouse, Ashby, Recruitee, Personio), and,
  later, licensed aggregator feeds. LinkedIn and undocumented endpoints are out.
- **Privacy by construction:** the CV is read by the site's own scripts on the device and
  goes nowhere; no page loads a third-party script; the profile code never leaves the
  browser (URL fragments are not sent to servers); no cookies, no local storage, no
  analytics in the first version.
- **Architecture:** a static site (Cloudflare Pages) plus a pile of offers rebuilt on a
  schedule and published as static JSON, split by family and country so the code decides
  which parts to download. No servers holding user data.
- **Money:** none at launch. If it ever earns, licensed pay-per-click feeds come before ads.

## Repository layout

```
catalogues/   families (ISCO-08 unit groups by minor group), countries, languages, degrees, vetoes;
              codes/ holds ESCO's job titles per group and JobTech's SSYK→ISCO table (built by
              builder/isco-esco.mjs)
builder/      adapters (one per source) → normalise → gate → dedupe → shards and an index
app/          the static site GitHub Pages serves
test/         the builder's pure parts, the code, the CV reader and the adapters' parsers
ops/          the home server's refresh script, a preview server, the workflows to come
```

The matching engine (title rules, years, degrees, languages) is Argus's own, installed as a
dependency from its repository at a tagged version.

## Licence

MIT. See [LICENSE](LICENSE).
