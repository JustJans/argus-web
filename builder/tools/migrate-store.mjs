// ➤ The one-off move from the old shared state files to the store: what the careers adapter
// ➤ had cached (builder/state/careers.json: where each site reads from and every page it had
// ➤ already read) and what the Workable lane had kept (boards-daily.json) become one file per
// ➤ source, so the first crawl is not a cold start. The old files are left where they are.
// ➤   node builder/tools/migrate-store.mjs [--dry]
import { existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as careers from '../adapters/careers.mjs';
import { loadSource, saveSource } from '../store.mjs';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const DRY = process.argv.includes('--dry');
const read = p => { try { return JSON.parse(readFileSync(join(ROOT, 'builder', 'state', p), 'utf8')); } catch { return null; } };

const state = read('careers.json');
let sites = 0, pages = 0, adverts = 0;
if (state?.sites) {
  for (const site of careers.loadSites()) {
    const resolved = state.resolved?.[site.host] || {};
    const from = site.feed || site.sitemap || site.listing || resolved.sitemap || resolved.listing;
    const cache = from ? state.sites?.[from] : null;
    if (!cache) continue;
    const key = careers.siteKey(site);
    const data = loadSource('careers', key);
    data.kind = 'board';
    if (site.host && (resolved.sitemap || resolved.listing)) data.resolved = { [site.host]: resolved };
    data.pages = {};
    for (const [url, entry] of Object.entries(cache)) { data.pages[url] = { lastmod: entry.lastmod || '', job: entry.job || null }; pages++; }
    data.adverts = Object.entries(data.pages).map(([url, p]) => p.job && careers.toRaw(p.job, { ...site, ...resolved }, url)).filter(Boolean);
    const visited = state.visited?.[from];
    data.pass = { started: visited || null, ended: visited || null, ok: true, seconds: 0, listed: Object.keys(data.pages).length, fetched: 0, blocks: data.adverts.length > 0 };
    adverts += data.adverts.length;
    sites++;
    if (!DRY) saveSource(data);
  }
}

let boards = 0, boardAdverts = 0;
const daily = read('boards-daily.json');
for (const [ats, list] of Object.entries(daily || {})) {
  for (const [slug, entry] of Object.entries(list || {})) {
    if (!entry?.jobs?.length) continue;
    const data = loadSource(ats, slug);
    data.kind = 'board';
    data.adverts = entry.jobs.map(p => ({ source: ats, country: '', city: '', codes: {}, lang: '', expires: '', ...p, sourceId: `${slug}:${p.sourceId}` }));
    data.pass = { started: entry.at, ended: entry.at, ok: true, seconds: 0, listed: data.adverts.length };
    boards++; boardAdverts += data.adverts.length;
    if (!DRY) saveSource(data);
  }
}

console.log(`${DRY ? 'would move' : 'moved'} ${sites} careers sites (${pages} pages, ${adverts} adverts) and ${boards} boards (${boardAdverts} adverts) into the store`);
if (!existsSync(join(ROOT, 'builder', 'state', 'careers.json'))) console.log('no careers.json here: nothing of the old state to move');
