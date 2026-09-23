# Searching by town and distance

Research of 23 September 2026, before `builder/towns.mjs`, `catalogues/codes/places.json` and
the town-and-distance search. It replaced a first attempt that matched city names, which missed
every advert in the towns around a city (Barcelona without L'Hospitalet, Cornellà or Rubí) and
counted München and Munich as two cities.

## How job sites do it

Every large site does it in two steps:

1. **When an advert is stored, its place becomes coordinates** against a gazetteer, with the
   town, region and country:
   - LinkedIn geocodes with Bing Maps (Autosuggest and Geocoding APIs).
   - Lightcast submits the raw location to Google's geocoder and derives city, county, state and
     metropolitan area from the coordinates.
   - Oracle Taleo codes each location (country, region, city) against a repository of coordinates;
     a location that does not match it "will not be geocoded", and its jobs are not found by a
     search by place.
   - Textkernel's Jobfeed normalises regions to ISO 3166-2, with a geocoding add-on.
   - Eurostat's online job ads statistics code the place of work as municipality (LAU), region
     (NUTS 1-3) and country.
   - A study of UK job ads (arXiv 2010.03629) checks the location field against GeoNames, then
     Nominatim (OpenStreetMap), and places 97% of the adverts with a location.
2. **A search is a place and a radius.** StepStone: "Ingenieur/in in München im Umkreis von 30 km".
   Indeed: "Barcelona, Barcelona provincia" and a Distance filter (radius=25 brings Cornellà,
   Rubí, Martorell). The Bundesagentur für Arbeit's job search: `wo` and `umkreis` in km. Google
   Cloud Talent Solution: a place and `distanceInMiles` (20 by default; a city is its centre plus
   the radius). LinkedIn: 25 miles by default. Algolia: `aroundLatLng` and `aroundRadius`. EURES
   filters by country and NUTS region instead.

## The gazetteer

The paid geocoders (Google, Bing, Mapbox, HERE) need an API and a key per request. The open ones:

- **GeoNames**: every populated place with coordinates, region, population and every name it goes
  by, as downloadable files, CC BY 4.0. Used by the UK study above and by offline geocoders
  (geocoder.js, offline-geocoder, local-reverse-geocoder, geonamescache).
- Self-hosted geocoders on OpenStreetMap (Nominatim, Photon, Pelias) need Postgres or
  Elasticsearch: too heavy for the home server for what a town lookup needs.
- Eurostat's LAU with NUTS codes (and EDJNet's population-weighted centres): EU only.

GeoNames `cities5000` (towns of more than 5,000 people, 19,953 in the site's countries) was
chosen, with `admin1CodesASCII` for the regions' names.

## What was built

- `builder/tools/places.mjs` writes `catalogues/codes/places.json` from GeoNames' files.
- `builder/towns.mjs` finds each advert's town by any of its names within its country, from the
  most precise piece of its place ("Terrassa, BARCELONA, ES" is Terrassa); two towns of one name:
  the one in the region the advert names, else the bigger. Coordinates travel on the record (`g`).
- The search bar: "what", "where" (a town from the towns with offers, a native datalist) and
  "how far" (5, 10, 25, 50, 100 km), by great-circle distance in the browser. An advert with no
  town is not found by a search by town, as on the big sites.
- On the pile of 22 September, 85% of the adverts with a country were placed.

## Known limits

Towns of fewer than 5,000 people (GeoNames `cities1000` has them) and regions ("Hampshire",
"Yvelines") are not placed yet.

## Sources

- Google Cloud Talent Solution, location search:
  https://docs.cloud.google.com/talent-solution/job-search/v3/docs/search-location
- Oracle Taleo, geolocation coding:
  https://docs.oracle.com/en/cloud/saas/taleo-enterprise/24a/tsscg/c-17-5-geolocation-coding.html
- LinkedIn with Bing Maps:
  https://www.linkedin.com/pulse/how-linkedin-used-bing-maps-platform-map-job-commutes-mark-finch
- Lightcast, location classification:
  https://kb.lightcast.io/en/articles/11130828-location-classification-in-lightcast-data
- Textkernel job data model: https://developer.textkernel.com/Parser/master/data_model/job-data-model/
- Eurostat WIH-OJA metadata:
  https://ec.europa.eu/eurostat/cache/metadata/Annexes/isoc_sk_oja_esmsip2_an_1.pdf
- Studying the UK Job Market with Online Job Ads: https://arxiv.org/abs/2010.03629
- Bundesagentur für Arbeit job search API (community documentation): https://github.com/bundesAPI/jobsuche-api
- Algolia, filtering around a location:
  https://www.algolia.com/doc/guides/managing-results/refine-results/geolocation/how-to/filter-results-around-a-location
- GeoNames dumps: https://download.geonames.org/export/dump/readme.txt
- Photon, Nominatim and Pelias compared: https://mapsi.dev/developers/pelias-vs-nominatim
