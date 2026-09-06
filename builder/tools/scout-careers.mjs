// ➤ The careers scout: finds employers' own careers sites that publish schema.org JobPosting
// ➤ blocks, which is what Google, Indeed and Adzuna read. The seed is Web Data Commons' list
// ➤ of the domains where Common Crawl saw JobPosting markup (63,000 of them); each is asked
// ➤ for its robots.txt and sitemaps, a few vacancy pages are read, and the domain is kept
// ➤ when it is an employer (one hiring organisation across its pages, not a job board) with
// ➤ at least one advert the gate keeps in Europe. Output: builder/config/careers-found.yml,
// ➤ read by the careers adapter. Hours long; resumable (builder/state/scout-careers.json).
// ➤   node builder/tools/scout-careers.mjs [--tlds es,de,nl] [--limit N]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import yaml from 'js-yaml';
import { get, getText } from '../http.mjs';
import { parseRobots, allowed, parseSitemap, looksLikeJob, jobPostings, jobLinks } from '../lib/crawl.mjs';
import { compileFamilies, familiesOf, hygieneReason } from '../gate.mjs';
import { compileCountries, placeOf } from '../normalise.mjs';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const STATE_DIR = join(ROOT, 'builder', 'state');
const WDC = join(STATE_DIR, 'wdc-jobposting-domains.tsv');
const WDC_URL = 'https://data.dws.informatik.uni-mannheim.de/structureddata/2024-12/quads/classspecific/JobPosting/JobPosting_domain_stats.csv';
const PROGRESS = join(STATE_DIR, 'scout-careers.json');
const FOUND = join(ROOT, 'builder', 'config', 'careers-found.yml');
const EUROPE_TLDS = ['es', 'de', 'fr', 'nl', 'be', 'it', 'at', 'ch', 'se', 'no', 'dk', 'fi', 'pl', 'cz', 'sk', 'hu', 'ro', 'bg', 'gr', 'hr', 'si', 'ee', 'lv', 'lt', 'lu', 'ie', 'pt', 'uk', 'is', 'eu'];
const PAGES_A_DOMAIN = 8, LANES = 8;
const OPTS = { tries: 1, timeoutMs: 10000, gapMs: 400 };

const args = process.argv.slice(2);
const flag = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const tlds = String(flag('--tlds', EUROPE_TLDS.join(','))).split(',');
const limit = Number(flag('--limit', 0)) || 0;

const read = p => JSON.parse(readFileSync(join(ROOT, ...p.split('/')), 'utf-8'));
const gate = compileFamilies(read('catalogues/families.json'), { isco: read('catalogues/codes/isco.json'), ssyk: read('catalogues/codes/ssyk-isco.json') });
const countryList = read('catalogues/countries.json').countries;
const countries = compileCountries(countryList);
const europe = new Set(countryList.map(c => c.iso));

async function seed() {
  mkdirSync(STATE_DIR, { recursive: true });
  if (!existsSync(WDC)) { console.log('downloading the Web Data Commons list…'); writeFileSync(WDC, await (await fetch(WDC_URL)).text()); }
  const rows = readFileSync(WDC, 'utf8').split(/\r?\n/).slice(1).map(l => l.split('\t')).filter(r => r[0]);
  return rows.map(r => ({ domain: r[0].toLowerCase(), pages: Number(r[2]) || 0 })).filter(r => tlds.includes(r.domain.split('.').pop()) && r.pages >= 2);
}

// ➤ One domain: robots, sitemaps, a handful of vacancy pages, the verdict. `say` tells the
// ➤ steps (the --domain mode), so a site that gives nothing can be understood.
async function look(domain, say = () => {}) {
  // ➤ The site's real address first: many answer only with www, or somewhere else entirely.
  let origin = `https://${domain}`;
  try { const r = await get(`${origin}/`, OPTS); if (r.ok) origin = new URL(r.url).origin; } catch { origin = `https://www.${domain}`; }
  say(`origin ${origin}`);
  let robots = { rules: [], delay: 0, sitemaps: [] };
  try { const r = await get(`${origin}/robots.txt`, OPTS); if (r.ok && /text\/plain/i.test(r.headers.get('content-type') || '')) robots = parseRobots(await r.text()); } catch { /* none */ }
  const sitemaps = robots.sitemaps.length ? robots.sitemaps : [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`, `${origin}/sitemap-index.xml`];
  say(`robots: ${robots.rules.length} rules, delay ${robots.delay}, sitemaps ${robots.sitemaps.length ? robots.sitemaps.join(' ') : 'none named, trying the usual addresses'}`);
  const urls = [];
  const seen = new Set();
  for (const sm of sitemaps.slice(0, 4)) {
    let parsed;
    try { parsed = parseSitemap(await getText(sm, OPTS)); } catch (e) { say(`sitemap ${sm}: ${e.message.slice(0, 60)}`); continue; }
    say(`sitemap ${sm}: ${parsed.index ? 'an index of ' : ''}${parsed.items.length} entries`);
    const children = parsed.index ? parsed.items.filter(i => /job|vacan|career|stellen|emploi|empleo|vacature|karriere|lediga|praca|oferta/i.test(i.url)).slice(0, 4) : [];
    if (parsed.index && !children.length) children.push(...parsed.items.slice(0, 3));
    const lists = parsed.index ? [] : [parsed];
    for (const c of children) { try { lists.push(parseSitemap(await getText(c.url, OPTS))); } catch { /* skip */ } }
    for (const l of lists) for (const i of l.items) if (looksLikeJob(i.url) && !seen.has(i.url)) { seen.add(i.url); urls.push({ url: i.url, sitemap: sm, child: l }); }
    if (urls.length >= 60) break;
  }
  say(`${urls.length} addresses that look like vacancies`);
  if (!urls.length) return null;
  const readable = urls.filter(u => allowed(robots, new URL(u.url).pathname));
  const postings = [];
  const pages = {};
  const readPages = async list => { for (const u of list) { try { const html = await getText(u, OPTS); pages[u] = html; postings.push(...jobPostings(html, u).map(p => ({ ...p, page: u }))); } catch (e) { say(`page ${u}: ${e.message.slice(0, 60)}`); } } };
  await readPages(readable.slice(0, PAGES_A_DOMAIN).map(u => u.url));
  say(`${Math.min(readable.length, PAGES_A_DOMAIN)} pages read, ${postings.length} JobPosting blocks: ${postings.slice(0, 4).map(p => `${p.title} @ ${p.company} (${p.location})`).join(' | ')}`);
  // ➤ The sitemap may name only the listing pages: the vacancies are then the links on them.
  let listing = '';
  if (postings.length < 2) {
    const links = [...new Set(Object.entries(pages).flatMap(([u, html]) => jobLinks(html, u)))].filter(u => !pages[u] && allowed(robots, new URL(u).pathname));
    if (links.length) {
      listing = Object.keys(pages).find(u => jobLinks(pages[u], u).length) || '';
      await readPages(links.slice(0, PAGES_A_DOMAIN));
      say(`${links.length} links to vacancies on the listing pages, ${Math.min(links.length, PAGES_A_DOMAIN)} read, ${postings.length} JobPosting blocks`);
    }
  }
  if (postings.length < 2) return null;
  // ➤ An employer names itself on every page; a board names a different company each time.
  const orgs = {};
  for (const p of postings) orgs[p.company.toLowerCase()] = (orgs[p.company.toLowerCase()] || 0) + 1;
  const [topOrg, topN] = Object.entries(orgs).sort((a, b) => b[1] - a[1])[0];
  say(`hiring organisations: ${Object.entries(orgs).map(([o, n]) => `${o || '(none)'} ${n}`).join(', ')}`);
  if (!topOrg || topN / postings.length < 0.8) return null;
  const by = {};
  let kept = 0;
  for (const p of postings) {
    const raw = { ...p, source: 'careers', codes: {}, lang: '' };
    if (!familiesOf(raw, gate).length || hygieneReason(raw)) continue;
    const place = p.country && europe.has(p.country) ? { cc: p.country } : placeOf(p.location, countries);
    if (place.cc && place.cc !== 'xx' && !europe.has(place.cc)) continue;
    kept++;
    by[place.cc || 'zz'] = (by[place.cc || 'zz'] || 0) + 1;
  }
  if (!kept) return null;
  // ➤ The narrowest path the vacancy pages share, for the adapter to pick them by.
  const paths = postings.map(p => new URL(p.page).pathname);
  const parts = paths[0].split('/').slice(0, -1);
  let match = '';
  for (let n = parts.length; n > 0; n--) { const prefix = parts.slice(0, n).join('/') + '/'; if (prefix.length > 1 && paths.every(p => p.startsWith(prefix))) { match = prefix; break; } }
  const name = postings.find(p => p.company.toLowerCase() === topOrg).company;
  const where = Object.entries(by).sort((a, b) => b[1] - a[1]).map(([cc, n]) => `${cc} ${n}`).join(' ');
  if (listing) return { name, listing, match: match || undefined, sampled: postings.length, kept, where };
  return { name, sitemap: urls[0].sitemap, match: match || undefined, listed: urls.length, sampled: postings.length, kept, where };
}

// ➤ One domain, with the steps told: node builder/tools/scout-careers.mjs --domain example.com
if (flag('--domain', '')) {
  const verdict = await look(flag('--domain', ''), s => console.log('  ' + s));
  console.log(verdict ? `kept: ${JSON.stringify(verdict)}` : 'not kept');
  process.exit(0);
}

const domains = await seed();
const progress = existsSync(PROGRESS) ? JSON.parse(readFileSync(PROGRESS, 'utf8')) : { done: {}, found: [] };
const todo = domains.filter(d => !(d.domain in progress.done)).slice(0, limit || undefined);
console.log(`${domains.length} domains with JobPosting markup on the chosen TLDs, ${Object.keys(progress.done).length} already looked at, ${todo.length} to go`);
let n = 0;
const queue = [...todo];
const save = () => { mkdirSync(STATE_DIR, { recursive: true }); writeFileSync(PROGRESS, JSON.stringify(progress)); };
await Promise.all(Array.from({ length: LANES }, async () => {
  while (queue.length) {
    const d = queue.shift();
    let verdict = null;
    try { verdict = await look(d.domain); } catch { /* a site that fails is not a site */ }
    progress.done[d.domain] = verdict ? verdict.kept : 0;
    if (verdict) progress.found.push({ domain: d.domain, ...verdict });
    if (++n % 100 === 0) { save(); console.log(`${n}/${todo.length} looked at, ${progress.found.length} employers found so far`); }
  }
}));
save();
const sites = progress.found.sort((a, b) => b.kept - a.kept).map(f => ({ name: f.name, ...(f.sitemap ? { sitemap: f.sitemap } : { listing: f.listing }), ...(f.match ? { match: f.match } : {}), domain: f.domain, kept: f.kept, where: f.where }));
const head = `# Employers' careers sites the careers scout found (builder/tools/scout-careers.mjs) on ${new Date().toISOString().slice(0, 10)}:\n# domains Common Crawl saw JobPosting markup on (Web Data Commons, 2024-12), on European TLDs, that name one hiring\n# organisation across their vacancy pages and whose sample held an advert the gate keeps in Europe. Read by the\n# careers adapter like careers.yml. kept/where are what the scout's sample gave that day.\n`;
writeFileSync(FOUND, head + yaml.dump({ sites }, { lineWidth: 200 }));
console.log(`written ${FOUND}: ${sites.length} sites`);
