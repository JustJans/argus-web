// ➤ Employers' own careers sites, read without an API: the sitemap names the vacancy pages,
// ➤ each page carries a schema.org JobPosting block (published for search engines; this
// ➤ reads it the same way), robots.txt is obeyed. Sites come from config/careers.yml (by
// ➤ hand), hunted.yml (the hunter) and careers-found.yml (the careers scout). One pass reads
// ➤ the list and the pages that are new; what it found is kept in the site's own file in the
// ➤ store (builder/store.mjs), so the next pass costs one sitemap plus the new pages, and a
// ➤ vacancy that leaves the sitemap has closed and leaves the pile.
import { existsSync, readFileSync } from 'fs';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import yaml from 'js-yaml';
import { get, getText } from '../http.mjs';
import { parseSitemap, looksLikeJob, pathShape, jobPostings, jobLinks, nextLink } from '../lib/crawl.mjs';
import { robotsOf } from '../robots.mjs';
import { parseSuccessFactors } from 'argus/server-bot/scan.mjs';

export const id = 'careers';
export const kind = 'board';
export const licence = {
  name: "Employers' careers sites", short: 'employer site', url: 'https://schema.org/JobPosting',
  licence: "The employer's own page, read through its sitemap and the JobPosting block it publishes for search engines; robots.txt obeyed", credit: '', needsKey: false,
};

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const PAGES_A_SITE = 200;          // ➤ vacancy pages read in one pass, when the budget allows
// ➤ A vacancy page that did not answer (a timeout, a server error) is tried again in the next
// ➤ passes, three in all, and a site with five such pages in one pass is left until the next
// ➤ one: Apache Nutch's defaults (db.fetch.retry.max, fetcher.max.exceptions.per.queue).
const PAGE_TRIES = 3;
const FAILURES_A_PASS = 5;
// ➤ A site whose vacancy pages never carry a JobPosting block (fifty answered, not one with it)
// ➤ is barren: a pass reads only a few new pages, in case it starts publishing the block, and
// ➤ the crawler comes back weekly (cadence_h.barren in config/crawl.yml). Crawlers read less
// ➤ often what brings nothing (docs/research/faster-runs.md).
const BARREN_PAGES = 50;
const BARREN_PROBE = 10;
export const isBarren = pages => { const answered = Object.values(pages || {}).filter(p => !p.failed); return answered.length >= BARREN_PAGES && !answered.some(p => p.job); };
const SITEMAP_CAP = 6;             // ➤ child sitemaps read from an index
const LISTING_PAGES = 10;          // ➤ pages of a listing followed through its "next" link
const DEEPER_A_SITE = 60;         // ➤ vacancy pages followed from a list the site names
const ALIVE_PAGES_A_SITE = 2000;   // ➤ pages one site keeps in its file: the newest by last change
const DESCRIPTION = 1500;          // ➤ characters kept per advert: only the screens read them
// ➤ How pages are read (builder/lib/crawl.mjs), as a number kept with each page. Version 2 reads
// ➤ the place from the street's field and the days sites write in words: a page read before
// ➤ that whose advert has no place or no day is read again, after the new pages, within the
// ➤ same budget, the ones without a place first.
const READER = 2;
const unplaced = job => !(job.location || job.country);
const toReadAgain = p => p?.job && (p.r || 1) < READER && (unplaced(p.job) || !p.job.posted);

// ➤ A site is a feed, a sitemap or a listing page to read; the careers scouts may only give
// ➤ a host and a few vacancy addresses seen, and the adapter then works out where to read
// ➤ from, in config (kept in the repository) and in state/found (what the server found on its
// ➤ own). The hand-made list (careers.yml) comes first, then the hunter's (hunted.yml) and
// ➤ the scout's (careers-found.yml), marked found; a site named earlier is left to that list.
const keyOf = s => s.feed || s.sitemap || s.listing || s.host;

// ➤ The site's name in the store: its host, and a hash when the list named an address, so two
// ➤ lists on one host stay apart.
export function siteKey(site) {
  const k = keyOf(site);
  if (!/^https?:\/\//.test(String(k))) return String(k).toLowerCase();
  try { return `${new URL(k).host.toLowerCase()}~${createHash('sha1').update(k).digest('hex').slice(0, 6)}`; } catch { return String(k).toLowerCase(); }
}

export function loadSites() {
  const read = f => ['config', 'state/found'].flatMap(dir => { const p = join(ROOT, 'builder', ...dir.split('/'), f); return existsSync(p) ? (yaml.load(readFileSync(p, 'utf-8')) || {}).sites || [] : []; });
  const hand = read('careers.yml');
  const seen = new Set(hand.map(keyOf));
  // ➤ Two lists on one host are two sources: each names its own way in (a sitemap per region, a
  // ➤ listing), and the pages one reads are often not the other's; the requests to the host
  // ➤ share its pace either way (builder/http.mjs). Only the same address twice is read once, and
  // ➤ an address still holding its page's template ("${…}") is no address.
  const out = [...hand];
  for (const s of [...read('hunted.yml'), ...read('careers-found.yml')]) {
    const k = keyOf(s);
    if (!k || seen.has(k) || /\$\{|\$%7B/i.test(k)) continue;
    seen.add(k);
    out.push({ ...s, found: true });
  }
  return out.filter(s => s.enabled !== false && keyOf(s));
}

// ➤ Where a host's vacancies are read from: the sitemaps its robots.txt names, else the
// ➤ usual sitemap addresses, else the listing the addresses seen hang from. Remembered. Every
// ➤ address tried is one robots.txt lets us read.
export async function resolve(site, state, opts, robots = robotsOf(opts)) {
  if (site.feed || site.sitemap || site.listing) return site;
  // ➤ The addresses the scout saw share a path ("/en/careers/jobs/"): only pages under it are
  // ➤ read, the rest of a big site's sitemap is not.
  if (!site.match && site.urls?.length) {
    const paths = site.urls.map(u => { try { return new URL(u).pathname; } catch { return ''; } }).filter(Boolean);
    const parts = (paths[0] || '').split('/').slice(0, -1);
    for (let n = parts.length; n > 1; n--) { const prefix = parts.slice(0, n).join('/') + '/'; if (paths.every(p => p.startsWith(prefix))) { site = { ...site, match: prefix }; break; } }
  }
  // ➤ A remembered way in is kept only while it works, and working means it brought adverts.
  // ➤ A site whose last pass brought nothing, or failed on the very address it remembers, is
  // ➤ worked out again from scratch, so a feed it has published since, a sitemap that has
  // ➤ moved, or a way of reading that did not exist when it was first looked at, all reach it
  // ➤ on the next pass instead of never.
  const worked = !!state.pass?.ok && (state.adverts || []).length > 0;
  const known = worked ? state.resolved?.[site.host] : null;
  if (known) return { ...site, ...known };
  const origin = `https://${site.host}`;
  // ➤ A host that does not answer its robots.txt at all is dead for the day: nothing may be read
  // ➤ on it (RFC 9309), and no sitemap is tried (each would wait its whole timeout).
  let rules;
  try { rules = await robots.rules(origin); } catch (e) { throw new Error(`no answer (${e.message.slice(0, 60)})`); }
  // ➤ A vacancies feed first, where the site publishes one: the whole list with its places and
  // ➤ its text in a single read, which is kinder to the site than a page per vacancy.
  for (const path of ['/jobs.xml', '/jobs.rss']) {
    if (!(await robots.may(origin + path))) continue;
    try {
      const jobs = parseSuccessFactors(await getText(origin + path, opts), site.name || '');
      if (jobs.filter(j => j.url && j.location).length >= 3) { (state.resolved ||= {})[site.host] = { feed: origin + path }; return { ...site, feed: origin + path }; }
    } catch { /* no feed there */ }
  }
  // ➤ A big site names a sitemap per region ("/apac/en/", "/global/en/"): the one whose address
  // ➤ shares the path the vacancies seen are under is the one that holds them, and a sitemap
  // ➤ that names vacancies beats one that names anything else.
  const candidates = [...new Set([...rules.sitemaps, `${origin}/sitemap.xml`])]
    .sort((a, b) => (site.match && b.includes(site.match) ? 1 : 0) - (site.match && a.includes(site.match) ? 1 : 0))
    .slice(0, 4);
  let elsewhere = '';
  for (const sm of candidates) {
    if (!(await robots.may(sm))) continue;
    try {
      const parsed = parseSitemap(await getText(sm, opts));
      if (!parsed.items.length) continue;
      // ➤ An index whose children are all elsewhere is not the one this site's vacancies were
      // ➤ seen under — but it may be where they have moved to, so it is held back rather than
      // ➤ thrown away, and used if nothing better answers.
      if (site.match && parsed.index && !parsed.items.some(i => i.url.includes(site.match))) { elsewhere ||= sm; continue; }
      (state.resolved ||= {})[site.host] = { sitemap: sm };
      return { ...site, sitemap: sm };
    } catch { /* next */ }
  }
  // ➤ Every sitemap named vacancies somewhere else: the site has moved them, and where they
  // ➤ are now beats where they used to be.
  if (elsewhere) { (state.resolved ||= {})[site.host] = { sitemap: elsewhere }; return { ...site, sitemap: elsewhere, match: '' }; }
  const first = (site.urls || [])[0];
  const guess = first ? first.replace(/[^/]*$/, '') : `${origin}/`;
  // ➤ A guessed list that no longer answers is worth less than the front page, which still
  // ➤ names where the vacancies went.
  let listing = guess;
  if (guess !== `${origin}/`) {
    if (!(await robots.may(guess))) listing = `${origin}/`;
    else try { const r = await get(guess, opts); if (!r.ok) listing = `${origin}/`; } catch { listing = `${origin}/`; }
  }
  (state.resolved ||= {})[site.host] = { listing };
  return { ...site, listing };
}

// ➤ The vacancy addresses a site lists: its sitemap, the children of its sitemap index, or
// ➤ the links on its listing page and the pages its "next" link leads to.
// ➤ The addresses the scout saw a vacancy at say what this site's vacancy pages look like.
const shapesOf = site => new Set((site.urls || []).map(pathShape).filter(Boolean));

export async function listed(site, opts, robots = robotsOf(opts)) {
  const shapes = shapesOf(site);
  if (!site.sitemap) {
    const seen = new Set();
    let url = site.listing;
    for (let page = 0; url && page < LISTING_PAGES; page++) {
      if (!(await robots.may(url))) break;
      let html;
      try { html = await getText(url, opts); } catch (e) { if (page || /^\d{3} for /.test(e.message)) break; throw e; }
      const before = seen.size;
      for (const u of jobLinks(html, url, shapes)) seen.add(u);
      const next = nextLink(html, url);
      url = next && !seen.has(next) && seen.size > before ? next : '';
    }
    const found = [...seen];
    const under = site.match ? found.filter(u => u.includes(site.match)) : found;
    return (under.length ? under : found.filter(looksLikeJob)).map(url => ({ url, lastmod: '' }));
  }
  let first;
  if (!(await robots.may(site.sitemap))) return [];
  try { first = parseSitemap(await getText(site.sitemap, opts)); } catch (e) { if (/^\d{3} for /.test(e.message)) return []; throw e; }
  let items = first.items;
  if (first.index) {
    items = [];
    const children = first.items.filter(i => !site.match || i.url.includes(site.match) || /job|vacan|career|stellen|emploi|empleo|vacature/i.test(i.url)).slice(0, SITEMAP_CAP);
    for (const c of children.length ? children : first.items.slice(0, SITEMAP_CAP)) { if (!(await robots.may(c.url))) continue; try { items.push(...parseSitemap(await getText(c.url, opts)).items); } catch { /* one child missing */ } }
  }
  const jobbish = items.filter(i => looksLikeJob(i.url) || shapes.has(pathShape(i.url)));
  if (!site.match) return jobbish;
  // ➤ The path was worked out from the addresses a scout happened to see; when nothing is under
  // ➤ it, the site has moved its vacancies and what looks like a vacancy is better than nothing.
  const under = items.filter(i => i.url.includes(site.match));
  return under.length ? under : jobbish;
}

export function toRaw(job, site, url) {
  return {
    source: id, sourceId: url,
    title: job.title, company: job.company || site.name || '',
    location: job.location, country: job.country || site.country || '', city: '', remote: job.remote,
    mode: job.mode || '', modeTag: job.modeTag || '', pay: job.pay || null,
    url, description: job.description, posted: job.posted, expires: job.expires, codes: {}, lang: site.lang || '',
  };
}

// ➤ One pass over one site: where to read from, what it lists now, the pages that are new,
// ➤ and the whole list of adverts it has at this moment. `store` is the site's own file
// ➤ (`resolved` and `pages` are kept between passes); `budget` is what the run may still
// ➤ spend (`left` pages in all, `pagesASite` on this one); `until`, when to stop reading pages
// ➤ (the pages left are read in the next pass).
export async function readSite(given, store, budget = {}, log = () => {}, until = Infinity) {
  const opts = { tries: 1, timeoutMs: given.found ? 6000 : 12000, gapMs: 400 };
  const robots = robotsOf(opts);
  const site = await resolve(given, store, opts, robots);
  // ➤ A feed (SuccessFactors' jobs.xml) is the whole list with the adverts' text: one read.
  if (site.feed) {
    if (!(await robots.may(site.feed))) return { adverts: [], listed: 0, fetched: 0, backlog: 0, blocks: true };
    const adverts = parseSuccessFactors(await getText(site.feed, opts), site.name || '')
      .map(p => toRaw({ title: p.title, company: p.company || site.name, location: p.location, description: String(p._jd || '').slice(0, DESCRIPTION) }, site, p.url));
    return { adverts, listed: adverts.length, fetched: 1, backlog: 0, blocks: true };
  }
  const from = site.sitemap || site.listing;
  const host = new URL(from).origin;
  // ➤ The site's own robots.txt: silent, the pass stops here and the site waits for its next one.
  const rules = await robots.rules(host);
  if (rules.delay) opts.gapMs = Math.max(opts.gapMs, Math.min(rules.delay, 10) * 1000);
  const listedNowAll = await listed(site, opts, robots);
  const readable = await Promise.all(listedNowAll.map(i => robots.may(i.url)));
  const items = listedNowAll.filter((_, n) => readable[n]);
  const pages = (store.pages ||= {});
  const wanted = items.filter(i => { const p = pages[i.url]; return !p || (p.failed && p.failed < PAGE_TRIES) || (i.lastmod && p.lastmod && i.lastmod > p.lastmod); });
  const canRead = Math.max(0, Math.min(isBarren(pages) ? BARREN_PROBE : budget.pagesASite ?? PAGES_A_SITE, budget.left ?? PAGES_A_SITE));
  const listedNow = new Set(items.map(i => i.url));
  const isWanted = new Set(wanted.map(i => i.url));
  const again = Object.entries(pages)
    .filter(([u, p]) => toReadAgain(p) && !isWanted.has(u) && (listedNow.has(u) || (p.from && listedNow.has(p.from))))
    .sort(([, a], [, b]) => Number(unplaced(b.job)) - Number(unplaced(a.job)))
    .map(([url, p]) => ({ url, lastmod: p.lastmod, from: p.from || '', again: true }));
  // ➤ A sitemap often names the careers page itself ("/jobs", "/kariera") and not the
  // ➤ vacancies on it. A page with no JobPosting block that links to several vacancy pages of
  // ➤ its own site is such a list, and those pages are read too: one step further, no more.
  const queue = [...wanted.sort((a, b) => String(b.lastmod).localeCompare(String(a.lastmod))).map(i => ({ url: i.url, lastmod: i.lastmod, from: '' })), ...again].slice(0, canRead);
  const seen = new Set([...items.map(i => i.url), ...queue.map(q => q.url)]);
  let fetched = 0, deeper = 0, failures = 0;
  const readNow = new Set();
  while (queue.length && fetched < canRead) {
    if (budget.left !== undefined && budget.left <= 0) break;
    if (Date.now() >= until) break;
    if (budget.left !== undefined) budget.left--;
    const q = queue.shift();
    fetched++;
    readNow.add(q.url);
    try {
      const html = await getText(q.url, opts);
      const job = jobPostings(html, q.url)[0] || null;
      if (job?.description?.length > DESCRIPTION) job.description = job.description.slice(0, DESCRIPTION);
      pages[q.url] = { lastmod: q.lastmod, job, r: READER, ...(q.from ? { from: q.from } : {}) };
      if (!job && !q.from && deeper < DEEPER_A_SITE) {
        for (const u of jobLinks(html, q.url, shapesOf(site))) {
          if (seen.has(u) || deeper >= DEEPER_A_SITE || !(await robots.may(u))) continue;
          seen.add(u); deeper++;
          queue.push({ url: u, lastmod: '', from: q.url });
        }
      }
    } catch (e) {
      // ➤ A host that says "too many requests" is left alone until the next pass. A page that
      // ➤ is not there or not for us (404, 410, 403) is an answer: no advert. One that did not
      // ➤ answer is not a page without an advert, and is tried again.
      if (e.status === 429) { readNow.delete(q.url); break; }
      const answered = e.status >= 400 && e.status < 500 && e.status !== 408;
      // ➤ A page read again that does not answer keeps the advert it had.
      if (!(q.again && !answered)) pages[q.url] = { lastmod: q.lastmod, job: null, ...(answered ? {} : { failed: (pages[q.url]?.failed || 0) + 1 }), ...(q.from ? { from: q.from } : {}) };
      if (!answered && ++failures >= FAILURES_A_PASS) break;
    }
  }
  // ➤ Alive: what the list still names, and what a page it still names led to.
  for (const [u, p] of Object.entries(pages)) if (!listedNow.has(u) && !(p.from && listedNow.has(p.from))) delete pages[u];
  const urls = Object.keys(pages);
  if (urls.length > ALIVE_PAGES_A_SITE) {
    for (const u of urls.sort((a, b) => String(pages[b].lastmod).localeCompare(String(pages[a].lastmod))).slice(ALIVE_PAGES_A_SITE)) delete pages[u];
  }
  const adverts = Object.entries(pages).map(([url, p]) => p.job && toRaw(p.job, site, url)).filter(Boolean);
  if (!given.found || fetched) log(`careers: ${site.name || site.host}: ${items.length} listed${deeper ? ` (+${deeper} from its lists)` : ''}, ${fetched} pages read, ${adverts.length} adverts`);
  // ➤ Whether this site publishes the block at all: a site that never does is a candidate for
  // ➤ the browser and the heuristic reader.
  const read = Object.values(pages).length;
  // ➤ A site whose pages were all left unread because the run had spent its budget has not
  // ➤ been read at all: it must come back at once, not tomorrow.
  const postponed = !!wanted.length && !fetched && (budget.left ?? 1) <= 0;
  // ➤ The pages it listed and could not read yet (not reached, or not answering and to be tried
  // ➤ again): while any are left, a page read for the first time may be old, so its day is not
  // ➤ taken for the day it appeared.
  const settled = u => readNow.has(u) && (!pages[u]?.failed || pages[u].failed >= PAGE_TRIES);
  const backlog = wanted.filter(i => !settled(i.url)).length;
  return { adverts, listed: items.length, fetched, postponed, backlog, blocks: read ? Object.values(pages).some(p => p.job) : true, barren: isBarren(pages) };
}
