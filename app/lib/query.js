// ➤ The search bar's reading of what a visitor typed: the towns and countries in it and the
// ➤ words left over, which are matched against titles, employers and places as before. It is
// ➤ the query tagging of the big job sites done with a dictionary instead of a model: the
// ➤ site's own towns (every name data/places.json gives them) and countries, found with
// ➤ Aho–Corasick, the longest name first. A name the pile uses more often as a word ("Orange",
// ➤ "Change") counts as a town only with a cue: "in", "en", "near"…, a comma after it, or a
// ➤ country next to it. Two towns of one name: the one in a country the query names, else the
// ➤ one with the most offers. docs/research/single-search.md.
import AhoCorasick from '../vendor/ahocorasick/index.js';
import { fold } from './engine.js';

// ➤ Letters no accent-stripping takes apart, spelt the way people type them without the key.
const LATIN = { ø: 'o', æ: 'ae', œ: 'oe', ß: 'ss', ł: 'l', đ: 'd', ð: 'd', þ: 'th', ı: 'i', ħ: 'h' };
const plain = s => fold(s).replace(/[øæœßłđðþıħ]/g, c => LATIN[c]);
// ➤ The form names and queries are compared in: plain letters and digits, one space between.
export const searchKey = s => plain(s).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// ➤ Words that point at a place ("in Nice", "en León") and words that join two ("Barcelona y
// ➤ Girona"); both are dropped from the words when they stand just before a town or country.
const CUES = new Set(['in', 'en', 'near', 'around', 'cerca', 'bei', 'nahe', 'nara', 'nabij', 'vicino', 'perto']);
const JOINS = new Set(['and', 'or', 'y', 'o', 'e', 'i', 'und', 'oder', 'et', 'ou', 'og', 'och', 'eller']);

// ➤ The countries by every name a visitor may type: the catalogue's, and each one's name in
// ➤ English and Spanish from the browser's own Intl ("Germany", "Alemania", "Deutschland").
export function countryNames(catalogue) {
  const names = ['en', 'es'].map(l => new Intl.DisplayNames([l], { type: 'region' }));
  return catalogue.countries.map(c => ({ iso: c.iso, names: [c.name, ...(c.aliases || []), ...names.map(n => n.of(c.iso.toUpperCase()))].filter(Boolean) }));
}

// ➤ places: data/places.json ({ places: [[shown, other, region, cc, lat, lon, offers, other
// ➤ names]], ambiguous: [names] }); countries: [{ iso, names: [...] }].
export function compileGazetteer({ places = [], ambiguous = [] }, countries = []) {
  const entries = new Map();
  const add = (name, entry) => {
    const k = searchKey(name);
    if (k.length < 2) return;
    if (!entries.has(k)) entries.set(k, []);
    const list = entries.get(k);
    if (!list.some(e => e.kind === entry.kind && e.cc === entry.cc && e.name === entry.name)) list.push(entry);
  };
  for (const [shown, other, , cc, lat, lon, n, more = []] of places) {
    const town = { kind: 'town', name: shown, cc, lat, lon, n: n || 0 };
    for (const name of [shown, other, ...more]) if (name) add(name, town);
  }
  for (const c of countries) for (const name of c.names) add(name, { kind: 'country', cc: c.iso, n: Infinity });
  for (const list of entries.values()) list.sort((a, b) => b.n - a.n);
  return { entries, ambiguous: new Set(ambiguous.map(searchKey)), matcher: new AhoCorasick([...entries.keys()].map(k => ` ${k} `)) };
}

// ➤ Answers { places: [{ name, cc, lat, lon }], countries: [cc], words: 'what is left' }.
export function readQuery(text, gazetteer) {
  // ➤ Commas stay, as words of their own: a name before one is a place ("Nice, France"), and
  // ➤ no name runs across one ("Barcelona, Girona" is two towns).
  const tokens = plain(text).replace(/,/g, ' , ').replace(/[^\p{L}\p{N},]+/gu, ' ').trim().split(' ').filter(Boolean);
  if (!gazetteer || !tokens.length) return { places: [], countries: [], words: tokens.filter(t => t !== ',').join(' ') };
  const padded = ` ${tokens.join(' ')} `;
  // ➤ Where each word starts in the padded text, to find the words around a match.
  const starts = [];
  for (let i = 0, at = 1; i < tokens.length; at += tokens[i].length + 1, i++) starts.push(at);
  const wordAt = pos => starts.findIndex((s, i) => pos >= s && pos < s + tokens[i].length);

  // ➤ Every name found, the longest first; a shorter one inside a longer one is not a match.
  const taken = [];
  const hits = gazetteer.matcher.search(padded)
    .map(h => ({ start: h.start + 1, end: h.end - 1, k: h.pattern.trim() }))
    .sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start);
  for (const h of hits) if (!taken.some(t => h.start < t.end && t.start < h.end)) taken.push({ ...h, first: wordAt(h.start), last: wordAt(h.end - 1) });
  taken.sort((a, b) => a.start - b.start);

  const countryOf = t => gazetteer.entries.get(t.k).find(e => e.kind === 'country');
  const countries = new Set(taken.filter(countryOf).map(t => countryOf(t).cc));
  const places = [], found = [];
  for (const t of taken) {
    if (countryOf(t)) { found.push(t); continue; }
    const next = taken.find(o => o.first === t.last + 1);
    const cued = CUES.has(tokens[t.first - 1]) || tokens[t.last + 1] === ',' || (next && countryOf(next));
    if (gazetteer.ambiguous.has(t.k) && !cued) continue;
    const towns = gazetteer.entries.get(t.k).filter(e => e.kind === 'town');
    const town = towns.find(e => countries.has(e.cc)) || towns[0];
    if (!places.some(p => p.name === town.name && p.cc === town.cc)) places.push({ name: town.name, cc: town.cc, lat: town.lat, lon: town.lon });
    found.push(t);
  }
  // ➤ The words left: everything but the towns and countries found and the cue or joining words
  // ➤ just before them.
  const drop = new Set();
  for (const t of found) {
    for (let i = t.first; i <= t.last; i++) drop.add(i);
    for (let i = t.first - 1; i >= 0 && (CUES.has(tokens[i]) || JOINS.has(tokens[i]) || tokens[i] === ','); i--) drop.add(i);
  }
  const words = tokens.filter((w, i) => !drop.has(i) && w !== ',').join(' ');
  return { places, countries: [...countries], words };
}
