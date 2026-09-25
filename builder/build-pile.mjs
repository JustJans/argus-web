// ➤ The pile builder, from the store and nothing else: every source's last pass (written by
// ➤ builder/crawl.mjs) → the common shape → the gate (families, Europe) → dedupe → shards and
// ➤ an index, written to --out (default builder/out). It asks nothing of the network, so a
// ➤ slow site never delays a publish. A source whose last pass is old is left out; a run that
// ➤ would shrink the pile by a third does not publish. --explain writes one line per dropped
// ➤ advert with the reason, --limit N stops each source after N adverts (for a quick look).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { compileFamilies, classifier, hygieneReason, languagesOfCountry } from './gate.mjs';
import { readCodes } from './codes.mjs';
import { compileCountries, placeOfAdvert, toRecord } from './normalise.mjs';
import { compileScreens } from './screens.mjs';
import { dedupe } from './dedupe.mjs';
import { buildShards, writePile } from './shard.mjs';
import { compileTowns, locate, townOf, campaignPlaces } from './towns.mjs';
import { ambiguousNames } from './place-names.mjs';
import { loopOffers } from './loop-offers.mjs';
import { loadCache, saveCache, translateTitles } from './translate.mjs';
import { eachSource } from './store.mjs';
import { licenceFor } from './sources.mjs';
import { exchangeRates } from './exchange-rates.mjs';

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
// ➤ The classifications the gate reads: ESCO's occupations per ISCO unit group, JobTech's
// ➤ SSYK→ISCO correspondence and the official coding indexes' titles (builder/codes.mjs).
const codes = readCodes(ROOT);
const countries = JSON.parse(readFileSync(join(ROOT, 'catalogues', 'countries.json'), 'utf-8')).countries;
const gate = compileFamilies(catalogue, codes);
const classify = classifier(gate);
const cc = compileCountries(countries);
const screens = compileScreens({
  degrees: JSON.parse(readFileSync(join(ROOT, 'catalogues', 'degrees.json'), 'utf-8')),
  languages: JSON.parse(readFileSync(join(ROOT, 'catalogues', 'languages.json'), 'utf-8')),
});
const europe = new Set(countries.map(c => c.iso));

const startedAt = new Date();
const log = line => console.log(`[${new Date().toISOString().slice(11, 19)}] ${line}`);
// ➤ How long each stage took, written at the end: every change to the build is measured.
const stages = [];
let stageStarted = Date.now();
const stage = name => { const now = Date.now(); stages.push(`${name} ${Math.round((now - stageStarted) / 1000)} s`); stageStarted = now; };
// ➤ The ECB's euro rates, for pay in other currencies (one small file; the last one kept when
// ➤ the ECB cannot be reached).
const rates = await exchangeRates(join(ROOT, 'builder', 'state', 'ecb-rates.xml'));
stage('exchange rates');

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
    // ➤ A source that names no language: the title is read in its country's languages as well.
    if (!raw.lang) raw.hintLangs = languagesOfCountry(placeOfAdvert(raw, cc).cc || String(raw.country || '').toLowerCase());
    const { families: fam, occupations } = classify(raw);
    if (!fam.length) { counts.outsideVertical++; drop('OUTSIDE VERTICAL', raw); continue; }
    const why = hygieneReason(raw);
    if (why) { counts.hygiene++; drop(`HYGIENE ${why}`, raw); continue; }
    const rec = toRecord(raw, fam, cc, screens, rates.rates);
    if (occupations.length) rec.e = occupations;
    if (rec.x && rec.x < startedAt.toISOString().slice(0, 10)) { counts.stale++; drop('EXPIRED', raw); continue; }
    if (rec.cc && rec.cc !== 'xx' && !europe.has(rec.cc)) { counts.outsideEurope++; drop('OUTSIDE EUROPE', raw); continue; }
    // ➤ Company boards are read the world over: an advert of theirs whose place names nothing
    // ➤ known is more often outside Europe than in it, and is left out.
    if (!rec.cc && kind === 'board') { counts.outsideEurope++; drop('PLACE UNKNOWN', raw); continue; }
    items.push({ rec, kind });
  }
}
if (!sourceFiles) { log('the store is empty: run builder/crawl.mjs first'); process.exit(1); }
stage('store and gate');

// ➤ The same job in two towns is two offers; the town is GeoNames', so "Munich" and "München"
// ➤ are one place.
const towns = compileTowns(JSON.parse(readFileSync(join(ROOT, 'catalogues', 'codes', 'places.json'), 'utf-8')));
const { kept, sameUrl, sameRole } = dedupe(items, rec => { const hit = townOf(rec, towns); return hit ? `#${hit.town.id}` : `${rec.cc || ''}|${String(rec.ci || '').toLowerCase()}`; });
stage('duplicates');

// ➤ Each advert on the map, for the search by town and distance: its town found in GeoNames.
// ➤ A campaign kept once per country is on the map in every town it names.
const onMap = locate([...kept, ...kept.flatMap(rec => rec.alsoAt || [])], towns);
for (const rec of kept) if (rec.alsoAt) { const more = campaignPlaces(rec); if (more.length) rec.m = more; delete rec.alsoAt; }
const onMapKept = kept.filter(rec => rec.g).length;
stage('towns');

// ➤ Titles in English, as the bot shows them, and in Spanish for the Spanish site; a cache on
// ➤ disk per language (keyed by the title alone) means only new titles are asked. Spanish goes
// ➤ first: nearly every title needs it, and the languages Azure detects on the way spare the
// ➤ English pass the titles already written in English.
if (!args.includes('--no-translate')) {
  const detected = new Map();
  for (const [target, field, name] of [['es', 'ts', 'Spanish'], ['en', 'te', 'English']]) {
    const cachePath = join(ROOT, 'builder', 'state', `titles-${target}.json`);
    const cache = loadCache(cachePath);
    const t = await translateTitles(kept, { target, field, cache, detected, log });
    saveCache(cachePath, cache);
    log(`titles: ${t.translated} in ${name} (${t.asked} new titles asked in ${t.requests} requests, ${t.used} characters of Azure's month${t.spare ? `, ${t.spare} through the spare translator` : ''})`);
  }
}
stage('translation');
const generatedAt = new Date().toISOString();
const { files, families: familiesIndex, latest } = buildShards(kept, families);
stage('shards');

const sources = {};
for (const id of sourcesSeen) { const lic = licenceFor(id); if (lic) sources[id] = { ...lic, enabled: true, extracted_at: crawledAt || generatedAt }; }
const perCountry = {};
for (const rec of kept) perCountry[rec.cc || 'zz'] = (perCountry[rec.cc || 'zz'] || 0) + 1;
const viaSources = new Set(Object.entries(sources).filter(([, v]) => v.via).map(([k]) => k));
const viaCount = kept.filter(rec => viaSources.has(rec.s)).length;
const withPay = kept.filter(rec => rec.p).length, withMode = kept.filter(rec => rec.w).length;

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
  families: familiesIndex, latest, sources,
  counts: { offers: kept.length, found: counts.found, by_country: perCountry, via: viaCount, sources: sourceFiles, companies: boardSources, on_map: onMapKept, with_pay: withPay, with_mode: withMode },
  status: { ok: kept.length > 0, seconds: Math.round((Date.now() - startedAt) / 1000) },
};
mkdirSync(OUT, { recursive: true });
// ➤ The towns with offers, for the search bar, with the names it must not take for a town on
// ➤ their own; loaded when a visitor starts to search.
const ambiguous = ambiguousNames(onMap.list, kept);
stage('place names');
// ➤ And the offers the front page's loop shows.
const extras = {
  'places.json': JSON.stringify({ v: 2, places: onMap.list, ambiguous }),
  'today.json': JSON.stringify({ v: 1, offers: loopOffers(kept, s => viaSources.has(s)) }),
};
if (EXPLAIN) extras['explain.txt'] = dropped.map(([why, raw]) => `[${why}] ${raw.title} | ${raw.company} | ${raw.location} (${raw.source})`).join('\n') + '\n';
writePile(OUT, files, index, extras);
writeFileSync(join(OUT, 'status.json'), JSON.stringify({ generated_at: generatedAt, crawled_at: crawledAt, offers: kept.length, found: counts.found, sources: sourceFiles, dropped: counts, duplicates: { sameUrl, sameRole }, by_country: perCountry }, null, 2));
stage('writing');

log(`store: ${sourceFiles} sources, newest pass ${crawledAt || 'never'}`);
log(`found ${counts.found} · outside vertical ${counts.outsideVertical} · outside Europe ${counts.outsideEurope} · hygiene ${counts.hygiene} · no link ${counts.noLink} · stale ${counts.stale} · duplicates ${sameUrl + sameRole}`);
log(`kept ${kept.length} offers in ${Object.keys(files).length} shards → ${OUT}`);
log(`on the map: ${onMapKept} offers in ${onMap.list.length} towns`);
log(`pay stated on ${withPay} offers (ECB rates of ${rates.day || 'no day: only pay in euros read'}); work mode stated on ${withMode}`);
log(`stages: ${stages.join(' · ')}`);
if (kept.length === 0) { log('nothing usable in the store: not publishing'); process.exit(1); }
