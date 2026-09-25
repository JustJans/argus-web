// ➤ The search bar checked on a real pile (default builder/out), with the towns and the
// ➤ ambiguous names worked out the way the next build writes them. The bar turns the towns and
// ➤ countries it reads into the search's places, as LinkedIn does ("mooring engineer geneve"
// ➤ is Geneva); this measures how often it reads right:
// ➤   1. every name of every town (the adverts', GeoNames', the other languages') typed alone,
// ➤      after a title and after "in" gives that town; a name the pile mostly uses as a word
// ➤      stays a word unless "in" comes first;
// ➤   2. every distinct title and company, typed as it stands, still finds its own offer, at
// ➤      25, 50 and 100 km; the misses by what was read, and whether the text uses those names
// ➤      as places ("Site Engineer | Lisboa" on an offer filed elsewhere) or as words ("Alfa
// ➤      Laval");
// ➤   3. the words titles use most that are read as a place when typed alone, for a look, and
// ➤      any read as a place that the pile uses more as a word;
// ➤   4. no title, company, word or town reads as a code, and the words a reading keeps and
// ➤      takes add up to the plain search's;
// ➤   5. the time a reading takes.
// ➤   node builder/tools/check-search-bar.mjs [--pile builder/out] [--show 40]
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { compileGazetteer, countryNames, readQuery } from '../../app/lib/query.js';
import { nameKey, namesAny } from '../../app/lib/name-key.js';
import { wordsOf } from '../../app/lib/search.js';
import { makeLocation } from '../../app/lib/gates.js';
import { decodeProfile, catalogueIds } from '../../app/lib/codec.js';
import { compileTowns, locate } from '../towns.mjs';
import { ambiguousNames, nameUses, namesIn, townNames } from '../place-names.mjs';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const args = process.argv.slice(2);
const flag = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const PILE = flag('--pile', join(ROOT, 'builder', 'out'));
const SHOW = Number(flag('--show', 40));
const RADII = [25, 50, 100];
const load = name => JSON.parse(readFileSync(join(ROOT, 'catalogues', `${name}.json`), 'utf8'));

const byId = new Map();
for (const f of readdirSync(join(PILE, 'offers'))) if (f.endsWith('.json')) for (const o of JSON.parse(readFileSync(join(PILE, 'offers', f), 'utf8')).offers || []) byId.set(o.id, o);
const pile = [...byId.values()];
const { list } = locate(pile, compileTowns(load('codes/places')));
const ambiguous = ambiguousNames(list, pile);
const gazetteer = compileGazetteer({ places: list, ambiguous }, countryNames(load('countries')));
const uses = nameUses(list, pile);
const towns = townNames(list);
const isCountry = k => (gazetteer.entries.get(k) || []).some(e => e.kind === 'country');

const pct = (a, b) => `${((100 * a) / b).toFixed(2)}%`;
const show = lines => { for (const l of lines.slice(0, SHOW)) console.log(`      ${l}`); if (lines.length > SHOW) console.log(`      … and ${lines.length - SHOW} more`); };
const where = r => [...r.towns.map(t => `${t.name} (${t.cc})`), ...r.countries.map(cc => cc.toUpperCase())].join(', ') || 'no place';
let parsed = 0, parseMs = 0;
const uneven = [];
// ➤ Every reading goes through here: timed, and its words checked against the plain search's.
const read = q => {
  const t0 = performance.now();
  const r = readQuery(q, gazetteer);
  parseMs += performance.now() - t0;
  parsed++;
  if ([...r.words, ...r.placeWords].sort().join(' ') !== wordsOf(q).sort().join(' ')) uneven.push(`"${q}"`);
  return r;
};
const isWord = r => !r.towns.length && !r.countries.length;

console.log(`${pile.length} offers, ${list.length} towns with offers (${list.filter(r => r[7]).length} with names in other languages)`);
console.log(`${ambiguous.length} names the pile mostly uses as words, read as a town only after "in": ${ambiguous.join(', ')}\n`);

// ➤ 1. Every town name.
const names = new Map();
for (const [shown, other, , cc, lat, lon, , more = []] of list) {
  for (const name of [shown, other, ...more]) {
    const k = nameKey(name);
    if (k.length < 3) continue;
    if (!names.has(k)) names.set(k, { name, k, ids: new Set(), ccs: new Set() });
    names.get(k).ids.add(`${shown}|${cc}|${lat}|${lon}`);
    names.get(k).ccs.add(cc);
  }
}
// ➤ A town named as a country ("Luxembourg") is read as the country, and that is right.
const isIt = (r, e) => r.towns.some(t => e.ids.has(`${t.name}|${t.cc}|${t.lat}|${t.lon}`)) || r.countries.some(cc => e.ccs.has(cc)) || (isCountry(e.k) && r.countries.length > 0);
const fails = [[], [], []];
for (const e of names.values()) {
  const amb = gazetteer.ambiguous.has(e.k) && !isCountry(e.k);
  const [a, b, c] = [e.name, `mechanical engineer ${e.name}`, `mechanical engineer in ${e.name}`].map(read);
  if (amb ? !isWord(a) : !isIt(a, e)) fails[0].push(`"${e.name}"${amb ? ' (a word)' : ''} → ${where(a)}`);
  if (amb ? !isWord(b) : !(isIt(b, e) && b.words.join(' ') === 'mechanical engineer')) fails[1].push(`"mechanical engineer ${e.name}" → ${where(b)}; words "${b.words.join(' ')}"`);
  if (!(isIt(c, e) && c.words.join(' ') === 'mechanical engineer')) fails[2].push(`"mechanical engineer in ${e.name}" → ${where(c)}; words "${c.words.join(' ')}"`);
}
console.log(`1. town names: ${names.size}`);
['alone', 'after a title', 'after "in"'].forEach((label, i) => {
  console.log(`   ${label}: ${names.size - fails[i].length} right (${pct(names.size - fails[i].length, names.size)})`);
  show(fails[i]);
});

// ➤ 2. Every distinct title and company, with the offers that carry it.
const texts = new Map();
for (const o of pile) {
  for (const [text, company] of [[o.t, false], [o.te, false], [o.c, true]]) {
    if (!text) continue;
    const e = texts.get(text) || texts.set(text, { own: [], company }).get(text);
    if (!e.own.includes(o)) e.own.push(o);
  }
}
const found = Object.fromEntries(RADII.map(km => [km, 0]));
const misses = new Map();
let placed = 0, strict = 0;
for (const [text, { own, company }] of texts) {
  const r = read(text);
  if (isWord(r)) { for (const km of RADII) found[km]++; strict++; continue; }
  placed++;
  // ➤ For comparison: the place alone, without "or the advert names it".
  const bare = makeLocation({ countries: r.countries, places: r.towns, said: [], km: RADII[0], remote: false });
  if (own.some(o => !bare(o))) strict++;
  for (const km of RADII) {
    const location = makeLocation({ countries: r.countries, places: r.towns, said: r.said, km, remote: false });
    if (own.some(o => !location(o))) { found[km]++; continue; }
    if (km !== RADII[0]) continue;
    const asWord = namesIn(text, towns, null, company).some(m => !m.place && r.said.includes(m.k));
    const key = `${where(r)}|${asWord}`;
    const e = misses.get(key) || misses.set(key, { name: where(r), asWord, n: 0, text }).get(key);
    e.n++;
  }
}
console.log(`\n2. titles and companies typed as they stand: ${texts.size}; a place read in ${placed}`);
for (const km of RADII) console.log(`   at ${km} km: ${found[km]} find their own offer (${pct(found[km], texts.size)}); ${texts.size - found[km]} do not`);
console.log(`   (by the place alone, at ${RADII[0]} km: ${strict}, ${pct(strict, texts.size)}; ${texts.size - strict} do not)`);
for (const asWord of [true, false]) {
  const rows = [...misses.values()].filter(e => e.asWord === asWord).sort((a, b) => b.n - a.n);
  console.log(`   misses at 25 km where the text uses the name as ${asWord ? 'a word' : 'a place'}: ${rows.reduce((s, e) => s + e.n, 0)}`);
  show(rows.map(e => `${e.name}: ${e.n}, e.g. "${e.text}"`));
}

// ➤ What "or the advert names it" costs: every town typed alone, the adverts farther than 25 km
// ➤ that name it (in title, company or place) against the ones within 25 km.
const said = new Map();
for (const o of pile) {
  const ws = nameKey([o.t, o.te, o.c, o.ci, o.l].filter(Boolean).join(' ')).split(' ');
  const seen = new Set();
  for (let i = 0; i < ws.length; i++) for (let n = 1; n <= 4 && i + n <= ws.length; n++) { const k = ws.slice(i, i + n).join(' '); if (names.has(k) && !seen.has(k)) { seen.add(k); (said.get(k) || said.set(k, []).get(k)).push(o); } }
}
const cell = (lat, lon) => `${Math.floor(lat * 2)}|${Math.floor(lon * 2)}`;
const grid = new Map();
for (const o of pile) if (o.g) (grid.get(cell(...o.g)) || grid.set(cell(...o.g), []).get(cell(...o.g))).push(o);
const nearby = t => { const out = []; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) out.push(...(grid.get(`${Math.floor(t.lat * 2) + a}|${Math.floor(t.lon * 2) + b}`) || [])); return out; };
let within = 0, beyond = 0;
const adds = [];
for (const e of names.values()) {
  if (gazetteer.ambiguous.has(e.k) || isCountry(e.k)) continue;
  const r = readQuery(e.name, gazetteer);
  const location = makeLocation({ countries: r.countries, places: r.towns, said: [], km: 25, remote: false });
  const inside = new Set(r.towns.flatMap(nearby).filter(o => !location(o)));
  const extra = (said.get(e.k) || []).filter(o => !inside.has(o) && o.cc !== 'xx' && namesAny([o.t, o.te, o.c, o.ci, o.l].filter(Boolean).join(' · '), [e.k]));
  within += inside.size; beyond += extra.length;
  if (extra.length) adds.push({ name: e.name, inside: inside.size, extra: extra.length, sample: extra[0] });
}
console.log(`   what "or the offer names it" adds, every town typed alone: ${beyond} offers beyond 25 km against ${within} within (${pct(beyond, within)} more)`);
show(adds.sort((a, b) => b.extra - a.extra).map(a => `${a.name}: ${a.inside} within, ${a.extra} beyond, e.g. "${a.sample.t}" · ${a.sample.c} · ${a.sample.l}`));

// ➤ 3. The words titles use most, typed alone.
const titleWords = new Map();
for (const o of pile) for (const w of new Set([o.t, o.te].filter(Boolean).flatMap(t => nameKey(t).split(' ')))) if (w.length >= 2) titleWords.set(w, (titleWords.get(w) || 0) + 1);
const asPlaces = [];
for (const [w, n] of titleWords) {
  const r = read(w);
  if (!isWord(r)) asPlaces.push({ w, n, u: uses.get(w), r });
}
asPlaces.sort((a, b) => b.n - a.n);
const usage = a => (a.u ? `${a.u.place} offers use it as a place, ${a.u.word} as a word` : 'no town of that name in a title');
console.log(`\n3. title words read as a place when typed alone: ${asPlaces.length} of ${titleWords.size}; the most used:`);
show(asPlaces.map(a => `${a.w} → ${where(a.r)}: in ${a.n} titles; ${usage(a)}`));
const wordy = asPlaces.filter(a => a.u && a.u.word > a.u.place);
console.log(`   read as a place though the pile uses it more as a word: ${wordy.length}`);
show(wordy.map(a => `${a.w} → ${where(a.r)}: ${usage(a)}`));

// ➤ 4. Codes, and the words.
const ids = catalogueIds({ families: load('families'), countries: load('countries'), languages: load('languages'), degrees: load('degrees'), vetoes: load('vetoes'), occupations: load('occupations') });
const all = new Set([...texts.keys(), ...titleWords.keys(), ...[...names.values()].map(e => e.name)]);
const asCode = [...all].filter(s => { try { decodeProfile(s.trim(), ids); return true; } catch { return false; } });
console.log(`\n4. codes: ${asCode.length} of ${all.size} titles, companies, words and towns read as a code`);
show(asCode);
console.log(`   words kept and taken add up to the plain search's in ${parsed - uneven.length} of ${parsed} readings`);
show(uneven);

console.log(`\n5. speed: ${parsed} readings in ${parseMs.toFixed(0)} ms, ${(parseMs / parsed).toFixed(3)} ms each`);
