// ➤ The store: what every source gave the last time it was read, one file per source under
// ➤ builder/state/adverts/<group>/<key>.json, written to a scratch file and renamed over the
// ➤ old one. The crawler writes it, the publisher reads it, and neither needs the other to be
// ➤ running. Adverts are kept as the adapters yield them (RawOffer), not as records, so a
// ➤ change in the catalogues or the gate costs no network.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'fs';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileAtomic } from 'argus/server-bot/fs-atomic.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
export const STORE = join(ROOT, 'builder', 'state', 'adverts');

// ➤ A key becomes a file name: letters, digits and a few marks survive; anything else is a
// ➤ hash, so two keys never land on the same file (a Workday slug carries a slash).
export function fileNameFor(key) {
  const plain = String(key).toLowerCase();
  const safe = plain.replace(/[^a-z0-9._~-]/g, '_').slice(0, 100);
  return safe === plain ? `${safe}.json` : `${safe}~${createHash('sha1').update(String(key)).digest('hex').slice(0, 8)}.json`;
}
export const sourcePath = (group, key) => join(STORE, String(group).replace(/[^a-z0-9-]/gi, '_'), fileNameFor(key));

export const emptySource = (group, key, kind = 'board') => ({ v: 1, group, key, kind, pass: null, resolved: {}, pages: {}, adverts: [] });

export function loadSource(group, key) {
  try { return JSON.parse(readFileSync(sourcePath(group, key), 'utf8')); } catch { return emptySource(group, key); }
}

export function saveSource(data) {
  const p = sourcePath(data.group, data.key);
  mkdirSync(dirname(p), { recursive: true });
  writeFileAtomic(p, JSON.stringify(data));
  return p;
}

export function dropSource(group, key) {
  try { rmSync(sourcePath(group, key)); return true; } catch { return false; }
}

// ➤ Every source in the store, one at a time: the publisher reads a thousand files without
// ➤ ever holding more than one in memory.
export function* eachSource(groups = null) {
  if (!existsSync(STORE)) return;
  for (const group of readdirSync(STORE)) {
    if (groups && !groups.includes(group)) continue;
    const dir = join(STORE, group);
    let names;
    try { names = readdirSync(dir); } catch { continue; }
    for (const name of names) {
      if (!name.endsWith('.json')) continue;
      try { yield JSON.parse(readFileSync(join(dir, name), 'utf8')); } catch { /* a file being written, or damaged: the next pass rewrites it */ }
    }
  }
}

// ➤ How much the store holds, without parsing it: for the daily line and the shrink guard.
export function storeSize() {
  let files = 0, bytes = 0;
  if (!existsSync(STORE)) return { files, bytes };
  for (const group of readdirSync(STORE)) {
    let names;
    try { names = readdirSync(join(STORE, group)); } catch { continue; }
    for (const name of names) { if (!name.endsWith('.json')) continue; files++; try { bytes += statSync(join(STORE, group, name)).size; } catch { /* gone */ } }
  }
  return { files, bytes };
}

// ➤ A scratch file left behind by a process that was killed mid-write.
export function sweepTemps() {
  let swept = 0;
  if (!existsSync(STORE)) return swept;
  for (const group of readdirSync(STORE)) {
    let names;
    try { names = readdirSync(join(STORE, group)); } catch { continue; }
    for (const name of names) if (name.endsWith('.tmp')) { try { rmSync(join(STORE, group, name)); swept++; } catch { /* gone */ } }
  }
  return swept;
}
