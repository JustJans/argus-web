// ➤ The judge the list page runs, with Argus's real title engine plugged in. Families are
// ➤ ISCO-08 unit groups: 2144 mechanical engineers, 2142 civil engineers, 3151 ships' engineers.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { harness } from 'argus/server-bot/test-harness.mjs';
import * as engine from 'argus/server-bot/filters.mjs';
import { makeJudge, sortOffers } from '../app/lib/gates.js';
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
eq(judge({ ...base, t: 'Sales Engineer Mooring' }).stage, 'TITLE', 'a vetoed chip word blocks');
eq(judge({ ...base, t: 'Mooring Engineer, dredging fleet' }).stage, 'TITLE', 'a free deal-breaker word blocks');
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
}
{
  const sorted = sortOffers([{ cc: 'nl', d: '2026-09-01' }, { cc: 'es', d: '2026-08-01' }, { cc: 'es', d: '2026-09-02' }, { cc: 'xx', d: '2026-09-03' }, { cc: 'fr', d: '2026-09-03' }], profile);
  eq(sorted.map(o => `${o.cc}:${o.d}`), ['es:2026-09-02', 'es:2026-08-01', 'nl:2026-09-01', 'fr:2026-09-03', 'xx:2026-09-03'], 'countries in the profile order, newest first inside, others and remote last');
}
{
  const index = { families: { 2144: { countries: { es: { files: ['offers/2144-es.json'] }, se: { files: ['offers/2144-se-1.json', 'offers/2144-se-2.json'] }, xx: { files: ['offers/2144-xx.json'] }, zz: { files: ['offers/2144-zz.json'] } } }, 2142: { countries: { es: { files: ['offers/2142-es.json'] } } } } };
  eq(shardFiles(index, normaliseProfile({ families: ['2144'], countries: ['es'] })), ['offers/2144-es.json', 'offers/2144-zz.json'], 'only the parts the profile names, plus the country-unknown part');
  eq(shardFiles(index, normaliseProfile({ families: ['2144'], countries: ['es'], remote: true })).includes('offers/2144-xx.json'), true, 'remote adds its part');
  eq(shardFiles(index, normaliseProfile({})).length, 6, 'no choices: everything');
  const pages = { 'data/offers/a.json': { offers: [{ id: '1', f: ['2144'] }, { id: '2', f: ['2144'] }] }, 'data/offers/b.json': { offers: [{ id: '2', f: ['3151'] }] } };
  const r = await loadShards(['offers/a.json', 'offers/b.json', 'offers/missing.json'], 'data', async u => { if (!(u in pages)) throw new Error('404'); return pages[u]; });
  eq(r.offers.length, 2, 'an advert in two parts is one advert');
  eq(r.offers.find(o => o.id === '2').f.sort(), ['2144', '3151'], 'with both families');
  eq(r.failed, ['offers/missing.json'], 'a missing part is reported, not fatal');
}

done();
