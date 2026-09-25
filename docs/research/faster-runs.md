# Making the periodic runs faster

Research of 23 September 2026. The question: how to make the crawler's passes, the
publication every three hours and the weekly discovery as fast and light as they can be on the
home server (4 cores, 7.8 GB).

## What they cost today

Measured on the server the same day, after the pile build went from 27 to 4 minutes (PR #43).

**The crawler** runs every hour and reads each source once a day (`cadence_h: 24` for every
group). Over the last 24 hourly runs it was busy 217 minutes (median 9 min a run, longest 27).
Lane time of each group's last pass:

| Group | Sources | Seconds a day | Share |
|---|---:|---:|---:|
| Employers' sites (sitemaps and vacancy pages) | 8,156 | 89,190 | 94% |
| The ten ATS groups together (Workday and Oracle included) | 9,841 | 5,391 | 6% |
| Public feeds | 11 | 178 | 0.2% |

Inside the employers' sites:
- **Reading new vacancy pages: 77%** (92,365 pages at about 0.74 s each, most of it the pause
  kept between two requests to one site).
- **207 sites have read 50 or more pages without finding a single JobPosting block.** They keep
  70,995 pages in their files and cost 8,134 s in their last pass. Counting every site with no
  advert at all, the figure is 23,505 s a day (26%).
- **Sites with nothing new** cost 6,549 s (7%, a median of 1 s each).

**The publication** takes about 9 minutes:
- reading the whole store, 2.8 GB of JSON: 21 s;
- working out the offers: about 3 minutes;
- translating the new titles: about 4 minutes, up to 4,000 a language a publication while the
  backlog lasts;
- assembling and pushing the site: seconds.

Every source is worked out again each time, although in three hours about one source in eight
has been read again.

**The weekly discovery** (Sunday 03:41) took about 1 h 15 min on 20 September:
- domains from Wikidata;
- hunting 2,000 domains on 6 lanes;
- names of the Workday boards;
- a triage of every site.

**Pages kept without a JobPosting**, read again on 23 September, one page a site:

| Sites | Pages kept | Without the block | Read again | With the block now | Would be on the site |
|---|---:|---:|---:|---:|---:|
| Barren (50+ pages, none with the block) | 70,995 | all | 80 | 0 | 0 |
| Publishing the block on other pages | 551,752 | 73,875 | 380 | 34 (9%) | 4 of 300 |

A page that did not answer (a timeout, a server error, "too many requests") was kept as a page
without the block and never read again. On the barren sites, reading again finds nothing.

**Sites that run out of time:** 68 employers' sites failed their last pass with "took too long".
A careers pass has 400 s (900 s for the sites listed by hand), and a pass that reaches its
deadline is thrown away whole, with the pages it did read. On careers.usa.skanska.com,
robots.txt asks for 5 s between requests, so its 200 new pages need 1,000 s: every pass read
about 70 of them and lost them. Most of the 68 had failed four times, all in the same runs. The
wait after a failure had no jitter, so sites that failed together came back together. Many of
them are served by one platform (Jibe, career.page, PageUp).

**Conditional requests:** a re-request with the validator the source gave (`If-None-Match` or
`If-Modified-Since`), answered "304 Not Modified" with no body:

| Source | Answer |
|---|---|
| Greenhouse, Ashby, Personio, Teamtailor | 304, 15 boards of 15 each |
| Lever, SmartRecruiters | 200 again |
| Recruitee | no validator |
| Employers' sitemaps | 304 on 22 of 80; 53 give no validator |

## What is known

- **Conditional requests.** Google's crawlers send `If-None-Match` with the ETag of their last
  visit, or `If-Modified-Since`, and a server that has nothing new answers 304 with no body
  (Google Search Central, "Crawling December: HTTP caching", 2024).
- **Adaptive revisits.** Apache Nutch's AdaptiveFetchSchedule adjusts each page's interval:
  - a page found unchanged waits 20% longer next time;
  - a changed one waits 20% less;
  - the interval stays between one day and seven by default.

  Cho and Garcia-Molina's work on refresh policies is the basis of such schedules.
- **Crawl budget.** Google spends its crawling on the URLs that are worth it: "crawl demand"
  falls for URLs that bring nothing, and low-value URLs "waste a lot of Google crawling time".
- **Failed fetches.** Apache Nutch generates a URL that met a recoverable error for fetching
  again, three times by default (`db.fetch.retry.max`). After five timeouts or similar
  exceptions on one host, it drops the rest of that host's URLs from the round
  (`fetcher.max.exceptions.per.queue`).
- **Status codes.** For Google, a 4xx other than 429 means the content does not exist. A 5xx
  or a 429 makes its crawlers slow down, and the URL is kept for a while before it is dropped
  (Google, "HTTP status codes, network and DNS errors").
- **Time limits.** Nutch can give a fetch round a number of minutes; when they run out, the
  URLs left are skipped and the round ends with what it fetched (`fetcher.timelimit.mins`).
- **Backoff with jitter.** Waits that grow after each failure bring clients that failed together
  back together. A random part in each wait spreads them out. "Equal jitter" waits half the
  backoff plus a random share of the other half. Jittered backoff "should be considered a
  standard approach for remote clients" (Marc Brooker, AWS Architecture Blog, 2015).
- **robots.txt** may be cached, but "SHOULD NOT" be used for more than 24 hours (RFC 9309, 2.4).
- **Sitemaps.** Google uses `lastmod` when it is "consistently and verifiably" accurate, and
  ignores `changefreq` and `priority`.
- **Incremental builds.** A build is minimal when it redoes only the work that depends on
  inputs that changed since the last one. Early cutoff stops a result that did not change from
  redoing what depends on it (Mokhov, Mitchell and Peyton Jones, "Build systems à la carte").

## The plan, by gain

1. **Timings in the logs.** Each stage of the publication and of the discovery writes how long
   it took, so each step below is measured before and after.
2. **Barren sites and failed pages.** A site with 50 pages that answered and none with a
   JobPosting is read once a week, and each pass reads only 10 of its new pages, in case it
   starts publishing the block. This saves at least 8,000 s a day of the crawler's time. A
   page that did not answer is tried again, up to three tries, and a site with five such pages
   in one pass is left until the next one (Nutch's defaults). A 404, 410 or 403 counts as an
   answer. The pages kept without the block before this change, on sites that publish it, are
   read again once (a one-off tool, removed once it had run). A careers pass stops reading pages
   a minute before its deadline and keeps what it read; the rest waits for the next pass. The
   wait after a failure is drawn between half and the whole of the backoff.
3. **Conditional requests** for the boards of Greenhouse, Ashby, Personio and Teamtailor, and
   for sitemaps that give a validator: an unchanged answer costs no body, no parsing and no
   write. For boards without validators, the body's hash tells unchanged from changed.
4. **The translation leaves the publication.** New titles are translated by the crawler's runs
   as they arrive, and a publication only reads the cache.
5. **Incremental publication.** The offers worked out from each source are kept with that
   source's last pass. A publication works out again only the sources read since the last one
   (about one in eight), then merges and writes as today.
6. **Adaptive cadence** after measuring how often each kind of source really changes: a source
   that stays the same is read less often (up to a week), one that changes stays at a day.

Each step goes in its own pull request, with its time before and after measured on the server.

## Sources

- Google Search Central, "Crawling December: HTTP caching" (2024):
  https://developers.google.com/search/blog/2024/12/crawling-december-caching
- Google, crawl budget management: https://developers.google.com/crawling/docs/crawl-budget
- Google, building a sitemap (`lastmod`): https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
- RFC 9309, Robots Exclusion Protocol, 2.4 Caching: https://www.rfc-editor.org/rfc/rfc9309.html
- Apache Nutch, AdaptiveFetchSchedule:
  https://github.com/apache/nutch/blob/master/src/java/org/apache/nutch/crawl/AdaptiveFetchSchedule.java
- Apache Nutch, default settings (`db.fetch.retry.max`, `fetcher.max.exceptions.per.queue`):
  https://github.com/apache/nutch/blob/master/conf/nutch-default.xml
- Google, HTTP status codes, network and DNS errors:
  https://developers.google.com/crawling/docs/troubleshooting/http-status-codes
- Marc Brooker, "Exponential Backoff And Jitter", AWS Architecture Blog, 2015:
  https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
- Cho and Garcia-Molina, "Effective page refresh policies for web crawlers", ACM TODS 28(4), 2003.
- Mokhov, Mitchell and Peyton Jones, "Build systems à la carte":
  https://www.microsoft.com/en-us/research/wp-content/uploads/2018/03/build-systems-final.pdf
