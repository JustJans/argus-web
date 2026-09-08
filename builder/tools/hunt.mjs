// ➤ The hunter: give it a company's domain (or many, or a file with one a line) and it finds
// ➤ the company's careers pages the way a person would, tells which platform serves them and
// ➤ reads the adverts with no API key: the ATS's public listing, the feed the site publishes
// ➤ (jobs.xml), its sitemap and the JobPosting block of each page, or its listing pages. It
// ➤ prints what it found and how many adverts the gate keeps in Europe; --write adds the
// ➤ readable sources to builder/state/found/hunted.yml, which the builder reads like companies.yml
// ➤ and careers.yml. Sites drawn by JavaScript read through the call their own page makes
// ➤ once the vendor is on in config/vendors.yml (Workday, Oracle); iCIMS, Eightfold, Taleo and
// ➤ softgarden are named and left.
// ➤   node builder/tools/hunt.mjs vestas.com boskalis.com [--write]
// ➤   node builder/tools/hunt.mjs --file domains.txt [--take 300] [--lanes 6] [--write]
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import yaml from 'js-yaml';
import { get, getText, deadline } from '../http.mjs';
import { ATS, readBoard, loadVendors, loadCompanies } from '../adapters/boards.mjs';
import { resolve, listed, loadSites } from '../adapters/careers.mjs';
import { careerLinks, detectPlatform, jobPostings, feedName, BOARD_HOSTS } from '../lib/crawl.mjs';
import { compileFamilies, familiesOf, hygieneReason } from '../gate.mjs';
import { compileCountries, placeOf } from '../normalise.mjs';
import { parseSuccessFactors } from 'argus/server-bot/scan.mjs';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const HUNTED = join(ROOT, 'builder', 'state', 'found', 'hunted.yml');
// ➤ The usual addresses of a careers section, in the languages of the sites read.
const PATHS = ['/careers', '/jobs', '/career', '/en/careers', '/en/jobs', '/join-us', '/empleo', '/trabaja-con-nosotros', '/karriere', '/jobs-karriere', '/stellenangebote', '/carrieres', '/recrutement', '/nous-rejoindre', '/vacatures', '/werken-bij', '/lediga-jobb', '/jobb', '/ledige-stillinger', '/kariera', '/praca', '/lavora-con-noi', '/carriere'];
const PAGES_READ = 12;    // ➤ vacancy pages read on a site to judge it
const LOOKED = 12;        // ➤ candidate pages looked at per company
const opts = { tries: 1, timeoutMs: 12000, gapMs: 300 };

const read = p => JSON.parse(readFileSync(join(ROOT, ...p.split('/')), 'utf-8'));
const gate = compileFamilies(read('catalogues/families.json'), { isco: read('catalogues/codes/isco.json'), ssyk: read('catalogues/codes/ssyk-isco.json') });
const countryList = read('catalogues/countries.json').countries;
const countries = compileCountries(countryList);
const europe = new Set(countryList.map(c => c.iso));

// ➤ How much of what a company publishes is work this site is for, how much of that is in
// ➤ Europe, and where. The first number is what says whether this is an employer of ours: an
// ➤ engineering firm that also wants an administrator is one, a haulier is not.
function judge(jobs, source) {
  let kept = 0, work = 0;
  const by = {};
  for (const p of jobs) {
    const raw = { ...p, source, codes: {}, lang: '' };
    if (!/^https?:\/\//.test(String(raw.url || ''))) continue;
    if (!familiesOf(raw, gate).length || hygieneReason(raw)) continue;
    work++;
    const place = placeOf(raw.location, countries);
    if (place.cc && place.cc !== 'xx' && !europe.has(place.cc)) continue;
    kept++;
    by[place.cc || 'zz'] = (by[place.cc || 'zz'] || 0) + 1;
  }
  return { kept, work, share: jobs.length ? work / jobs.length : 0, where: Object.entries(by).sort((a, b) => b[1] - a[1]).map(([cc, n]) => `${cc} ${n}`).join(' ') };
}

const pretty = domain => { const label = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('.')[0]; return label.charAt(0).toUpperCase() + label.slice(1); };
const bare = domain => domain.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
async function page(url) { const r = await get(url, opts); return { url: r.url || url, ok: r.ok, status: r.status, html: r.ok ? await r.text() : '' }; }

// ➤ The home page: the bare domain, else www (some certificates and servers know only one).
async function homeOf(domain) {
  let last = null;
  for (const u of [`https://${bare(domain)}`, `https://www.${bare(domain)}`]) {
    try { const got = await page(u); if (got.ok) return got; last = got; } catch (e) { last = { url: u, ok: false, error: e.message.slice(0, 50) }; }
  }
  return last;
}

// ➤ Every N-th of a list, so a sample of a sitemap that mixes vacancies with other pages
// ➤ still reaches vacancies.
const spread = (items, n) => { const step = Math.max(1, Math.floor(items.length / n)); return items.filter((_, i) => i % step === 0).slice(0, n); };

// ➤ What a careers page is and how it reads. Answers `how` (an ATS, feed, sitemap, listing),
// ➤ the config entry that reads it, and the adverts read; or why it cannot be read.
async function recognise(url, html) {
  const p = detectPlatform(url, html);
  if (p.ats) {
    const entry = { [p.ats]: p.slug };
    if (ATS[p.ats].vendor && loadVendors()[p.ats] !== true) return { how: p.ats, entry, off: true, jobs: [] };
    try { const jobs = await deadline(readBoard(p.ats, p.slug, '', { tries: 1, timeoutMs: 15000 }), 90_000); return { how: p.ats, entry, jobs, ...(jobs.length ? {} : { error: `${p.slug} answered no adverts` }) }; }
    catch (e) { return { how: p.ats, entry, jobs: [], error: `${p.slug}: ${e.message.slice(0, 60)}` }; }
  }
  const o = new URL(url).origin;
  // ➤ The feed a SuccessFactors site publishes at /jobs.xml (SAP, Vestas): every advert, with its text.
  try {
    const xml = await getText(`${o}/jobs.xml`, { ...opts, timeoutMs: 30000, tries: 2 });
    if (/<rss/i.test(xml) && /<item>/i.test(xml)) {
      const name = feedName(xml);
      const jobs = parseSuccessFactors(xml, name).map(j => ({ title: j.title, url: j.url, location: j.location, description: j._jd, company: name }));
      if (jobs.length) return { how: 'feed', entry: { feed: `${o}/jobs.xml` }, jobs };
    }
  } catch { /* no feed */ }
  if (p.vendor) return { how: p.vendor, jobs: [], error: 'drawn by JavaScript, no feed: not readable without a browser' };
  // ➤ A site: its sitemap when it lists vacancies, else this page as the listing; a few
  // ➤ vacancy pages read for their JobPosting block.
  let site;
  try { site = await resolve({ host: new URL(url).host, urls: [url], name: '' }, {}, opts); } catch (e) { return { jobs: [], error: `no answer (${e.message.slice(0, 40)})` }; }
  let items = [];
  if (site.sitemap) { try { items = await listed(site, opts); } catch { items = []; } }
  if (!items.length) { site = { ...site, sitemap: undefined, listing: url }; try { items = await listed(site, opts); } catch { items = []; } }
  if (!items.length) return { jobs: [], error: 'no vacancy addresses in its sitemap or on the page' };
  const jobs = [];
  const sample = spread(items, PAGES_READ);
  for (const i of sample) { try { const job = jobPostings(await getText(i.url, opts), i.url)[0]; if (job) jobs.push({ ...job, url: i.url }); } catch { /* one page */ } }
  const how = site.sitemap ? 'sitemap' : 'listing';
  const entry = site.sitemap ? { sitemap: site.sitemap, ...(site.match ? { match: site.match } : {}) } : { listing: url };
  if (!jobs.length) return { how, entry, jobs: [], listed: items.length, error: `${items.length} addresses look like vacancies, the ${sample.length} read carry no JobPosting block (drawn by JavaScript?)` };
  return { how, entry, jobs, listed: items.length };
}

// ➤ A company's careers pages: the links its home page names, the usual careers hosts and
// ➤ paths, and the careers links of every page looked at (home, then "Careers", then "See all
// ➤ vacancies" on another host, as a person clicks). The first candidate that reads is the
// ➤ answer; else the best reason why none did.
async function hunt(domain) {
  const home = await homeOf(domain);
  const d = bare(domain);
  const base = home?.ok ? new URL(home.url).origin : `https://www.${d}`;
  const candidates = [
    ...(home?.ok ? careerLinks(home.html, home.url).slice(0, 8) : []),
    `https://careers.${d}`, `https://jobs.${d}`, `https://career.${d}`, ...PATHS.map(p => base + p),
  ];
  const seen = new Set();
  let looked = 0, best = null;
  for (let k = 0; k < candidates.length; k++) {
    const c = candidates[k];
    if (seen.has(c) || looked >= LOOKED) continue;
    seen.add(c);
    let got;
    try { got = await page(c); } catch { continue; }
    // ➤ A page that turns out to be a job board's or a social network's is not read.
    if (!got.ok || seen.has(`${got.url}#`) || BOARD_HOSTS.test(new URL(got.url).hostname)) continue;
    seen.add(`${got.url}#`);
    looked++;
    const found = await recognise(got.url, got.html);
    if (found.jobs.length || found.off) return { domain, home: home?.url, url: got.url, ...found };
    if (!best && found.how) best = { url: got.url, ...found };
    // ➤ The careers links of this page, other hosts first: the vacancies often live one click further.
    for (const next of careerLinks(got.html, got.url).filter(u => !seen.has(u)).slice(0, 6)) candidates.splice(k + 1, 0, next);
  }
  const why = home?.ok ? '' : `the home page answers ${home?.status || home?.error || 'nothing'}; `;
  return { domain, home: home?.url, ...(best || {}), error: why + (best?.error || (looked ? `${looked} pages looked at, none with adverts` : 'no careers page found')) };
}

// ➤ One line per company: how it reads, what it gave, what the gate keeps.
function line(r) {
  const what = r.entry ? Object.values(r.entry)[0] : '';
  if (r.off) return `${r.domain}: ${r.how} ${what}: switched off in config/vendors.yml`;
  if (r.jobs?.length) { const j = judge(r.jobs, r.how); return `${r.domain}: ${r.how} ${what}, ${r.jobs.length} adverts${r.listed ? ` of ${r.listed} listed` : ''}, ${Math.round(100 * j.share)}% work of ours, ${j.kept} in Europe${j.where ? ` (${j.where})` : ''}`; }
  return `${r.domain}: ${r.how ? `${r.how}, ` : ''}${r.error || 'nothing read'}${r.url ? ` [${r.url}]` : ''}`;
}

// ➤ What is kept of a domain once it has been looked at and its line printed: never the
// ➤ adverts, which are thousands per run and are of no use after the count.
function slim(r) {
  const jobs = r.jobs || [];
  const j = judge(jobs, r.how);
  return { domain: r.domain, entry: r.entry, off: r.off, how: r.how, adverts: jobs.length, share: j.share, ours: j.work, kept: j.kept, name: jobs.find(x => x.company)?.company || '' };
}

const OURS_AT_LEAST = 0.1;    // ➤ under this share of its adverts, a company is not one of ours
const SEEN_AT_LEAST = 4;      // ➤ adverts read before that share means anything

// ➤ hunted.yml: the readable sources, and the vendor sites waiting for their switch; a source
// ➤ the other lists already name is left to them. A company that does publish work of ours is
// ➤ kept even when it publishes more of something else; one where it is a rounding error is
// ➤ not, because the site would read it every day and take nothing from it.
function write(results) {
  mkdirSync(dirname(HUNTED), { recursive: true });
  const file = existsSync(HUNTED) ? (yaml.load(readFileSync(HUNTED, 'utf8')) || {}) : {};
  const companies = file.companies || [], sites = file.sites || [];
  const slugOf = c => Object.keys(ATS).map(k => c[k] && `${k}:${String(c[k]).toLowerCase()}`).find(Boolean);
  const known = new Set([...loadCompanies().map(slugOf), ...companies.map(slugOf), ...loadSites().map(s => s.feed || s.sitemap || s.listing || s.host), ...sites.map(s => s.feed || s.sitemap || s.listing)]);
  let added = 0;
  for (const r of results) {
    if (!r.entry || (!r.adverts && !r.off)) continue;
    const ats = Object.keys(ATS).find(k => r.entry[k]);
    const key = ats ? `${ats}:${String(r.entry[ats]).toLowerCase()}` : r.entry.feed || r.entry.sitemap || r.entry.listing;
    if (known.has(key)) continue;
    known.add(key);
    if (!r.off && r.adverts >= SEEN_AT_LEAST && r.share < OURS_AT_LEAST) continue;
    (ats ? companies : sites).push({ name: r.name || pretty(r.domain), ...r.entry, hunted: new Date().toISOString().slice(0, 10), adverts: r.adverts, ours: r.ours, kept: r.kept });
    added++;
  }
  const head = '# ➤ Sources the hunter found (builder/tools/hunt.mjs --write): companies read through their\n# ➤ ATS\'s public listing, and sites read through their feed, sitemap or listing page. Read by the\n# ➤ builder like companies.yml and careers.yml; a source those name is left to them. adverts and\n# ➤ kept are what the hunter saw that day, for the record.\n';
  writeFileSync(HUNTED, head + yaml.dump({ companies, sites }, { lineWidth: 200 }));
  return added;
}

const args = process.argv.slice(2);
const flag = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const LANES = Number(flag('--lanes', 6));
const TAKE = Number(flag('--take', 0)) || 0;
const DONE = join(ROOT, 'builder', 'state', 'hunted-done.txt');

// ➤ A domain is written down as soon as it has been tried, whatever came of it: a list of six
// ➤ thousand is hunted a slice at a time, over days, and never twice.
const tried = new Set();
try { for (const l of readFileSync(DONE, 'utf8').split(/\r?\n/)) if (l.trim()) tried.add(l.trim()); } catch { /* none yet */ }
const noteDone = d => { tried.add(d); try { appendFileSync(DONE, d + '\n'); } catch { /* the note is a convenience */ } };

// ➤ A list may name a company after its domain ("acme.com, Acme Ltd"): the domain is what is hunted.
const wanted = args.includes('--file')
  ? readFileSync(flag('--file', ''), 'utf8').split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#')).map(l => l.split(',')[0].trim())
  : args.filter(a => !a.startsWith('--') && a.includes('.'));
const domains = wanted.filter(d => !tried.has(d)).slice(0, TAKE || wanted.length);
if (!domains.length) { console.log(wanted.length ? `nothing left: all ${wanted.length} have been hunted before` : 'usage: node builder/tools/hunt.mjs <domain> … | --file <list> [--take 300] [--lanes 6] [--write]'); process.exit(wanted.length ? 0 : 1); }
console.log(`hunting ${domains.length} of ${wanted.length} domains, ${LANES} at a time`);

const results = [];
const queue = [...domains];
await Promise.all(Array.from({ length: LANES }, async () => {
  while (queue.length) {
    const d = queue.shift();
    const r = await deadline(hunt(d), 300_000).catch(e => ({ domain: d, error: e.message }));
    noteDone(d);
    console.log(line(r));
    results.push(slim(r));
    // ➤ What was found is written as it goes: a run cut short keeps its work.
    if (args.includes('--write') && results.length % 25 === 0) write(results);
  }
}));
if (args.includes('--write')) console.log(`${write(results)} added to ${HUNTED}`);
const gave = results.filter(r => r.adverts).length;
console.log(`${gave} of ${results.length} domains gave adverts`);
// ➤ A read abandoned at its deadline must not keep the process alive.
process.exit(0);
