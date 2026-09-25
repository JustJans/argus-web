// ➤ The judge the list page runs, with Argus's real title engine plugged in. Families are
// ➤ ISCO-08 unit groups: 2144 mechanical engineers, 2142 civil engineers, 3151 ships' engineers.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { harness } from 'argus/server-bot/test-harness.mjs';
import * as engine from 'argus/server-bot/filters.mjs';
import { makeJudge, sortOffers, distanceKm } from '../app/lib/gates.js';
import { normaliseProfile } from '../app/lib/codec.js';
import { shardFiles, loadShards } from '../app/lib/shards.js';

const { ok, eq, done } = harness('gates');
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const load = n => JSON.parse(readFileSync(join(ROOT, 'catalogues', `${n}.json`), 'utf-8'));
const cats = { families: load('families'), countries: load('countries'), languages: load('languages'), degrees: load('degrees'), seniority: load('seniority'), vetoes: load('vetoes') };

const profile = normaliseProfile({ families: ['2144', '3151'], countries: ['es', 'nl'], languages: ['en', 'es'], degrees: ['naval'], level: 'junior', maxYears: 3, remote: false, roles: ['mooring', 'naval architect'], vetoes: ['sales'], noWords: ['dredging'] });
const judge = makeJudge(profile, cats, engine);
const base = { f: ['2144'], t: 'Naval Architect', c: 'Damen', l: 'Gorinchem, Netherlands', cc: 'nl', y: 2 };

eq(judge(base).ok, true, 'a fitting advert passes');
eq(judge({ ...base, f: ['2142'] }).stage, 'FAMILY', 'another family is out');
eq(judge({ ...base, f: ['2142', '3151'] }).ok, true, 'one family in common is enough');
eq(judge({ ...base, t: 'Senior Naval Architect' }).stage, 'TITLE', 'a junior does not get the senior advert');
ok(/senior/i.test(judge({ ...base, t: 'Senior Naval Architect' }).reason), 'and the reason names the word');
eq(judge({ ...base, t: 'Sales Engineer Mooring' }).ok, true, "an older code's ready-made exclusion no longer blocks");
eq(judge({ ...base, t: 'Mooring Engineer, dredging fleet' }).stage, 'TITLE', 'a word to avoid blocks');
eq(judge({ ...base, t: 'Piping Designer' }).stage, 'TITLE', 'a title without any role word is out');
eq(judge({ ...base, cc: 'de' }).stage, 'COUNTRY', 'a country not chosen is out');
eq(judge({ ...base, cc: 'xx' }).stage, 'COUNTRY', 'remote is out when not allowed');
eq(judge({ ...base, cc: '' }).ok, true, 'an unknown country is kept');
eq(judge({ ...base, y: 5 }).stage, 'YEARS', 'more years than the cap is out');
eq(judge({ ...base, dg: ['electrical'] }).stage, 'DEGREE', 'a degree not held is out');
eq(judge({ ...base, dg: ['electrical', 'naval'] }).ok, true, 'either of two degrees is enough');
eq(judge({ ...base, dg: ['engineering-any'] }).ok, true, 'any engineering degree satisfies the generic demand');
eq(judge({ ...base, lg: ['nl'] }).stage, 'LANGUAGE', 'a language not spoken is out');
ok(/Dutch/.test(judge({ ...base, lg: ['nl'] }).reason), 'named in words');
eq(judge({ ...base, lg: ['en'] }).ok, true, 'a language spoken is fine');

{
  const open = makeJudge(normaliseProfile({}), cats, engine);
  eq(open({ f: ['2142'], t: 'Senior Site Manager', cc: 'de' }).ok, true, 'an empty profile lets everything through');
  eq([open({ f: ['2144'], t: 'Ingeniero mecánico', cc: 'es', dg: ['mechanical'] }).ok, open({ f: ['2144'], t: 'Ingeniero mecánico', cc: 'es', lg: ['es'] }).ok], [true, true], 'an advert that names a degree or a language passes when the visitor listed none');
  const spainOnly = makeJudge(normaliseProfile({ countries: ['es'] }), cats, engine);
  eq(spainOnly({ f: ['2144'], t: 'Ingeniero mecánico', cc: 'es', dg: ['mechanical'], lg: ['es'] }).ok, true, 'ticking only a country hides nothing for degree or language');
  const withDegree = makeJudge(normaliseProfile({ degrees: ['electrical'] }), cats, engine);
  eq(withDegree({ f: ['2144'], t: 'Ingeniero mecánico', cc: 'es', dg: ['mechanical'] }).stage, 'DEGREE', 'once the visitor lists degrees, the screen applies');
}
{
  // ➤ Specialties narrow a family; cities narrow a country; the rest stays as it was.
  const naval = makeJudge(normaliseProfile({ families: ['2144', '2142'], specialties: ['2144.1.14'] }), cats, engine);
  eq([naval({ f: ['2144'], e: ['2144.1.14'], t: 'Naval Architect' }).ok, naval({ f: ['2144'], e: ['2144.1'], t: 'Mechanical Engineer' }).stage, naval({ f: ['2144'], t: 'Werktuigbouwkundige' }).stage], [true, 'FAMILY', 'FAMILY'], 'a mechanical engineer is out once only naval architects were chosen, and so is one that names no specialty');
  eq(naval({ f: ['2142'], t: 'Site Engineer' }).ok, true, 'a family with no specialty chosen keeps all of its adverts');
  // ➤ Barcelona and 25 km: Cornellà (7 km) and Rubí (17 km) are in, Manresa (47 km) and Madrid
  // ➤ are not, and neither is a Spanish advert the map could not place; other countries are untouched.
  const bcn = makeJudge(normaliseProfile({ countries: ['nl'], place: { cc: 'es', name: 'Barcelona, Catalonia', lat: 41.39, lon: 2.16, km: 25 } }), cats, engine);
  const at = (cc, g) => bcn({ f: ['2144'], t: 'Ingeniero', cc, g });
  eq([at('es', [41.35, 2.08]).ok, at('es', [41.49, 2.03]).ok, at('es', [41.73, 1.83]).stage, at('es', [40.42, -3.70]).stage], [true, true, 'PLACE', 'PLACE'], 'within the distance of the town, or not');
  eq([at('es', undefined).stage, at('nl', [52.01, 4.36]).ok], ['PLACE', true], 'an advert off the map is not found by town; another country chosen keeps all of its adverts');
  ok(Math.abs(distanceKm([48.86, 2.35], [51.51, -0.13]) - 344) < 2, 'Paris to London is some 344 km as the crow flies');
}
{
  // ➤ Work modes: the offers that state one of those chosen; one that states none is left out.
  const remote = makeJudge(normaliseProfile({ modes: ['remote', 'hybrid'] }), cats, engine);
  const offer = w => remote({ f: ['2512'], t: 'Software Engineer', cc: 'es', ...(w ? { w } : {}) });
  eq([offer('r').ok, offer('h').ok, offer('o').stage, offer('').stage], [true, true, 'MODE', 'MODE'], 'remote or hybrid chosen: on-site and unstated are out');
  eq([offer('o').reason, offer('').reason], ['on-site work', 'does not say where the work is done'], 'with the reason in words');
  eq(makeJudge(normaliseProfile({ families: ['2512'] }), cats, engine)({ f: ['2512'], t: 'Software Engineer', w: 'o' }).ok, true, 'no mode chosen: every mode stays');
  // ➤ Pay: a range that reaches the minimum stays; unstated pay stays unless only stated pay is wanted.
  const paid = p => makeJudge(normaliseProfile({ minPay: 45, ...p }), cats, engine);
  const at = (judgeIt, o) => judgeIt({ f: ['2512'], t: 'Software Engineer', cc: 'es', ...o });
  eq([at(paid(), { p: [40000, 50000, 'EUR', 'y'], pa: 50000 }).ok, at(paid(), { p: [3000, 3500, 'EUR', 'm'], pa: 42000 }).stage, at(paid(), {}).ok], [true, 'PAY', true], 'a range reaching €45,000 stays, one under it goes, an offer with no pay stays');
  ok(/42\.000/.test(at(paid(), { p: [3000, 3500, 'EUR', 'm'], pa: 42000 }).reason), 'the reason names the top of the year in euros, thousands after a dot');
  eq([at(paid({ payStated: true }), {}).stage, at(paid({ payStated: true }), { p: [20, 25, 'EUR', 'h'] }).ok], ['PAY', true], 'only stated pay: no pay is out; pay with no yearly figure is stated, and stays');
}
{
  const sorted = sortOffers([{ cc: 'nl', d: '2026-09-01' }, { cc: 'es', d: '2026-08-01' }, { cc: 'es', d: '2026-09-02' }, { cc: 'xx', d: '2026-09-03' }, { cc: 'fr', d: '2026-09-03' }], profile);
  eq(sorted.map(o => `${o.cc}:${o.d}`), ['es:2026-09-02', 'es:2026-08-01', 'nl:2026-09-01', 'fr:2026-09-03', 'xx:2026-09-03'], 'countries in the profile order, newest first inside, others and remote last');
}
{
  const index = { families: { 2144: { countries: { es: { files: ['offers/2144-es.json'] }, se: { files: ['offers/2144-se-1.json', 'offers/2144-se-2.json'] }, xx: { files: ['offers/2144-xx.json'] }, zz: { files: ['offers/2144-zz.json'] } } }, 2142: { countries: { es: { files: ['offers/2142-es.json'] } } } } };
  eq(shardFiles(index, normaliseProfile({ families: ['2144'], countries: ['es'] })), ['offers/2144-es.json'], 'only the parts the profile names; the country-unknown part is left out once a country is chosen');
  ok(shardFiles(index, normaliseProfile({ families: ['2144'] })).includes('offers/2144-zz.json'), 'with no country chosen, the country-unknown part comes too');
  eq(shardFiles(index, normaliseProfile({ families: ['2144'], countries: ['es'], remote: true })).includes('offers/2144-xx.json'), true, 'remote adds its part');
  eq(shardFiles(index, normaliseProfile({})).length, 6, 'no choices: everything');
  const pages = { 'data/offers/a.json': { offers: [{ id: '1', f: ['2144'] }, { id: '2', f: ['2144'] }] }, 'data/offers/b.json': { offers: [{ id: '2', f: ['3151'] }] } };
  const r = await loadShards(['offers/a.json', 'offers/b.json', 'offers/missing.json'], 'data', async u => { if (!(u in pages)) throw new Error('404'); return pages[u]; });
  eq(r.offers.length, 2, 'an advert in two parts is one advert');
  eq(r.offers.find(o => o.id === '2').f.sort(), ['2144', '3151'], 'with both families');
  eq(r.failed, ['offers/missing.json'], 'a missing part is reported, not fatal');
}

done();
