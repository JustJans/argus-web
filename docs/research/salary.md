# Pay: showing it and filtering by it

Research of 23 September 2026, before the pay on the cards and the minimum-pay filter.

## How job sites and job-data firms do it

- **Only the pay the employer states.** Google's JobPosting markup: `baseSalary` is "the actual
  base salary for the job, as provided by the employer (not an estimate)". Lightcast "extracts the
  salary information from the job posting as advertised" and "does not present an 'estimated
  salary' for the individual job posting". Indeed and Adzuna add their own estimates when an
  advert gives none, and label them apart from the employer's figure. This site shows no
  estimates.
- **A figure has a period.** schema.org's `QuantitativeValue.unitText` takes HOUR, DAY, WEEK,
  MONTH or YEAR; Google Cloud Talent Solution (the search engine several large job boards run on)
  has the same units plus ONE_TIME. Indeed's European data keeps "the advertised hourly wage or a
  monthly or annual salary" (Adrjan and Lydon, Central Bank of Ireland, 2022).
- **Comparing pay across periods: annualise.** Cloud Talent Solution multiplies the base pay by
  its expected units per year, by default for a full-time job: hour 2080, day 260, week 52,
  month 12, year 1. JobSpy (open source, GitHub) uses the same factors. Lightcast uses each
  country's working hours for hourly pay (2,340 a year in Turkey, for example).
- **A pay filter is a range that overlaps.** Cloud Talent Solution's `CompensationFilter` matches
  a job when its annualised range "overlaps" the searcher's range. It also has a switch,
  `includeJobsWithUnspecifiedCompensationRange`, that lets the searcher keep the jobs that state
  no pay.
- **Most adverts state no pay.** Indeed's share of postings with pay, March 2026: UK 56%,
  Netherlands 48%, France 43%, Ireland 39%, Italy 36%, Spain 17%, Germany 12%. In US data, 14% of
  posts carry pay; 8% give a range, on average as wide as 28% of its midpoint (Batra, Michaud and
  Mongey, NBER w31984).
- **Reading pay out of free text goes wrong in known ways.** JobSpy guesses the period from the
  size of the figure (under 350 an hour, under 30,000 a month), which only holds in US dollars: a
  monthly pay of 600,000 forints or 45,000 koruna would read as a year. Its bounds for a
  believable year are 1,000 to 700,000.

## What our sources carry

Measured on 23 September 2026 (the server's store and each source's own data):

| Source | Field | Adverts with pay | Period | Notes |
|---|---|---|---|---|
| Employers' sites (JobPosting) | `baseSalary` | 30 of 113 pages with a block (27%) | `unitText` | Also "Monthly", "£", "€", "eur" and no unit (2): normalised, or refused |
| Lever | `salaryRange` {min, max, currency, interval} | 1,480 of 5,901 | `per-year-salary`, `per-month-salary`, `per-hour-wage`, `per-week-salary`, `per-day-wage` | `bi-week-salary` and `bi-month-salary` (13): refused |
| Ashby, `includeCompensation=true` | `compensation.summaryComponents` (type Salary) | 794 of 1,789 | `1 YEAR`, `1 MONTH`, `1 HOUR`, `1 DAY` | Used only when `shouldDisplayCompensationOnJobPostings` is not false |
| Recruitee | `salary` {min, max, period, currency} | 424 of 1,632 | `year`, `month`, `hour`; none (12): refused | |
| Personio XML | `salaryInformation` {min, max, currencyCode, type} | 117 of 1,658 | `yearly`, `monthly`, `hourly` | |
| Greenhouse, `pay_transparency=true` | `pay_input_ranges` | 1,041 of 5,391, nearly all USD and CAD | none | No period: refused |
| SmartRecruiters, Workable, Teamtailor, Workday, Oracle | none in the lists the site reads | | | |
| Czechia, MPSV | `mesicniMzdaOd`, `mesicniMzdaDo`, `typMzdy` | all 39,413; 42% with a top | `typMzdy`: month (37,012) or hour (2,401) | With an hourly type the "monthly" fields hold the hourly rate |
| Lithuania, UŽT | `vid_darbo_uzmokestis`, `maks_darbo_uzmokestis`, `valiuta` | 63 of 63 in group 214; 48 with a top | month | "Monthly pay, before taxes" (the dataset's own description) |
| Latvia, NVA | `Alga_no`, `Alga_lidz` | all 1,372 | not stated | NVA's page: "Alga bruto 2300 - 2600 EUR" |
| Catalonia, Feina Activa | `salaryMin`, `salaryMax` | 983 of 2,000 | month | Its page: "Salari mensual brut des de 1416 fins a 1550" |
| Sweden, JobTech | `salary_type` | none with a figure | | Only "fixed" or "variable" |
| Lanbide, Castilla y León, SEF Murcia | none | | | |

## Decisions

1. **Structured fields only for now.** Pay is read from the fields above, already downloaded by
   the crawler: no new request per advert. Free text is not read: the pitfalls above (period
   guessed from size, currencies, bonuses and benefits written as figures) would put wrong
   figures on cards. A text reader can come later, behind a hand-checked test set.
2. **The card shows the advert's own figure**, in its currency and period ("€3,500–4,500 a
   month").
3. **A figure without a period is refused.** One exception, decided by the law, not by
   guessing: NVA states no period, but Latvia's minimum monthly wage for full-time work is €780.
   A full-time figure of at least €780 is therefore a month, and one under €50 is an hour. Figures
   in between, and part-time ones, are refused.
4. **For the filter, the pay becomes euros a year**: Cloud Talent Solution's factors (hour 2080,
   day 260, week 52, month 12). An hourly figure with its weekly hours (MPSV) uses hours × 52. A
   part-time advert paid by the hour, day or week gets no yearly figure: the card shows it; the
   filter treats it as unstated. Currencies: the ECB's euro reference rates, one small file per
   publication. A currency the ECB does not quote gets no yearly figure.
5. **A believable year, or nothing:** from €7,000 to €300,000, with the top of a range at most
   five times its bottom. JobSpy bounds a year the same way (1,000 to 700,000 dollars); ours are
   set to catch the usual slip in both directions. A month's pay labelled as a year's falls under
   €7,000, about the lowest EU minimum wage for a year of full-time work. A year's pay of €25,000
   or more labelled as a month's rises over €300,000. A figure outside the bounds is dropped from
   the card too: it is more likely a slip than a real pay.
6. **The filter: "at least X a year"** matches a range whose top reaches X (overlap, as Cloud
   Talent Solution). By default the adverts that state no pay stay in the list; a check box keeps
   only the adverts that state it (`includeJobsWithUnspecifiedCompensationRange`).

## Cost on the server

- No new requests per advert; one exchange-rate file per publication.
- The store gains a few numbers per advert that has pay. Each shard record gains `p` (the
  advert's figure, about 25 bytes) and `pa` (euros a year, about 8 bytes), only on adverts with
  pay.
- The work is done once per advert while the offers are built, after the gate: on the ~83,000
  offers kept, not on the ~957,000 adverts read.

## Sources

- Google, JobPosting structured data: https://developers.google.com/search/docs/appearance/structured-data/job-posting
- schema.org `baseSalary`, `MonetaryAmount`, `QuantitativeValue`: https://schema.org/baseSalary
- Google Cloud Talent Solution, `CompensationInfo`:
  https://docs.cloud.google.com/talent-solution/job-search/docs/reference/rest/v4/projects.tenants.jobs ·
  `CompensationFilter`: https://docs.cloud.google.com/talent-solution/job-search/docs/reference/rest/v4/JobQuery
- Lightcast, advertised salary: https://kb.lightcast.io/en/articles/7932497-advertised-salary-job-posting-analytics ·
  its hours per year by country: https://kb.lightcast.io/en/articles/6957446-job-posting-analytics-jpa-methodology
- Adzuna's `salary_is_predicted`: https://developer.adzuna.com/docs/search
- Latvia's minimum monthly wage, €780 from 1 January 2026: https://www.lm.gov.lv/en/minimum-monthly-wage
- Eurostat, minimum wages on 1 January 2026 (lowest: Bulgaria, €620 a month):
  https://ec.europa.eu/eurostat/web/products-eurostat-news/w/ddn-20260130-2
- Adrjan and Lydon, "Wage growth in Europe: evidence from job ads", Central Bank of Ireland, 2022:
  https://www.centralbank.ie/docs/default-source/publications/economic-letters/wage-growth-europe-evidence-job-ads.pdf
- Indeed Hiring Lab, salary transparency in Europe (March 2026):
  https://hiringlab.indeed.com/uk/blog/2026/05/07/full-salary-transparency-in-europe-is-still-a-distant-prospect/
- Batra, Michaud and Mongey, "Online Job Posts Contain Very Little Wage Information", NBER w31984:
  https://www.nber.org/papers/w31984
- JobSpy, salary extraction: https://github.com/speedyapply/JobSpy/blob/main/jobspy/util.py
- Indeed, estimated and employer-provided pay: https://www.indeed.com/career-advice/pay-salary/pay-transparency-update
- Lever postings API: https://github.com/lever/postings-api · Ashby: https://developers.ashbyhq.com/docs/public-job-posting-api ·
  Greenhouse: https://docs.greenhouse.io/job-board.html · Recruitee: https://docs.recruitee.com/reference/offers
- MPSV open data: https://data.mpsv.cz/web/data/volna-mista-za-celou-cr · UŽT: https://data.gov.lt/datasets/2894/ ·
  NVA: https://data.gov.lv/dati/lv/dataset/vakances · Feina Activa: https://feinaactiva.gencat.cat/ ·
  JobTech taxonomy (wage type): https://taxonomy.api.jobtechdev.se/v1/taxonomy/graphql
- ECB euro foreign exchange reference rates:
  https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html
