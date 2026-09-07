// ➤ The pile on disk: one file per family and country, so a profile code downloads only the
// ➤ parts it named, and an index that says what exists, how big it is, where it came from
// ➤ and under which licence. A shard past 4 MB is split into numbered parts.
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';

const MAX_BYTES = 4 * 1024 * 1024;
const LATEST = 6000;        // ➤ the newest offers a visitor sees before naming anything
const LATEST_DAYS = 21;     // ➤ how far back that goes

export function shardKey(family, cc) { return `${family}-${cc || 'zz'}`; }

// ➤ The newest offers of the whole pile, whatever their family or country: what the site shows
// ➤ to a visitor who has named nothing, instead of every part there is.
export function latestOf(records, { max = LATEST, days = LATEST_DAYS, now = Date.now() } = {}) {
  const since = new Date(now - days * 864e5).toISOString().slice(0, 10);
  const seen = new Set();
  const out = [];
  for (const rec of [...records].sort((a, b) => (b.d || '').localeCompare(a.d || '') || String(a.id).localeCompare(String(b.id)))) {
    if (out.length >= max || (rec.d || '') < since) break;
    if (seen.has(rec.id)) continue;
    seen.add(rec.id);
    out.push(rec);
  }
  return { offers: out, since };
}

// ➤ records → { files: {name: content}, families: index block }. The same offers give the same
// ➤ bytes (no date inside a shard, a fixed order), so a publish moves only what changed.
export function buildShards(records, families) {
  const groups = new Map();
  for (const rec of records) {
    for (const f of rec.f) {
      const key = shardKey(f, rec.cc);
      if (!groups.has(key)) groups.set(key, { family: f, cc: rec.cc || 'zz', offers: [] });
      groups.get(key).offers.push(rec);
    }
  }
  const files = {};
  const index = {};
  for (const f of families) index[f.id] = { label: f.label, group: f.group, countries: {} };
  for (const [key, g] of groups) {
    g.offers.sort((a, b) => (b.d || '').localeCompare(a.d || '') || String(a.id).localeCompare(String(b.id)));
    const parts = [];
    let part = [], size = 0;
    for (const rec of g.offers) {
      const bytes = JSON.stringify(rec).length + 1;
      if (size + bytes > MAX_BYTES && part.length) { parts.push(part); part = []; size = 0; }
      part.push(rec); size += bytes;
    }
    if (part.length) parts.push(part);
    const names = parts.map((p, i) => `offers/${key}${parts.length > 1 ? `-${i + 1}` : ''}.json`);
    names.forEach((name, i) => { files[name] = JSON.stringify({ v: 1, shard: key, offers: parts[i] }); });
    if (!index[g.family]) index[g.family] = { label: g.family, countries: {} };
    index[g.family].countries[g.cc] = { files: names, n: g.offers.length, bytes: names.reduce((s, n) => s + files[n].length, 0) };
  }
  // ➤ The newest of the lot, in parts of their own.
  const { offers: newest, since } = latestOf(records);
  const latestFiles = [];
  let part = [], size = 0;
  const flush = () => { if (!part.length) return; const name = `offers/latest${latestFiles.length ? `-${latestFiles.length + 1}` : ''}.json`; files[name] = JSON.stringify({ v: 1, shard: 'latest', offers: part }); latestFiles.push(name); part = []; size = 0; };
  for (const rec of newest) { const bytes = JSON.stringify(rec).length + 1; if (size + bytes > MAX_BYTES && part.length) flush(); part.push(rec); size += bytes; }
  flush();
  return { files, families: index, latest: { files: latestFiles, n: newest.length, since } };
}

export function writePile(outDir, files, indexJson, extras = {}) {
  rmSync(join(outDir, 'offers'), { recursive: true, force: true });
  mkdirSync(join(outDir, 'offers'), { recursive: true });
  for (const [name, content] of Object.entries(files)) writeFileSync(join(outDir, name), content);
  writeFileSync(join(outDir, 'index.json'), JSON.stringify(indexJson));
  for (const [name, content] of Object.entries(extras)) writeFileSync(join(outDir, name), content);
}
