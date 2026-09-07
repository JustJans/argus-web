// ➤ The tenants of the careers platforms whose pages are drawn by JavaScript (Workday,
// ➤ Oracle), taken from the addresses Web Data Commons already saw (builder/state/wdc-hosts.json,
// ➤ written by scout-wdc.mjs): the slug is in the address, so no crawling is needed to find
// ➤ them. They join builder/state/scout-slugs.json, and `scout.mjs --probe` then reads each
// ➤ one through its public listing and keeps those with adverts of ours in Europe — but only
// ➤ when builder/config/vendors.yml switches that vendor on.
// ➤   node builder/tools/vendor-slugs.mjs [--dry]
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { detectPlatform } from '../lib/crawl.mjs';
import { loadVendors } from '../adapters/boards.mjs';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const HOSTS = join(ROOT, 'builder', 'state', 'wdc-hosts.json');
const SLUGS = join(ROOT, 'builder', 'state', 'scout-slugs.json');
const DRY = process.argv.includes('--dry');

const URLS = join(ROOT, 'builder', 'state', 'wdc-vendor-urls.json');
if (!existsSync(HOSTS) && !existsSync(URLS)) { console.log(`no ${HOSTS}: run builder/tools/scout-wdc.mjs or builder/tools/vendor-urls.mjs first`); process.exit(1); }
const file = existsSync(SLUGS) ? JSON.parse(readFileSync(SLUGS, 'utf8')) : { crawls: [], collected_at: new Date().toISOString(), slugs: {} };
const found = {};
const take = url => { const p = detectPlatform(url); if (p.ats) (found[p.ats] ||= new Set()).add(p.slug); };
// ➤ The hosts the careers scout kept, and the one address per vendor host that vendor-urls.mjs
// ➤ reads out of the same files for every host, kept or not.
if (existsSync(HOSTS)) {
  for (const [host, v] of Object.entries(JSON.parse(readFileSync(HOSTS, 'utf8')))) {
    if (!/myworkdayjobs\.com$|oraclecloud\.com$/.test(host)) continue;
    for (const url of v.urls || []) { take(url); break; }
  }
}
if (existsSync(URLS)) for (const url of Object.values(JSON.parse(readFileSync(URLS, 'utf8')))) take(url);
const vendors = loadVendors();
for (const [ats, set] of Object.entries(found)) {
  const before = new Set(file.slugs[ats] || []);
  const after = [...new Set([...before, ...set])];
  console.log(`${ats}: ${set.size} tenants seen, ${after.length - before.size} of them new (${after.length} in all)${vendors[ats] === true ? '' : ' — switched off in config/vendors.yml, the probe will skip them'}`);
  file.slugs[ats] = after;
}
if (!Object.keys(found).length) console.log('no Workday or Oracle addresses in the Web Data Commons hosts');
else if (!DRY) { writeFileSync(SLUGS, JSON.stringify(file, null, 1)); console.log(`written ${SLUGS}`); }
