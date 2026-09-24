// ➤ The search bar's reading checked against every town the site knows, and against every real
// ➤ title typed as it stands. Four checks:
// ➤   1. each town name alone (every name: the adverts', GeoNames', the other languages') gives
// ➤      that town, or stays a word when the name is ambiguous;
// ➤   2. each name after a title ("engineer Vigo") gives the town and leaves the title;
// ➤   3. each name after a cue ("engineer in Nice") gives the town, ambiguous or not;
// ➤   4. each distinct real title, typed whole, finds no town but its own offer's (a title that
// ➤      names its town is right; any other town found is a false alarm).
// ➤   node builder/tools/check-search-bar.mjs [--pile builder/out] [--show 40]
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { compileGazetteer, countryNames, readQuery, searchKey } from '../../app/lib/query.js';
import { ambiguousNames } from '../place-names.mjs';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const args = process.argv.slice(2);
const flag = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const PILE = flag('--pile', join(ROOT, 'builder', 'out'));
const SHOW = Number(flag('--show', 40));

const placesFile = JSON.parse(readFileSync(join(PILE, 'places.json'), 'utf8'));
const records = new Map();
for (const f of readdirSync(join(PILE, 'offers'))) if (f.endsWith('.json')) for (const o of JSON.parse(readFileSync(join(PILE, 'offers', f), 'utf8')).offers || []) records.set(o.id, o);
const pile = [...records.values()];
// ➤ A pile written before the bar had no list of ambiguous names: it is worked out here the way
// ➤ the build does.
const ambiguous = placesFile.ambiguous || ambiguousNames(placesFile.places, pile);
const countries = countryNames(JSON.parse(readFileSync(join(ROOT, 'catalogues', 'countries.json'), 'utf8')));
const t0 = performance.now();
const gazetteer = compileGazetteer({ places: placesFile.places, ambiguous }, countries);
const built = performance.now() - t0;

const rad = d => (d * Math.PI) / 180;
const km = ([a, b], [c, d]) => 2 * 6371 * Math.asin(Math.sqrt(Math.sin(rad(c - a) / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(rad(d - b) / 2) ** 2));
const report = (label, fails, total) => {
  console.log(`${label}: ${total - fails.length} of ${total} right (${((100 * (total - fails.length)) / total).toFixed(2)}%)`);
  for (const f of fails.slice(0, SHOW)) console.log(`    ${f}`);
  if (fails.length > SHOW) console.log(`    … and ${fails.length - SHOW} more`);
};

// ➤ Every name of every town, with the towns that go by it.
const names = new Map();
for (const [shown, other, , cc, lat, lon, n, more = []] of placesFile.places) {
  for (const name of [shown, other, ...more]) {
    if (!name) continue;
    const k = searchKey(name);
    if (k.length < 2) continue;
    if (!names.has(k)) names.set(k, { name, towns: [] });
    names.get(k).towns.push({ shown, cc, lat, lon, n });
  }
}
const countryKeys = new Set(countries.flatMap(c => c.names.map(searchKey)));
const isTownOf = (place, entry) => entry.towns.some(t => t.shown === place.name && t.cc === place.cc);

const alone = [], titled = [], cued = [];
let checked = 0;
const t1 = performance.now();
for (const [k, entry] of names) {
  if (countryKeys.has(k)) continue;
  checked++;
  const amb = gazetteer.ambiguous.has(k);
  const a = readQuery(entry.name, gazetteer);
  if (amb ? a.places.length : !(a.places.length === 1 && isTownOf(a.places[0], entry))) alone.push(`"${entry.name}"${amb ? ' (ambiguous)' : ''} → ${JSON.stringify(a.places.map(p => `${p.name} (${p.cc})`))} words "${a.words}"`);
  const b = readQuery(`mechanical engineer ${entry.name}`, gazetteer);
  if (amb ? b.places.length || b.words !== `mechanical engineer ${k}` : !(b.places.length === 1 && isTownOf(b.places[0], entry) && b.words === 'mechanical engineer')) titled.push(`"mechanical engineer ${entry.name}" → ${JSON.stringify(b.places.map(p => `${p.name} (${p.cc})`))} words "${b.words}"`);
  const c = readQuery(`mechanical engineer in ${entry.name}`, gazetteer);
  if (!(c.places.length === 1 && isTownOf(c.places[0], entry) && c.words === 'mechanical engineer')) cued.push(`"mechanical engineer in ${entry.name}" → ${JSON.stringify(c.places.map(p => `${p.name} (${p.cc})`))} words "${c.words}"`);
}
const perQuery = (performance.now() - t1) / (checked * 3);
console.log(`${placesFile.places.length} towns, ${names.size} names (${checked} checked; country names apart), ${ambiguous.length} ambiguous; dictionary built in ${built.toFixed(0)} ms, ${perQuery.toFixed(3)} ms a query\n`);
report('1. a town name alone', alone, checked);
report('2. a title and a town', titled, checked);
report('3. a title, "in" and a town', cued, checked);

// ➤ 4. Every distinct real title, as a visitor would paste it.
const titles = new Map();
for (const o of pile) for (const t of [o.t, o.te].filter(Boolean)) { const e = titles.get(t) || titles.set(t, { n: 0, at: [] }).get(t); e.n++; if (o.g) e.at.push(o.g); }
const alarms = new Map();
let withTown = 0, right = 0;
for (const [title, { n, at }] of titles) {
  const r = readQuery(title, gazetteer);
  if (!r.places.length) continue;
  withTown++;
  const own = r.places.every(p => at.some(g => km(g, [p.lat, p.lon]) < 30));
  if (own) { right++; continue; }
  for (const p of r.places) { const key = `${p.name} (${p.cc})`; const e = alarms.get(key) || alarms.set(key, { titles: 0, offers: 0, sample: title }).get(key); e.titles++; e.offers += n; }
}
const falseTitles = withTown - right;
console.log(`\n4. real titles typed whole: ${titles.size} distinct titles; ${withTown} name a town, ${right} of them their own offer's; ${falseTitles} find another town (${((100 * falseTitles) / titles.size).toFixed(2)}% of all titles)`);
for (const [town, e] of [...alarms].sort((a, b) => b[1].titles - a[1].titles).slice(0, SHOW)) console.log(`    ${town}: ${e.titles} titles, e.g. "${e.sample}"`);
