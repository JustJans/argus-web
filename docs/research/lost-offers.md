# Offers the builder was losing

Research of 25 September 2026, prompted by an outside audit of commit 1ae88db. Every figure
below was measured on the server's store the same day (974,318 adverts from 18,617 sources) or
on the last build's `explain.txt` (the adverts of our families that were left out, with the
reason).

## Workday stopped at forty adverts a board

Workday's careers sites answer a public listing call (`POST /wday/cxs/<tenant>/<site>/jobs`)
twenty adverts at a time. **Only the first page carries the total; the pages after it say 0**,
so a loop that reads the total from each page stops after the second one. A write-up of the
same API says it in as many words: "Only the first page carries `total`. Later pages return it
as 0. Carry it forward yourself, or your loop will stop after page two"
([dododata, DEV Community](https://dev.to/dododata/scraping-workday-career-sites-without-a-browser-and-the-2000-job-ceiling-h2e)).
The same source notes that `limit` caps at 20 and that the total itself caps at 2,000.

On the server, 422 of the 642 Workday boards held exactly 40 adverts. A sample of 16 of them,
asked for their first page, listed 9,945 adverts, of which we read 640 (6%); Airbus lists
2,000. The reader now carries the first page's total, and still stops at 1,000 (our own cap,
under Workday's 2,000).

Boards found by the scouts were also cut at 500 adverts, and 137 sat at that cap, among them
the boards of engineering firms that hire by the thousand (Alten, Assystem, Bosch, Egis,
Ramboll, Socotec, AECOM). The cap is now 1,000, the paging limit of the ATSs that page.

## Employers' pages whose place and day went unread

Among the adverts of employers' own sites, **76,916 had no place and 210,254 no day**. One page
each from the 80 sites with the most of them showed why:

- **SAP SuccessFactors** career sites (Capgemini, Atos, Nestlé, Vodafone, EY, Mott MacDonald,
  Fraunhofer, Dachser, Schaeffler, Mahle, Zurich, Bureau Veritas, IDOM and many more) mark the
  vacancy up with microdata and write the whole place in the street's field (`<meta
  itemprop="streetAddress" content="Bogota, CO">`) and the day the way Java prints a date
  (`<meta itemprop="datePosted" content="Wed Sep 09 02:00:00 UTC 2026">`). schema.org defines
  `streetAddress` as "The street address. For example, 1600 Amphitheatre Pkwy."
  ([schema.org](https://schema.org/streetAddress)): the platform bends the field, and the
  reader only looked at the town, region and country.
- **JSON-LD with the address as one line** (`"address": "Dublin"`), which schema.org allows (a
  Place's `address` is a PostalAddress or Text): the reader kept the line aside and never used
  it. One Irish recruiter alone had 1,009 adverts that way.
- **Days written other ways**: unpadded ("2026-9-21", IKEA, Boeing, L3Harris), with slashes
  ("2026/9/04"), with the month in words ("September 9, 2026").

A board advert with no place is left out unless its title names one ("company boards are read
the world over"), so the first two cost whole employers: IDOM, the Spanish engineering firm,
had all 166 of its adverts dropped. The reader now takes the street's field or the one-line
address when there is no town, region or country, and reads days written those ways (English
and the main European languages' month names; a day and month in figures only when they
cannot be swapped). Pages read before are read again, after each pass's new pages and within
its page budget, the ones without a place first: a big site heals in about a week.

## Smaller losses

- **Offers with no day under a posted-date filter**: 13.7% of the pile (12,054 of 87,815,
  almost all from employers' sites) names no day, and every posted-date window left them out.
  They now stay: an offer is not known to be old because its page names no day.
- **The same job in two towns**: duplicates were found by company and title alone, so a job
  advertised in Madrid and in Munich became one offer. Job sites list a job per location; the
  key now carries the place (the GeoNames town, so "Munich" and "München" are one).
- **"survey" as a hygiene word** left out survey engineers and technicians (offshore survey,
  survey support: about ten adverts); the paid-survey gigs it was there for are still caught.
- **Region codes read as countries**: the first catalogue country among a place's codes won
  ("Bern, BE, CH" was Belgium); the last code is the country now. A small-letter country code
  ending the place ("Barcelona, CT, es"), Canada's province codes ("London, ON") and Germany's
  states by name (286 adverts of "Baden-Württemberg" were in Switzerland, by its town of Baden)
  are read too.
- **A site read twice**: 53 hosts were listed both by hand (with an address) and by a scout
  (by host), and 54 addresses still held their page's template (`${...}`).

## What was measured and left alone

- **"comercial"** as an outside word: of the 536 European adverts it keeps out, the rest of
  the title is one of our occupations in six, and all six are sales jobs ("COMERCIAL
  INFORMÁTICO/CA", "Consultor Comercial IT/ERP").
- **Region codes read against GeoNames' towns** ("Bergamo, BG" as Italy): ten dropped adverts
  would change, and seven of them are American ("Aurora, CO", "Santa Maria, CA").
- **Region names** (GeoNames' first-level divisions) as a sign of the country: 119 dropped
  adverts name one, and several would go wrong ("Münster" read as the Irish province).
