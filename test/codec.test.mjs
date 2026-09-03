// ➤ The profile code must survive a round trip, stay short, and refuse a typo. These
// ➤ checks run the same file the browser runs.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { harness } from 'argus/server-bot/test-harness.mjs';
import { encodeProfile, decodeProfile, normaliseProfile, catalogueIds, crc16, toBase64url, fromBase64url } from '../app/lib/codec.js';

const { ok, eq, done } = harness('codec');
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const load = n => JSON.parse(readFileSync(join(ROOT, 'catalogues', `${n}.json`), 'utf-8'));
const cats = catalogueIds({ families: load('families'), countries: load('countries'), languages: load('languages'), degrees: load('degrees'), vetoes: load('vetoes') });

eq(toBase64url(Uint8Array.from([0, 255, 16])), 'AP8Q', 'base64url of three bytes');
eq([...fromBase64url('AP8Q')], [0, 255, 16], 'and back');
eq([...fromBase64url(toBase64url(Uint8Array.from([1, 2])))], [1, 2], 'two bytes, no padding needed');
eq(crc16(new TextEncoder().encode('123456789')), 0x29b1, 'CRC-16/CCITT-FALSE check value');

const typical = { families: ['mechanical', 'marine-offshore'], countries: ['es', 'nl', 'no'], languages: ['en', 'es'], degrees: ['naval', 'mechanical'], level: 'junior', maxYears: 3, highest: 'master', remote: true, roles: ['mooring engineer', 'naval architect'], vetoes: ['sales', 'internships'], noWords: ['dredging'] };
{
  const code = encodeProfile(typical, cats);
  ok(/^[A-Za-z0-9_-]+$/.test(code), 'the code is URL-safe');
  ok(code.length <= 100, `a typical profile stays short (${code.length} chars)`);
  const back = decodeProfile(code, cats);
  eq(back, normaliseProfile(typical), 'a typical profile round-trips exactly');
  eq(back.countries, ['es', 'nl', 'no'], 'countries keep their order (it is the priority)');
}
{
  const empty = encodeProfile({}, cats);
  ok(empty.length <= 30, `an empty profile is tiny (${empty.length} chars)`);
  eq(decodeProfile(empty, cats), normaliseProfile({}), 'and decodes to the defaults');
}
{
  const big = encodeProfile({ families: cats.families, countries: cats.countries, languages: cats.languages, degrees: cats.degrees, level: 'senior', maxYears: 15, highest: 'phd', roles: Array.from({ length: 12 }, (_, i) => `role number ${i} with words`), vetoes: cats.vetoes, noWords: Array.from({ length: 12 }, (_, i) => `word${i}`) }, cats);
  const back = decodeProfile(big, cats);
  eq(back.roles.length, 8, 'free terms are capped at eight');
  eq(back.families.length, cats.families.length, 'every family fits in the bitfield');
  ok(big.length <= 450, `even everything at once stays under 450 chars (${big.length})`);
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
  const p = decodeProfile(encodeProfile({ maxYears: 4, level: 'boss' }, cats), cats);
  eq([p.maxYears, p.level], [null, 'any'], 'values outside the steps fall back to none and any');
}
{
  // ➤ Unknown ids in a profile (a future catalogue) simply drop out of the code.
  const p = decodeProfile(encodeProfile({ families: ['mechanical', 'not-a-family'], countries: ['es', 'zz'] }, cats), cats);
  eq([p.families, p.countries], [['mechanical'], ['es']], 'unknown ids are left out');
}

done();
