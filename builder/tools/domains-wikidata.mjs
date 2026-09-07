// ➤ Employers to look at, by name, from Wikidata: every company Wikidata places in one of the
// ➤ site's countries, with an official website and a staff count, biggest first. No key, no
// ➤ account, one query per country. What comes out is a queue of domains for the hunter
// ➤ (builder/tools/hunt.mjs --file), which then finds each one's careers pages and how to read
// ➤ them. Domains already in the lists are left out.
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
const EACH = Number(flag('--each', 800));        // ➤ companies kept per country
const MIN = Number(flag('--min', 200));          // ➤ staff a company must have to be worth a look
const OUT = join(ROOT, 'builder', 'state', 'found', 'hunt-queue.txt');
const ENDPOINT = 'https://query.wikidata.org/sparql';

const iso = JSON.parse(readFileSync(join(ROOT, 'catalogues', 'codes', 'wikidata-countries.json'), 'utf8'));
const countries = (flag('--countries', '') || Object.keys(iso).join(',')).split(',').filter(c => iso[c]);

// ➤ One query per country: what Wikidata knows, not what it can infer, so it answers quickly.
const queryFor = (qid, min) => `SELECT ?cLabel ?web ?e WHERE { ?c wdt:P17 wd:${qid} ; wdt:P856 ?web ; wdt:P1128 ?e . FILTER(?e >= ${min}) SERVICE wikibase:label { bd:serviceParam wikibase:language "en,de,fr,es,it,nl,sv,pl". } } LIMIT 4000`;

async function ask(qid, min) {
  const res = await get(`${ENDPOINT}?query=${encodeURIComponent(queryFor(qid, min))}`, { headers: { Accept: 'application/sparql-results+json' }, tries: 2, timeoutMs: 120_000, gapMs: 1500 });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).results.bindings.map(b => ({ name: b.cLabel?.value || '', web: b.web.value, staff: Number(b.e.value) || 0 }));
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
    if (better) byName.set(r.name, { host, name: r.name, staff: r.staff, cc });
  }
  return [...byName.values()].sort((a, b) => b.staff - a.staff).slice(0, EACH);
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
  console.log(`${cc}: ${rows.length} companies known to Wikidata, ${sites.length} worth hunting`);
}
picked.sort((a, b) => b.staff - a.staff);
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, picked.map(s => `${s.host}, ${s.name.replace(/[,\n]/g, ' ')}`).join('\n') + '\n');
console.log(`\nwritten ${OUT}: ${picked.length} domains, biggest employers first`);
console.log(`next: node builder/tools/hunt.mjs --file ${OUT} --write`);
