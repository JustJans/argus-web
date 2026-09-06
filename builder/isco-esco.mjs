// ➤ Builds the two occupation tables the gate reads, from the classifications themselves:
// ➤ ISCO-08 through ESCO (the European Commission's 3,007 occupations in 27 languages, no
// ➤ key; the same API Argus's esco.mjs talks to) and Sweden's SSYK-2012 through JobTech's
// ➤ taxonomy, which publishes the official SSYK→ISCO-08 correspondence. Output in
// ➤ catalogues/codes/: isco.json (the vertical's minor groups, their unit groups and every
// ➤ ESCO occupation under them with usable job titles per language) and ssyk-isco.json
// ➤ (JobTech concept id → ISCO codes). Each answer is cached under builder/state/esco-cache/,
// ➤ so a rerun costs no requests. `node builder/isco-esco.mjs [--isco] [--ssyk]`.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { usableLabels } from 'argus/server-bot/esco.mjs';
import { fold } from 'argus/server-bot/text.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(ROOT, 'catalogues', 'codes');
const CACHE = join(ROOT, 'builder', 'state', 'esco-cache');
const ESCO = 'https://ec.europa.eu/esco/api';
const JOBTECH = 'https://taxonomy.api.jobtechdev.se/v1/taxonomy/graphql';

// ➤ The vertical, as decided: ISCO-08 minor groups 214-216 and 311-315 (engineers,
// ➤ architects/planners/surveyors, technicians, supervisors, plant operators, crews), minus
// ➤ product/garment and graphic designers.
export const MINOR_GROUPS = ['214', '215', '216', '251', '252', '311', '312', '313', '315', '351', '352'];
export const EXCLUDED_UNITS = ['2163', '2166'];
// ➤ Groups next door whose job titles look like ours but are out (software and ICT, technical
// ➤ sales): their ESCO titles let the gate refuse "software engineer" or "sales engineer"
// ➤ instead of reading them as engineers.
export const BLOCKER_GROUPS = ['243'];
// ➤ The languages kept: those of today's and tomorrow's sources. ESCO has no Catalan.
export const LANGS = ['en', 'es', 'fr', 'de', 'nl', 'sv', 'no', 'da', 'fi', 'it', 'pt', 'pl', 'cs', 'lt', 'lv'];

const sleep = ms => new Promise(r => setTimeout(r, ms));
let calls = 0;
async function cached(url, key) {
  mkdirSync(CACHE, { recursive: true });
  const file = join(CACHE, `${key.replace(/[^a-z0-9]+/gi, '_').slice(0, 100)}.json`);
  if (existsSync(file)) { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { /* refetched below */ } }
  // ➤ ESCO answers 500 now and then for a single resource: three attempts with a pause, then
  // ➤ the caller gets null and skips that one (only good answers are cached).
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (calls++) await sleep(attempt === 1 ? 120 : 1500 * attempt);
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(30_000) });
      if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) { console.log(`skipped: HTTP ${res.status} for ${url}`); return null; }
      const json = await res.json();
      writeFileSync(file, JSON.stringify(json));
      return json;
    } catch (e) {
      if (attempt === 3) { console.log(`skipped after 3 attempts: ${e.message} for ${url}`); return null; }
    }
  }
  return null;
}
const concept = uri => cached(`${ESCO}/resource/concept?uri=${encodeURIComponent(uri)}&language=en`, `concept_${uri.split('/').pop()}`);
// ➤ A few occupations answer 500 on the occupation endpoint ("civil engineer" among them) but
// ➤ fine on the generic concept endpoint, which carries the same fields.
const occupation = async uri => (await cached(`${ESCO}/resource/occupation?uri=${encodeURIComponent(uri)}&language=en`, `occ_${uri.split('/').pop()}`)) || concept(uri);
const iscoUri = code => `http://data.europa.eu/esco/isco/C${code}`;
// ➤ An occupation's ISCO unit group: the first four characters of its ESCO code ("2144.1.14"
// ➤ is the naval architect, under 2144). Only top-level occupations carry the group link,
// ➤ so the code is what places the narrower ones.
const unitOf = (occ, inherited = '') => String(occ.code || '').slice(0, 4).replace(/\D.*/, '') || occ._links?.broaderIscoGroup?.[0]?.code || inherited;

// ➤ One occupation's job titles per language: the preferred label and the alternatives,
// ➤ through Argus's usableLabels (drops long administrative names and gendered pairs).
// ➤ The preferred ones are also kept apart: when a title is the name of an occupation in one
// ➤ group and only an alternative in another, the gate trusts the name.
function labelsOf(occ) {
  const labels = {}, preferred = {};
  for (const lang of LANGS) {
    const list = usableLabels([occ.preferredLabel?.[lang], ...(occ.alternativeLabel?.[lang] || [])].filter(Boolean));
    if (list.length) labels[lang] = list;
    const pref = usableLabels([occ.preferredLabel?.[lang]].filter(Boolean));
    if (pref.length) preferred[lang] = pref;
  }
  return { labels, preferred };
}

export async function buildIsco(log = console.log) {
  const groups = [], units = {}, outside = {}, skipped = [];
  const seen = new Set();
  // ➤ Walks an occupation and everything narrower than it. ESCO's own code decides the unit
  // ➤ group (a narrower occupation can sit in another group than its parent).
  async function walk(uri, inherited = '') {
    if (seen.has(uri)) return;
    seen.add(uri);
    const occ = await occupation(uri);
    if (!occ) { skipped.push(uri); return; }
    const code = unitOf(occ, inherited);
    const entry = { uri, title: occ.title, code: occ.code || '', ...labelsOf(occ) };
    if (units[code]) units[code].occupations.push(entry);
    else (outside[code] ||= []).push({ uri, title: occ.title });
    for (const n of occ._links?.narrowerOccupation || []) await walk(n.uri, code);
  }
  for (const g of MINOR_GROUPS) {
    const res = await concept(iscoUri(g));
    if (!res) throw new Error(`ESCO did not answer for minor group ${g}`);
    const unitLinks = (res._links?.narrowerConcept || []).map(u => ({ code: u.code || u.uri.split('/C').pop(), title: u.title, uri: u.uri })).filter(u => !EXCLUDED_UNITS.includes(u.code)).sort((a, b) => a.code.localeCompare(b.code));
    groups.push({ code: g, title: res.title, units: unitLinks.map(u => u.code) });
    for (const u of unitLinks) units[u.code] = { title: u.title, group: g, occupations: [] };
    log(`ISCO ${g} ${res.title}: ${unitLinks.map(u => u.code).join(' ')}`);
  }
  for (const [code, unit] of Object.entries(units)) {
    const res = await concept(iscoUri(code));
    for (const o of res?._links?.narrowerOccupation || []) await walk(o.uri);
    log(`  ${code} ${unit.title}: ${unit.occupations.length} occupations`);
  }
  // ➤ The blocker groups: only their titles per language are kept.
  const blockers = {};
  const blockerSeen = new Set();
  async function walkBlocker(uri, code) {
    if (blockerSeen.has(uri) || seen.has(uri)) return;
    blockerSeen.add(uri);
    const occ = await occupation(uri);
    if (!occ) return;
    const own = unitOf(occ, code);
    if (units[own]) return;   // ➤ filed in the vertical after all: not a blocker
    (blockers[own] ||= { occupations: [] }).occupations.push({ uri, title: occ.title, ...labelsOf(occ) });
    for (const n of occ._links?.narrowerOccupation || []) await walkBlocker(n.uri, own);
  }
  for (const g of BLOCKER_GROUPS) {
    const res = await concept(iscoUri(g));
    for (const u of res?._links?.narrowerConcept || []) {
      const code = u.code || u.uri.split('/C').pop();
      const unit = await concept(u.uri);
      blockers[code] ||= { title: u.title, occupations: [] };
      blockers[code].title = u.title;
      for (const o of unit?._links?.narrowerOccupation || []) await walkBlocker(o.uri, code);
    }
    log(`blockers ${g} ${res?.title || ''}: ${Object.values(blockers).reduce((s, b) => s + b.occupations.length, 0)} occupations so far`);
  }
  // ➤ Per unit group, the union of its occupations' titles per language, deduplicated
  // ➤ accent-blind: what the gate matches against titles of sources without codes.
  const union = (unit, field) => {
    unit[field] = {};
    for (const lang of LANGS) {
      const all = unit.occupations.flatMap(o => o[field]?.[lang] || []);
      const uniq = [];
      for (const l of all) if (!uniq.some(x => fold(x) === fold(l))) uniq.push(l);
      if (uniq.length) unit[field][lang] = uniq.sort((a, b) => a.length - b.length);
    }
  };
  for (const unit of Object.values(units)) { union(unit, 'labels'); union(unit, 'preferred'); }
  for (const b of Object.values(blockers)) { union(b, 'labels'); delete b.occupations; }
  const out = {
    _about: 'ISCO-08 minor groups of the vertical, their unit groups, and every ESCO occupation under them with the job titles ESCO gives per language (through Argus\'s usableLabels). Built by builder/isco-esco.mjs from https://ec.europa.eu/esco/api. `blockers`: titles of neighbouring groups that are out (ICT, technical sales), so a generic "engineer" never covers them. `outside` lists occupations reached through the walk that ESCO files under other groups.',
    built_at: new Date().toISOString(), langs: LANGS, groups, units, blockers, outside, skipped,
  };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'isco.json'), JSON.stringify(out, null, 1));
  log(`isco.json: ${groups.length} minor groups, ${Object.keys(units).length} unit groups, ${seen.size - skipped.length} occupations (${skipped.length} skipped), ${calls} requests`);
  return out;
}

// ➤ JobTech's taxonomy: every SSYK-2012 level-4 concept with the ISCO-08 codes it relates to.
export async function buildSsyk(log = console.log) {
  const query = '{ concepts(type:"ssyk-level-4", limit: 2000) { id preferred_label ssyk_code_2012 related(type:"isco-level-4") { isco_code_08 } } }';
  const res = await cached(`${JOBTECH}?query=${encodeURIComponent(query)}`, 'jobtech_ssyk4_isco');
  const table = {};
  for (const c of res.data?.concepts || []) table[c.id] = { ssyk: c.ssyk_code_2012, label: c.preferred_label, isco: [...new Set(c.related.map(r => r.isco_code_08))].sort() };
  const out = { _about: 'SSYK-2012 level-4 concepts of JobTech\'s taxonomy (the codes Arbetsförmedlingen\'s adverts carry) and the ISCO-08 unit groups the taxonomy relates them to. Built by builder/isco-esco.mjs from ' + JOBTECH, built_at: new Date().toISOString(), concepts: table };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'ssyk-isco.json'), JSON.stringify(out, null, 1));
  log(`ssyk-isco.json: ${Object.keys(table).length} SSYK groups, ${Object.values(table).filter(t => t.isco.length).length} with ISCO codes`);
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const both = !args.includes('--isco') && !args.includes('--ssyk');
  if (both || args.includes('--ssyk')) await buildSsyk();
  if (both || args.includes('--isco')) await buildIsco();
}
