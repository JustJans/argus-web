// ➤ The specialties a visitor can pick inside a family: ESCO's occupations under each ISCO unit
// ➤ group of the catalogue ("naval architect", "wind energy engineer", "software tester"),
// ➤ written to catalogues/occupations.json from catalogues/codes/isco.json, with no network.
// ➤ The profile code stores a specialty as its position in that file, so the file only grows:
// ➤ a run keeps every entry it had, in its place, and appends what ESCO added since. The
// ➤ Spanish names come from ESCO's own answers, kept by builder/isco-esco.mjs in
// ➤ builder/state/esco-cache (the gate's lists drop the long gendered names the screen wants).
// ➤   node builder/tools/occupations.mjs
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const OUT = join(ROOT, 'catalogues', 'occupations.json');
const CACHE = join(ROOT, 'builder', 'state', 'esco-cache');
const read = p => JSON.parse(readFileSync(join(ROOT, 'catalogues', p), 'utf8'));

const upper = s => s.charAt(0).toUpperCase() + s.slice(1);
// ➤ ESCO gives Spanish titles in the masculine and the feminine ("ingeniero mecánico",
// ➤ "ingeniera mecánica"); the screen shows both in one ("Ingeniero/a mecánico/a"). A pair that
// ➤ differs in anything but those endings keeps the first.
export function bothGenders(forms) {
  const [m, f] = forms || [];
  if (!m) return '';
  if (!f) return m;
  const a = m.split(' '), b = f.split(' ');
  if (a.length !== b.length) return m;
  const out = [];
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) { out.push(a[i]); continue; }
    if (a[i].endsWith('o') && b[i] === `${a[i].slice(0, -1)}a`) { out.push(`${a[i]}/a`); continue; }
    if (a[i].endsWith('or') && b[i] === `${a[i]}a`) { out.push(`${a[i]}/a`); continue; }
    return m;
  }
  return out.join(' ');
}

// ➤ ESCO's Spanish name for an occupation, both genders in one: "ingeniero especializado en
// ➤ energía eólica/ingeniera especializada en energía eólica" is one pair written with a slash.
export function spanishName(raw) {
  const parts = String(raw || '').split('/').map(p => p.trim()).filter(Boolean);
  if (parts.length === 2 && parts[0].split(' ').length === parts[1].split(' ').length) return bothGenders(parts);
  return String(raw || '').trim();
}
const cachedEs = uri => {
  const id = String(uri).split('/').pop().replace(/[^a-z0-9]+/gi, '_').slice(0, 100);
  for (const name of [`occ_${id}`, `concept_${id}`]) {
    const p = join(CACHE, `${name}.json`);
    if (existsSync(p)) { try { const es = JSON.parse(readFileSync(p, 'utf8'))?.preferredLabel?.es; if (es) return es; } catch { /* a damaged answer */ } }
  }
  return '';
};

// ➤ ESCO's codes sort as numbers part by part: 2144.1.2 before 2144.1.10.
const byCode = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] ?? -1) - (y[i] ?? -1); if (d) return d; } return 0; };

export function buildOccupations(families, isco, previous = []) {
  const fresh = [];
  for (const f of families.families) {
    for (const unit of f.isco || []) {
      for (const o of [...(isco.units?.[unit]?.occupations || [])].sort((a, b) => byCode(a.code, b.code))) {
        fresh.push({ code: o.code, label: upper(o.preferred?.en?.[0] || o.title), es: upper(spanishName(cachedEs(o.uri)) || bothGenders(o.preferred?.es) || bothGenders(o.labels?.es) || o.preferred?.en?.[0] || o.title) });
      }
    }
  }
  const byCodeNow = new Map(fresh.map(o => [o.code, o]));
  // ➤ The entries already published keep their place (and are refreshed where ESCO renamed
  // ➤ them); the new ones go at the end.
  const kept = previous.map(o => byCodeNow.get(o.code) || { ...o, retired: true });
  const known = new Set(previous.map(o => o.code));
  return [...kept, ...fresh.filter(o => !known.has(o.code))];
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')).occupations : [];
  const occupations = buildOccupations(read('families.json'), read('codes/isco.json'), previous);
  const about = "ESCO's occupations under each family (ISCO-08 unit group), the specialties a visitor can pick inside a family. code = ESCO's code, whose first four digits are its family's; label = ESCO's English title; es = the Spanish one, both genders in one. Built by builder/tools/occupations.mjs from codes/isco.json. The position is the index in the profile code. APPEND ONLY: an occupation ESCO drops stays, marked retired.";
  writeFileSync(OUT, `${JSON.stringify({ _about: about, occupations }, null, 1)}\n`);
  console.log(`${occupations.length} occupations (${occupations.length - previous.length} new) → ${OUT}`);
}
