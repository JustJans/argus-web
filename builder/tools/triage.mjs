// ➤ Why a careers site gives nothing, told apart one reason at a time: a site that lists no
// ➤ vacancy is not a site with no vacancies. It fetches what the crawler would fetch and
// ➤ answers with a label, so the readers can be built for the biggest reasons first.
// ➤   node builder/tools/triage.mjs [--limit 200] [--group careers] [--all] [--out file.tsv]
// ➤ Labels: no-block (it lists vacancies, the pages carry no JobPosting block) · feed (a
// ➤ vacancy feed nobody was reading) · unrecognised (addresses there are, none that look like
// ➤ a vacancy) · js (the list is drawn by JavaScript) · vendor:<name> (a platform with a
// ➤ reader of its own) · wall (a bot wall) · dead (nothing answers) · empty (it really has no
// ➤ vacancies) · odd (none of the above).
import { writeFileSync } from 'fs';
import { get, getText, deadline } from '../http.mjs';
import { parseSitemap, looksLikeJob, jobPostings, detectPlatform } from '../lib/crawl.mjs';
import { listed } from '../adapters/careers.mjs';
import { eachSource } from '../store.mjs';

const args = process.argv.slice(2);
const flag = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const LIMIT = Number(flag('--limit', 200));
const LANES = 8;
const opts = { tries: 1, timeoutMs: 12000, gapMs: 400 };

// ➤ The marks a page leaves when its list is drawn after loading.
const APP = /__NEXT_DATA__|ng-version|data-reactroot|window\.__NUXT__|__remixContext|vue-app|\bReact\.createElement|jobs\.json|graphql/i;
const WALL = /human verification|verify (?:that )?you are (?:a )?human|are you a robot|captcha|just a moment|access denied|challenge-platform|cloudflare/i;
// ➤ The addresses a jobs feed usually hangs from, in the order they are worth trying.
const FEEDS = ['/jobs.xml', '/jobs.rss', '/feed/jobs', '/vacatures/feed', '/jobs/feed', '/karriere/feed', '/feed', '/wp-json/wp/v2/jobs?per_page=1'];

// ➤ How many VACANCIES a body holds when it is a feed at all: RSS or Atom with items, or the
// ➤ JSON a WordPress site answers with. A site's blog feed is not a vacancy feed, however
// ➤ many job words its articles happen to carry: the feed itself has to be about vacancies,
// ➤ by its own title or by the addresses of its items.
export function feedItems(body, path = '') {
  const s = String(body || '');
  const jobbyPath = /job|vacat|vacan|stelle|karriere|career|empleo|emploi/i.test(path);
  if (/^\s*(?:<\?xml|<rss|<feed)/i.test(s)) {
    const items = [...s.matchAll(/<(?:item|entry)[\s>]([\s\S]*?)<\/(?:item|entry)>/gi)].map(m => m[1]);
    if (!items.length) return 0;
    const channel = (s.match(/<(?:channel|feed)[\s>][\s\S]{0,800}?<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '';
    const aboutJobs = /job|vacature|vacancy|vacancies|vacante|stelle|karriere|career|empleo|emploi|lavoro|praca|opening|recruit/i.test(channel);
    const links = items.map(i => (i.match(/<link[^>]*>\s*([^<\s]+)/i) || i.match(/<link[^>]*href="([^"]+)"/i) || [])[1] || '').filter(Boolean);
    const jobbyLinks = links.filter(looksLikeJob).length;
    return aboutJobs || (jobbyPath && jobbyLinks >= Math.max(1, links.length / 2)) ? items.length : 0;
  }
  if (/^\s*[[{]/.test(s) && jobbyPath) {
    try { const j = JSON.parse(s); const list = Array.isArray(j) ? j : j.jobs || j.items || j.data; return Array.isArray(list) && list.length && list.some(x => x && (x.title || x.name)) ? list.length : 0; } catch { return 0; }
  }
  return 0;
}

async function why(site) {
  const where = site.sitemap || site.listing;
  if (!where) return { label: 'odd', note: 'nowhere to read from' };
  const origin = new URL(where).origin;
  // ➤ First, what the crawler itself sees: the same sitemaps, the same index children, the
  // ➤ same idea of an address that looks like a vacancy.
  let items = [];
  let listedFailed = '';
  try { items = await listed(site, opts); } catch (e) { listedFailed = e.message.slice(0, 40); }
  if (items.length) {
    // ➤ It does list vacancies, so the pages must be missing the block.
    try {
      const page = await getText(items[0].url, opts);
      return jobPostings(page, items[0].url).length
        ? { label: 'odd', note: `${items.length} pages, and they do carry a block` }
        : { label: 'no-block', note: `${items.length} pages, no block` };
    } catch (e) { return { label: 'no-block', note: `${items.length} pages, the first did not answer` }; }
  }
  // ➤ A vacancy feed nobody was reading: the whole list in one read.
  for (const path of FEEDS) {
    try {
      const body = await getText(origin + path, { ...opts, timeoutMs: 8000 });
      const n = feedItems(body, path);
      if (n) return { label: 'feed', note: `${path} (${n} items)` };
    } catch { /* not there */ }
  }
  let res;
  try { res = await get(where, opts); } catch (e) { return { label: 'dead', note: listedFailed || e.message.slice(0, 40) }; }
  if (!res.ok) return { label: res.status === 403 || res.status === 503 ? 'wall' : 'dead', note: `HTTP ${res.status}` };
  const html = await res.text();
  if (WALL.test(html.slice(0, 4000))) return { label: 'wall', note: 'a bot wall' };
  const platform = detectPlatform(res.url || where, html);
  if (platform.ats) return { label: `vendor:${platform.ats}`, note: platform.slug };
  if (platform.vendor) return { label: `vendor:${platform.vendor}`, note: '' };
  // ➤ Addresses there are; vacancies among them, none that anyone recognised.
  if (site.sitemap) {
    const parsed = parseSitemap(html);
    const kids = parsed.index ? parsed.items.length : 0;
    if (parsed.items.length) return { label: 'unrecognised', note: parsed.index ? `an index of ${kids} sitemaps` : `${parsed.items.length} addresses, none look like a vacancy` };
    return { label: 'empty', note: 'a sitemap with nothing in it' };
  }
  if (APP.test(html)) return { label: 'js', note: 'the list is drawn after loading' };
  return { label: 'empty', note: `${Math.round(html.length / 1000)} kB, no vacancy links` };
}

// ➤ The sites in the store that gave nothing on their last pass.
function silent() {
  const out = [];
  for (const data of eachSource(['careers'])) {
    if ((data.adverts || []).length) continue;
    const resolved = Object.values(data.resolved || {})[0] || {};
    out.push({ key: data.key, sitemap: resolved.sitemap, listing: resolved.listing, listed: data.pass?.listed ?? 0 });
  }
  return out;
}

const all = silent();
// ➤ Every Nth site, not the first N: the store is in alphabetical order and the first hundred
// ➤ are not the shape of the rest.
const step = Math.max(1, Math.floor(all.length / LIMIT));
const sites = args.includes('--all') ? all : all.filter((_, i) => i % step === 0).slice(0, LIMIT);
console.log(`${all.length} careers sites gave nothing; looking at ${sites.length}`);
const rows = [];
const queue = [...sites];
await Promise.all(Array.from({ length: LANES }, async () => {
  while (queue.length) {
    const site = queue.shift();
    const r = await deadline(why(site), 90_000).catch(e => ({ label: 'dead', note: e.message.slice(0, 40) }));
    rows.push({ ...site, ...r });
    if (rows.length % 25 === 0) console.log(`  ${rows.length} of ${sites.length}`);
  }
}));

const by = {};
for (const r of rows) (by[r.label] ||= []).push(r);
console.log('\nwhy they give nothing:');
for (const [label, list] of Object.entries(by).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${label.padEnd(22)} ${String(list.length).padStart(4)}  ${Math.round(list.length / rows.length * 100)}%  e.g. ${list.slice(0, 2).map(r => `${r.key}${r.note ? ` (${r.note})` : ''}`).join(' · ').slice(0, 120)}`);
}
const out = flag('--out', null);
if (out) { writeFileSync(out, rows.map(r => [r.key, r.label, r.note, r.sitemap || r.listing || ''].join('\t')).join('\n') + '\n'); console.log(`\nwritten ${out}`); }
process.exit(0);
