# Reading an advert's occupation from its title

Research of 23–24 September 2026. The question: how to find every advert of the vertical (the
52 ISCO-08 unit groups of engineers, technicians and IT) when most of them come with nothing but
a title, and to find them the way the people who do this for a living do it.

## The problem, measured

Only one advert in ten arrives with an official occupation code: the public employment services
of Sweden (JobTech, 5,770 offers) and Czechia (MPSV, 2,120) put one on every advert. The other
nine come from employers' sites (52% of the offers) and job-board systems (37%) with a title and
nothing else, and the gate has to tell the occupation from the title.

Until now the gate matched ESCO's job titles as exact phrases, plus a few hand-made titles and
routes for "engineer" and computing words. Among the 437,599 adverts it left out as outside the
vertical, in Europe or of unknown place, 44,795 carry a sign of our scope in the title (engineer,
technician, developer, surveyor, deck officer... in the sources' languages). A sample of 160 of
them, read one by one:

| Read as | Adverts |
|---|---:|
| Ours for certain | 42 |
| Ours, likely | 7 |
| A trade (vehicle technician, monteur, maintenance technician) | 50 |
| Rightly out (sales, interns, outside Europe) | 48 |
| Unclear | 13 |

About a quarter of those 44,795, some 12,000 adverts, are ours and were being left out. The
causes:

- **Titles ESCO lacks**: "Site Manager", "Mechanical Technician", "BIM coordinator", Dutch
  "werkvoorbereider" and "uitvoerder".
- **Plurals**: "Senior Project Engineers".
- **Words between**: "Avionics *Verification* Technician".
- **Hyphens**: "CAD-Designer".
- **Misspellings**: "Mooring & Subsea Enigneer".

## What is known

**Occupation coding** is the name of the task: giving a free-text job title a code of an
occupational classification. Statistics offices do it for every survey and census, with a
**coding index** (a list of job titles, each with its code) and rules.

- **CASCOT** (Warwick Institute for Employment Research), the coding tool of the ONS and other
  offices, has a multilingual ISCO-08 version. Besides the index, it has tables of rules
  (Elias, DASISH workshop):
  - downgraded words, less important than the rest;
  - equivalent word ends, such as plurals;
  - abbreviations, spelt out;
  - replacement words, as global substitutions;
  - conclusions: ambiguous text is scored low, and some text "can not conclude";
  - default rules, where a text is scored "as" an entry of the index.

  The rules are tested on job titles already coded. It is sold as a desktop program; its web
  version is only for trying it.
- **occupationcoder**, the ONS Data Science Campus's coder (Turrell et al., 2019), is open.
  - It cleans the title (letters only) and lemmatises it, but keeps "sales", "systems",
    "services", "operations" and a few more as they are.
  - It expands abbreviations and keeps only the words that some title of the index uses.
  - Then it looks for an exact match; failing that, it uses TF-IDF and a fuzzy token-set score.
  - English only; GPL, so its tables are not copied here, only its method.
- **Schierholz and Schonlau (2021)** compared seven methods on survey data.
  - The coding index is essential: adding 50,000 index titles to the training data improved
    every learning method.
  - Learning methods beat dictionary lookups, but they need thousands of hand-coded examples,
    and they lose up to 25 points on data unlike their training data.
  - Automatic coding of everything leaves errors; the offices code the sure cases automatically
    and send the rest to people.
- **Taxonomies with finer titles.**
  - O*NET (United States) has no "mooring engineer" either; it would file one with marine
    engineers and naval architects (17-2121).
  - Lightcast's 75,000 standardised titles are sold through an API.
  - Canada's NOC has an index of titles, in English and French.

**The official coding indexes**, with ISCO-08 codes:

| Index | Titles | ISCO-08 | Licence |
|---|---:|---|---|
| ONS, SOC 2020 Volume 2: the coding index (version 14) | 32,670 entries | a code on every entry | Open Government Licence v3.0 |
| CBS, beroepenindex ISCO 2008 | 4,715 Dutch titles | a code on every title | CC BY 4.0 |
| France Travail, ROME 4.0 | 14,301 appellations | the correspondence covers only the 532 fiches of ROME v3; many engineering fiches have none, others go to managers | Licence Ouverte |
| ESCO | 3,000 occupations, 27 languages | by occupation | used since the start |

## What the gate does now

1. **The index** is ESCO's titles plus the ONS's (1,572 in our groups) and the CBS's (551).
   `builder/tools/title-indexes.mjs` builds `catalogues/codes/titles.json` from the official files.
   - About a hundred titles are left out after a reading, one by one: content and marketing,
     property, food and garments, labouring, and titles too vague to stand alone.
   - Where the ONS files a title differently by industry, the plain entry is kept only when its
     plain meaning is plainly ours ("site manager" is a construction supervisor, 3123).
   - The twins' industries then become that title's **contexts**: "Logistics Site Manager" or a
     retail one stays out.
   - Laboratory titles get the contexts of the laboratories ISCO files elsewhere: medical and
     pathology (3212), dental (3214), veterinary (3240) and life science (3141). "Dental Lab
     Technician" is not a chemical technician.
   - A workshop or service technician on trucks, cars or buses is a motor vehicle mechanic
     (7231, a trade; the ONS's "vehicle technician").
   - Where the ONS and ESCO disagree on a title we already filed, ESCO's family stays: "systems
     engineer" (software for the ONS, electronics in aerospace) and the language-named developers
     ("Java developer", web development for the ONS).
2. **The second reading** cleans the words the way occupationcoder does, for a title the first
   reading found nothing in.
   - The title is cut where it lists or joins ("o", "and", "/", commas), so no title is found
     across two pieces.
   - The words are lemmatised, with occupationcoder's words kept as they are and words ending in
     -ics, -ss, -us or -is.
   - A hyphen separates words ("CAD-Designer").
   - A few abbreviations and the misspellings found in our own adverts are spelt out.
   - What only the second reading finds outside the vertical stands over our titles inside it,
     but never shuts the title out of the routes that follow. ESCO lists "help-desk technician"
     among sales jobs, and "IT Help Desk Technician" is still IT support.
   - The pieces of a list that ESCO's titles were split into ("Klima-" of
     "Heizungs-/Klima-/Sanitärtechnik") are left out, since without the hyphen they would read as
     titles.
   - Unlike occupationcoder, every word stays. occupationcoder drops the words no index title uses
     and then compares the whole of what is left. This gate finds titles *inside* an advert's
     title, and there dropping words made titles that were not there ("Site Selection Manager"
     as a site manager, "Computational Protein Designer" as a computational designer).
3. **Default rules**, CASCOT's "score as":
   - BIM titles count as CAD titles (3118; the ONS files "bim technician" and "cad coordinator"
     there);
   - "werkvoorbereider" as the CBS's "bouwkundig projectvoorbereider" (3112);
   - "uitvoerder" as "uitvoerder bouw" (3123);
   - "mooring engineer" with naval architecture (2144);
   - "mooring master" with the deck officers (3152).
4. **Computing**: "Windows/Linux/Teamcenter administrator" count as systems administrators
   (2522), as the ONS's "unix systems administrator" and "network administrator" do. Spanish
   "técnico de soporte" counts as IT support.
5. **Outside words and hygiene**:
   - Facilities management is outside the vertical (1219, as the ONS files "facilities
     manager"). ESCO lists "facility manager" among the mining engineers.
   - So is the French "technico-commercial", which is technical sales.
   - A student's thesis ("Thesis Work", Masterarbeit, examensarbete, TFM) is hygiene, like an
     internship.
6. **Where the standard draws the line, the gate follows it.**
   - "Wind turbine technician" and a plain "service technician" are technicians (3112, 3119).
   - "Maintenance technician", "vehicle technician" and "HVAC technician" are trades (7233,
     7231, 7126) and stay out.

## How others make sure the right adverts pass

- **Specialised boards** (EuroEngineerJobs, jobs.ingenieur.de, jobvector) do not filter the web.
  Employers pay for each advert (EuroEngineerJobs: €760 standard, €1,160 high visibility, a few
  basic ones free) and the board reads them: "We reserve the right to reject advertisements we
  consider unsuitable." The filter is the fee and an editor.
- **Aggregators** classify with machine learning on the title and the description. Adzuna does it
  in the United Kingdom and the United States; elsewhere it takes the category the recruiter gave.
- **The EU's own system**, Cedefop's Skills-OVATE (32 countries, adverts gathered by Eurostat's Web
  Intelligence Hub), files adverts under ISCO-08 unit groups with machine learning (support
  vector machines at first).
  - A 2024 study for Polish job vacancy statistics reached 73–74% correct at ISCO's four digits
    and 88–89% at one digit. It used transformer models on the adverts' descriptions and 143,000
    coded examples.
  - Nobody codes every advert right.

All of them read the description; this gate reads the title alone.

## Measured

On one snapshot of the store, with the crawler paused:

| | Before | After |
|---|---:|---:|
| Offers published | 83,127 | 87,181 |
| Gained / lost | | 4,247 / 193 |
| Store and gate | 243 s | 273 s |
| Peak memory | 908 MB | 1,326 MB |

- **Gained**: nearly all of a random sample of 60 read as ours. Werkvoorbereiders and
  uitvoerders, site managers, service technicians of wind turbines, production and test
  technicians, BIM and CAD titles, systems administrators.
- **Lost**: students' theses, facilities managers, CNC operators, and adverts whose duplicate
  won instead.
- **The labelled sample**: 18 of the 40 sure misses are found now. Most of the rest are in German
  or French.

**Left for later**:
- French, German, Norwegian and Polish titles, until those countries' public employment services
  bring their codes.
- A learning method, which would need thousands of coded examples. The coded offers of Sweden
  and Czechia are the beginning of such a set, and a fixed check of the gate.

## Sources

- A. Turrell, B. Speigner, J. Djumalieva, D. Copple, J. Thurgood, "Transforming Naturally
  Occurring Text Data Into Economic Statistics: The Case of Online Job Vacancy Postings", NBER
  Working Paper 25837, 2019: https://www.nber.org/papers/w25837; occupationcoder:
  https://github.com/datasciencecampus/occupationcoder-international
- M. Schierholz, M. Schonlau, "Machine Learning for Occupation Coding—A Comparison Study",
  Journal of Survey Statistics and Methodology 9(5), 2021: https://doi.org/10.1093/jssam/smaa023
- CASCOT, Warwick Institute for Employment Research: https://warwick.ac.uk/fac/soc/ier/software/cascot/;
  P. Elias, "CASCOT and the Coding of Occupations in European Surveys", DASISH workshop.
- ONS, SOC 2020 Volume 2: the coding index:
  https://www.ons.gov.uk/methodology/classificationsandstandards/standardoccupationalclassificationsoc/soc2020/soc2020volume2codingrulesandconventions
- CBS, Beroepenclassificatie (ISCO en SBC), codelijsten en beroepenindex ISCO 2008:
  https://www.cbs.nl/nl-nl/onze-diensten/methoden/classificaties/onderwijs-en-beroepen/beroepenclassificatie--isco-en-sbc--
- France Travail, ROME: https://www.data.gouv.fr/datasets/repertoire-operationnel-des-metiers-et-des-emplois-rome
- O*NET OnLine: https://www.onetonline.org/ · NOC: https://noc.esdc.gc.ca/ · Lightcast titles:
  https://lightcast.io/open-titles
