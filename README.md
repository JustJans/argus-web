# Argus Web

A free, public job portal for engineers and technicians in Europe. You paste your CV, it is
read **in your browser** and never uploaded, and you get a short profile code — your
"plate" — that lives after the `#` of the address. Paste the code and the public list of
offers is filtered for you, on your device. No account, no email, nothing stored anywhere.

It is the web companion of [Argus](https://github.com/JustJans/argus), the Telegram job-search
bot, and reuses its matching engine: the same title, location, years-of-experience, degree
and language rules, run client-side.

## Status

**Working, Spain first.** Live at <https://justjans.github.io/argus-web/>: search the pile
by words and country with no code at all, or make a code from your CV and get the list
your profile deserves. Every advert past its deadline is hidden; the page says when the
pile was last rebuilt. The pile is rebuilt and published with the three commands below
(the six-hourly GitHub Actions workflow waits in `ops/workflows/` until the repository's
token can create it).

Sources read today: Lanbide (Basque Country), Feina Activa (Catalonia), the Junta de
Castilla y León, Arbetsförmedlingen (Sweden, by occupation code) and the company boards
listed in `builder/config/companies.yml`. Spanish supply is thin on purpose until a licensed
feed covers the private market; every source's licence is shown on the page.

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
  311, 312, 313, 315), all of Europe. Marine and offshore roles are one family among them.
- **Sources:** only job data whose written terms allow republishing, each offer linking to
  the page it lives on — public employment services with open licences (France Travail,
  Sweden's JobTech, Norway's NAV, Czechia, Lithuania, Latvia, Spanish regions), documented
  public applicant-tracking APIs (Lever, Greenhouse, Ashby, Recruitee, Personio), and,
  later, licensed aggregator feeds. LinkedIn and undocumented endpoints are out.
- **Privacy by construction:** the CV is parsed in a Web Worker on a page that loads no
  third-party script; the profile code never leaves the browser (URL fragments are not sent
  to servers); no cookies, no local storage, no analytics in the first version.
- **Architecture:** a static site (Cloudflare Pages) plus a pile of offers rebuilt on a
  schedule and published as static JSON, split by family and country so the code decides
  which parts to download. No servers holding user data.
- **Money:** none at launch. If it ever earns, licensed pay-per-click feeds come before ads.

## Repository layout

```
catalogues/   families (ISCO and SSYK codes, title terms in seven languages) and countries
builder/      adapters (one per source) → normalise → gate → dedupe → shards and an index
app/          the static site GitHub Pages serves
test/         the builder's pure parts and the adapters' parsers on recorded answers
.github/      tests on every push; the pile and the site rebuilt every six hours
```

The matching engine (title rules, years, degrees, languages) is Argus's own, installed as a
dependency from its repository at a tagged version.

## Licence

MIT. See [LICENSE](LICENSE).
