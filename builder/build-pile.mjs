// ➤ The pile builder: every source → the common shape → the gate (families, Europe) →
// ➤ dedupe → shards and an index, written to --out (default builder/out). A source that
// ➤ fails is reported and skipped; the run fails only when every source failed, so a bad
// ➤ hour at one API never publishes an empty site. --explain writes one line per dropped
// ➤ advert with the reason, --limit N stops each source after N adverts (for a quick look).
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import yaml from 'js-yaml';
import { compileFamilies, familiesOf, hygieneReason } from './gate.mjs';
import { compileCountries, toRecord } from './normalise.mjs';
import { dedupe } from './dedupe.mjs';
import { buildShards, writePile } from './shard.mjs';
import * as jobtech from './adapters/jobtech.mjs';
import * as lanbide from './adapters/lanbide.mjs';
import * as feinaactiva from './adapters/feinaactiva.mjs';
import * as jcyl from './adapters/jcyl.mjs';
import * as boards from './adapters/boards.mjs';
import { ATS } from './adapters/boards.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const flag = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const OUT = flag('--out', join(ROOT, 'builder', 'out'));
const LIMIT = Number(flag('--limit', 0)) || 0;
const EXPLAIN = args.includes('--explain');

const families = JSON.parse(readFileSync(join(ROOT, 'catalogues', 'families.json'), 'utf-8')).families;
const countries = JSON.parse(readFileSync(join(ROOT, 'catalogues', 'countries.json'), 'utf-8')).countries;
const companies = (yaml.load(readFileSync(join(ROOT, 'builder', 'config', 'companies.yml'), 'utf-8')) || {}).companies || [];
const gate = compileFamilies(families);
const cc = compileCountries(countries);
const europe = new Set(countries.map(c => c.iso));

const startedAt = new Date();
const log = line => console.log(`[${new Date().toISOString().slice(11, 19)}] ${line}`);
const failed = [];
const ctx = { families, companies, log, fail: (who, why) => { failed.push(`${who}: ${why}`); log(`FAILED ${who}: ${why}`); } };

const adapters = [lanbide, feinaactiva, jcyl, jobtech, boards];
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
      if (!/^https?:\/\//.test(String(raw.url || ''))) { counts.noLink++; dropped.push(['NO LINK', raw]); continue; }
      const fam = familiesOf(raw, gate);
      if (!fam.length) { counts.outsideVertical++; dropped.push(['OUTSIDE VERTICAL', raw]); continue; }
      const why = hygieneReason(raw);
      if (why) { counts.hygiene++; dropped.push([`HYGIENE ${why}`, raw]); continue; }
      const rec = toRecord(raw, fam, cc);
      if (rec.cc && rec.cc !== 'xx' && !europe.has(rec.cc)) { counts.outsideEurope++; dropped.push(['OUTSIDE EUROPE', raw]); continue; }
      items.push({ rec, kind: adapter.kind === 'board' ? 'board' : 'feed' });
    }
  } catch (e) {
    ctx.fail(adapter.id, e.message);
  }
}

const { kept, sameUrl, sameRole } = dedupe(items);
const generatedAt = new Date().toISOString();
const { files, families: familiesIndex } = buildShards(kept, families, generatedAt);

const sources = {};
for (const a of adapters) if (a.licence && sourcesSeen.has(a.id)) sources[a.id] = { ...a.licence, kind: a.kind, enabled: true, extracted_at: generatedAt };
for (const [key, ats] of Object.entries(ATS)) if (sourcesSeen.has(key)) sources[key] = { ...ats.licence, kind: 'board', enabled: true, extracted_at: generatedAt };
const perCountry = {};
for (const rec of kept) perCountry[rec.cc || 'zz'] = (perCountry[rec.cc || 'zz'] || 0) + 1;

const index = {
  v: 1, generated_at: generatedAt, expires_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(), catalogue_v: 1,
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
