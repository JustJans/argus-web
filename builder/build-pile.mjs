// ➤ The pile builder, from the store and nothing else: every source's last pass (written by
// ➤ builder/crawl.mjs) → the common shape → the gate (families, Europe) → dedupe → shards and
// ➤ an index, written to --out (default builder/out). It asks nothing of the network, so a
// ➤ slow site never delays a publish. A source whose last pass is old is left out; a run that
// ➤ would shrink the pile by a third does not publish. --explain writes one line per dropped
// ➤ advert with the reason, --limit N stops each source after N adverts (for a quick look).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { compileFamilies, familiesOf, hygieneReason } from './gate.mjs';
import { compileCountries, toRecord } from './normalise.mjs';
import { compileScreens } from './screens.mjs';
import { dedupe } from './dedupe.mjs';
import { buildShards, writePile } from './shard.mjs';
import { loadCache, saveCache, translateTitles } from './translate.mjs';
import { eachSource } from './store.mjs';
import { licenceFor } from './sources.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
// ➤ Keys for the sources that need one (the intermediaries): builder/.env, one KEY=VALUE per
// ➤ line, never in git; the environment itself wins when it already has the key.
const envFile = join(ROOT, 'builder', '.env');
if (existsSync(envFile)) for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }
const args = process.argv.slice(2);
const flag = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const OUT = flag('--out', join(ROOT, 'builder', 'out'));
const LIMIT = Number(flag('--limit', 0)) || 0;
const EXPLAIN = args.includes('--explain');
const FORCE = args.includes('--force');
const DROP_AFTER_DAYS = 10;   // ➤ a source nobody could read for this long has nothing live left
const KEEP_AT_LEAST = 0.7;    // ➤ a pile a third smaller than the last one is a fault, not a day

const catalogue = JSON.parse(readFileSync(join(ROOT, 'catalogues', 'families.json'), 'utf-8'));
const families = catalogue.families;
// ➤ The classifications the gate reads: ESCO's occupations per ISCO unit group and JobTech's
// ➤ SSYK→ISCO correspondence (both built by builder/isco-esco.mjs).
const codes = {
  isco: JSON.parse(readFileSync(join(ROOT, 'catalogues', 'codes', 'isco.json'), 'utf-8')),
  ssyk: JSON.parse(readFileSync(join(ROOT, 'catalogues', 'codes', 'ssyk-isco.json'), 'utf-8')),
};
const countries = JSON.parse(readFileSync(join(ROOT, 'catalogues', 'countries.json'), 'utf-8')).countries;
const gate = compileFamilies(catalogue, codes);
const cc = compileCountries(countries);
const screens = compileScreens({
  degrees: JSON.parse(readFileSync(join(ROOT, 'catalogues', 'degrees.json'), 'utf-8')),
  languages: JSON.parse(readFileSync(join(ROOT, 'catalogues', 'languages.json'), 'utf-8')),
});
const europe = new Set(countries.map(c => c.iso));

const startedAt = new Date();
const log = line => console.log(`[${new Date().toISOString().slice(11, 19)}] ${line}`);

const items = [];
const dropped = [];
const counts = { found: 0, outsideVertical: 0, outsideEurope: 0, hygiene: 0, noLink: 0, stale: 0 };
const sourcesSeen = new Set();
const stale = new Date(Date.now() - DROP_AFTER_DAYS * 864e5).toISOString();
let sourceFiles = 0, boardSources = 0, crawledAt = '';

for (const data of eachSource()) {
  sourceFiles++;
  const ended = data.pass?.ended || '';
  if (data.pass?.ok && ended > crawledAt) crawledAt = ended;
  if (data.group !== 'feeds' && data.group !== 'via') boardSources++;
  // ➤ A source nobody has read for days: its adverts are probably closed, so they leave.
  if (ended && ended < stale) { counts.stale += (data.adverts || []).length; continue; }
  const kind = data.kind === 'board' || data.kind === 'via' ? data.kind : 'feed';
  let n = 0;
  for (const raw of data.adverts || []) {
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
    if (rec.x && rec.x < startedAt.toISOString().slice(0, 10)) { counts.stale++; drop('EXPIRED', raw); continue; }
    if (rec.cc && rec.cc !== 'xx' && !europe.has(rec.cc)) { counts.outsideEurope++; drop('OUTSIDE EUROPE', raw); continue; }
    // ➤ Company boards are read the world over: an advert of theirs whose place names nothing
    // ➤ known is more often outside Europe than in it, and is left out.
    if (!rec.cc && kind === 'board') { counts.outsideEurope++; drop('PLACE UNKNOWN', raw); continue; }
    items.push({ rec, kind });
  }
}
if (!sourceFiles) { log('the store is empty: run builder/crawl.mjs first'); process.exit(1); }

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
const { files, families: familiesIndex } = buildShards(kept, families);

const sources = {};
for (const id of sourcesSeen) { const lic = licenceFor(id); if (lic) sources[id] = { ...lic, enabled: true, extracted_at: crawledAt || generatedAt }; }
const perCountry = {};
for (const rec of kept) perCountry[rec.cc || 'zz'] = (perCountry[rec.cc || 'zz'] || 0) + 1;
const viaSources = new Set(Object.entries(sources).filter(([, v]) => v.via).map(([k]) => k));
const viaCount = kept.filter(rec => viaSources.has(rec.s)).length;

// ➤ The last pile, to see whether this one is a fall rather than a build.
const before = (() => { try { return JSON.parse(readFileSync(join(OUT, 'index.json'), 'utf8')); } catch { return null; } })();
const wasKept = before?.counts?.offers || 0;
if (!FORCE && wasKept && kept.length < wasKept * KEEP_AT_LEAST) {
  log(`ALERT not publishing: ${kept.length} offers is under ${Math.round(KEEP_AT_LEAST * 100)}% of the ${wasKept} the last pile had (--force overrides)`);
  process.exit(1);
}

const index = {
  v: 1, generated_at: generatedAt, crawled_at: crawledAt || generatedAt,
  expires_at: new Date(Date.parse(crawledAt || generatedAt) + 48 * 3600 * 1000).toISOString(), catalogue_v: 2,
  families: familiesIndex, sources,
  counts: { offers: kept.length, found: counts.found, by_country: perCountry, via: viaCount, sources: sourceFiles, companies: boardSources },
  status: { ok: kept.length > 0, seconds: Math.round((Date.now() - startedAt) / 1000) },
};
mkdirSync(OUT, { recursive: true });
const extras = {};
if (EXPLAIN) extras['explain.txt'] = dropped.map(([why, raw]) => `[${why}] ${raw.title} | ${raw.company} | ${raw.location} (${raw.source})`).join('\n') + '\n';
writePile(OUT, files, index, extras);
writeFileSync(join(OUT, 'status.json'), JSON.stringify({ generated_at: generatedAt, crawled_at: crawledAt, offers: kept.length, found: counts.found, sources: sourceFiles, dropped: counts, duplicates: { sameUrl, sameRole }, by_country: perCountry }, null, 2));

log(`store: ${sourceFiles} sources, newest pass ${crawledAt || 'never'}`);
log(`found ${counts.found} · outside vertical ${counts.outsideVertical} · outside Europe ${counts.outsideEurope} · hygiene ${counts.hygiene} · no link ${counts.noLink} · stale ${counts.stale} · duplicates ${sameUrl + sameRole}`);
log(`kept ${kept.length} offers in ${Object.keys(files).length} shards → ${OUT}`);
if (kept.length === 0) { log('nothing usable in the store: not publishing'); process.exit(1); }
