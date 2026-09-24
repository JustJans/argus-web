# Reading the occupation from more than the title

Research of 24 September 2026. The question: after the coding indexes
(`docs/research/occupation-coding.md`), can an advert's description, or the category its source
gives, tell the occupation where the title alone cannot? And can that be done without letting in
what is not ours?

The site's rules hold throughout:
- no advert text is ever published, only facts read from it (as the screens of years, degrees
  and languages already do);
- only data already downloaded is used;
- no paid API or language model;
- nothing reaches production unmeasured.

## What Argus's bot does with the description

The bot reads the description after the title has let the offer in, and only to leave it out: the
years it asks for (and in which field), a degree the user lacks, a language it requires. It reads
the description proper, never the whole page: menus in the country's language once made it think
every offer required that language. The description never lets an offer in.

## What is known

- **Text zoning.** Gnehm and Clematide (2020, Swiss Job Market Monitor, University of Zurich)
  split job adverts in German, French and English into eight zones: company, reason for the
  vacancy, administration, agency, incentives, job description, hard skills and soft skills. They
  reach 91% at the level of each word with neural networks trained on 80,000 hand-annotated
  adverts. The occupation is told by the job description and the hard skills, not by the
  company's presentation.
- **Aggregators.** Adzuna classifies with machine learning on the title and the description in the
  United Kingdom and the United States; elsewhere it takes the category the recruiter gave.
- **The EU.** Cedefop's Skills-OVATE files the adverts of 32 countries under ISCO-08 unit groups
  with machine learning. A 2024 study for Polish job vacancy statistics reached 73–74% correct at
  four digits and 88–89% at one. It used transformer models on the descriptions and 143,000 coded
  examples.
- **occupationcoder** (ONS Data Science Campus) uses the description only to shortlist codes.
  Among those, the one whose titles best match the advert's title wins.
- **Specialised boards** (EuroEngineerJobs: €760 an advert, reviewed by an editor) do not
  classify at all. The employer pays and the editor reads.

## Measured on our data

**Descriptions already in the store** (a sample of 300 sources a group):

| Sources | With a description | Length kept |
|---|---:|---|
| Employers' sites | 98% | 1,500 characters |
| Greenhouse, Lever, Ashby | 100% | 4,000 |
| Recruitee, Teamtailor, Personio | 85–100% | up to 5,000 |
| Public services | 91% | median 2,000 |
| SmartRecruiters, Workable, Workday | 0% | — |

**The description as evidence**, found by looking for the index's titles in it:
- 23,564 adverts left out in Europe carry a technical role word in the title (technician,
  techniker, adviseur, specialist...) and a description.
- Only 2,295 of them (10%) name a title of the index in the description. The first such mention
  sits at character 750 in the median.
- Read by hand, most of those mentions say nothing about the job:
  - "video" in "video interview" or "video conference";
  - "Copilot", the software, taken for a pilot;
  - "top architects" as clients, "working alongside civil engineers";
  - "uitvoerder" as the next step of a career;
  - a superyacht's "kapitein" thanking the technician.

  Few name the job itself ("als technisch adviseur ... werktuigbouwkundige installaties").

**The sources' own categories** are given as follows:

| Source | Field | Filled | Values |
|---|---|---:|---|
| SmartRecruiters | function | 100% | a fixed list |
| Personio | occupation category | 100% | a fixed list |
| Recruitee | category | 100% | a fixed list |
| Workable | function | 52% | a fixed list |
| Greenhouse, Lever, Ashby | department, team | 76–100% | each company's own words |
| Employers' JobPosting pages | occupationalCategory | 7% | free text, no ISCO code |

Against the gate's verdict (about 40 boards an ATS, titles read in their country's languages),
the categories are wrong in both directions:
- **As a veto** they would drop good adverts: "Hydrographic Surveyor" filed under
  Strategy/Planning, "IT Service Desk Specialist" under Administrative, "Principal ML Engineer"
  under General Business.
- **As a way in** they would admit what is not ours: "Junior Accountant" under Engineering,
  "Junior Legal Counsel" under IT, "Reinigungskraft" (cleaning) under production, "Timmerman"
  (carpenter) under construction.

## Conclusion

- **The description does not let an advert in.** Read naively it is mostly noise. Reading it well
  takes text zoning and a trained model, and even then the best published systems are right three
  times in four. It stays where Argus's bot keeps it: after the title, for the screens.
- **The sources' categories do not decide either**, neither to leave out nor to let in.
- **Before either is tried again**, three things are needed:
  - a hand-labelled set of about 500 adverts, to measure recall and precision;
  - only role sentences as evidence ("we are looking for a…", "als … ben je"), with the job they
    name agreeing with the title's role word;
  - a category counted only together with a technical role word in the title.

  Each would have to reach 95% precision on the labelled set before reaching production.

What the categories did show were a few gaps in the gate, now mended:
- German sales ("Vertrieb…") and French project or land developers ("développeur de projet",
  "développeur foncier") as outside words;
- "Berufsausbildung" as hygiene, like an Ausbildung;
- the French "·se" gender mark;
- "programmeur" and "développeur" as computing words;
- hyphenated "front-end", "back-end" and "full-stack";
- the Dutch "hoofduitvoerder" (head site supervisor).

## Sources

- A.-S. Gnehm, S. Clematide, "Text Zoning and Classification for Job Advertisements in German,
  French and English", NLP+CSS workshop, 2020: https://aclanthology.org/2020.nlpcss-1.10/
- Cedefop, Skills-OVATE: https://www.cedefop.europa.eu/en/tools/skills-online-vacancies
- "Multilingual hierarchical classification of job advertisements for job vacancy statistics",
  2024: https://arxiv.org/abs/2411.03779
- Adzuna, categories: https://developer.adzuna.com/docs/categories; OECD.AI on Adzuna's data:
  https://oecd.ai/en/adzuna
- schema.org, occupationalCategory: https://schema.org/occupationalCategory
- EuroEngineerJobs, recruit: https://www.euroengineerjobs.com/recruit
