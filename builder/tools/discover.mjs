// ➤ Finds company boards: for each company name given (arguments, or one per line in a file
// ➤ with --file), tries the slugs the name suggests against every ATS pattern in
// ➤ adapters/boards.mjs and prints what answers with adverts, with how many of them the gate
// ➤ would keep and where they are. What comes out is pasted into config/companies.yml by hand.
// ➤   node builder/tools/discover.mjs "Van Oord" Damen Fugro
// ➤   node builder/tools/discover.mjs --file candidates.txt
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ATS } from '../adapters/boards.mjs';
import { getJson, getText } from '../http.mjs';
import { compileFamilies, familiesOf, hygieneReason } from '../gate.mjs';
import { compileCountries, placeOf } from '../normalise.mjs';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const read = p => JSON.parse(readFileSync(join(ROOT, ...p.split('/')), 'utf-8'));
const gate = compileFamilies(read('catalogues/families.json'), { isco: read('catalogues/codes/isco.json'), ssyk: read('catalogues/codes/ssyk-isco.json') });
const countries = compileCountries(read('catalogues/countries.json').countries);
const europe = new Set(read('catalogues/countries.json').countries.map(c => c.iso));

// ➤ "Royal IHC" → royalihc, royal-ihc, RoyalIHC (SmartRecruiters likes its own casing).
function slugsOf(name) {
  const words = name.replace(/[^\p{L}\p{N}\s-]/gu, ' ').trim().split(/[\s-]+/).filter(Boolean);
  const plain = words.join('').toLowerCase();
  const dashed = words.join('-').toLowerCase();
  const camel = words.map(w => w[0].toUpperCase() + w.slice(1)).join('');
  return [...new Set([plain, dashed, camel, name.toLowerCase().replace(/\s+/g, '')])];
}

async function probe(ats, slug, company) {
  const url = ATS[ats].url(slug);
  try {
    const body = ATS[ats].xml ? await getText(url, { tries: 1, gapMs: 150 }) : await getJson(url, { tries: 1, gapMs: 150 });
    return ATS[ats].parse(body, slug, company);
  } catch { return null; }
}

// ➤ What the pile would keep from a board: the gate's verdict and the country of each advert.
function judge(jobs, ats) {
  const kept = [];
  for (const p of jobs) {
    const raw = { ...p, source: ats, codes: {}, lang: '' };
    if (!/^https?:\/\//.test(String(raw.url || ''))) continue;
    if (!familiesOf(raw, gate).length || hygieneReason(raw)) continue;
    const place = placeOf(raw.location, countries);
    if (place.cc && place.cc !== 'xx' && !europe.has(place.cc)) continue;
    kept.push(place.cc || 'zz');
  }
  const by = {};
  for (const cc of kept) by[cc] = (by[cc] || 0) + 1;
  return { n: kept.length, where: Object.entries(by).sort((a, b) => b[1] - a[1]).map(([cc, n]) => `${cc} ${n}`).join(' ') };
}

const args = process.argv.slice(2);
const fileAt = args.indexOf('--file');
const names = fileAt >= 0 ? readFileSync(args[fileAt + 1], 'utf8').split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#')) : args;
if (!names.length) { console.log('give company names, or --file with one per line'); process.exit(1); }

// ➤ The ATS live on different hosts, so one company is asked of all of them at once.
async function onAts(ats, name) {
  for (const slug of slugsOf(name)) {
    const jobs = await probe(ats, slug, name);
    if (jobs && jobs.length) return { ats, slug, total: jobs.length, ...judge(jobs, ats) };
  }
  return null;
}
for (const name of names) {
  const hits = (await Promise.all(Object.keys(ATS).map(ats => onAts(ats, name)))).filter(Boolean);
  if (!hits.length) { console.log(`- ${name}: nothing`); continue; }
  for (const h of hits) console.log(`+ ${name}: ${h.ats}: ${h.slug}  (${h.total} adverts, ${h.n} kept: ${h.where || '-'})`);
}
