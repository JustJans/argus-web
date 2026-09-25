// ➤ The search bar's reading of what a visitor typed: the towns and countries named in it,
// ➤ which become the search's places (lib/gates.js), and the words left, which are matched as
// ➤ before. It is the query tagging of the big job sites ("mooring engineer geneve" is Geneva on
// ➤ LinkedIn) done with a dictionary instead of a model: the towns with offers under every name
// ➤ data/places.json gives them, and the countries under theirs, found with Aho–Corasick, the
// ➤ longest name first. docs/research/single-search.md.
import AhoCorasick from '../vendor/ahocorasick/index.js';
import { nameKey, nameKeys } from './name-key.js';
import { wordsOf } from './search.js';
import { distanceKm } from './distance.js';

// ➤ Words that point at a place ("in Nice", "cerca de León", "bei München"): after one, even a
// ➤ name the pile mostly uses as a word ("Orange") is read as the town.
const CUES = new Set(['in', 'en', 'near', 'nearby', 'around', 'cerca', 'bei', 'nahe', 'nara', 'naer', 'nabij', 'vicino', 'presso', 'perto', 'pres', 'autour', 'dans']);
// ➤ Words between a place and the rest ("Barcelona y Girona", "cerca de Vigo"): they go with the
// ➤ place, so the words left are the job's.
const LINKS = new Set(['and', 'or', 'y', 'o', 'e', 'i', 'a', 'und', 'oder', 'et', 'ou', 'og', 'och', 'eller', 'of', 'to', 'the', 'de', 'del', 'la', 'le', 'les', 'di', 'da', 'do', 'von', 'zu', 'im', 'am', 'um', 'al', 'au', 'w']);
// ➤ "Vigo y alrededores", "Bergen og omegn": the surroundings, said after the place.
const AROUND = new Set(['alrededores', 'surroundings', 'environs', 'umgebung', 'umkreis', 'omgeving', 'omegn', 'dintorni', 'arredores', 'omgivelser', 'omgivningar']);

// ➤ The countries by every name a visitor may type: the catalogue's, and each one's name in
// ➤ English and Spanish from the browser's own Intl ("Germany", "Alemania", "Deutschland").
export function countryNames(catalogue) {
  const names = ['en', 'es'].map(l => new Intl.DisplayNames([l], { type: 'region' }));
  return catalogue.countries.map(c => ({ iso: c.iso, names: [c.name, ...(c.aliases || []), ...names.map(n => n.of(c.iso.toUpperCase()))].filter(Boolean) }));
}

// ➤ places: data/places.json ({ places: [[shown, other, region, cc, lat, lon, offers, other
// ➤ names]], ambiguous: [names] }); countries: [{ iso, names: [...] }]. A town's name has three
// ➤ letters at least ("ST" in a title is STMicroelectronics); a country's two ("UK").
export function compileGazetteer({ places = [], ambiguous = [] }, countries = []) {
  const entries = new Map(), towns = [];
  const add = (name, entry) => {
    for (const k of nameKeys(name)) {
      if (k.length < (entry.kind === 'town' ? 3 : 2)) continue;
      if (!entries.has(k)) entries.set(k, []);
      if (!entries.get(k).includes(entry)) entries.get(k).push(entry);
    }
  };
  for (const [shown, other, , cc, lat, lon, n, more = []] of places) {
    const town = { kind: 'town', name: shown, cc, lat, lon, n: n || 0 };
    towns.push(town);
    for (const name of [shown, other, ...more]) if (name) add(name, town);
  }
  for (const c of countries) {
    const country = { kind: 'country', cc: c.iso };
    for (const name of c.names) add(name, country);
  }
  return { entries, towns, ambiguous: new Set(ambiguous.map(nameKey)), matcher: new AhoCorasick([...entries.keys()].map(k => ` ${k} `)) };
}

// ➤ Answers { words: the words left, as the plain search reads them; placeWords: the words that
// ➤ named places, with their "in", "y", "cerca de"; towns: [{ name, cc, lat, lon }]; countries:
// ➤ [cc]; said: the places' names as typed, in name form }. Two towns of one name are both
// ➤ kept ("Bergen": Norway's and the Netherlands'), unless the query names the country
// ➤ ("Bergen, Norway").
export function readQuery(text, gazetteer) {
  // ➤ The words as the plain search splits them, with each comma kept as a word of its own: no
  // ➤ name runs across a comma ("Barcelona, Girona" is two towns).
  const tokens = String(text || '').replace(/,/g, ' , ').split(/[\s;]+/).filter(Boolean);
  if (!gazetteer || !tokens.length) return { words: tokens.flatMap(wordsOf), placeWords: [], towns: [], countries: [], said: [] };
  // ➤ Each word in the form names are kept in, in parts ("Saint-Étienne": saint, etienne), and
  // ➤ where each word's parts begin and end.
  const parts = [], owner = [], first = [], last = [];
  tokens.forEach((tok, i) => {
    first[i] = parts.length;
    for (const p of tok === ',' ? [','] : nameKey(tok).split(' ').filter(Boolean)) { parts.push(p); owner.push(i); }
    last[i] = parts.length - 1;
  });
  const partAt = new Map();
  for (let i = 0, pos = 1; i < parts.length; pos += parts[i].length + 1, i++) partAt.set(pos, i);

  // ➤ Every name that covers whole words, the longest first; a name inside a longer one found
  // ➤ ("Frankfurt" in "Frankfurt am Main") does not count.
  const found = [];
  const hits = gazetteer.matcher.search(` ${parts.join(' ')} `).map(h => {
    const k = h.pattern.trim(), from = partAt.get(h.start + 1);
    return { k, from, to: from + k.split(' ').length - 1 };
  }).filter(h => first[owner[h.from]] === h.from && last[owner[h.to]] === h.to)
    .sort((a, b) => b.k.length - a.k.length || a.from - b.from);
  for (const h of hits) if (!found.some(f => h.from <= f.to && f.from <= h.to)) found.push({ ...h, a: owner[h.from], b: owner[h.to] });
  found.sort((x, y) => x.from - y.from);

  const countryOf = f => gazetteer.entries.get(f.k).find(e => e.kind === 'country');
  // ➤ The name right after another, with or without a comma between.
  const nextTo = f => found.find(g => g.a === f.b + 1 || (tokens[f.b + 1] === ',' && g.a === f.b + 2));
  const towns = [], countries = new Set(), used = [], qualifiers = new Set(), said = new Set();
  for (const f of found) {
    if (countryOf(f)) continue;
    const next = nextTo(f);
    const country = next && countryOf(next);
    if (gazetteer.ambiguous.has(f.k) && !CUES.has(nameKey(tokens[f.a - 1])) && !country) continue;
    let named = gazetteer.entries.get(f.k);
    // ➤ "Newport, UK": only the towns of that name in the country named after it.
    if (country && named.some(t => t.cc === country.cc)) { named = named.filter(t => t.cc === country.cc); qualifiers.add(next); }
    for (const t of named) if (!towns.includes(t)) towns.push(t);
    used.push(f);
    said.add(f.k);
  }
  for (const f of found) {
    if (!countryOf(f)) continue;
    used.push(f);
    if (qualifiers.has(f)) continue;
    countries.add(countryOf(f).cc);
    said.add(f.k);
  }

  // ➤ The words that go with the places: their own, the cue and link words just before them,
  // ➤ and "y alrededores" just after.
  const drop = new Set();
  const isLink = i => tokens[i] === ',' || LINKS.has(nameKey(tokens[i]));
  for (const f of used) {
    for (let i = f.a; i <= f.b; i++) drop.add(i);
    for (let i = f.a - 1; i >= 0 && (isLink(i) || CUES.has(nameKey(tokens[i]))); i--) drop.add(i);
    let j = f.b + 1;
    while (j < tokens.length && isLink(j)) j++;
    if (AROUND.has(nameKey(tokens[j]))) for (let i = f.b + 1; i <= j; i++) drop.add(i);
  }
  const words = [], placeWords = [];
  tokens.forEach((tok, i) => (drop.has(i) ? placeWords : words).push(...wordsOf(tok)));
  return { words, placeWords, towns: towns.map(({ name, cc, lat, lon }) => ({ name, cc, lat, lon })), countries: [...countries], said: [...said] };
}

// ➤ The countries a reading reaches: the ones it names, and those of every town with offers within
// ➤ km of a town it names (Vigo at 50 km reaches Portugal). They are the parts of the pile to fetch.
export function scopeCountries(read, gazetteer, km) {
  const out = new Set(read.countries);
  for (const t of read.towns) for (const o of gazetteer.towns) if (!out.has(o.cc) && distanceKm([t.lat, t.lon], [o.lat, o.lon]) <= km) out.add(o.cc);
  return [...out];
}
