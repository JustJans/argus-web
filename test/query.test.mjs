// ➤ The search bar's reading (towns and countries in what a visitor types), the place it makes
// ➤ of them, and the builder's list of names the pile uses as words.
import { harness } from 'argus/server-bot/test-harness.mjs';
import { compileGazetteer, readQuery, scopeCountries } from '../app/lib/query.js';
import { nameKey, nameKeys, namesAny } from '../app/lib/name-key.js';
import { makeLocation } from '../app/lib/gates.js';
import { wordsOf } from '../app/lib/search.js';
import { ambiguousNames, namesIn, townNames } from '../builder/place-names.mjs';

const { ok, eq, done } = harness('query');

// ➤ A small places.json: [shown, other, region, cc, lat, lon, offers, other names].
const places = [
  ['Vigo', '', 'Galicia', 'es', 42.24, -8.72, 40],
  ['Redondela', '', 'Galicia', 'es', 42.28, -8.61, 3],
  ['Valença', '', 'Viana do Castelo', 'pt', 42.03, -8.64, 2],
  ['Bergen', '', 'Vestland', 'no', 60.39, 5.32, 33],
  ['Bergen', '', 'Lower Saxony', 'de', 52.81, 9.96, 1],
  ['München', 'Munich', 'Bavaria', 'de', 48.14, 11.58, 900, ['Múnich', 'Monaco di Baviera']],
  ['Genève', 'Geneva', 'Geneva', 'ch', 46.2, 6.14, 80, ['Ginebra', 'Genf']],
  ['Saint-Étienne', '', 'Auvergne-Rhône-Alpes', 'fr', 45.43, 4.39, 12],
  ['Tromsø', '', 'Troms', 'no', 69.65, 18.96, 9],
  ['A Coruña', '', 'Galicia', 'es', 43.37, -8.4, 20],
  ['Orange', '', 'Provence', 'fr', 44.14, 4.81, 5],
  ['Laval', '', 'Pays de la Loire', 'fr', 48.07, -0.77, 6],
  ['Luxembourg', '', 'Luxembourg', 'lu', 49.61, 6.13, 70],
  ['St', '', '', 'fr', 45.0, 3.0, 1],
];
const countries = [
  { iso: 'es', names: ['Spain', 'España'] }, { iso: 'no', names: ['Norway', 'Noruega'] },
  { iso: 'de', names: ['Germany', 'Alemania', 'Deutschland'] }, { iso: 'fr', names: ['France', 'Francia'] },
  { iso: 'gb', names: ['United Kingdom', 'UK'] }, { iso: 'lu', names: ['Luxembourg'] },
];
const g = compileGazetteer({ places, ambiguous: ['orange'] }, countries);
const towns = q => readQuery(q, g).towns.map(t => `${t.name}/${t.cc}`).sort();

// ➤ Towns and words.
eq(towns('Vigo'), ['Vigo/es'], 'a town alone');
eq(readQuery('mechanical engineer Vigo', g).words, ['mechanical', 'engineer'], 'the title stays, the town goes');
eq(readQuery('ingeniero cerca de Vigo', g).words, ['ingeniero'], '"cerca de" goes with the town');
eq(readQuery('ingeniero en Vigo y alrededores', g).words, ['ingeniero'], '"y alrededores" goes too');
eq(towns('Barcelona y Vigo, Bergen'), ['Bergen/de', 'Bergen/no', 'Vigo/es'], 'several towns; a comma between them');
eq(towns('Bergen'), ['Bergen/de', 'Bergen/no'], 'two towns of one name: both');
eq(towns('Bergen, Norway'), ['Bergen/no'], 'the country after the town picks it');
eq(readQuery('Bergen, Norway', g).countries, [], 'and is not a country of its own');
eq(towns('Múnich'), ['München/de'], 'a name in another language');
eq(towns('muenchen'), ['München/de'], 'the German spelling without the umlaut');
eq(towns('tromso engineer'), ['Tromsø/no'], 'ø typed as o');
eq(towns('saint etienne'), ['Saint-Étienne/fr'], 'a hyphenated name typed with a space');
eq(towns('etienne'), [], 'half a name is not the town');
eq(towns('a coruña'), ['A Coruña/es'], 'a name with a one-letter word');
eq(towns('ST engineer'), [], 'two letters are never a town');
eq(towns('Orange'), [], 'a name the pile uses as a word, alone: a word');
eq(readQuery('Orange', g).words, ['orange'], 'and it stays in the words');
eq(towns('engineer in Orange'), ['Orange/fr'], 'after "in", the town');
eq(towns('Orange, France'), ['Orange/fr'], 'with its country after it, the town');
eq(readQuery('ingeniero Alemania', g).countries, ['de'], 'a country');
eq(readQuery('ingeniero Alemania', g).words, ['ingeniero'], 'its name goes from the words');
eq(readQuery('Luxembourg', g).countries, ['lu'], 'a town named as its country is the country');
eq(readQuery('ingeniero en Vigo', g).said, ['vigo'], 'the names read, as typed');
for (const q of ['mechanical engineer Vigo', 'Orange, France', 'ingeniero cerca de Vigo y alrededores', 'R&D in Genf; C++', 'x, y,, z']) {
  const r = readQuery(q, g);
  eq([...r.words, ...r.placeWords].sort(), wordsOf(q).sort(), `nothing typed is lost: "${q}"`);
}
eq(scopeCountries(readQuery('Vigo', g), g, 50).sort(), ['es', 'pt'], 'the parts of the pile a town reaches over a border');

// ➤ The place made of a reading.
const at = (t, g2, more = {}) => ({ t, c: 'Acme', l: '', cc: more.cc || 'es', g: g2, ...more });
const vigo = readQuery('Vigo', g);
const only = makeLocation({ countries: vigo.countries, places: vigo.towns, said: vigo.said, km: 25 });
ok(!only(at('Engineer', [42.28, -8.61])), 'within 25 km');
ok(!only(at('Engineer', [42.03, -8.64], { cc: 'pt' })), 'over the border, within 25 km');
eq(only(at('Engineer', [40.42, -3.7]))?.stage, 'PLACE', 'the same country, far away: out');
eq(only(at('Engineer', [48.85, 2.35], { cc: 'fr' }))?.stage, 'COUNTRY', 'another country: out');
ok(!only(at('Engineer - Vigo', [40.42, -3.7])), 'a title that names the town: in');
ok(!only(at('Engineer', [40.42, -3.7], { c: 'Vigo Shipyards' })), 'a company that names it: in');
ok(!only(at('Engineer', [40.42, -3.7], { l: 'Madrid; Vigo' })), 'a place that lists it: in');
eq(only(at('Engineer', undefined, { cc: 'xx' }))?.stage, 'COUNTRY', 'remote work: out unless allowed');
const noord = makeLocation({ countries: [], places: [{ name: 'Noord', cc: 'nl', lat: 52.4, lon: 4.9 }], said: ['noord'], km: 25 });
eq(noord(at('Engineer', [51.56, 5.09], { cc: 'nl', l: 'Tilburg, Noord-Brabant' }))?.stage, 'PLACE', 'a name joined by a hyphen does not count');
const both = makeLocation({ countries: ['fr', 'es'], places: vigo.towns, said: vigo.said, km: 25 });
ok(!both(at('Engineer', [48.85, 2.35], { cc: 'fr' })), 'France and Vigo: all of France');
eq(both(at('Engineer', [40.42, -3.7]))?.stage, 'PLACE', 'France and Vigo: Spain only around Vigo');
ok(!makeLocation({ countries: [] })(at('Engineer', [48.85, 2.35], { cc: 'fr' })), 'no place chosen: everywhere');

// ➤ Names and their forms.
eq(nameKey('Saint-Étienne'), 'saint etienne', 'a name in name form');
eq(nameKeys('Göteborg'), ['goteborg', 'goeteborg'], 'with and without the letter');
ok(namesAny('Engineer - Saint-Étienne', ['saint etienne']), 'a hyphenated name is itself');
ok(!namesAny('Baden-Württemberg', ['baden']), 'not a piece of a longer one');

// ➤ The builder's names used as words.
const list = [['Oss', '', '', 'nl', 51.77, 5.52, 30], ['Duisburg', '', '', 'de', 51.43, 6.76, 50], ['Brno', '', '', 'cz', 49.2, 16.61, 20]];
const t = townNames(list);
eq(namesIn('OSS Automation Engineer', t, null).map(m => m.place), [false], 'a name first in a title, unmarked: a word');
eq(namesIn('Softwareentwickler Duisburg', t, null).map(m => m.place), [true], 'last in a title: a place');
eq(namesIn('Engineer (Oss)', t, null).map(m => m.place), [true], 'after a separator: a place');
eq(namesIn('Dopravoprojekt Brno a.s.', t, null, true).map(m => m.place), [true], "a company's home town: a place");
eq(namesIn('Oss Energy', t, null, true).map(m => m.place), [false], 'a company named after a town: a word');
const rec = (t2, c, g2) => ({ t: t2, c, g: g2 });
const pile = [rec('OSS Automation Engineer', 'Telco', [52.37, 4.9]), rec('OSS Support', 'Telco', [52.37, 4.9]), rec('Operator', 'Pharma Oss', [51.77, 5.52]), rec('Engineer Duisburg', 'X', [48, 11])];
eq(ambiguousNames(list, pile), ['oss'], 'a name used more as a word than as a place is ambiguous');

done();
