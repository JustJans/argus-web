// ➤ Employers' own careers sites, read without an API: the sitemap names the vacancy pages,
// ➤ each page carries a schema.org JobPosting block (published for search engines; this
// ➤ reads it the same way), robots.txt is obeyed. Sites come from config/careers.yml (by
// ➤ hand) and config/careers-found.yml (the careers scout). Pages already read are kept in
// ➤ builder/state/careers.json, so a build costs one sitemap per site plus the new pages:
// ➤ a vacancy that leaves the sitemap has closed and leaves the pile.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import yaml from 'js-yaml';
import { get, getText, deadline } from '../http.mjs';
import { parseRobots, allowed, parseSitemap, looksLikeJob, jobPostings, jobLinks } from '../lib/crawl.mjs';

export const id = 'careers';
export const kind = 'board';
export const licence = {
  name: "Employers' careers sites", short: 'employer site', url: 'https://schema.org/JobPosting',
  licence: "The employer's own page, read through its sitemap and the JobPosting block it publishes for search engines; robots.txt obeyed", credit: '', needsKey: false,
};

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const STATE = join(ROOT, 'builder', 'state', 'careers.json');
const NEW_PAGES_A_SITE = 40;     // ➤ per site and build: the fill spreads over builds, the steady state is cheap
const NEW_PAGES_A_BUILD = 4000;  // ➤ in all: with thousands of sites, the least recently visited go first
const SITEMAP_CAP = 6;           // ➤ child sitemaps read from an index
const LANES = 12;                // ➤ sites read side by side (the pacing per host is in http.mjs)

// ➤ A site is a sitemap or a listing page to read; the careers scouts may only give a host
// ➤ and a few vacancy addresses seen, and the adapter then works out where to read from.
export function loadSites() {
  const read = f => { const p = join(ROOT, 'builder', 'config', f); return existsSync(p) ? (yaml.load(readFileSync(p, 'utf-8')) || {}).sites || [] : []; };
  const hand = read('careers.yml');
  const key = s => s.sitemap || s.listing || s.host;
  const named = new Set(hand.map(key));
  return [...hand, ...read('careers-found.yml').filter(s => !named.has(key(s))).map(s => ({ ...s, found: true }))].filter(s => s.enabled !== false && key(s));
}

// ➤ Where a host's vacancies are read from: the sitemaps its robots.txt names, else the
// ➤ usual sitemap addresses, else the listing the addresses seen hang from. Remembered.
async function resolve(site, state, opts) {
  if (site.sitemap || site.listing) return site;
  // ➤ The addresses the scout saw share a path ("/en/careers/jobs/"): only pages under it are
  // ➤ read, the rest of a big site's sitemap is not.
  if (!site.match && site.urls?.length) {
    const paths = site.urls.map(u => { try { return new URL(u).pathname; } catch { return ''; } }).filter(Boolean);
    const parts = (paths[0] || '').split('/').slice(0, -1);
    for (let n = parts.length; n > 1; n--) { const prefix = parts.slice(0, n).join('/') + '/'; if (paths.every(p => p.startsWith(prefix))) { site = { ...site, match: prefix }; break; } }
  }
  const known = state.resolved?.[site.host];
  if (known) return { ...site, ...known };
  const origin = `https://${site.host}`;
  let robots = { sitemaps: [] };
  // ➤ A host that does not answer its robots.txt at all is dead for the day: no sitemaps
  // ➤ are tried on it (each would wait its whole timeout).
  try { const r = await get(`${origin}/robots.txt`, opts); if (r.ok) robots = parseRobots(await r.text()); } catch (e) { throw new Error(`no answer (${e.message.slice(0, 40)})`); }
  for (const sm of [...robots.sitemaps, `${origin}/sitemap.xml`].slice(0, 3)) {
    try { const parsed = parseSitemap(await getText(sm, opts)); if (parsed.items.length) { (state.resolved ||= {})[site.host] = { sitemap: sm }; return { ...site, sitemap: sm }; } } catch { /* next */ }
  }
  const first = (site.urls || [])[0];
  const listing = first ? first.replace(/[^/]*$/, '') : `${origin}/`;
  (state.resolved ||= {})[site.host] = { listing };
  return { ...site, listing };
}

const loadState = () => { try { return JSON.parse(readFileSync(STATE, 'utf8')); } catch { return {}; } };
const saveState = s => { mkdirSync(dirname(STATE), { recursive: true }); writeFileSync(STATE, JSON.stringify(s)); };

// ➤ The vacancy addresses a site lists: its sitemap, the children of its sitemap index, or
// ➤ the links on its listing page.
async function listed(site, opts) {
  if (!site.sitemap) {
    const html = await getText(site.listing, opts);
    return jobLinks(html, site.listing).filter(u => !site.match || u.includes(site.match)).map(url => ({ url, lastmod: '' }));
  }
  const first = parseSitemap(await getText(site.sitemap, opts));
  let items = first.items;
  if (first.index) {
    items = [];
    const children = first.items.filter(i => !site.match || i.url.includes(site.match) || /job|vacan|career|stellen|emploi|empleo|vacature/i.test(i.url)).slice(0, SITEMAP_CAP);
    for (const c of children.length ? children : first.items.slice(0, SITEMAP_CAP)) { try { items.push(...parseSitemap(await getText(c.url, opts)).items); } catch { /* one child missing */ } }
  }
  return items.filter(i => (site.match ? i.url.includes(site.match) : looksLikeJob(i.url)));
}

export function toRaw(job, site, url) {
  return {
    source: id, sourceId: url,
    title: job.title, company: job.company || site.name || '',
    location: job.location, country: job.country || site.country || '', city: '', remote: job.remote,
    url, description: job.description, posted: job.posted, expires: job.expires, codes: {}, lang: site.lang || '',
  };
}

async function readSite(given, state, budget, log) {
  const opts = { tries: 1, timeoutMs: given.found ? 6000 : 12000, gapMs: 400 };
  // ➤ A site the scout found that did not answer is left alone for a day.
  const failedAt = state.failed?.[given.sitemap || given.listing || given.host];
  if (given.found && failedAt && Date.now() - new Date(failedAt).getTime() < 24 * 3600 * 1000) return [];
  const site = await resolve(given, state, opts);
  const from = site.sitemap || site.listing;
  const host = new URL(from).origin;
  let robots = { rules: [], delay: 0 };
  try { const r = await get(`${host}/robots.txt`, opts); if (r.ok) robots = parseRobots(await r.text()); } catch { /* no robots: everything may be read */ }
  if (robots.delay) opts.gapMs = Math.max(opts.gapMs, Math.min(robots.delay, 10) * 1000);
  const items = (await listed(site, opts)).filter(i => allowed(robots, new URL(i.url).pathname));
  const cache = (state.sites ||= {})[from] ||= {};
  (state.visited ||= {})[from] = new Date().toISOString();
  const wanted = items.filter(i => !cache[i.url] || (i.lastmod && cache[i.url].lastmod && i.lastmod > cache[i.url].lastmod));
  let fetched = 0;
  for (const i of wanted.sort((a, b) => String(b.lastmod).localeCompare(String(a.lastmod))).slice(0, Math.max(0, Math.min(NEW_PAGES_A_SITE, budget.left)))) {
    if (budget.left <= 0) break;
    budget.left--;
    try {
      const html = await getText(i.url, opts);
      const job = jobPostings(html, i.url)[0] || null;
      cache[i.url] = { lastmod: i.lastmod, job };
      fetched++;
    } catch { cache[i.url] = { lastmod: i.lastmod, job: null }; }
  }
  // ➤ Only what the sitemap still lists is alive, and a site keeps at most 300 pages in
  // ➤ memory: the record needs an excerpt, not the whole advert.
  const alive = new Set(items.map(i => i.url));
  for (const u of Object.keys(cache)) if (!alive.has(u)) delete cache[u];
  for (const [u, c] of Object.entries(cache).slice(300)) delete cache[u];
  for (const c of Object.values(cache)) if (c.job?.description?.length > 1500) c.job.description = c.job.description.slice(0, 1500);
  const jobs = items.map(i => cache[i.url]?.job && toRaw(cache[i.url].job, site, i.url)).filter(Boolean);
  if (!given.found || fetched) log(`careers: ${site.name}: ${items.length} listed, ${fetched} pages read, ${jobs.length} adverts`);
  return jobs;
}

export async function* fetchAll(ctx) {
  const state = loadState();
  // ➤ The least recently visited sites first, so a budget that runs out one build is spent
  // ➤ elsewhere the next; the sites by hand always come first.
  const sites = loadSites().sort((a, b) => (a.found ? 1 : 0) - (b.found ? 1 : 0) || String(state.visited?.[a.sitemap || a.listing || a.host] || '').localeCompare(String(state.visited?.[b.sitemap || b.listing || b.host] || '')));
  if (!sites.length) return;
  const budget = { left: NEW_PAGES_A_BUILD };
  const out = [];
  const queue = [...sites];
  let read = 0, failed = 0;
  await Promise.all(Array.from({ length: LANES }, async () => {
    while (queue.length) {
      const site = queue.shift();
      try { out.push(...await deadline(readSite(site, state, budget, ctx.log), site.found ? 400_000 : 900_000)); read++; } catch (e) { failed++; (state.failed ||= {})[site.sitemap || site.listing || site.host] = new Date().toISOString(); if (!site.found) ctx.log(`careers: ${site.name}: ${e.message.slice(0, 80)}`); }
      // ➤ The state is saved as it goes: a build cut short keeps what it read.
      if ((read + failed) % 200 === 0) { saveState(state); ctx.log(`careers: ${read + failed} of ${sites.length} sites, ${NEW_PAGES_A_BUILD - budget.left} pages fetched, ${out.length} adverts so far`); }
    }
  }));
  saveState(state);
  ctx.log(`careers: ${read} sites read, ${failed} did not answer, ${NEW_PAGES_A_BUILD - budget.left} pages fetched, ${out.length} adverts`);
  for (const raw of out) yield raw;
}
