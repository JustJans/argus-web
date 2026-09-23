# Why the big sites list millions of offers, and what we miss

Research of 23 September 2026. The question: OmniJobs lists 2.7 million offers, Hiring Cafe 3.6
million, EURES 2.0 million, and this site 83,000. Are their millions waiters and shop assistants,
or is there something we do not read?

## The short answer

1. **Most of their volume is outside our occupations.** EURES answers searches by ISCO group
   (its search API takes `occupationUris` such as `http://data.europa.eu/esco/isco/C2144`): of
   its 2,045,311 records on 23 September, **248,454 (12%)** fall in our 52 ISCO unit groups
   (engineers, architects and surveyors, technicians, supervisors, plant operators, ship and
   aircraft crews, software and IT). OmniJobs and Hiring Cafe index every occupation, and Hiring
   Cafe mostly the United States.
2. **In our occupations, the gap is the public employment services of six countries.** In 15 EU
   and EEA countries this site already lists as many or more of our occupations than EURES (Spain
   4,113 against 2,054; Poland 3,084 against 867; Portugal, Ireland, Italy, Czechia, Hungary,
   Romania, Denmark…). The difference is almost all in Germany (−71,095), France (−41,093),
   Belgium (−35,747), the Netherlands (−25,267), Austria (−6,751) and Switzerland (−2,746): the
   countries whose public service feeds a national job exchange of several hundred thousand
   offers into EURES.
3. **Commercial job boards and staffing agencies**, which this site does not read by rule, are
   the other big stream. Cedefop names private portals, public services, agencies, newspapers and
   employers' sites as the sources of online job ads; no public figure splits the shares.
4. **Duplicates inflate every headline**: aggregators count the same job once per board, agency
   and repost (one analysis finds half of Indeed's listings duplicated, expired or posted by
   third-party recruiters). This site merges the same address and the same employer's role.

## The numbers

Our pile of 23 September 2026, 07:06 UTC: 83,306 offers, built from 957,223 adverts read. The
gate kept 262,798 of them in our occupations (72.5% were other jobs), 136,894 were outside
Europe, 9,478 were sales, trainee or shop jobs by title, 11,115 had expired, 23,199 were
duplicates.

EURES records in our 52 ISCO groups (first figure) and in all occupations (second), by country,
against this site:

| Country | This site | EURES, our groups | EURES, all | Gap |
|---|---:|---:|---:|---:|
| Germany | 15,016 | 86,111 | 667,154 | 71,095 |
| France | 7,676 | 48,769 | 471,852 | 41,093 |
| Belgium | 1,746 | 37,493 | 240,715 | 35,747 |
| Netherlands | 7,305 | 32,572 | 235,406 | 25,267 |
| Sweden | 8,178 | 19,127 | 132,286 | 10,949 |
| Austria | 1,196 | 7,947 | 64,909 | 6,751 |
| Switzerland | 1,293 | 4,039 | 41,550 | 2,746 |
| Norway | 431 | 1,520 | 14,078 | 1,089 |
| Spain | 4,113 | 2,054 | 28,690 | −2,059 |
| Poland | 3,084 | 867 | 19,122 | −2,217 |
| EU and EEA, all 31 | 62,412 | 248,454 | 2,045,311 | |

A EURES record is not always one advert: for Sweden EURES counts 132,286 records while the
Swedish service's own API lists 42,837 adverts (72,091 positions), and this site reads the 7,070
of them in our occupations, all of them (no group hits the API's paging ceiling). EURES figures
are an order of magnitude, not a count to match one by one.

## Can the missing public services be read?

| Service | Offers (EURES, all) | Reading them | Status |
|---|---:|---|---|
| Germany, Bundesagentur für Arbeit | 667,154 | Its terms forbid robots and reading the portal "for the purpose of data collection"; the community API (bundesAPI) is unofficial. Offers reach "selected cooperation partners" under an agreement (HR-BA-XML) | Needs a cooperation agreement: the owner's decision |
| France, France Travail | 471,852 | Official API "Offres d'emploi v2", licence allowing redistribution with the source cited | Needs an account: the owner's |
| Belgium, Wallonia, Le Forem | (part of 240,715) | **Open data**: every offer it publishes, 25,779 today, on ODWB with an API, CC BY-SA 4.0, updated continuously, with coordinates, posts, languages and education level | **Can be read now** |
| Belgium, Flanders, VDAB | (part of 240,715) | Vacancy API after an approved partnership and a signed agreement | Needs an application: the owner's |
| Belgium, Brussels, Actiris | (part of 240,715) | Not researched yet | — |
| Netherlands, UWV | 235,406 | No API, none planned; open data only aggregated per occupation and postcode | No clean way |
| Austria, AMS | 64,909 | No public vacancy API (its HR-API is for posting) | No clean way |
| Switzerland, SECO Job-Room | 41,550 | Its API is a channel for employers to post; reading not documented | To confirm |
| Finland, Työmarkkinatori | 11,076 | Search API for external services, after registration and accepting terms, free | Needs registration: the owner's |
| Norway, NAV | 14,078 | Public feed with a token requested by e-mail; adverts must be withdrawn as soon as NAV withdraws them | Needs the token: the owner's |

## Employers' sites that give nothing

Of the employers' sites the server's triage looked at (2,837, `builder/state/triage.tsv`):
1,020 publish no JobPosting block on their vacancy pages, 306 put up a bot wall, 258 are dead,
305 list nothing, and about 190 run on an applicant-tracking system this site already reads
(Teamtailor 106, Recruitee 41, Workday 28, Personio 7…) but are still read as plain sites.

## What follows

1. Read Le Forem's open data (Wallonia): a public service, CC BY-SA 4.0, no account.
2. Switch the ~190 sites on a known ATS to that ATS's reader.
3. The owner's applications, in order of volume: France Travail (account), a cooperation
   agreement with the Bundesagentur für Arbeit, VDAB (partnership), NAV (token), Työmarkkinatori
   (registration).
4. Pages without a JobPosting block (1,020 sites): the heuristic reader and the browser in the
   crawling plan.

## Sources

- EURES job search (counts by country and ISCO group through its public search API):
  https://europa.eu/eures/portal/jv-se/search
- Eurostat, Web Intelligence Hub, online job advertisements: https://cros.ec.europa.eu/wih/oja
- Cedefop, Skills-OVATE and the sources of online job ads:
  https://www.cedefop.europa.eu/en/tools/skills-online-vacancies ·
  https://www.cedefop.europa.eu/en/publications/5572
- Duplicates on aggregators: https://www.jobintel.com/blog/duplicate-job-postings
- JobTech JobSearch API: https://jobsearch.api.jobtechdev.se/
- Bundesagentur für Arbeit, terms of use: https://www.arbeitsagentur.de/en/terms-of-use ·
  HR-BA-XML: https://www.arbeitsagentur.de/unternehmen/arbeitskraefte/hr-ba-xml-schnittstelle ·
  community API: https://github.com/bundesAPI/jobsuche-api
- France Travail API: https://francetravail.io/data/api/offres-emploi
- Le Forem open data: https://www.leforem.be/open-data.html ·
  https://www.odwb.be/explore/dataset/offres-d-emploi-forem/
- VDAB vacancy API: https://extranet.vdab.be/api-center-excellence-coe/vacatures-ophalen-met-de-vacatures-api
- UWV (no vacancy API): https://data.overheid.nl/community/datarequest/vacatures-werk-nl
- AMS HR-API: https://www.ams.at/unternehmen/service-zur-personalsuche/ams-hr-api
- SECO Job-Room API: https://www.arbeit.swiss/en/employers/job-registration-requirement
- Työmarkkinatori APIs: https://tyomarkkinatori.fi/ohjeet-ja-tuki/rajapinnat/tyopaikkailmoitusten-rajapinnat
- NAV feed: https://navikt.github.io/pam-stilling-feed/
