# How the aggregators gather adverts, and how this site does the same

Written 2026-09-06 after the owner asked to replicate the aggregators' collection "as close to
1:1 as it gets". Everything below comes with its source; what could not be verified says so.

## What Adzuna, Indeed, Jooble and the others actually do

None of them has "the APIs of the job boards". They run three intakes side by side:

1. **A web crawler**, the same kind Google runs, reading employers' careers pages and job
   boards that let themselves be read (robots.txt decides). Jooble: "Jooble's web crawler works
   the same way as other search engines (like Google)… it only indexes vacancies using public
   resources, with the resource type (public/private) determined by… robots.txt"; it reads "over
   140,000 sources daily, including job sites, corporate websites, social media, and classifieds"
   ([Jooble help](https://help.jooble.org/en/support/solutions/articles/60000037148-how-did-my-vacancies-appear-on-jooble-),
   [Jooble review](https://www.betterteam.com/jooble)). Careerjet: "smart agents running on a
   cluster of networked computers that scan the web and identify job listings… on small
   recruitment agencies websites… or on larger job boards", 90 countries
   ([Careerjet](https://www.careerjet.com/about-us)). Indeed: "aggregates job listings from
   thousands of websites, including job boards, staffing firms, associations, and company career
   pages… uses a web crawler" ([Indeed](https://indeedinc.my.site.com/employerSupport1/s/article/What-is-Aggregation),
   [Indeed UK](https://uk.indeed.com/hire/resources/howtohub/job-boards)). Textkernel's Jobfeed:
   "a software program that constantly and systematically crawls the internet, locating and
   indexing websites that publicly display job ads", then "classifying, de-duplicating and
   enhancing them" ([Textkernel](https://www.textkernel.com/jobfeed/),
   [Bullhorn KB](https://kb.bullhorn.com/connexys/Content/Topics/English/TextkernelJobfeedInformation.html)).
   hiring.cafe, a newer one, "runs a web crawler that visits company career pages directly —
   roles hosted on Greenhouse, Lever, Workday, Workable, and dozens of other applicant tracking
   systems" and reads "over 40k company websites every day"
   ([review](https://www.remotejobassistant.com/blog/hiringcafe-review)).
2. **Feeds that the boards and employers push** (XML feeds, ATS integrations), most of them
   paid per click: that is the aggregator's revenue and the reason the feed exists. Indeed:
   "companies can use an XML feed or request aggregation from their career site or Applicant
   Tracking System". This part cannot be replicated without the contracts.
3. **Their own postings** (Indeed and Adzuna also sell adverts).

What the crawler reads is what sites publish for search engines: **schema.org JobPosting**
blocks. Google requires them for its job search, wants one per vacancy page ("Put structured
data on the most detailed leaf page possible. Don't add structured data to pages intended to
present a list of jobs"), asks sites to announce pages through sitemaps or its Indexing API,
and to retire expired postings (a past `validThrough`, a 404/410, or removing the block)
([Google](https://developers.google.com/search/docs/appearance/structured-data/job-posting)).
Jooble tells sites the same: "Use microformats such as Schema.org or JSON-LD to clearly indicate
the job title, description, location, salary…", one address per vacancy, robots.txt open, links
to the original posting ([Jooble](https://help.jooble.org/en/support/solutions/articles/60000931300-requirements-for-job-websites-to-be-indexed-by-jooble)).

The public statistical system does it too. Cedefop and Eurostat's Web Intelligence Hub
collects "hundreds of millions" of online job advertisements in Europe from "private job
portals, public employment service portals, and recruitment agencies", found through a
"landscaping" of sources, collected "using various methods including application programming
interfaces (APIs), web scraping, and data-sharing agreements", deduplicated, and classified to
ISCO-08 and ESCO — the same classifications this site's gate uses
([Cedefop](https://www.cedefop.europa.eu/en/projects/skills-online-job-advertisements),
[Eurostat WIH](https://cros.ec.europa.eu/wih/oja),
[Cedefop 2025](https://www.cedefop.europa.eu/en/publications/5610),
[representativeness study](https://www.cedefop.europa.eu/files/6217_en.pdf)).

## The data that lets a small project start where they are

- **Common Crawl** publishes a monthly crawl of the web with a free index of every address
  captured ([index](https://index.commoncrawl.org/)). Asking it for the addresses on the ATS
  hosts gives every company board those hosts served: 13,579 slugs on Greenhouse, Lever, Ashby,
  SmartRecruiters, Recruitee and Personio from the last three indexes (2026-09-06).
- **Web Data Commons** (University of Mannheim) extracts the schema.org blocks from each crawl
  and publishes them by class. The JobPosting class of the 2024-12 crawl holds 175 million
  triples from 3.6 million vacancy pages on 63,320 hosts, with a per-host table; adoption grew
  from 7,000 sites in 2013 to 50,000 in 2022
  ([WDC](https://webdatacommons.org/structureddata/2024-12/stats/schema_org_subsets.html),
  [Brinkmann et al., WWW 2023](https://www.uni-mannheim.de/media/Einrichtungen/dws/Files_Research/Web-based_Systems/pub/Brinkmann-etal-TheWDCSchemaorgDataSetSeries-WWW2023.pdf)).
  In practice JSON-LD is the cleaner form: title, description, datePosted and
  hiringOrganization are present in 98-99% of JSON-LD postings, addressLocality in 89%;
  microdata is poorer ([skeptric](https://skeptric.com/schema-jobposting/)). Extracting job
  ads from Common Crawl by address patterns and WARC offsets is documented step by step
  ([skeptric](https://skeptric.com/common-crawl-job-ads/)).
- **21,865** of those hosts sit on European country domains (Germany 9,138, the Netherlands
  3,455, the UK 2,246, France 1,253, Sweden 833, Switzerland 687, Belgium 628, Austria 599,
  Spain 234, Czechia 178…); 26,207 more are .com.

## The open-source projects that already do it, and what is reused

The owner suspected this existed on GitHub already. It does, and the lists are reused rather
than rebuilt (each with its licence honoured in the file headers):

- [OpenRoles](https://github.com/datascry/openroles) (MIT; data CC BY-SA 4.0): 51 hiring
  platforms; "tenant slugs are discovered from public Common Crawl snapshots and, for
  platforms that publish one, their own public sitemap index — then liveness-probed weekly"; a
  "JSON-LD harvester — walks a per-tenant sitemap and extracts schema.org/JobPosting"; it
  publishes `data/tenants/*.json` per platform (Greenhouse 11,107, Workable 14,805, BambooHR
  16,528, Teamtailor 7,217, Recruitee 6,487, Lever 6,616…). Its Workable and Teamtailor
  address templates are what `builder/adapters/boards.mjs` uses for those two.
- [job-board-aggregator](https://github.com/Feashliaa/job-board-aggregator) (MIT; data
  CC BY-NC 4.0): "company lists are built from Common Crawl index data… scans CDX archives
  for URLs matching 20+ ATS domain patterns, extracts company slugs via regex", about 95,000
  identifiers; `data/*_companies.json` per platform.
- [JobSeek](https://github.com/colophon-group/jobseek) (MIT; data CC BY-NC 4.0): 5,300+
  companies and 6,200+ boards in `apps/crawler/data/boards.csv`, with the platform of each.
- [agentic-job-search-eu](https://github.com/kitsuno-ai/agentic-job-search-eu) (MIT +
  CC BY-SA 4.0): a directory of EU job sources with access type, licence posture and crawl
  notes; it confirms the choices here (JobTech, the Czech open data, the ATS APIs as "the
  single largest channel… roughly 63% of everything we crawl", Net-Empregos' RSS) and lists
  what needs keys (Arbeitsagentur, jobs.ch).

On 2026-09-06 the union of those lists with Common Crawl's own gave 9,903 Greenhouse, 4,647
Lever, 4,467 Ashby, 2,870 SmartRecruiters, 4,450 Recruitee, 3,385 Personio, 9,521 Workable
and 1,767 Teamtailor slugs to probe; the first probe of the Common Crawl set alone kept 5,315
boards with 51,395 adverts of ours in Europe that day. The same day, reading Web Data Commons'
175 million JobPosting triples (71,898 hosts) gave 7,594 employers' own careers sites naming
one hiring organisation, not a board, with 78,949 adverts of ours in Europe in that crawl
(`config/careers-found.yml`); a trial build with the boards alone kept 45,975 offers in 847
shards in eleven minutes.

## What this site replicates, and what it leaves out

| Their intake | Here | Why |
|---|---|---|
| Crawling employers' careers pages (JobPosting blocks, sitemaps, robots.txt) | **Yes**: `builder/adapters/careers.mjs`, sites from `careers.yml` and the scouts | What search engines do; the employer publishes the block to be read; robots.txt obeyed; every advert links to the employer's page |
| Reading ATS boards through their public APIs | **Yes**, by the thousand: `builder/tools/scout.mjs` (Common Crawl index → slugs → probe) | Documented public APIs |
| Crawling job boards | **No**, except boards whose API asks only for a link back (Jobicy, Remotive, Arbeitnow) | Boards' terms forbid it and the database right protects them (CJEU CV-Online v Melons); the owner's rule is written permission |
| Paid feeds from boards | **No** | Contracts |
| Adzuna's own API | **Yes**, when the keys exist: its terms allow publishing its listings labelled "Jobs by Adzuna" | 250 calls a day, 2,500 a month: a supplement, not the core |
| Workday and Oracle career sites | **Yes**, since the owner turned them on in `config/vendors.yml` | The reader asks the address the page itself asks for its list, as a browser does; robots.txt and the pace are the same as anywhere else |

## The pipeline, stage by stage

1. **Discovery** (`ops/server-discover.sh`, every day at 03:41; the scouts by hand):
   - `scout.mjs --collect --probe`: Common Crawl index → ATS slugs → every board read through
     its API → kept when the gate keeps an advert in Europe → `config/companies-found.yml`.
   - `scout-wdc.mjs`: Web Data Commons' JobPosting quads → per host: vacancy pages, hiring
     organisations (one means an employer, many a board), countries, titles the gate keeps →
     employers with adverts of ours in Europe → `config/careers-found.yml`, with the addresses
     seen so the adapter knows where the vacancies live.
   - `scout-careers.mjs`: the slower road for a domain list: robots, sitemaps, a few pages.
   - `domains-wikidata.mjs`: every company Wikidata places in one of the site's countries,
     with an official website and a staff count — names, no key, no account — minus what the
     lists already name → a queue of domains, biggest employers first.
   - `hunt.mjs --file <queue> --take 400`: the daily slice of that queue. For each domain:
     its careers pages, which platform serves them, and the adverts, with no API key. What is
     readable is written to `builder/state/found/hunted.yml`, which the builder reads next to
     `config/` and which is never committed, so the server's own discoveries never fight a
     pull; every domain tried is written down, so a queue of thousands is worked through over
     weeks and never twice.
   - `discover.mjs "Name"`: one company by name.
2. **Reading** (`builder/crawl.mjs`, every hour): the crawler takes the sources whose last pass
   is older than their cadence (`builder/config/crawl.yml`: a feed or an ATS board every six
   hours, an employer's site once a day), reads each one whole and writes what it gave to that
   source's own file in the store (`builder/state/adverts/<group>/<key>.json`, written to a
   scratch file and renamed). A careers site keeps the pages it has already read, so a pass
   costs one sitemap plus the pages that are new; an advert that leaves the sitemap has closed.
   Every read has a deadline, "too many requests" pauses that group until the host says come
   back, a source that fails waits six hours, then a day, then two, and is parked after a
   fortnight. `builder/state/STOP` stops everything.
3. **Publishing** (`builder/build-pile.mjs`, every three hours): the pile is built from the
   store and nothing else, so a slow site never delays a publish and a publish never waits for
   the network. A source nobody could read for ten days leaves the pile; a build that would
   lose a third of the offers refuses to publish.
4. **Gate**: the source's occupation code when it has one, else the title against ESCO's
   titles in fifteen languages; computing in, trades and service jobs out; hygiene words;
   Europe only.
5. **Records**: no advert text at all — the title, the employer, the place, the day and the
   link, plus what the screens read off the text (years, degrees, languages); the employer's own
   address, expiry by `validThrough`, deadline or absence.
6. **Dedupe**: same address once; same employer and role once (the board copy wins over a
   feed's), as Jobfeed merges "different advertisements of this job".

## Politeness and the law, as practised

- `ArgusWeb/0.1 (+https://github.com/JustJans/argus-web)` as the user agent everywhere;
  robots.txt read and obeyed, `Crawl-delay` honoured, one request at a time per host with a gap.
- "Too many requests" (429) is honoured with its `Retry-After`: the host is left alone until then
  and the reader moves on. Workable's widget API allows an IP about a thousand calls a day and
  then answers 429 for a day (seen 2026-09-06, `Retry-After: 78149`), so its boards are read
  once a day with their adverts kept between builds, and the board scout takes several runs,
  one a day, over its list.
- Employers' pages only, told from boards by the hiring organisation named on the pages.
- Every advert links to the page it lives on; nothing personal kept; a takedown within 72 hours
  (see the Sources page).
- The crawl of a site is bounded: at most 200 new pages a pass and 6,000 across a run, sitemaps
  first, and one pass a day per site.

## What the vendor-hosted careers sites give away without JavaScript (checked 2026-09-06)

The big industrial employers do not run their own careers sites: a vendor hosts them. Fetched
with plain HTTP, as a search engine's crawler and this project do:

| Vendor | The list of vacancies | One vacancy's page | Read here |
|---|---|---|---|
| Workday (`*.myworkdayjobs.com`, 925 employers in the WDC data) | Drawn by JavaScript; no sitemap (`/sitemap.xml` answers the app shell); the page asks `/wday/cxs/{tenant}/{site}/jobs` (POST) | Static HTML with the JobPosting block | The list the way the page asks it, behind `config/vendors.yml` |
| Oracle Cloud Recruiting (`*.oraclecloud.com/hcmUI/CandidateExperience`) | Drawn by JavaScript; the page asks `/hcmRestApi/resources/latest/recruitingCEJobRequisitions` | Drawn by JavaScript (no block) | The list the way the page asks it, behind `config/vendors.yml` |
| SuccessFactors career sites (SAP, Vestas) | `/jobs.xml`: an RSS feed of every vacancy with its text | Static HTML with the block | The feed (`feed:` in careers.yml or hunted.yml) |
| iCIMS (`careers-*.icims.com`, 747 employers) | "Human Verification" interstitial | Static HTML with the block | Not without a browser |
| Eightfold, softgarden, Taleo | Drawn by JavaScript | Static HTML with the block (Eightfold) | Not without a browser |

Common Crawl's index has the vacancy pages of all of them (their addresses circulate on job
boards and LinkedIn), so the vendors' tenants can be collected the way the ATS slugs are
(`scout.mjs --collect` knows Workday and Oracle); reading them is the owner's decision.

## Reading one company: the hunter

`node builder/tools/hunt.mjs vestas.com boskalis.com [--write]` (or `--file domains.txt`) does
what a person would: reads the home page, follows the links that say careers, jobs, empleo,
karriere, vacatures (and the usual paths), recognises the platform behind the page (the ATS
and its slug, embedded or linked; a Workday or Oracle site; a `jobs.xml` feed; else a site with
a sitemap or a listing), reads a sample and says how many adverts the gate keeps in Europe. It
never follows a link to a job board, an agency or a social network.
`--write` puts the readable ones in `builder/config/hunted.yml`, which the builder reads like
`companies.yml` and `careers.yml`. Seen on the first run: Vestas by its feed (761 adverts),
Van Oord by its sitemap (134 pages), DEME and Damen on Workday (named, switched off),
Boskalis and Aviva with careers pages whose vacancies are drawn by JavaScript.

## Intermediaries, on their own terms

The aggregators run partner programmes for sites like this one: free, and they pay the site for
every click sent to their pages. Jooble hands an API key (jooble.org/api/about, a form),
Talent.com and WhatJobs an XML feed of their adverts (employers.talent.com/publishers,
whatjobs.com/affiliates), Adzuna an app key for its API (developer.adzuna.com: 250 calls a day,
2,500 a month; a licence agreement "may be required" for commercial use after 14 days, and every
advert labelled "Jobs by Adzuna"). None of the figures per click are published; they come with
the sign-up.

What this site does with them (`builder/adapters/adzuna.mjs`, `jooble.mjs`, `jobfeed.mjs`, keys
in `builder/.env`, see `builder/.env.example`): their adverts are read by the server like any
other source, pass the same gate, and are shown **after the employers' own adverts, in a section
of their own, labelled**, each linking to the intermediary's page as the programmes ask. An
employer's own advert always beats an aggregator's copy of it in the dedupe. Nothing about the
visitor is sent to them: the server reads feeds, the visitor only follows a link.

Left out: Careerjet, whose API wants each search made live with the visitor's IP address and
browser (`user_ip`, `user_agent` are required parameters), which the static site cannot and
will not do; and Indeed and LinkedIn, which sell nothing of the kind.

## The ways a site is read, and how they were chosen

A site that lists no vacancy is not a site with no vacancies. `builder/tools/triage.mjs` asks
the crawler's own reader why a site gave nothing and labels it, so the next reader is built for
the biggest reason rather than the most interesting one. Of 300 of the 6,108 silent sites,
spread across the whole list (2026-09-07):

| Why it gave nothing | Share | What was done |
|---|---|---|
| It lists its careers page, not its vacancies | 72% | The page is read as a list: its vacancy links are followed one step further |
| It does publish the block, and the run had no page budget left | 18% | A pass with no budget is no longer recorded as a pass |
| Addresses there are, none that look like a vacancy | 7% | Left alone: they turned out to be blogs and magazines, not employers |
| Empty, walled, dead, drawn by JavaScript, a feed | 1% each | A feed is read; a wall is left; JavaScript waits for a browser |

So the readers, in the order they are tried: a **vacancies feed** (`/jobs.xml`, one read with the
places and the text), the **sitemap and the JobPosting block** of each page, the **list a page
carries** (one step further, at most sixty a pass), the **ATS's own listing** when the page names
one, and the **vendor's** (Workday and Oracle, behind `config/vendors.yml`). A page drawn by
JavaScript is the rarest reason of all, which is why the browser is last rather than first.

## Where it can still grow

- The .com hosts of Web Data Commons (26,207), told apart by the countries their postings name.
- Common Crawl's own pages (WARC records) for hosts without a sitemap: read the archived copy
  first, ask the live site only for what changed.
- A monthly cron for the scouts on the server; the lists are committed for now.
- Workday and Oracle are on: their tenants came from the addresses Web Data Commons had already
  seen (`builder/tools/vendor-urls.mjs`, `vendor-slugs.mjs`), and the probe kept 109 of 157. iCIMS, Eightfold, Taleo and softgarden would
  need a browser (Playwright on the server) for their lists.
