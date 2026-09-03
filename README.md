# Argus Web

A free, public job portal for engineers and technicians in Europe. You paste your CV, it is
read **in your browser** and never uploaded, and you get a short profile code — your
"plate" — that lives after the `#` of the address. Paste the code and the public list of
offers is filtered for you, on your device. No account, no email, nothing stored anywhere.

It is the web companion of [Argus](https://github.com/JustJans/argus), the Telegram job-search
bot, and reuses its matching engine: the same title, location, years-of-experience, degree
and language rules, run client-side.

## Status

**Planning.** Nothing is built yet. The feasibility study (legal, budget, sources, audience)
and the design were completed on 2026-09-03; the implementation will start from that plan.

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

## Repository layout (planned)

```
catalogues/   families, countries, languages, degrees — shared by builder, app and tests
sectors/      the occupation gate per family: ISCO codes and title terms
builder/      source adapters → normalise → gate → dedupe → shards → publish
app/          the static site: intake (CV + questionnaire), profile code, filtered list
test/         codec round-trips, adapter fixtures, browser build of the engine's own checks
docs/         design, codec, pile format, sources and their licences
```

## Licence

MIT. See [LICENSE](LICENSE).
