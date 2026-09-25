# One search bar for titles, companies, towns and codes

Research of 24 and 25 September 2026, for the single search bar of design v2.

## How sites do it

- **Query tagging.** LinkedIn tags the parts of a query as a title, a company or a place, and
  a place typed among the keywords becomes the location filter: "mooring engineer geneve" shows
  "Geneva (80 km)" under the bar. ZipRecruiter does the same with named-entity recognition on
  short queries. Both learn it from their query logs; this site has none, so it uses a
  dictionary: the towns with offers, under every name they go by, and the countries.
- **Dictionary matching.** With thousands of names, a trie (Aho–Corasick) finds all of them in
  one pass, while regular expressions slow down with every name added (the FlashText paper).
  modern-ahocorasick (MIT) does it in the browser.
- **Geo/non-geo ambiguity.** Geoparsing research names the case where a town's name is also a
  word ("Orange", "Best"), a company ("Kalmar") or an acronym ("OSS"). Geoparsers read the
  words around the name; here the pile itself says how each name is used.
- **Names in other languages.** GeoNames gives each town's other names with their language.
  The untagged column carries transliterations and dialects ("Mönster", Low German for
  Münster, made "monster" a town), so only the tagged names in the visitors' languages count.

## Decisions

- The bar reads towns and countries and makes them the search's places, as LinkedIn does. The
  radius pill appears once a town is read.
- A town is read typed alone, after a title, or after a place word ("in", "en", "cerca de").
  With its country after it ("Bergen, Norway"), only that country's town counts; two towns of
  one name are both kept ("Bergen": Norway's and Germany's).
- A name is ambiguous when more than a quarter of the offers that name it use it as a word: a
  company named after a town ("Kalmar", "Heidelberg Materials"), a word ("Change", "Best"), an
  acronym ("OSS"). Such a name needs "in" before it. A mention counts as a place when the offer
  is near the town, or when the text marks it as one: a separator before or after it
  ("Engineer – Vigo", "Köln, NRW"), a place or region word ("in Vigo", "Łódź province"), last
  in a title ("Softwareentwickler Duisburg"), after the first word of a company's name
  ("Dopravoprojekt Brno a.s."), or with another town in the same text.
- A town's name has three letters at least ("ST" in titles is STMicroelectronics); a
  country's two ("UK").
- An offer is in a place when it is within the radius, or when its title, company or place
  names it. This covers adverts for several towns, moves abroad, and company names ("Alfa
  Laval" must not become Laval, France). A piece of a hyphenated name does not count ("Baden"
  is not in "Baden-Württemberg").
- Names in the languages the filters let a visitor speak, Norwegian in both written forms,
  and Spain's other official languages; each also in the German and Nordic spelling without
  the special letters ("Muenchen", "Aarhus").

## What was measured

The pile of 25 September 2026: 87,815 offers in 4,697 towns
(`node builder/tools/check-search-bar.mjs`).

- 7,470 town names, every name of every town: 100% read as their town typed alone, after a
  title and after "in"; 60 are ambiguous and are read only after "in".
- 106,657 titles and companies, each typed as it stands: 100% find their own offer. With the
  place alone, without "or the offer names it", 98.22% would: 1,895 would lose their offer.
- "Or the offer names it" adds 0.31% offers to a town's search: mostly adverts for several
  towns, and provinces named like their capital (Utrecht, Limburg).
- Title words read as a place although the pile uses them more as words: 0.
- Titles, companies, words and towns read as a code: 0 of 140,323.
- A reading takes 0.006 ms. data/places.json: 274 KB, 93 KB compressed.

## Sources

- LinkedIn, "Better Search Through Query Understanding": https://www.slideshare.net/slideshow/better-search-through-query-understanding/34679364
- ZipRecruiter Engineering, "Named Entity Recognition (NER) of Short & Unstructured Job Search Queries": https://medium.com/@ziprecruiter.engineering/named-entity-recognition-ner-of-short-unstructured-job-search-queries-6b265ec0fb
- Singh, "Replace or Retrieve Keywords In Documents at Scale" (FlashText): https://arxiv.org/abs/1711.00046
- DeLozier, Baldridge and London, "Gazetteer-Independent Toponym Resolution Using Geographic Word Profiles" (AAAI 2015): https://ojs.aaai.org/index.php/AAAI/article/view/9531/9390
- GeoNames, alternate names by language (readme): https://download.geonames.org/export/dump/readme.txt
- modern-ahocorasick (MIT): https://github.com/icelib/modern-ahocorasick
