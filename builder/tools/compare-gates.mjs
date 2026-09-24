// ➤ This checkout's gate against another checkout's, on every advert in the store: the families
// ➤ and occupations each gives, the adverts where they differ (with a sample), and the time each
// ➤ takes. For any change to the gate: what it lets in, what it leaves out, what it costs.
// ➤   node builder/tools/compare-gates.mjs <other checkout>        e.g. a git worktree of master
import { existsSync, readFileSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join, resolve } from 'path';

const HERE = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const OTHER = resolve(process.argv[2] || '');
if (!process.argv[2]) { console.log('usage: node builder/tools/compare-gates.mjs <other checkout>'); process.exit(1); }

const load = async root => {
  const read = p => JSON.parse(readFileSync(join(root, p), 'utf8'));
  const g = await import(pathToFileURL(join(root, 'builder', 'gate.mjs')).href);
  // ➤ A checkout from before the official coding indexes has no titles.json.
  const codes = { isco: read('catalogues/codes/isco.json'), ssyk: read('catalogues/codes/ssyk-isco.json') };
  if (existsSync(join(root, 'catalogues', 'codes', 'titles.json'))) codes.titles = read('catalogues/codes/titles.json');
  return { g, gate: g.compileFamilies(read('catalogues/families.json'), codes) };
};
const { eachSource } = await import(pathToFileURL(join(HERE, 'builder', 'store.mjs')).href);
const { compileCountries, placeOfAdvert } = await import(pathToFileURL(join(HERE, 'builder', 'normalise.mjs')).href);
const cc = compileCountries(JSON.parse(readFileSync(join(HERE, 'catalogues', 'countries.json'), 'utf8')).countries);
const [other, here] = [await load(OTHER), await load(HERE)];

// ➤ The gate's inputs, as the pile builder gives them (a source with no language: its country's).
const inputs = [];
for (const data of eachSource()) for (const raw of data.adverts || []) {
  const r = { title: raw.title, lang: raw.lang, codes: raw.codes };
  if (!raw.lang) r.hintLangs = here.g.languagesOfCountry(placeOfAdvert(raw, cc).cc || String(raw.country || '').toLowerCase());
  inputs.push(r);
}
console.log(`${inputs.length} adverts in the store`);

const run = ({ g, gate }, label) => {
  const classify = g.classifier(gate);
  const started = process.hrtime.bigint();
  const out = inputs.map(r => { const v = classify(r); return `${v.families.join(',')}|${v.occupations.join(',')}`; });
  console.log(`${label}: ${(Number(process.hrtime.bigint() - started) / 1e9).toFixed(1)} s`);
  return out;
};
const before = run(other, `the other gate (${OTHER})`), after = run(here, 'this gate');
// ➤ Every change counted by its families before and after ("3131,3133 → 3123"), each with a few
// ➤ of its titles; --show N prints that many titles a change (default 3).
const show = Number(process.argv[process.argv.indexOf('--show') + 1]) || 3;
const families = s => s.split('|')[0] || '-';
const changes = new Map();
let differ = 0, into = 0, out = 0;
for (let i = 0; i < inputs.length; i++) {
  if (before[i] === after[i]) continue;
  differ++;
  if (!before[i].startsWith('|') && after[i].startsWith('|')) out++;
  if (before[i].startsWith('|') && !after[i].startsWith('|')) into++;
  const key = `${families(before[i])} → ${families(after[i])}`;
  const c = changes.get(key) || changes.set(key, { n: 0, titles: new Set() }).get(key);
  c.n++;
  if (c.titles.size < show) c.titles.add(inputs[i].title);
}
for (const [key, c] of [...changes].sort((a, b) => b[1].n - a[1].n)) {
  console.log(`  ${key}: ${c.n}`);
  for (const title of c.titles) console.log(`      ${JSON.stringify(title)}`);
}
console.log(`${differ} adverts differ: ${into} come in, ${out} go out, ${differ - into - out} change families or occupations`);
