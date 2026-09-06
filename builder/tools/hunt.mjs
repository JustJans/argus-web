// ➤ The hunter: give it a company's domain (or many, or a file with one a line) and it finds
// ➤ the company's careers pages the way a person would, tells which platform serves them and
// ➤ reads the adverts with no API key: the ATS's public listing, the feed the site publishes
// ➤ (jobs.xml), its sitemap and the JobPosting block of each page, or its listing pages. It
// ➤ prints what it found and how many adverts the gate keeps in Europe; --write adds the
// ➤ readable sources to builder/config/hunted.yml, which the builder reads like companies.yml
// ➤ and careers.yml. Sites drawn by JavaScript read through the call their own page makes
// ➤ once the vendor is on in config/vendors.yml (Workday, Oracle); iCIMS, Eightfold, Taleo and
// ➤ softgarden are named and left.
// ➤   node builder/tools/hunt.mjs vestas.com boskalis.com [--write]
// ➤   node builder/tools/hunt.mjs --file domains.txt [--write]
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import yaml from 'js-yaml';
import { get, getText, deadline } from '../http.mjs';
import { ATS, readBoard, loadVendors, loadCompanies } from '../adapters/boards.mjs';
import { resolve, listed, loadSites } from '../adapters/careers.mjs';
import { careerLinks, detectPlatform, jobPostings } from '../lib/crawl.mjs';
import { compileFamilies, familiesOf, hygieneReason } from '../gate.mjs';
import { compileCountries, placeOf } from '../normalise.mjs';
import { parseSuccessFactors } from 'argus/server-bot/scan.mjs';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const HUNTED = join(ROOT, 'builder', 'config', 'hunted.yml');
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

// ➤ How many of the adverts the gate keeps in Europe, and where.
function judge(jobs, source) {
  let kept = 0;
  const by = {};
  for (const p of jobs) {
    const raw = { ...p, source, codes: {}, lang: '' };
    if (!/^https?:\/\//.test(String(raw.url || ''))) continue;
    if (!familiesOf(raw, gate).length || hygieneReason(raw)) continue;
    const place = placeOf(raw.location, countries);
    if (place.cc && place.cc !== 'xx' && !europe.has(place.cc)) continue;
    kept++;
    by[place.cc || 'zz'] = (by[place.cc || 'zz'] || 0) + 1;
  }
  return { kept, where: Object.entries(by).sort((a, b) => b[1] - a[1]).map(([cc, n]) => `${cc} ${n}`).join(' ') };
}

const pretty = domain => { const label = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('.')[0]; return label.charAt(0).toUpperCase() + label.slice(1); };
const origin = domain => (/^https?:\/\//.test(domain) ? domain : `https://${domain.replace(/^www\./, '')}`);
async function page(url) { const r = await get(url, opts); return { url: r.url || url, ok: r.ok, html: r.ok ? await r.text() : '' }; }

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
    const xml = await getText(`${o}/jobs.xml`, opts);
    if (/<rss/i.test(xml) && /<item>/i.test(xml)) {
      const jobs = parseSuccessFactors(xml, '').map(j => ({ title: j.title, url: j.url, location: j.location, description: j._jd, company: '' }));
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
  for (const i of items.slice(0, PAGES_READ)) { try { const job = jobPostings(await getText(i.url, opts), i.url)[0]; if (job) jobs.push({ ...job, url: i.url }); } catch { /* one page */ } }
  const how = site.sitemap ? 'sitemap' : 'listing';
  const entry = site.sitemap ? { sitemap: site.sitemap, ...(site.match ? { match: site.match } : {}) } : { listing: url };
  if (!jobs.length) return { how, entry, jobs: [], listed: items.length, error: `${items.length} vacancy addresses, none with a JobPosting block` };
  return { how, entry, jobs, listed: items.length };
}

// ➤ A company's careers pages: the links its home page names, then the usual paths. The
// ➤ first candidate that reads is the answer; else the best reason why none did.
async function hunt(domain) {
  let home;
  try { home = await page(origin(domain)); } catch (e) { return { domain, error: `no answer (${e.message.slice(0, 50)})` }; }
  if (!home.ok) return { domain, error: `the home page answers ${home.url}` };
  const base = new URL(home.url).origin;
  const candidates = [...careerLinks(home.html, home.url).slice(0, 8), ...PATHS.map(p => base + p)];
  const seen = new Set();
  let looked = 0, best = null;
  for (const c of candidates) {
    if (seen.has(c) || looked >= LOOKED) continue;
    seen.add(c);
    let got;
    try { got = await page(c); } catch { continue; }
    if (!got.ok || seen.has(`${got.url}#`)) continue;
    seen.add(`${got.url}#`);
    looked++;
    const found = await recognise(got.url, got.html);
    if (found.jobs.length || found.off) return { domain, home: home.url, url: got.url, ...found };
    if (!best && found.how) best = { url: got.url, ...found };
  }
  return { domain, home: home.url, ...(best || {}), error: best?.error || (looked ? `${looked} pages looked at, none with adverts` : 'no careers page found') };
}

// ➤ One line per company: how it reads, what it gave, what the gate keeps.
function line(r) {
  const what = r.entry ? Object.values(r.entry)[0] : '';
  if (r.off) return `${r.domain}: ${r.how} ${what}: switched off in config/vendors.yml`;
  if (r.jobs?.length) { const j = judge(r.jobs, r.how); return `${r.domain}: ${r.how} ${what}, ${r.jobs.length} adverts${r.listed ? ` of ${r.listed} listed` : ''}, ${j.kept} ours in Europe${j.where ? ` (${j.where})` : ''}`; }
  return `${r.domain}: ${r.how ? `${r.how}, ` : ''}${r.error || 'nothing read'}${r.url ? ` [${r.url}]` : ''}`;
}

// ➤ hunted.yml: the readable sources, and the vendor sites waiting for their switch; a source
// ➤ the other lists already name is left to them.
function write(results) {
  const file = existsSync(HUNTED) ? (yaml.load(readFileSync(HUNTED, 'utf8')) || {}) : {};
  const companies = file.companies || [], sites = file.sites || [];
  const slugOf = c => Object.keys(ATS).map(k => c[k] && `${k}:${String(c[k]).toLowerCase()}`).find(Boolean);
  const known = new Set([...loadCompanies().map(slugOf), ...companies.map(slugOf), ...loadSites().map(s => s.feed || s.sitemap || s.listing || s.host), ...sites.map(s => s.feed || s.sitemap || s.listing)]);
  let added = 0;
  for (const r of results) {
    if (!r.entry || (!r.jobs?.length && !r.off)) continue;
    const ats = Object.keys(ATS).find(k => r.entry[k]);
    const key = ats ? `${ats}:${String(r.entry[ats]).toLowerCase()}` : r.entry.feed || r.entry.sitemap || r.entry.listing;
    if (known.has(key)) continue;
    known.add(key);
    const name = r.jobs.find(j => j.company)?.company || pretty(r.domain);
    (ats ? companies : sites).push({ name, ...r.entry, hunted: new Date().toISOString().slice(0, 10), adverts: r.jobs.length, kept: judge(r.jobs, r.how).kept });
    added++;
  }
  const head = '# ➤ Sources the hunter found (builder/tools/hunt.mjs --write): companies read through their\n# ➤ ATS\'s public listing, and sites read through their feed, sitemap or listing page. Read by the\n# ➤ builder like companies.yml and careers.yml; a source those name is left to them. adverts and\n# ➤ kept are what the hunter saw that day, for the record.\n';
  writeFileSync(HUNTED, head + yaml.dump({ companies, sites }, { lineWidth: 200 }));
  return added;
}

const args = process.argv.slice(2);
const domains = args.includes('--file')
  ? readFileSync(args[args.indexOf('--file') + 1], 'utf8').split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'))
  : args.filter(a => !a.startsWith('--'));
if (!domains.length) { console.log('usage: node builder/tools/hunt.mjs <domain> [<domain> ...] [--write] | --file <list> [--write]'); process.exit(1); }
const results = [];
for (const d of domains) {
  const r = await deadline(hunt(d), 300_000).catch(e => ({ domain: d, error: e.message }));
  results.push(r);
  console.log(line(r));
}
if (args.includes('--write')) console.log(`${write(results)} added to ${HUNTED}`);
// ➤ A read abandoned at its deadline must not keep the process alive.
process.exit(0);
