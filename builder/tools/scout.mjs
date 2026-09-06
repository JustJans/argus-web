// ➤ The scout: finds company boards by the thousand instead of by name. Common Crawl's public
// ➤ index of the web lists every address it has seen on the ATS hosts (boards.greenhouse.io,
// ➤ jobs.lever.co, jobs.ashbyhq.com, jobs.smartrecruiters.com, *.recruitee.com,
// ➤ *.jobs.personio.de); the board slug is in the address. Every slug is then read through
// ➤ the ATS's public API and kept when the gate keeps at least one of its adverts in Europe.
// ➤   node builder/tools/scout.mjs --collect     # Common Crawl → builder/state/scout-slugs.json
// ➤   node builder/tools/scout.mjs --probe       # slugs → builder/config/companies-found.yml
// ➤   node builder/tools/scout.mjs --write       # what the probes answered so far → companies-found.yml, asking nothing
// ➤ The hand-made list in companies.yml stays as it is and wins on a slug both name. Workable
// ➤ allows about a thousand calls a day: its slugs take several runs, one a day.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import yaml from 'js-yaml';
import { ATS, loadVendors } from '../adapters/boards.mjs';
import { getJson, getText, deadline } from '../http.mjs';
import { compileFamilies, familiesOf, hygieneReason } from '../gate.mjs';
import { compileCountries, placeOf } from '../normalise.mjs';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const STATE = join(ROOT, 'builder', 'state');
const SLUGS = join(STATE, 'scout-slugs.json');
const FOUND = join(ROOT, 'builder', 'config', 'companies-found.yml');
const UA = 'ArgusWeb/0.1 (+https://github.com/JustJans/argus-web)';
const CRAWLS = 3;   // ➤ the newest monthly indexes read

// ➤ Where each ATS keeps its boards, and how the slug is read off an address.
const HOSTS = {
  greenhouse: { patterns: ['boards.greenhouse.io/*', 'job-boards.greenhouse.io/*', 'job-boards.eu.greenhouse.io/*'], slug: u => (u.match(/greenhouse\.io\/([^/?#]+)/) || [])[1] },
  lever: { patterns: ['jobs.lever.co/*', 'jobs.eu.lever.co/*'], slug: u => (u.match(/lever\.co\/([^/?#]+)/) || [])[1] },
  ashby: { patterns: ['jobs.ashbyhq.com/*'], slug: u => (u.match(/ashbyhq\.com\/([^/?#]+)/) || [])[1] },
  smartrecruiters: { patterns: ['jobs.smartrecruiters.com/*', 'careers.smartrecruiters.com/*'], slug: u => (u.match(/smartrecruiters\.com\/([^/?#]+)/) || [])[1] },
  recruitee: { patterns: ['*.recruitee.com'], slug: u => (u.match(/^https?:\/\/([^.]+)\.recruitee\.com/) || [])[1] },
  personio: { patterns: ['*.jobs.personio.de'], slug: u => (u.match(/^https?:\/\/([^.]+)\.jobs\.personio\.de/) || [])[1] },
  workable: { patterns: ['apply.workable.com/*'], slug: u => (u.match(/apply\.workable\.com\/([^/?#]+)/) || [])[1] },
  teamtailor: { patterns: ['*.teamtailor.com'], slug: u => (u.match(/^https?:\/\/([^.]+)\.(?:jobs\.)?teamtailor\.com/) || [])[1] },
  // ➤ Vendor-hosted careers sites (config/vendors.yml decides whether they are read): the slug
  // ➤ keeps its case, the site name is part of the address.
  workday: { patterns: ['*.myworkdayjobs.com/*'], keepCase: true, slug: u => { const m = u.match(/^https?:\/\/([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com\/(?:[a-z]{2}-[A-Za-z]{2}\/)?(?!wday\/)([A-Za-z0-9_-]+)/); return m ? `${m[1]}.${m[2]}/${m[3]}` : ''; } },
  oracle: { patterns: ['*.oraclecloud.com/hcmUI/CandidateExperience/*'], keepCase: true, slug: u => { const m = u.match(/^https?:\/\/([a-z0-9.-]+\.oraclecloud\.com)\/hcmUI\/CandidateExperience\/[a-z]{2}\/sites\/([A-Za-z0-9_]+)/); return m ? `${m[1]}/${m[2]}` : ''; } },
};
const PROBED = join(STATE, 'scout-probed.json');   // ➤ what every probe answered, so a rerun asks only the new slugs
const NOT_A_SLUG = /^(v1|api|embed|static|www|jobs|careers|boards|_next|assets|favicon\.ico|robots\.txt|sitemap\.xml)$/i;

async function collect(log = console.log) {
  const cols = await (await fetch('https://index.commoncrawl.org/collinfo.json', { headers: { 'User-Agent': UA } })).json();
  const crawls = cols.slice(0, CRAWLS).map(c => c.id);
  const slugs = {};
  for (const [ats, h] of Object.entries(HOSTS)) {
    const set = new Set();
    for (const crawl of crawls) for (const pattern of h.patterns) {
      const base = `https://index.commoncrawl.org/${crawl}-index?url=${encodeURIComponent(pattern)}&output=json`;
      let pages = 1;
      try { pages = (await (await fetch(`${base}&showNumPages=true`, { headers: { 'User-Agent': UA } })).json()).pages || 1; } catch { /* one page then */ }
      for (let p = 0; p < pages; p++) {
        try {
          const text = await (await fetch(`${base}&fl=url&page=${p}`, { headers: { 'User-Agent': UA } })).text();
          for (const line of text.split('\n')) {
            if (!line) continue;
            let url; try { url = JSON.parse(line).url; } catch { continue; }
            const s = h.slug(url);
            if (s && !NOT_A_SLUG.test(s)) set.add(h.keepCase ? s : s.toLowerCase());
          }
        } catch (e) { log(`${ats} ${crawl} ${pattern} page ${p}: ${e.message.slice(0, 60)}`); }
      }
    }
    slugs[ats] = [...set].sort();
    log(`${ats}: ${set.size} slugs`);
  }
  mkdirSync(STATE, { recursive: true });
  writeFileSync(SLUGS, JSON.stringify({ crawls, collected_at: new Date().toISOString(), slugs }, null, 1));
  log(`written ${SLUGS}`);
}

// ➤ "dura-vermeer" → "Dura Vermeer", for boards whose API carries no company name.
const pretty = slug => slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

// ➤ Reads one board whole (pages where the ATS pages) and answers what the gate would keep.
async function probe(ats, slug, gate, countries, europe) {
  const a = ATS[ats];
  const jobs = [];
  let name = '';
  const opts = { tries: 1, gapMs: 120, timeoutMs: 10000 };
  if (a.xml) jobs.push(...a.parse(await getText(a.url(slug), opts), slug, pretty(slug)));
  else {
    // ➤ Three pages at most: enough to judge a board; the build reads the rest.
    let got = 0, pages = 0;
    for (;;) {
      const req = a.request ? a.request(slug, got) : {};
      const j = await getJson(a.url(slug, got).replace('content=true', 'content=false'), { ...opts, ...req, headers: { ...(req.headers || {}) } });
      name ||= j?.content?.[0]?.company?.name || j?.jobs?.[0]?.organizationName || j?.name || '';
      const page = a.parse(j, slug, pretty(slug));
      jobs.push(...page);
      got += (a.count ? a.count(j) : (j.content || j.jobs || j).length) || 0;
      if (!a.more || !page.length || !a.more(j, got) || ++pages >= 3) break;
    }
  }
  name ||= jobs[0]?.company || '';
  const by = {};
  let kept = 0;
  for (const p of jobs) {
    const raw = { ...p, source: ats, codes: {}, lang: '' };
    if (!/^https?:\/\//.test(String(raw.url || ''))) continue;
    if (!familiesOf(raw, gate).length || hygieneReason(raw)) continue;
    const place = placeOf(raw.location, countries);
    if (place.cc && place.cc !== 'xx' && !europe.has(place.cc)) continue;
    kept++;
    by[place.cc || 'zz'] = (by[place.cc || 'zz'] || 0) + 1;
  }
  return { total: jobs.length, kept, by, name };
}

// ➤ The slugs companies.yml names by hand: never asked, never written.
function loadHandled() {
  const hand = (yaml.load(readFileSync(join(ROOT, 'builder', 'config', 'companies.yml'), 'utf-8')) || {}).companies || [];
  return new Set(hand.map(c => Object.keys(ATS).map(k => c[k] && `${k}:${String(c[k]).toLowerCase()}`).filter(Boolean)).flat());
}
const loadProbed = () => existsSync(PROBED) ? JSON.parse(readFileSync(PROBED, 'utf8')) : {};

// ➤ companies-found.yml from what the probes answered: every board with adverts of ours.
function writeFound(probed, collected_at, log = console.log) {
  const handled = loadHandled();
  const found = [];
  for (const [key, v] of Object.entries(probed)) {
    if (!v.kept || handled.has(key)) continue;
    const [ats, slug] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
    found.push({ name: v.name, [ats]: slug, adverts: v.adverts, kept: v.kept, where: v.where });
  }
  found.sort((a, b) => b.kept - a.kept);
  const head = `# Company boards the scout found (builder/tools/scout.mjs) on ${new Date().toISOString().slice(0, 10)}: every board whose public\n# API answered with at least one advert the gate keeps in Europe. The slugs asked came from Common Crawl's indexes\n# (${collected_at.slice(0, 10)}) and from three open-source lists, with thanks: OpenRoles (github.com/datascry/openroles, data\n# CC BY-SA 4.0), job-board-aggregator (github.com/Feashliaa/job-board-aggregator, data CC BY-NC 4.0) and JobSeek\n# (github.com/colophon-group/jobseek, data CC BY-NC 4.0). Read by the builder like companies.yml; a slug named there is\n# left to it. adverts/kept/where are what the scout saw that day, for the record.\n`;
  writeFileSync(FOUND, head + yaml.dump({ companies: found }, { lineWidth: 200 }));
  log(`written ${FOUND}: ${found.length} boards, ${found.reduce((s, f) => s + f.kept, 0)} adverts kept that day`);
}

async function probeAll(log = console.log) {
  const read = p => JSON.parse(readFileSync(join(ROOT, ...p.split('/')), 'utf-8'));
  const gate = compileFamilies(read('catalogues/families.json'), { isco: read('catalogues/codes/isco.json'), ssyk: read('catalogues/codes/ssyk-isco.json') });
  const countryList = read('catalogues/countries.json').countries;
  const countries = compileCountries(countryList);
  const europe = new Set(countryList.map(c => c.iso));
  const { slugs, collected_at } = JSON.parse(readFileSync(SLUGS, 'utf8'));
  const handled = loadHandled();
  // ➤ Every answer is kept on disk: a rerun (a new month's slugs) asks only what is new, and
  // ➤ --again asks everything afresh.
  const probed = process.argv.includes('--again') ? {} : loadProbed();
  const save = () => { mkdirSync(STATE, { recursive: true }); writeFileSync(PROBED, JSON.stringify(probed)); };
  // ➤ One ATS at a time per host, the hosts side by side.
  await Promise.all(Object.entries(slugs).map(async ([ats, list]) => {
    if (!ATS[ats]) return;
    if (ATS[ats].vendor && loadVendors()[ats] !== true) { log(`${ats}: switched off in config/vendors.yml, ${list.length} slugs not probed`); return; }
    let done = 0, asked = 0;
    for (const slug of list) {
      done++;
      const key = `${ats}:${slug}`;
      if (handled.has(key) || probed[key]) continue;
      try {
        const r = await deadline(probe(ats, slug, gate, countries, europe), 45_000);
        probed[key] = r.kept ? { name: r.name || pretty(slug), adverts: r.total, kept: r.kept, where: Object.entries(r.by).sort((a, b) => b[1] - a[1]).map(([cc, n]) => `${cc} ${n}`).join(' '), at: new Date().toISOString().slice(0, 10) } : { at: new Date().toISOString().slice(0, 10) };
      } catch (e) {
        // ➤ "Too many requests" (Workable allows about a thousand calls a day): the rest of the
        // ➤ list waits for the next run, which asks only what is still unanswered.
        if (e.status === 429) { log(`${ats}: ${e.message}; ${list.length - done} slugs wait for the next run`); break; }
        probed[key] = { at: new Date().toISOString().slice(0, 10), dead: true };
        if (e.message === 'took too long') log(`${ats}: ${slug} took too long, marked dead`);
      }
      if (++asked % 200 === 0) { save(); log(`${ats}: ${done}/${list.length} looked at, ${Object.entries(probed).filter(([k, v]) => k.startsWith(ats + ':') && v.kept).length} boards with adverts of ours in Europe`); }
    }
    save();
    log(`${ats}: ${done}/${list.length} looked at, ${Object.entries(probed).filter(([k, v]) => k.startsWith(ats + ':') && v.kept).length} kept`);
  }));
  writeFound(probed, collected_at, log);
}

const args = process.argv.slice(2);
if (args.includes('--collect')) await collect();
if (args.includes('--probe')) { if (!existsSync(SLUGS)) { console.log('run --collect first'); process.exit(1); } await probeAll(); }
if (args.includes('--write')) writeFound(loadProbed(), JSON.parse(readFileSync(SLUGS, 'utf8')).collected_at);
if (!args.some(a => ['--collect', '--probe', '--write'].includes(a))) console.log('usage: node builder/tools/scout.mjs --collect | --probe | --write');
// ➤ A read abandoned at its deadline must not keep the process alive.
process.exit(0);
