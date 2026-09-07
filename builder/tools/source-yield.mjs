// ➤ What each source is actually giving. A source is worth reading every day when most of what
// ➤ it publishes is work this site is for: an engineering firm that also wants an administrator
// ➤ is an employer of ours, a haulier that once wanted a programmer is not. The gate is the same
// ➤ one the publisher uses, so the share here is the share that reaches the site.
// ➤ It only measures and writes builder/state/source-yield.json; retiring is a separate step.
// ➤   node builder/tools/source-yield.mjs [--min 15] [--bar 0.25]
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { compileFamilies, familiesOf, hygieneReason } from '../gate.mjs';
import { compileCountries, toRecord } from '../normalise.mjs';
import { compileScreens } from '../screens.mjs';
import { eachSource } from '../store.mjs';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const flag = (name, dflt) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : dflt; };
const MIN = Number(flag('--min', 15));    // ➤ adverts a source must have published to be judged
const BAR = Number(flag('--bar', 0.25));  // ➤ the share of its adverts that must be ours
const OUT = join(ROOT, 'builder', 'state', 'source-yield.json');

const read = p => JSON.parse(readFileSync(join(ROOT, ...p.split('/')), 'utf-8'));
const catalogue = read('catalogues/families.json');
const gate = compileFamilies(catalogue, { isco: read('catalogues/codes/isco.json'), ssyk: read('catalogues/codes/ssyk-isco.json') });
const countries = read('catalogues/countries.json').countries;
const cc = compileCountries(countries);
const screens = compileScreens({ degrees: read('catalogues/degrees.json'), languages: read('catalogues/languages.json') });
const europe = new Set(countries.map(c => c.iso));
const today = new Date().toISOString().slice(0, 10);

// ➤ Exactly the publisher's decision, advert by advert.
function ours(raw, kind) {
  if (!/^https?:\/\//.test(String(raw.url || ''))) return false;
  const fam = familiesOf(raw, gate);
  if (!fam.length || hygieneReason(raw)) return false;
  const rec = toRecord(raw, fam, cc, screens);
  if (rec.x && rec.x < today) return false;
  if (rec.cc && rec.cc !== 'xx' && !europe.has(rec.cc)) return false;
  if (!rec.cc && kind === 'board') return false;
  return true;
}

const rows = [];
let files = 0;
for (const data of eachSource()) {
  files++;
  const kind = data.kind === 'board' || data.kind === 'via' ? data.kind : 'feed';
  const adverts = data.adverts || [];
  let mine = 0;
  for (const raw of adverts) if (ours(raw, kind)) mine++;
  rows.push({ group: data.group, key: data.key, adverts: adverts.length, ours: mine, share: adverts.length ? mine / adverts.length : 0 });
  if (files % 2000 === 0) console.log(`${files} sources measured`);
}

rows.sort((a, b) => b.ours - a.ours);
writeFileSync(OUT, JSON.stringify(rows));
const total = rows.reduce((n, r) => n + r.adverts, 0), mine = rows.reduce((n, r) => n + r.ours, 0);
console.log(`\n${files} sources, ${total.toLocaleString('en')} adverts, ${mine.toLocaleString('en')} of ours (${(100 * mine / total).toFixed(1)}%)`);

// ➤ How the sources fall by the share of their adverts that is ours.
const bands = [[0, 0.0001, 'none of theirs is ours'], [0.0001, 0.05, 'under 5%'], [0.05, 0.15, '5-15%'], [0.15, 0.25, '15-25%'], [0.25, 0.5, '25-50%'], [0.5, 0.8, '50-80%'], [0.8, 1.01, 'over 80%']];
for (const [lo, hi, label] of bands) {
  const band = rows.filter(r => r.adverts >= MIN && r.share >= lo && r.share < hi);
  console.log(`  ${label.padEnd(24)} ${String(band.length).padStart(6)} sources · ${String(band.reduce((n, r) => n + r.adverts, 0)).padStart(8)} adverts · ${String(band.reduce((n, r) => n + r.ours, 0)).padStart(7)} ours`);
}
const small = rows.filter(r => r.adverts < MIN);
console.log(`  ${'too few to judge'.padEnd(24)} ${String(small.length).padStart(6)} sources · ${String(small.reduce((n, r) => n + r.adverts, 0)).padStart(8)} adverts · ${String(small.reduce((n, r) => n + r.ours, 0)).padStart(7)} ours`);

const out = rows.filter(r => r.adverts >= MIN && r.share < BAR);
console.log(`\nat a bar of ${BAR}: ${out.length} sources would go, taking ${out.reduce((n, r) => n + r.adverts, 0).toLocaleString('en')} adverts read for ${out.reduce((n, r) => n + r.ours, 0).toLocaleString('en')} of ours`);
console.log(`written ${OUT}`);
