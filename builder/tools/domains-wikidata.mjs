// ➤ Employers to look at, by name, from Wikidata: every company it places in one of the site's
// ➤ countries with an official website, found two ways — by what the company does (its industry)
// ➤ and by how many people it employs. No key, no account, two queries per country. What comes
// ➤ out is a queue of domains for the hunter (builder/tools/hunt.mjs --file), which finds each
// ➤ one's careers pages and how to read them. Domains already in the lists are left out.
// ➤ Only the companies whose trade is one this site is for come out: engineering, industry,
// ➤ energy, construction, transport, software and the rest of them, biggest first. A sports
// ➤ club or a supermarket costs a visit and gives nothing, and the server has better to do.
// ➤   node builder/tools/domains-wikidata.mjs [--countries es,de] [--each 800] [--min 200]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import yaml from 'js-yaml';
import { get } from '../http.mjs';
import { loadSites } from '../adapters/careers.mjs';
import { BOARD_HOSTS } from '../lib/crawl.mjs';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const flag = (name, dflt) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : dflt; };
const EACH = Number(flag('--each', 0)) || Infinity;  // ➤ companies kept per country; all of them unless asked
const MIN = Number(flag('--min', 200));          // ➤ staff a company must have to be worth a look
const OUT = join(ROOT, 'builder', 'state', 'found', 'hunt-queue.txt');
const ENDPOINT = 'https://query.wikidata.org/sparql';

const iso = JSON.parse(readFileSync(join(ROOT, 'catalogues', 'codes', 'wikidata-countries.json'), 'utf8'));
const countries = (flag('--countries', '') || Object.keys(iso).join(',')).split(',').filter(c => iso[c]);

// ➤ The industries where the site's occupations are done. Matched against the industry's own
// ➤ name, so it survives Wikidata renumbering its items.
const OURS = /engineer|manufactur|industrial|automotive|vehicle|aerospace|aviation|aeronaut|space|defen[cs]e|arms|shipbuild|marine|maritime|naval|rail|transport|logistics|energy|electric|electronic|semiconductor|nuclear|oil|gas|petrol|renewable|wind power|solar|utilit|water|mining|metal|steel|machin|robot|automation|chemical|pharmac|biotech|construction|building|architect|infrastructure|software|computer|information technology|internet|telecom|artificial intelligence|data|cyber|electronics|plastics|cement|glass|paper|environment|video game|research|laborator/i;

// ➤ Two queries a country: what a company does, and how many it employs. Neither is filled in
// ➤ for every company, and together they name far more than either alone.
const BY_INDUSTRY = qid => `SELECT ?cLabel ?web ?indLabel WHERE { ?c wdt:P17 wd:${qid} ; wdt:P856 ?web ; wdt:P452 ?ind . SERVICE wikibase:label { bd:serviceParam wikibase:language "en,de,fr,es,it,nl,sv,pl". } } LIMIT 6000`;
const BY_STAFF = (qid, min) => `SELECT ?cLabel ?web ?e WHERE { ?c wdt:P17 wd:${qid} ; wdt:P856 ?web ; wdt:P1128 ?e . FILTER(?e >= ${min}) SERVICE wikibase:label { bd:serviceParam wikibase:language "en,de,fr,es,it,nl,sv,pl". } } LIMIT 4000`;

async function sparql(query) {
  const res = await get(`${ENDPOINT}?query=${encodeURIComponent(query)}`, { headers: { Accept: 'application/sparql-results+json' }, tries: 2, timeoutMs: 120_000, gapMs: 1500 });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).results.bindings;
}

async function ask(qid, min) {
  const rows = new Map();
  const put = (name, web, extra) => {
    const key = `${name}|${web}`;
    const before = rows.get(key) || { name, web, staff: 0, industry: '' };
    rows.set(key, { ...before, ...extra, name, web });
  };
  for (const b of await sparql(BY_INDUSTRY(qid))) put(b.cLabel?.value || '', b.web.value, { industry: b.indLabel?.value || '' });
  for (const b of await sparql(BY_STAFF(qid, min))) put(b.cLabel?.value || '', b.web.value, { staff: Number(b.e.value) || 0 });
  return [...rows.values()];
}

// ➤ A company often has a website per country: the one on the country's own domain is the one
// ➤ that carries its vacancies, else the shortest.
function pickSites(rows, cc) {
  const byName = new Map();
  for (const r of rows) {
    let host; try { host = new URL(r.web).host.toLowerCase().replace(/^www\./, ''); } catch { continue; }
    if (!host || BOARD_HOSTS.test(host)) continue;
    const before = byName.get(r.name);
    const better = !before || (host.endsWith(`.${cc}`) && !before.host.endsWith(`.${cc}`)) || (host.length < before.host.length && before.host.endsWith(`.${cc}`) === host.endsWith(`.${cc}`));
    if (better) byName.set(r.name, { host, name: r.name, staff: r.staff, cc, industry: r.industry || '', ours: OURS.test(r.industry || '') });
  }
  // ➤ Only the companies whose trade is one of these: a sports club or a supermarket would
  // ➤ cost a visit each and give nothing, and the server has better things to do.
  return [...byName.values()].filter(r => r.ours).sort((a, b) => b.staff - a.staff).slice(0, EACH);
}

// ➤ What the lists already name: a domain there needs no hunting.
function known() {
  const out = new Set();
  const readCompanies = f => ['config', 'state/found'].flatMap(dir => { const p = join(ROOT, 'builder', ...dir.split('/'), f); return existsSync(p) ? (yaml.load(readFileSync(p, 'utf-8')) || {}).companies || [] : []; });
  for (const s of loadSites()) { const k = s.host || s.feed || s.sitemap || s.listing || ''; try { out.add((k.startsWith('http') ? new URL(k).host : k).toLowerCase().replace(/^www\./, '').replace(/^(careers?|jobs|job|werkenbij|empleo|karriere|stellen|vacatures|recrutement)\./, '')); } catch { /* skip */ } }
  for (const c of [...readCompanies('companies.yml'), ...readCompanies('hunted.yml')]) if (c.site) { try { out.add(new URL(c.site).host.toLowerCase().replace(/^www\./, '')); } catch { /* skip */ } }
  try { for (const line of readFileSync(join(ROOT, 'builder', 'state', 'hunted-done.txt'), 'utf8').split(/\r?\n/)) if (line.trim()) out.add(line.trim().split(',')[0].toLowerCase()); } catch { /* none yet */ }
  return out;
}

const seen = known();
console.log(`${seen.size} domains are already named by the lists or have been hunted`);
const picked = [];
for (const cc of countries) {
  let rows = [];
  // ➤ A small country has few big employers: the bar comes down until it has something to say.
  for (const min of [MIN, Math.max(50, Math.round(MIN / 4)), 20]) {
    try { rows = await ask(iso[cc], min); } catch (e) { console.log(`${cc}: ${e.message.slice(0, 60)}`); break; }
    if (rows.length >= 100 || min === 20) break;
  }
  const sites = pickSites(rows, cc).filter(s => !seen.has(s.host));
  for (const s of sites) { seen.add(s.host); picked.push(s); }
  console.log(`${cc}: ${rows.length} companies known to Wikidata, ${sites.length} in the site's trades and worth hunting`);
}
picked.sort((a, b) => (b.ours ? 1 : 0) - (a.ours ? 1 : 0) || b.staff - a.staff);
mkdirSync(dirname(OUT), { recursive: true });
const clean = t => String(t || '').replace(/[,\n]/g, ' ').trim();
writeFileSync(OUT, picked.map(s => `${s.host}, ${clean(s.name)}, ${clean(s.industry)}`).join('\n') + '\n');
console.log(`\nwritten ${OUT}: ${picked.length} domains in the site's trades, biggest employers first`);
console.log(`next: node builder/tools/hunt.mjs --file ${OUT} --write`);
