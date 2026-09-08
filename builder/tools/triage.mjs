// ➤ Why a source gives nothing, asked one question at a time. A site that lists no vacancy is
// ➤ not a site with no vacancies, and a site that fails is not always a site that is gone, so
// ➤ every source that brought nothing on its last pass — or failed on it — is put through the
// ➤ same ladder of questions, cheapest and most fundamental first. The first question that
// ➤ answers stops the walk, and its answer is the source's label.
// ➤
// ➤   1  Does it read now?            → reads-now   nothing is wrong; the last pass was old
// ➤   2  Does the host answer at all? → dead        nothing to do until it comes back
// ➤   3  Is a bot wall in the way?    → wall        left alone on purpose
// ➤   4  Is it an ATS under a name?   → vendor:x    read it through the ATS, not the site
// ➤   5  Does it publish a feed?      → feed        one read for the whole list
// ➤   6  Has the address we hold gone?→ moved       the next pass works it out again
// ➤   7  Does it list vacancies?      → unrecognised / empty
// ➤   8  Do its pages carry a block?  → no-block    the page says nothing a machine can read
// ➤   9  None of the above            → odd
// ➤
// ➤ The verdict is kept per source in builder/state/triage.json with the day it was reached and
// ➤ the day that label started, so a site changing its mind is visible. --out also writes it as
// ➤ a table. Runs on Sundays from ops/server-discover.sh.
// ➤   node builder/tools/triage.mjs [--limit 200] [--all] [--out builder/state/triage.tsv]
import { existsSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { get, getText, deadline } from '../http.mjs';
import { parseSitemap, looksLikeJob, detectPlatform } from '../lib/crawl.mjs';
import { listed, readSite } from '../adapters/careers.mjs';
import { eachSource } from '../store.mjs';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const args = process.argv.slice(2);
const flag = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const LIMIT = Number(flag('--limit', 200));
const LANES = 8;
const STATUS = join(ROOT, 'builder', 'state', 'crawl-status.json');
const KEPT = join(ROOT, 'builder', 'state', 'triage.json');
const opts = { tries: 1, timeoutMs: 12000, gapMs: 400 };
const today = new Date().toISOString().slice(0, 10);

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

// ➤ The ladder. Each rung asks one thing and either answers or hands on to the next.
async function why(site) {
  const where = site.sitemap || site.listing;
  const origin = where ? new URL(where).origin : `https://${site.key}`;

  // ➤ 1. Does it read now? A pass can be old: what the reader does today is the first fact.
  let read = null;
  try {
    read = await readSite({ ...site, host: site.key, found: true }, {}, { pagesASite: 12, left: 12 }, () => {});
    if (read.adverts.length) return { step: 1, label: 'reads-now', note: `${read.adverts.length} adverts of ${read.listed} listed` };
  } catch (e) { read = { error: e.message.slice(0, 60) }; }

  // ➤ 2. Does the host answer at all? Nothing below matters if it does not.
  let home;
  try { home = await get(origin, opts); } catch (e) { return { step: 2, label: 'dead', note: e.message.slice(0, 40) }; }
  const html = home.ok ? await home.text() : '';

  // ➤ 3. Is a bot wall in the way? Those are left alone on purpose.
  if (home.status === 403 || home.status === 503) return { step: 3, label: 'wall', note: `HTTP ${home.status}` };
  if (WALL.test(html.slice(0, 4000))) return { step: 3, label: 'wall', note: 'a bot wall' };
  if (!home.ok) return { step: 2, label: 'dead', note: `HTTP ${home.status}` };

  // ➤ 4. Is this an ATS wearing the company's name? Then read the ATS, not the site.
  const platform = detectPlatform(home.url || origin, html);
  if (platform.ats) return { step: 4, label: `vendor:${platform.ats}`, note: platform.slug || '' };
  if (platform.vendor) return { step: 4, label: `vendor:${platform.vendor}`, note: '' };

  // ➤ 5. Does it publish a vacancies feed? One read for the whole list beats a page at a time.
  for (const path of FEEDS) {
    try {
      const n = feedItems(await getText(origin + path, { ...opts, timeoutMs: 8000 }), path);
      if (n) return { step: 5, label: 'feed', note: `${path} (${n} items)` };
    } catch { /* not there */ }
  }

  // ➤ 6. Has the address we hold gone? Then the next pass works out where the site is read from.
  if (where) {
    try { const r = await get(where, opts); if (!r.ok) return { step: 6, label: 'moved', note: `${r.status} for ${where}` }; } catch (e) { return { step: 6, label: 'moved', note: e.message.slice(0, 40) }; }
  }

  // ➤ 7. Does it list vacancies at all?
  let items = [];
  try { items = await listed({ ...site, host: site.key }, opts); } catch (e) { return { step: 7, label: 'odd', note: `the lister stopped: ${e.message.slice(0, 40)}` }; }
  if (!items.length) {
    if (site.sitemap) {
      try {
        const parsed = parseSitemap(await getText(site.sitemap, opts));
        if (parsed.items.length) return { step: 7, label: 'unrecognised', note: parsed.index ? `an index of ${parsed.items.length} sitemaps` : `${parsed.items.length} addresses, none look like a vacancy` };
      } catch { /* answered a moment ago; nothing to add */ }
    }
    if (APP.test(html)) return { step: 7, label: 'js', note: 'the list is drawn after loading' };
    return { step: 7, label: 'empty', note: `${Math.round(html.length / 1000)} kB, no vacancy links` };
  }

  // ➤ 8. It lists vacancies and the reader still found none: the pages say nothing readable.
  if (read && !read.error && read.fetched) return { step: 8, label: 'no-block', note: `${read.fetched} pages read of ${items.length} listed, no block` };

  // ➤ 9. None of the above.
  return { step: 9, label: 'odd', note: read?.error || `${items.length} listed, none of them read` };
}

// ➤ Every source that has something to explain: it brought nothing on its last pass, or the
// ➤ pass failed. A source that is bringing adverts is not asked anything.
function troubled() {
  const status = existsSync(STATUS) ? JSON.parse(readFileSync(STATUS, 'utf8')).sources || {} : {};
  const out = [];
  for (const data of eachSource(['careers'])) {
    const st = status[`careers/${data.key}`] || {};
    if ((data.adverts || []).length && !st.fails) continue;
    const resolved = Object.values(data.resolved || {})[0] || {};
    out.push({ key: data.key, sitemap: resolved.sitemap, listing: resolved.listing, fails: st.fails || 0, err: st.err || '' });
  }
  return out;
}

const all = troubled();
// ➤ Every Nth site, not the first N: the store is in alphabetical order and the first hundred
// ➤ are not the shape of the rest.
const step = Math.max(1, Math.floor(all.length / LIMIT));
const sites = args.includes('--all') ? all : all.filter((_, i) => i % step === 0).slice(0, LIMIT);
console.log(`${all.length} careers sources have something to explain; looking at ${sites.length}`);

const rows = [];
const queue = [...sites];
await Promise.all(Array.from({ length: LANES }, async () => {
  while (queue.length) {
    const site = queue.shift();
    const r = await deadline(why(site), 120_000).catch(e => ({ step: 2, label: 'dead', note: e.message.slice(0, 40) }));
    rows.push({ ...site, ...r });
    if (rows.length % 25 === 0) console.log(`  ${rows.length} of ${sites.length}`);
  }
}));

// ➤ What was said about each source last time, so a site that changes its mind is visible.
const before = existsSync(KEPT) ? JSON.parse(readFileSync(KEPT, 'utf8')) : {};
const kept = { ...before };
let changed = 0;
for (const r of rows) {
  const was = before[r.key];
  if (was && was.label !== r.label) changed++;
  kept[r.key] = { label: r.label, note: r.note, step: r.step, seen: today, since: was && was.label === r.label ? was.since : today, ...(was && was.label !== r.label ? { was: was.label } : {}) };
}
writeFileSync(KEPT, JSON.stringify(kept, null, 1));

const by = {};
for (const r of rows) (by[r.label] ||= []).push(r);
console.log('\nwhat the questions answered:');
for (const [label, list] of Object.entries(by).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${String(list[0].step).padStart(2)}. ${label.padEnd(20)} ${String(list.length).padStart(4)}  ${Math.round(list.length / rows.length * 100)}%  e.g. ${list.slice(0, 2).map(r => `${r.key}${r.note ? ` (${r.note})` : ''}`).join(' · ').slice(0, 110)}`);
}
if (changed) console.log(`\n${changed} sources changed their answer since the last time`);
console.log(`kept in ${KEPT}`);

// ➤ Only a host that answers nothing, or a wall, is worth giving up on. Every other answer is
// ➤ a site that is alive and merely awkward, so its failures are forgiven and it is read again
// ➤ at once: no useful site is lost to a fortnight of silly failures. (The crawler owns this
// ➤ file; should a pass be writing it this second, the worst that happens is that the
// ➤ forgiveness waits for next Sunday.)
const GIVE_UP = new Set(['dead', 'wall']);
const alive = rows.filter(r => r.fails && !GIVE_UP.has(r.label));
if (alive.length && existsSync(STATUS)) {
  const status = JSON.parse(readFileSync(STATUS, 'utf8'));
  for (const r of alive) { const st = status.sources?.[`careers/${r.key}`]; if (st) { st.fails = 0; st.next = 0; } }
  writeFileSync(STATUS + '.tmp', JSON.stringify(status));
  renameSync(STATUS + '.tmp', STATUS);
  console.log(`${alive.length} sources were failing but are alive: their strikes are wiped and they are read again at once`);
}

const out = flag('--out', null);
if (out) { writeFileSync(out, rows.map(r => [r.key, r.label, r.note, r.sitemap || r.listing || ''].join('\t')).join('\n') + '\n'); console.log(`written ${out}`); }
process.exit(0);
