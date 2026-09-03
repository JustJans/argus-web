// ➤ The pile on disk: one file per family and country, so a profile code downloads only the
// ➤ parts it named, and an index that says what exists, how big it is, where it came from
// ➤ and under which licence. A shard past 4 MB is split into numbered parts.
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';

const MAX_BYTES = 4 * 1024 * 1024;

export function shardKey(family, cc) { return `${family}-${cc || 'zz'}`; }

// ➤ records → { files: {name: content}, families: index block }
export function buildShards(records, families, generatedAt) {
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
  for (const f of families) index[f.id] = { label: f.label, countries: {} };
  for (const [key, g] of groups) {
    g.offers.sort((a, b) => (b.d || '').localeCompare(a.d || ''));
    const parts = [];
    let part = [], size = 0;
    for (const rec of g.offers) {
      const bytes = JSON.stringify(rec).length + 1;
      if (size + bytes > MAX_BYTES && part.length) { parts.push(part); part = []; size = 0; }
      part.push(rec); size += bytes;
    }
    if (part.length) parts.push(part);
    const names = parts.map((p, i) => `offers/${key}${parts.length > 1 ? `-${i + 1}` : ''}.json`);
    names.forEach((name, i) => { files[name] = JSON.stringify({ v: 1, shard: key, generated_at: generatedAt, offers: parts[i] }); });
    if (!index[g.family]) index[g.family] = { label: g.family, countries: {} };
    index[g.family].countries[g.cc] = { files: names, n: g.offers.length, bytes: names.reduce((s, n) => s + files[n].length, 0) };
  }
  return { files, families: index };
}

export function writePile(outDir, files, indexJson, extras = {}) {
  rmSync(join(outDir, 'offers'), { recursive: true, force: true });
  mkdirSync(join(outDir, 'offers'), { recursive: true });
  for (const [name, content] of Object.entries(files)) writeFileSync(join(outDir, name), content);
  writeFileSync(join(outDir, 'index.json'), JSON.stringify(indexJson));
  for (const [name, content] of Object.entries(extras)) writeFileSync(join(outDir, name), content);
}
