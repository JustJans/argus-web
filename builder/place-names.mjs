// ➤ The town names the search bar reads as a town only with "in" before them (or a country
// ➤ after). Geoparsing calls it geo/non-geo ambiguity: "Orange" is a company, "Hook" a word in
// ➤ "Hook Up Engineer", "OSS" a telecom term, and each is also a town with offers. Every time
// ➤ an offer's title or company names a town, the mention is a place when the offer is near
// ➤ that town, when the text marks it as one — a separator or a place word before it
// ➤ ("Engineer – Vigo", "(Vigo)", "in Vigo", "regio Amersfoort"), a separator or a region word
// ➤ after it ("Köln, NRW", "Łódź province"), last in the text ("Softwareentwickler Duisburg"),
// ➤ after the first word of a company's name ("Dopravoprojekt Brno a.s.") — or when the text
// ➤ names another town too ("Hamburg, München, Berlin"). Any other mention is a word (a
// ➤ company named after a town: "Kalmar", "Heidelberg Materials"), and a name is ambiguous
// ➤ when more than a quarter of the offers that name it use it as a word.
// ➤ docs/research/single-search.md.
import { nameKey, nameKeys } from '../app/lib/name-key.js';
import { distanceKm } from '../app/lib/distance.js';

const NEAR_KM = 30;
const LONGEST = 4;         // ➤ words in the longest town name looked for
const SHORTEST = 3;        // ➤ letters in the shortest: "ST" and "Ed" are not read as towns
const WORD_SHARE = 0.25;
const BEFORE = /[-–—|(/,@:·•]\s*$/;
const AFTER = /^\s*[-–—|()/,:·•]/;
const REGION_WORDS = new Set(['province', 'provincia', 'provinz', 'region', 'regio', 'area', 'county', 'voivodeship', 'kreis', 'landkreis', 'departement', 'canton', 'kanton', 'metropolitan']);
const PLACE_WORDS = new Set(['in', 'en', 'i', 'w', 'im', 'near', 'nahe', 'nara', 'naer', 'nabij', 'vicino', 'presso', 'perto', 'pres', 'around', 'cerca', 'raum', 'regio', 'region', 'regione', 'omgeving', 'zona', 'area']);

// ➤ The towns by every form of every name: name form → their coordinates.
export function townNames(list) {
  const towns = new Map();
  for (const [shown, other, , , lat, lon, , more = []] of list) {
    for (const name of [shown, other, ...more]) {
      for (const k of name ? nameKeys(name) : []) {
        if (k.length < SHORTEST) continue;
        if (!towns.has(k)) towns.set(k, []);
        towns.get(k).push([lat, lon]);
      }
    }
  }
  return towns;
}

// ➤ The towns a text names, the longest name first at each word and none inside another, each
// ➤ marked as a place or a word; g: the offer's coordinates; company: the text is a company's name.
export function namesIn(text, towns, g, company = false) {
  const ws = [];
  let end = 0;
  for (const m of String(text).matchAll(/[\p{L}\p{N}]+/gu)) { ws.push({ w: nameKey(m[0]), gap: text.slice(end, m.index) }); end = m.index + m[0].length; }
  const found = [];
  for (let i = 0; i < ws.length;) {
    let n = Math.min(LONGEST, ws.length - i);
    while (n && !towns.has(ws.slice(i, i + n).map(x => x.w).join(' '))) n--;
    if (n) { found.push({ k: ws.slice(i, i + n).map(x => x.w).join(' '), i, n }); i += n; } else i++;
  }
  const several = new Set(found.map(f => f.k)).size > 1;
  return found.map(({ k, i, n }) => {
    const near = !!g && towns.get(k).some(t => distanceKm(g, t) < NEAR_KM);
    const last = i + n === ws.length;
    const marked = BEFORE.test(ws[i].gap) || PLACE_WORDS.has(ws[i - 1]?.w) || REGION_WORDS.has(ws[i + n]?.w) || (i > 0 && (company || last || AFTER.test(ws[i + n]?.gap || '')));
    return { k, place: near || marked || several };
  });
}

// ➤ How the pile uses each town name: { place, word } offers.
export function nameUses(list, records) {
  const towns = townNames(list);
  const uses = new Map();
  const use = k => uses.get(k) || uses.set(k, { place: 0, word: 0 }).get(k);
  for (const rec of records) {
    const place = new Set(), word = new Set();
    for (const [text, company] of [[rec.t, false], [rec.te, false], [rec.c, true]]) {
      if (text) for (const f of namesIn(text, towns, rec.g, company)) (f.place ? place : word).add(f.k);
    }
    for (const k of place) use(k).place++;
    for (const k of word) if (!place.has(k)) use(k).word++;
  }
  return uses;
}

// ➤ list: the towns with offers, as locate() writes them; records: the pile. Answers the
// ➤ ambiguous names, in name form, sorted.
export function ambiguousNames(list, records) {
  return [...nameUses(list, records)].filter(([, u]) => u.word > WORD_SHARE * (u.word + u.place)).map(([k]) => k).sort();
}
