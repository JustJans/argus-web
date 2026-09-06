// ➤ The scout that reads the web's own copy of the job adverts. Web Data Commons extracts,
// ➤ from every monthly Common Crawl, the schema.org JobPosting blocks that sites publish for
// ➤ search engines (3.6 million vacancy pages on 63,000 hosts in the 2024-12 release) and
// ➤ publishes them as N-Quads. This reads those files (builder/state/wdc/part_*.gz), groups
// ➤ the triples of each page, and keeps per host: how many vacancy pages, how many hiring
// ➤ organisations (one means an employer's own site, many means a job board), the countries
// ➤ named, and how many titles the gate would keep. Employers with adverts of ours in Europe
// ➤ come out as candidates for the careers adapter, each with the addresses seen, so the
// ➤ live check knows where the vacancies live on that host.
// ➤   node builder/tools/scout-wdc.mjs            # → builder/state/wdc-hosts.json, builder/config/careers-found.yml
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { createGunzip } from 'zlib';
import { createInterface } from 'readline';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import yaml from 'js-yaml';
import { compileFamilies, familiesOf, hygieneReason } from '../gate.mjs';
import { compileCountries, placeOf } from '../normalise.mjs';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const args = process.argv.slice(2);
const flag = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const WDC = flag('--dir', join(ROOT, 'builder', 'state', 'wdc'));   // ➤ --dir for a trial on a few files
const DRY = args.includes('--dry');                                   // ➤ --dry: report, write nothing
const HOSTS = join(ROOT, 'builder', 'state', 'wdc-hosts.json');
const FOUND = join(ROOT, 'builder', 'config', 'careers-found.yml');
const MAX_URLS_A_HOST = 12;
// ➤ The hosts of job boards and aggregators are never employers, whatever the rule says of them.
const BOARDS = /(?:^|\.)(?:freelance-informatique|rollingadz|php-resource|qreer|studentjob|jobteaser|indeed|linkedin|glassdoor|monster|stepstone|infojobs|infoempleo|tecnoempleo|jobrapido|jooble|adzuna|talent|neuvoo|trovit|mitula|careerjet|jobted|jobijoba|kimeta|jobware|stellenanzeigen|jobvector|hays|adecco|randstad|manpower|michaelpage|robertwalters|reed|totaljobs|cv-library|jobsite|welcometothejungle|jobteaser|hellowork|apec|francetravail|pole-emploi|arbeitsagentur|arbeitnow|jobs\.ch|jobscout24|karriere\.at|willhaben|pracuj|olx|jobs\.cz|profesia|nofluffjobs|justjoin|jobs\.bg|ejobs|bestjobs|cvbankas|cv\.lv|cvkeskus|duunitori|oikotie|finn|nav\.no|jobindex|jobnet|arbetsformedlingen|platsbanken|ledigajobb|blocket|jobsora|jobsinnetwork|jobs\.de|jobcenter|jobbnorge|thelocal|eurojobs|eures|ziprecruiter|simplyhired|careerbuilder|workable|jobvite|lever|greenhouse|smartrecruiters|recruitee|personio|teamtailor|successfactors|myworkdayjobs|taleo|icims|bamboohr|breezy|ashbyhq|jobs\.lever|boards\.greenhouse)\.[a-z.]+$/i;

const read = p => JSON.parse(readFileSync(join(ROOT, ...p.split('/')), 'utf-8'));
const gate = compileFamilies(read('catalogues/families.json'), { isco: read('catalogues/codes/isco.json'), ssyk: read('catalogues/codes/ssyk-isco.json') });
const countryList = read('catalogues/countries.json').countries;
const countries = compileCountries(countryList);
const europe = new Set(countryList.map(c => c.iso));

// ➤ One N-Quad: subject, predicate, object, graph. Objects are literals ("…"@lang or "…"^^type) or IRIs or blank nodes.
const QUAD = /^(<[^>]*>|_:\S+)\s+<([^>]*)>\s+(.+?)\s+<([^>]*)>\s+\.\s*$/;
const literal = o => {
  if (o[0] !== '"') return null;
  const end = o.lastIndexOf('"');
  return o.slice(1, end).replace(/\\"/g, '"').replace(/\\n/g, ' ').replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
};
// ➤ rdf:type is "type"; schema.org properties keep their name, lower-cased.
const local = p => (/#type$/.test(p) ? 'type' : p.replace(/^https?:\/\/schema\.org\//i, '').toLowerCase());

// ➤ The triples of one page → its postings: title, organisation, place, date.
function postingsOf(triples) {
  const byNode = {};
  for (const [s, p, o] of triples) (byNode[s] ||= {})[p] = (byNode[s][p] || []).concat([o]);
  const isType = (n, t) => (byNode[n]?.type || []).some(v => v.toLowerCase().endsWith('/' + t));
  const first = (n, p) => { const v = byNode[n]?.[p]?.[0]; return v == null ? '' : literal(v) ?? v; };
  const name = n => literal(byNode[n]?.name?.[0] || '') ?? (byNode[n]?.name?.[0] ? first(byNode[n].name[0], 'name') : '');
  const out = [];
  for (const [node, props] of Object.entries(byNode)) {
    if (!(props.type || []).some(t => /jobposting>?$/i.test(t))) continue;
    const title = literal(props.title?.[0] || '') || literal(props.name?.[0] || '') || '';
    if (!title) continue;
    const orgNode = props.hiringorganization?.[0] || '';
    const org = literal(orgNode) ?? name(orgNode);
    const placeNode = props.joblocation?.[0] || '';
    const addrNode = placeNode && byNode[placeNode]?.address?.[0];
    const addr = addrNode && byNode[addrNode] ? byNode[addrNode] : (placeNode && byNode[placeNode]) || {};
    const country = (literal(addr.addresscountry?.[0] || '') ?? name(addr.addresscountry?.[0] || '')) || '';
    const locality = literal(addr.addresslocality?.[0] || '') || '';
    const region = literal(addr.addressregion?.[0] || '') || '';
    out.push({ title, org: String(org || '').trim(), location: [locality, region, country].filter(Boolean).join(', '), country: /^[A-Za-z]{2}$/.test(country) ? country.toLowerCase() : '', posted: (literal(props.dateposted?.[0] || '') || '').slice(0, 10) });
  }
  return out;
}

const hosts = {};
function take(url, postings) {
  let host;
  try { host = new URL(url).host.toLowerCase(); } catch { return; }
  const h = hosts[host] ||= { pages: 0, orgs: {}, countries: {}, kept: 0, urls: [], sample: [] };
  h.pages++;
  for (const p of postings) {
    if (p.org) h.orgs[p.org] = (h.orgs[p.org] || 0) + 1;
    const raw = { title: p.title, codes: {}, lang: '' };
    if (!familiesOf(raw, gate).length || hygieneReason(raw)) continue;
    const place = p.country && europe.has(p.country) ? { cc: p.country } : placeOf(p.location, countries);
    if (place.cc && place.cc !== 'xx' && !europe.has(place.cc)) continue;
    h.kept++;
    h.countries[place.cc || 'zz'] = (h.countries[place.cc || 'zz'] || 0) + 1;
    if (h.urls.length < MAX_URLS_A_HOST) { h.urls.push(url); h.sample.push(p.title); }
  }
}

async function readPart(file) {
  const rl = createInterface({ input: createReadStream(file).pipe(createGunzip()), crlfDelay: Infinity });
  let graph = '', triples = [], lines = 0;
  for await (const line of rl) {
    lines++;
    const m = QUAD.exec(line);
    if (!m) continue;
    const g = m[4];
    if (g !== graph) { if (graph) take(graph, postingsOf(triples)); graph = g; triples = []; }
    triples.push([m[1], local(m[2]), m[3]]);
  }
  if (graph) take(graph, postingsOf(triples));
  return lines;
}

// ➤ --from-hosts rewrites the list from the last reading (builder/state/wdc-hosts.json) without
// ➤ reading the quads again: for a change of rule.
let total = 0;
if (args.includes('--from-hosts')) Object.assign(hosts, JSON.parse(readFileSync(HOSTS, 'utf8')));
else {
  const parts = readdirSync(WDC).filter(f => /^part_\d+\.gz$/.test(f)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
  if (!parts.length) { console.log(`no part_*.gz in ${WDC}`); process.exit(1); }
  for (const f of parts) { const n = await readPart(join(WDC, f)); total += n; console.log(`${f}: ${n.toLocaleString('en')} lines, ${Object.keys(hosts).length.toLocaleString('en')} hosts so far`); }
  if (!DRY) writeFileSync(HOSTS, JSON.stringify(hosts));
}
if (DRY) for (const [host, h] of Object.entries(hosts).slice(0, 6)) console.log('  host', host, 'pages', h.pages, 'orgs', JSON.stringify(h.orgs).slice(0, 120), 'kept', h.kept, 'sample', h.sample.slice(0, 3).join(' | '));
// ➤ Employers: one organisation on most pages, not a board, adverts of ours in Europe.
const sites = [];
for (const [host, h] of Object.entries(hosts)) {
  if (!h.kept || BOARDS.test(host)) continue;
  const orgs = Object.entries(h.orgs).sort((a, b) => b[1] - a[1]);
  const total = orgs.reduce((s, [, n]) => s + n, 0);
  if (!orgs.length || orgs[0][1] / total < 0.8) continue;
  // ➤ An employer's site carries its name: a word of the organisation (four letters or more)
  // ➤ is in the host. A board that names one big client on most pages is not (qreer.com
  // ➤ naming ASML), and neither is a board that names itself.
  const compact = host.replace(/[^a-z0-9]/g, '');
  const words = orgs[0][0].toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length >= 4 && !/^(gmbh|group|holding|limited|company|corporation|international|solutions|services|technologies|technology|systems|consulting|engineering|europe|global|jobportal|karriere|careers|jobs)$/.test(w));
  if (!words.some(w => compact.includes(w))) continue;
  // ➤ A domain named after jobs themselves (artificialintelligencejobs.co.uk) is a board,
  // ➤ whatever organisation it names; a "jobs." or "careers." subdomain of an employer is not.
  const labels = host.split('.');
  const registrable = labels.length > 2 && /^(co|com|org|net|ac|gov|edu)$/.test(labels[labels.length - 2]) ? labels[labels.length - 3] : labels[labels.length - 2] || '';
  if (/job|stellen|empleo|emploi|vacature|vacancy|career|karriere|recruit|talent|staffing|interim/.test(registrable)) continue;
  const where = Object.entries(h.countries).sort((a, b) => b[1] - a[1]).map(([cc, n]) => `${cc} ${n}`).join(' ');
  sites.push({ name: orgs[0][0], host, pages: h.pages, kept: h.kept, where, urls: h.urls.slice(0, 3) });
}
sites.sort((a, b) => b.kept - a.kept);
const head = `# Employers' careers hosts found by builder/tools/scout-wdc.mjs on ${new Date().toISOString().slice(0, 10)} in Web Data Commons'\n# JobPosting extraction of Common Crawl 2024-12: hosts naming one hiring organisation on their vacancy pages (not a job\n# board) with adverts the gate keeps in Europe. \`urls\` are pages seen then; the careers adapter finds today's through\n# the host's sitemap or the listing those pages hang from. pages/kept/where are what the crawl held that month.\n`;
const existing = existsSync(FOUND) ? (yaml.load(readFileSync(FOUND, 'utf8')) || {}).sites || [] : [];
if (DRY) console.log(sites.slice(0, 25).map(s => `${s.name} | ${s.host} | pages ${s.pages} kept ${s.kept} | ${s.where} | ${s.urls[0]}`).join('\n'));
else writeFileSync(FOUND, head + yaml.dump({ sites: [...existing.filter(s => s.sitemap || s.listing), ...sites] }, { lineWidth: 200 }));
console.log(`${total.toLocaleString('en')} quads, ${Object.keys(hosts).length.toLocaleString('en')} hosts, ${sites.length.toLocaleString('en')} employers with adverts of ours in Europe → ${FOUND}`);
