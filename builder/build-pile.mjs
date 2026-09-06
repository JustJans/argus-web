// ➤ The pile builder: every source → the common shape → the gate (families, Europe) →
// ➤ dedupe → shards and an index, written to --out (default builder/out). A source that
// ➤ fails is reported and skipped; the run fails only when every source failed, so a bad
// ➤ hour at one API never publishes an empty site. --explain writes one line per dropped
// ➤ advert with the reason, --limit N stops each source after N adverts (for a quick look).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import yaml from 'js-yaml';
import { compileFamilies, familiesOf, hygieneReason } from './gate.mjs';
import { compileCountries, toRecord } from './normalise.mjs';
import { compileScreens } from './screens.mjs';
import { dedupe } from './dedupe.mjs';
import { buildShards, writePile } from './shard.mjs';
import { loadCache, saveCache, translateTitles } from './translate.mjs';
import * as jobtech from './adapters/jobtech.mjs';
import * as lanbide from './adapters/lanbide.mjs';
import * as feinaactiva from './adapters/feinaactiva.mjs';
import * as jcyl from './adapters/jcyl.mjs';
import * as sef from './adapters/sef.mjs';
import * as mpsv from './adapters/mpsv.mjs';
import * as uzt from './adapters/uzt.mjs';
import * as nva from './adapters/nva.mjs';
import * as adzuna from './adapters/adzuna.mjs';
import { jobicy, remotive, arbeitnow } from './adapters/remote.mjs';
import * as careers from './adapters/careers.mjs';
import * as boards from './adapters/boards.mjs';
import { ATS, loadCompanies } from './adapters/boards.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
// ➤ Keys for the sources that need one (Adzuna): builder/.env, one KEY=VALUE per line, never
// ➤ in git; the environment itself wins when it already has the key.
const envFile = join(ROOT, 'builder', '.env');
if (existsSync(envFile)) for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }
const args = process.argv.slice(2);
const flag = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const OUT = flag('--out', join(ROOT, 'builder', 'out'));
const LIMIT = Number(flag('--limit', 0)) || 0;
const EXPLAIN = args.includes('--explain');

const catalogue = JSON.parse(readFileSync(join(ROOT, 'catalogues', 'families.json'), 'utf-8'));
const families = catalogue.families;
// ➤ The classifications the gate reads: ESCO's occupations per ISCO unit group and JobTech's
// ➤ SSYK→ISCO correspondence (both built by builder/isco-esco.mjs).
const codes = {
  isco: JSON.parse(readFileSync(join(ROOT, 'catalogues', 'codes', 'isco.json'), 'utf-8')),
  ssyk: JSON.parse(readFileSync(join(ROOT, 'catalogues', 'codes', 'ssyk-isco.json'), 'utf-8')),
};
const countries = JSON.parse(readFileSync(join(ROOT, 'catalogues', 'countries.json'), 'utf-8')).countries;
const companies = loadCompanies();
const gate = compileFamilies(catalogue, codes);
const cc = compileCountries(countries);
const screens = compileScreens({
  degrees: JSON.parse(readFileSync(join(ROOT, 'catalogues', 'degrees.json'), 'utf-8')),
  languages: JSON.parse(readFileSync(join(ROOT, 'catalogues', 'languages.json'), 'utf-8')),
});
const europe = new Set(countries.map(c => c.iso));

const startedAt = new Date();
const log = line => console.log(`[${new Date().toISOString().slice(11, 19)}] ${line}`);
const failed = [];
// ➤ iscoUnits: the vertical's ISCO unit groups, for the feeds that classify by code (Czechia,
// ➤ Lithuania); ssykGroups: the SSYK groups whose ISCO codes fall in the vertical, what JobTech
// ➤ is asked for.
const ctx = { families, iscoUnits: [...gate.byIsco.keys()], ssykGroups: [...gate.bySsyk.keys()], companies, log, fail: (who, why) => { failed.push(`${who}: ${why}`); log(`FAILED ${who}: ${why}`); } };

// ➤ The two heavy readers run in processes of their own (adapters/run.mjs): a crash of the
// ➤ runtime under thousands of sites ends the reader, not the build, and the reader is
// ➤ started once more; what arrived before stays.
async function* linesOf(stream) {
  let rest = '';
  stream.setEncoding('utf8');
  for await (const chunk of stream) { const parts = (rest + chunk).split('\n'); rest = parts.pop(); for (const p of parts) if (p) yield p; }
  if (rest) yield rest;
}
function isolated(adapter) {
  async function* fetchAll(ctx) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const child = spawn(process.execPath, [join(ROOT, 'builder', 'adapters', 'run.mjs'), adapter.id], { stdio: ['ignore', 'pipe', 'pipe'] });
      child.stderr.on('data', d => { for (const line of String(d).split(/\r?\n/)) if (line.trim()) ctx.log(line.trim()); });
      let n = 0, unread = 0;
      for await (const line of linesOf(child.stdout)) {
        let raw;
        // ➤ A line that cannot be read costs one advert, not the source; it is logged to be understood.
        try { raw = JSON.parse(line); } catch (e) { if (++unread <= 5) ctx.log(`${adapter.id}: an unreadable line of ${line.length} chars (${e.message.slice(0, 50)}) starting ${line.slice(0, 60)} and ending ${line.slice(-60)}`); continue; }
        n++;
        yield raw;
      }
      const code = await new Promise(r => child.on('close', r));
      if (unread) ctx.log(`${adapter.id}: ${unread} lines could not be read`);
      if (code === 0) return;
      ctx.log(`${adapter.id}: the reader ended with code ${code} after ${n} adverts${attempt === 1 ? '; started once more' : ''}`);
    }
  }
  return { ...adapter, fetchAll };
}
const adapters = [lanbide, feinaactiva, jcyl, sef, jobtech, mpsv, uzt, nva, adzuna, jobicy, remotive, arbeitnow, isolated(careers), isolated(boards)];
const items = [];
const dropped = [];
const counts = { found: 0, outsideVertical: 0, outsideEurope: 0, hygiene: 0, noLink: 0 };
const sourcesSeen = new Set();

for (const adapter of adapters) {
  let n = 0;
  try {
    for await (const raw of adapter.fetchAll(ctx)) {
      counts.found++;
      sourcesSeen.add(raw.source);
      if (LIMIT && ++n > LIMIT) break;
      // ➤ The explain report keeps only what it prints: the adverts themselves are many.
      const drop = (why, r) => { if (EXPLAIN) dropped.push([why, { title: r.title, company: r.company, location: r.location, source: r.source }]); };
      if (!/^https?:\/\//.test(String(raw.url || ''))) { counts.noLink++; drop('NO LINK', raw); continue; }
      const fam = familiesOf(raw, gate);
      if (!fam.length) { counts.outsideVertical++; drop('OUTSIDE VERTICAL', raw); continue; }
      const why = hygieneReason(raw);
      if (why) { counts.hygiene++; drop(`HYGIENE ${why}`, raw); continue; }
      const rec = toRecord(raw, fam, cc, screens);
      if (rec.cc && rec.cc !== 'xx' && !europe.has(rec.cc)) { counts.outsideEurope++; drop('OUTSIDE EUROPE', raw); continue; }
      // ➤ Company boards are read the world over: an advert of theirs whose place names nothing
      // ➤ known is more often outside Europe than in it, and is left out.
      if (!rec.cc && adapter.kind === 'board') { counts.outsideEurope++; drop('PLACE UNKNOWN', raw); continue; }
      items.push({ rec, kind: adapter.kind === 'board' ? 'board' : 'feed' });
    }
  } catch (e) {
    ctx.fail(adapter.id, e.message);
  }
}

const { kept, sameUrl, sameRole } = dedupe(items);

// ➤ Titles in English, as the bot shows them; the cache on disk means only new titles are asked.
if (!args.includes('--no-translate')) {
  const cachePath = join(ROOT, 'builder', 'state', 'translations.json');
  const cache = loadCache(cachePath);
  const t = await translateTitles(kept, { cache, log });
  saveCache(cachePath, cache);
  log(`titles: ${t.translated} in English (${t.asked} asked, ${t.fromCache} from the cache${t.limited ? ', translator rate-limited' : ''})`);
}
const generatedAt = new Date().toISOString();
const { files, families: familiesIndex } = buildShards(kept, families, generatedAt);

const sources = {};
for (const a of adapters) if (a.licence && sourcesSeen.has(a.id)) sources[a.id] = { ...a.licence, kind: a.kind, enabled: true, extracted_at: generatedAt };
for (const [key, ats] of Object.entries(ATS)) if (sourcesSeen.has(key)) sources[key] = { ...ats.licence, kind: 'board', enabled: true, extracted_at: generatedAt };
const perCountry = {};
for (const rec of kept) perCountry[rec.cc || 'zz'] = (perCountry[rec.cc || 'zz'] || 0) + 1;

const index = {
  v: 1, generated_at: generatedAt, expires_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(), catalogue_v: 2,
  families: familiesIndex, sources,
  counts: { offers: kept.length, found: counts.found, by_country: perCountry, companies: companies.filter(c => c.enabled !== false).length },
  status: { ok: kept.length > 0 && failed.length < adapters.length, sources_failed: failed, seconds: Math.round((Date.now() - startedAt) / 1000) },
};
mkdirSync(OUT, { recursive: true });
const extras = {};
if (EXPLAIN) extras['explain.txt'] = dropped.map(([why, raw]) => `[${why}] ${raw.title} | ${raw.company} | ${raw.location} (${raw.source})`).join('\n') + '\n';
writePile(OUT, files, index, extras);
writeFileSync(join(OUT, 'status.json'), JSON.stringify({ generated_at: generatedAt, offers: kept.length, found: counts.found, dropped: counts, duplicates: { sameUrl, sameRole }, sources_failed: failed, by_country: perCountry }, null, 2));

log(`found ${counts.found} · outside vertical ${counts.outsideVertical} · outside Europe ${counts.outsideEurope} · hygiene ${counts.hygiene} · no link ${counts.noLink} · duplicates ${sameUrl + sameRole}`);
log(`kept ${kept.length} offers in ${Object.keys(files).length} shards → ${OUT}`);
if (failed.length) log(`sources failed: ${failed.join(' | ')}`);
if (kept.length === 0 || failed.length >= adapters.length) { log('nothing usable came back: not publishing'); process.exit(1); }
