# Work mode: on-site, hybrid or remote

Research of 23 September 2026, before the work-mode filter.

## How job sites do it

- **Three values, chosen by whoever posts the job.** LinkedIn's workplace types are On-site,
  Hybrid and Remote. Jobs that LinkedIn copies from an employer's site ("job wrapping") state
  their type with a tag in the description: `#LI-Onsite`, `#LI-Hybrid`, `#LI-Remote`. Indeed and
  Monster read the same tags. The applicant-tracking systems use the same three values: Lever
  (`workplaceType`: on-site, hybrid, remote, unspecified), Ashby (OnSite, Hybrid, Remote), Oracle
  (ORA_ON_SITE, ORA_HYBRID, ORA_REMOTE). So does the Swedish employment service's taxonomy
  ("Workplace model": Arbete på plats, Hybridarbete, Distansarbete, each with a definition).
- **Google marks only full remote.** JobPosting's `jobLocationType: TELECOMMUTE` is for jobs done
  "remotely 100% of the time". Hybrid jobs and jobs where home working is "a negotiable benefit"
  must not use it. Google Cloud Talent Solution has the same single flag, with a search option to
  allow or exclude such jobs.
- **Reading it from free text goes wrong often.** Indeed's list of telework words, in a dozen
  languages, is searched in the title, description and location (OECD Productivity Working Paper
  30, 2021, Annex Table A.2). Hansen, Lambert, Bloom, Davis, Sadun and Taska tested such a list
  against 10,000 hand-labelled passages (NBER w31007). Its error rate was about eight times that
  of their fine-tuned language model (0.02, so roughly 0.16); another published list erred 0.19
  of the time. The false alarms: a company's "home office" (its headquarters), "work from home
  care facilities", a UK "Home Office work permit", and forms that print "Home working: not
  possible". Handling negation helped, but not by much.

## What our sources carry

Measured on 23 September 2026 on 25 boards per applicant-tracking system, and on each public
source's own data:

| Source | Field | What it says |
|---|---|---|
| Lever | `workplaceType` | remote 4,490, hybrid 225, onsite 181 of 4,896 |
| Ashby | `workplaceType` | OnSite 115, Hybrid 58, Remote 58, none 30. Its `isRemote` is also true for every hybrid job |
| Recruitee | `on_site`, `hybrid`, `remote` (yes/no each) | one ticked on 683 of 822; several on 139 (the employer offers more than one) |
| SmartRecruiters | `location.remote`, `location.hybrid` | remote 122, hybrid 279, neither 1,033 |
| Teamtailor (RSS) | `remoteStatus` | hybrid 157, none 87, onsite 30, fully 28, temporary 7 |
| Workable (widget) | `telecommuting` | yes on 39 of 1,043 |
| Workday (list) | `remoteType`, set by 28 of 468 | "On Site", "Onsite", "#LI-Onsite", "Hybrid", "#LI-Hybrid", "Remote" |
| Oracle | `WorkplaceTypeCode` | on-site 164, hybrid 111, remote 38, none 667 of 980 |
| Greenhouse, Personio | none | Greenhouse's location sometimes names "Remote" (153 of 1,491) or "Hybrid" (8) |
| Employers' sites (JobPosting) | `jobLocationType` | on 9 of 113 pages with a block |
| Sweden, JobTech | `workplace_model` | "Arbete på plats" on 31,775 of 43,002 adverts; hybrid and remote on none. 448 adverts marked "on site" describe remote or hybrid work in their text |
| Other public sources | none | |

## Decisions

1. **Three values and "not said"**: on-site, hybrid, remote. An advert that says nothing is
   unknown, never assumed.
2. **Where the value comes from, in order:**
   1. the source's own field, as in the table;
   2. a LinkedIn tag in the advert's text (`#LI-Remote`, `#LI-Hybrid`, `#LI-Onsite`);
   3. the location field, when it names remote work instead of a place ("Remote", "Home Office",
      "Télétravail", "Teletrabajo"…, from Indeed's location words).
3. **Not used, and why.** The description's wording, because of the error rates above. JobTech's
   "Arbete på plats": it is the form's default, set on adverts whose text says remote or hybrid.
   Ashby's `isRemote`: it is also true for hybrid jobs.
4. **An employer that offers several modes** (Recruitee, SmartRecruiters) counts as the most
   flexible one: the filter answers "can I work this way?".
5. **The filter**: check boxes On-site, Hybrid, Remote. With none checked, every advert shows.
   With some checked, an advert shows when it states one of them; an advert that states nothing
   is left out, as on the big sites' remote filters.
6. **Bugs this fixes in the current readers.** Ashby's hybrid jobs were taken as remote.
   Teamtailor's hybrid jobs were taken as remote, and its fully remote ones were not. Hybrid was
   ignored for Recruitee, SmartRecruiters, Workday and Oracle.

## Cost on the server

Fields already downloaded; one letter (`w`) on each shard record that states a mode. The LinkedIn
tag is a plain text search on the offers kept after the gate.

## Sources

- LinkedIn, job wrapping with workplace types:
  https://www.linkedin.com/help/recruiter/answer/a414765/post-remote-hybrid-or-on-site-jobs-with-job-wrapping ·
  LinkedIn tags read by other boards: https://help.datapeople.io/article/226-linkedin-location-tags
- Google, JobPosting `jobLocationType`: https://developers.google.com/search/docs/appearance/structured-data/job-posting
- Google Cloud Talent Solution, telecommute:
  https://docs.cloud.google.com/talent-solution/job-search/docs/reference/rest/v4/JobQuery
- Adrjan, Ciminelli, Judes, Koelle, Schwellnus and Sinclair, "Will it stay or will it go?
  Analysing developments in telework during COVID-19 using online job postings data", OECD
  Productivity Working Papers 30, 2021: https://www.oecd.org/en/publications/will-it-stay-or-will-it-go-analysing-developments-in-telework-during-covid-19-using-online-job-postings-data_aed3816e-en.html
- Hansen, Lambert, Bloom, Davis, Sadun and Taska, "Remote Work across Jobs, Companies, and Space",
  NBER w31007: https://www.nber.org/papers/w31007
- Lever postings API: https://github.com/lever/postings-api · Ashby:
  https://developers.ashbyhq.com/docs/public-job-posting-api · Recruitee:
  https://docs.recruitee.com/reference/offers
- JobTech taxonomy, workplace model (`work-place-model`): https://taxonomy.api.jobtechdev.se/v1/taxonomy/graphql ·
  JobSearch API: https://jobsearch.api.jobtechdev.se/
