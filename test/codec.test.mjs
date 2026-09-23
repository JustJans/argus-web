// ➤ The profile code must survive a round trip, stay short, and refuse a typo. These
// ➤ checks run the same file the browser runs.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { harness } from 'argus/server-bot/test-harness.mjs';
import { encodeProfile, decodeProfile, normaliseProfile, isEmptyProfile, catalogueIds, crc16, toBase64url, fromBase64url, VERSION, MODES } from '../app/lib/codec.js';

const { ok, eq, done } = harness('codec');
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const load = n => JSON.parse(readFileSync(join(ROOT, 'catalogues', `${n}.json`), 'utf-8'));
const cats = catalogueIds({ families: load('families'), countries: load('countries'), languages: load('languages'), degrees: load('degrees'), vetoes: load('vetoes'), occupations: load('occupations') });

eq(VERSION, 4, 'the code is at version 4');
eq(toBase64url(Uint8Array.from([0, 255, 16])), 'AP8Q', 'base64url of three bytes');
eq([...fromBase64url('AP8Q')], [0, 255, 16], 'and back');
eq([...fromBase64url(toBase64url(Uint8Array.from([1, 2])))], [1, 2], 'two bytes, no padding needed');
eq(crc16(new TextEncoder().encode('123456789')), 0x29b1, 'CRC-16/CCITT-FALSE check value');

// ➤ Families are ISCO-08 unit groups: 2144 mechanical engineers, 3151 ships' engineers.
const typical = { families: ['2144', '3151'], specialties: ['2144.1.14', '2144.1.10'], countries: ['es', 'nl', 'no'], place: { cc: 'es', name: 'Bilbao, Basque Country', lat: 43.26271, lon: -2.92528, km: 50 }, languages: ['en', 'es'], degrees: ['naval', 'mechanical'], level: 'junior', maxYears: 3, highest: 'master', remote: true, posted: 7, roles: ['mooring engineer', 'naval architect'], vetoes: ['sales', 'internships'], noWords: ['dredging'] };
{
  const code = encodeProfile(typical, cats);
  ok(/^[A-Za-z0-9_-]+$/.test(code), 'the code is URL-safe');
  ok(code.length <= 150, `a typical profile, specialties and a place included, stays short (${code.length} chars)`);
  const back = decodeProfile(code, cats);
  eq(back, normaliseProfile(typical), 'a typical profile round-trips exactly');
  eq(back.countries, ['es', 'nl', 'no'], 'countries keep their order (it is the priority)');
  eq([back.specialties, back.place], [['2144.1.10', '2144.1.14'], { cc: 'es', name: 'Bilbao, Basque Country', lat: 43.26, lon: -2.93, km: 50 }], 'specialties and a place ride along, the place to about a kilometre');
}
{
  // ➤ A specialty brings its family, a city its country: a code never names one without the other.
  const p = normaliseProfile({ specialties: ['2149.7.6'], place: { cc: 'de', name: 'München', lat: 48.14, lon: 11.58 } });
  eq([p.families, p.countries, p.place.km], [['2149'], ['de'], 25], 'a specialty names its family, a place its country, and a distance not given is 25 km');
  eq(decodeProfile(encodeProfile({ place: { cc: 'pt', name: 'Viana do Castelo, Viana do Castelo', lat: 41.69, lon: -8.83, km: 10 } }, cats), cats).place, { cc: 'pt', name: 'Viana do Castelo, Viana do Castelo', lat: 41.69, lon: -8.83, km: 10 }, 'a long name, a place west of Greenwich and a short distance round-trip');
  eq([normaliseProfile({ place: { cc: 'es', name: '', lat: 1, lon: 1 } }).place, normaliseProfile({ place: { cc: 'es', name: 'X', lat: 95, lon: 1 } }).place], [null, null], 'a place without a name, or off the globe, is no place');
}
{
  // ➤ Codes made before version 3 are in bookmarks: they read as they did.
  eq(decodeProfile('AgMIAAAAAQAAAFoDAIEAAAADAAMKAhBtb29yaW5nIGVuZ2luZWVyD25hdmFsIGFyY2hpdGVjdAIBAAEIZHJlZGdpbmfxPQ', cats), normaliseProfile({ ...typical, specialties: [], place: null }), 'a version-2 code decodes to the same profile');
  eq(decodeProfile('AgQAAAAAAAAAAAAAAAAAAAAAAAAAWtg', cats).posted, 30, 'with its posted window, two bits then');
  eq([1, 3, 90].map(d => decodeProfile(encodeProfile({ posted: d }, cats), cats).posted), [1, 3, 90], 'version 3 has the day, three days and three months');
  eq(decodeProfile('AwcIAAAAAAAAAAAAAAAAAAACAAMAAAAAAQZCaWxiYW8Q5v7bA7jg', cats), normaliseProfile({ families: ['2144'], countries: ['es', 'nl'], remote: true, posted: 7, place: { cc: 'es', name: 'Bilbao', lat: 43.26, lon: -2.93, km: 50 } }), 'a version-3 code decodes to the same profile, with no work mode and no pay');
}
{
  // ➤ Version 4: the work modes and the pay.
  const p = { families: ['2512'], countries: ['es'], modes: ['remote', 'hybrid'], minPay: 45, payStated: true, posted: 7, remote: true };
  const back = decodeProfile(encodeProfile(p, cats), cats);
  eq([back.modes, back.minPay, back.payStated, back.posted, back.remote], [['hybrid', 'remote'], 45, true, 7, true], 'work modes and pay ride along without disturbing the flags they share a byte with');
  eq(MODES.map(m => decodeProfile(encodeProfile({ modes: [m] }, cats), cats).modes), [['onsite'], ['hybrid'], ['remote']], 'each mode alone');
  eq(decodeProfile(encodeProfile({ minPay: 250 }, cats), cats).minPay, 250, 'a minimum over 127 thousand takes a second byte');
  eq([normaliseProfile({ modes: ['remote', 'anywhere', 'remote'] }).modes, normaliseProfile({ minPay: -3 }).minPay, normaliseProfile({ minPay: 45.5 }).minPay, normaliseProfile({ minPay: 5000 }).minPay], [['remote'], 0, 0, 999], 'unknown modes drop out; a minimum is a whole number of thousands, up to 999');
  ok(!isEmptyProfile({ modes: ['remote'] }) && !isEmptyProfile({ minPay: 30 }) && !isEmptyProfile({ payStated: true }), 'a work mode or a pay filter alone is a profile');
}
{
  const empty = encodeProfile({}, cats);
  ok(empty.length <= 36, `an empty profile is tiny (${empty.length} chars)`);
  eq(decodeProfile(empty, cats), normaliseProfile({}), 'and decodes to the defaults');
}
{
  const big = encodeProfile({ families: cats.families, countries: cats.countries, languages: cats.languages, degrees: cats.degrees, level: 'senior', maxYears: 15, highest: 'phd', roles: Array.from({ length: 12 }, (_, i) => `role number ${i} with words`), vetoes: cats.vetoes, noWords: Array.from({ length: 12 }, (_, i) => `word${i}`) }, cats);
  const back = decodeProfile(big, cats);
  eq(back.roles.length, 8, 'free terms are capped at eight');
  eq(back.families.length, cats.families.length, `every family fits in the bitfield (${cats.families.length} of 64)`);
  ok(cats.families.length > 32, 'there are more than 32 families, which is why the field is 64 bits');
  ok(big.length <= 450, `even everything at once stays under 450 chars (${big.length})`);
}
{
  // ➤ The last family in the catalogue sits past the 32nd bit: it must survive alone.
  const last = cats.families[cats.families.length - 1];
  eq(decodeProfile(encodeProfile({ families: [last] }, cats), cats).families, [last], 'a family past bit 32 round-trips');
}
{
  const code = encodeProfile({ roles: ['Ingénieur études — mécanique (H/F) et plus encore, vraiment long'] }, cats);
  const back = decodeProfile(code, cats);
  ok(back.roles[0].length > 0 && new TextEncoder().encode(back.roles[0]).length <= 24, 'a long free term is cut at 24 bytes without breaking');
}
{
  const code = encodeProfile(typical, cats);
  let rejected = 0;
  for (let i = 0; i < code.length; i++) {
    const ch = code[i] === 'A' ? 'B' : 'A';
    try { decodeProfile(code.slice(0, i) + ch + code.slice(i + 1), cats); } catch { rejected++; }
  }
  eq(rejected, code.length, 'every single-character change is rejected');
  let short = false; try { decodeProfile(code.slice(0, -1), cats); } catch { short = true; }
  ok(short, 'a code with a character missing is rejected');
  let junk = false; try { decodeProfile('not a code!!', cats); } catch { junk = true; }
  ok(junk, 'junk is rejected');
}
{
  // ➤ A version-1 code (4-byte family field, families that no longer exist) checks out but is
  // ➤ refused with the message to make a new one.
  const body = [1, 0, 0, 0, 0, 3, 0x40, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const crc = crc16(Uint8Array.from(body));
  const old = toBase64url(Uint8Array.from([...body, crc >> 8, crc & 255]));
  let msg = ''; try { decodeProfile(old, cats); } catch (e) { msg = e.message; }
  ok(/earlier version/.test(msg), `a version-1 code is refused with the message to make a new one ("${msg}")`);
}
{
  const p = decodeProfile(encodeProfile({ maxYears: 4, level: 'boss', posted: 12 }, cats), cats);
  eq([p.maxYears, p.level, p.posted], [null, 'any', 0], 'values outside the steps fall back to none, any and any time');
  eq(decodeProfile(encodeProfile({ posted: 30 }, cats), cats).posted, 30, 'the posted window rides in the flags byte');
  ok(isEmptyProfile({}) && isEmptyProfile({ level: 'any', posted: 0, remote: false }) && !isEmptyProfile({ posted: 7 }) && !isEmptyProfile({ remote: true }), 'an empty profile is one with nothing set, whatever the defaults are spelled like');
}
{
  // ➤ Unknown ids in a profile (a future catalogue) simply drop out of the code.
  const p = decodeProfile(encodeProfile({ families: ['2144', 'not-a-family'], countries: ['es', 'zz'] }, cats), cats);
  eq([p.families, p.countries], [['2144'], ['es']], 'unknown ids are left out');
}

done();
