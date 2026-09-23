// ➤ The places adverts are located against: GeoNames' towns of more than 1,000 people in the
// ➤ site's countries, each with its coordinates, its region and the other names it goes by
// ➤ ("München" and "Múnich" are Munich), written to catalogues/codes/places.json. Job sites
// ➤ locate an advert the same way — its place to coordinates against a gazetteer, then a radius
// ➤ around the town the visitor names — and GeoNames is the open gazetteer (CC BY 4.0).
// ➤ The files come from https://download.geonames.org/export/dump/ into builder/state/geonames:
// ➤   curl -O https://download.geonames.org/export/dump/cities1000.zip && unzip cities1000.zip
// ➤   curl -O https://download.geonames.org/export/dump/admin1CodesASCII.txt
// ➤   node builder/tools/places.mjs
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { fold } from 'argus/server-bot/text.mjs';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const DIR = join(ROOT, 'builder', 'state', 'geonames');
const OUT = join(ROOT, 'catalogues', 'codes', 'places.json');

// ➤ Other names are kept in the scripts the site's countries write in (Latin, Greek, Cyrillic);
// ➤ airport and other short codes in capitals ("MUC", "BCN") are not names of a town.
const OURS_SCRIPT = /^[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\s'’.\-()]+$/u;
const isCode = s => /^[A-Z]{2,4}$/.test(s);

export function buildPlaces(citiesTsv, admin1Tsv, countries) {
  const regions = new Map(admin1Tsv.split('\n').filter(Boolean).map(l => l.split('\t')).map(([code, name]) => [code, name]));
  const ours = new Set(countries.map(c => c.toUpperCase()));
  const places = [];
  for (const line of citiesTsv.split('\n')) {
    const r = line.split('\t');
    if (r.length < 15 || !ours.has(r[8])) continue;
    const [id, name, ascii, alternates, lat, lon] = r;
    const seen = new Set([fold(name)]);
    const names = [];
    for (const n of [ascii, ...alternates.split(',')]) {
      const k = fold(n.trim());
      if (!k || seen.has(k) || isCode(n.trim()) || !OURS_SCRIPT.test(n)) continue;
      seen.add(k);
      names.push(n.trim());
    }
    places.push([Number(id), name, r[8].toLowerCase(), regions.get(`${r[8]}.${r[10]}`) || '', Number(Number(lat).toFixed(4)), Number(Number(lon).toFixed(4)), Number(r[14]) || 0, names]);
  }
  return places.sort((a, b) => a[0] - b[0]);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const countries = JSON.parse(readFileSync(join(ROOT, 'catalogues', 'countries.json'), 'utf8')).countries.map(c => c.iso);
  const places = buildPlaces(readFileSync(join(DIR, 'cities1000.txt'), 'utf8'), readFileSync(join(DIR, 'admin1CodesASCII.txt'), 'utf8'), countries);
  const about = "GeoNames' populated places of more than 1,000 people (cities1000) in the site's countries, from https://download.geonames.org/export/dump/ under CC BY 4.0 (https://www.geonames.org). One array per place: GeoNames id, name, country, region (admin1), latitude, longitude, population, other names (Latin, Greek and Cyrillic, codes left out). Built by builder/tools/places.mjs.";
  writeFileSync(OUT, `${JSON.stringify({ _about: about, built_at: new Date().toISOString().slice(0, 10), places })}\n`);
  console.log(`${places.length} places → ${OUT}`);
}
