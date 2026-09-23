// ➤ The profile code ("plate"): a visitor's search profile packed into a short string that
// ➤ lives after the # of the address, so it never reaches a server. Catalogue choices are
// ➤ bit positions and indices (the catalogues only ever grow, so a code keeps meaning);
// ➤ free words travel as short UTF-8 strings. A checksum rejects a mistyped code. Pure:
// ➤ the same file runs in the browser and under Node's tests.

// ➤ Version 4 (2026-09-23): the work modes wanted and the pay (a yearly minimum in thousands of
// ➤ euros, and whether to keep only the offers that state pay). Version 3 (2026-09-23):
// ➤ specialties inside the families (ESCO's occupations), a town and a distance around it, and
// ➤ more posted windows. Codes of versions 2 and 3 read as they always did; a version-1 code
// ➤ named families that no longer exist and is refused with a message to make a new one.
export const VERSION = 4;
const FAMILY_BYTES = 8, LANGUAGE_BYTES = 2, DEGREE_BYTES = 4;
export const MAX_YEARS_STEPS = [null, 1, 2, 3, 5, 7, 10, 15];   // ➤ 3 bits
export const LEVELS = ['any', 'junior', 'mid', 'senior'];         // ➤ 2 bits
export const HIGHEST = ['none', 'bachelor', 'master', 'phd'];     // ➤ 2 bits
export const POSTED_STEPS = [0, 1, 3, 7, 30, 90];                 // ➤ 3 bits of the flags: posted within n days, 0 = any time
const POSTED_V2 = [0, 7, 30];
const MAX_FREE = 8;
const MAX_TERM_BYTES = 24;
export const RADIUS_KM = [5, 10, 25, 50, 100];                     // ➤ around the town, as job sites offer it
export const MODES = ['onsite', 'hybrid', 'remote'];               // ➤ bits 4-6 of the flags; bit 7: only offers that state pay
const MAX_PAY_THOUSANDS = 999;
const MAX_PLACE_BYTES = 60;

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
export function toBase64url(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
    out += B64[n >> 18] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : '') + (i + 2 < bytes.length ? B64[n & 63] : '');
  }
  return out;
}
// ➤ Strict, as RFC 4648 (3.5) allows: the bits left over after the last byte must be zero, so
// ➤ a changed last character cannot slip through as the same code.
export function fromBase64url(s) {
  const clean = String(s || '').replace(/[^A-Za-z0-9\-_]/g, '');
  const out = [];
  let buf = 0, bits = 0;
  for (const ch of clean) {
    buf = ((buf << 6) | B64.indexOf(ch)) & 0xffff; bits += 6;
    if (bits >= 8) { bits -= 8; out.push((buf >> bits) & 255); }
  }
  if (bits >= 6 || buf & ((1 << bits) - 1)) throw new Error('code does not check out (a character is wrong or missing)');
  return Uint8Array.from(out);
}

// ➤ CRC-16/CCITT-FALSE: two bytes that catch a typo anywhere in the code.
export function crc16(bytes) {
  let crc = 0xffff;
  for (const b of bytes) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

class Writer {
  constructor() { this.bytes = []; }
  byte(b) { this.bytes.push(b & 255); }
  varint(n) { let v = Math.max(0, Math.floor(n)); do { let b = v & 127; v >>>= 7; if (v) b |= 128; this.byte(b); } while (v); }
  // ➤ A set of catalogue choices as a bitfield of n bytes: position p of the catalogue is
  // ➤ bit (p mod 8) of byte (p div 8). Positions beyond the field are left out.
  bits(ids, catalogue, n) { const b = new Array(n).fill(0); for (const id of ids || []) { const p = catalogue.indexOf(id); if (p >= 0 && p < n * 8) b[p >> 3] |= 1 << (p & 7); } for (const x of b) this.byte(x); }
  string(s, max = MAX_TERM_BYTES) { let b = enc.encode(String(s).trim()); if (b.length > max) b = b.slice(0, max); this.varint(b.length); for (const x of b) this.byte(x); }
  int16(v) { const x = Math.round(v) & 0xffff; this.byte(x >> 8); this.byte(x); }
}
class Reader {
  constructor(bytes) { this.b = bytes; this.i = 0; }
  byte() { if (this.i >= this.b.length) throw new Error('code too short'); return this.b[this.i++]; }
  varint() { let v = 0, shift = 0, b; do { b = this.byte(); v |= (b & 127) << shift; shift += 7; if (shift > 28) throw new Error('bad number'); } while (b & 128); return v >>> 0; }
  // ➤ The ids whose bit is set; a bit for a position the catalogue does not have yet is ignored.
  bits(catalogue, n) { const b = []; for (let i = 0; i < n; i++) b.push(this.byte()); return catalogue.filter((_, p) => p < n * 8 && (b[p >> 3] & (1 << (p & 7)))); }
  string(max = MAX_TERM_BYTES) { const n = this.varint(); if (n > max) throw new Error('bad word'); const s = this.b.slice(this.i, this.i + n); if (s.length < n) throw new Error('code too short'); this.i += n; return dec.decode(s); }
  int16() { const x = (this.byte() << 8) | this.byte(); return x >= 0x8000 ? x - 0x10000 : x; }
}

const cleanTerms = list => [...new Set((list || []).map(s => String(s).trim()).filter(Boolean))].slice(0, MAX_FREE);

// ➤ A complete, tidy profile from whatever object came in. Sets (families, languages,
// ➤ degrees, vetoes, specialties) are sorted: their order carries no meaning and a code
// ➤ decodes them in catalogue order anyway. Countries keep their order: it is the priority.
// ➤ A specialty is an ESCO occupation, whose code starts with its family's ("2144.1.14" is a
// ➤ naval architect, a mechanical engineer, 2144); the place is a town and a distance,
// ➤ { cc, name, lat, lon, km }. Each brings its family or country along.
const sorted = list => [...new Set(list || [])].sort();
export const familyOfSpecialty = code => String(code).slice(0, 4);
const validPlace = p => (p && /^[a-z]{2}$/.test(p.cc) && String(p.name || '').trim() && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180
  ? { cc: p.cc, name: String(p.name).trim(), lat: Math.round(p.lat * 100) / 100, lon: Math.round(p.lon * 100) / 100, km: RADIUS_KM.includes(p.km) ? p.km : 25 }
  : null);
export function normaliseProfile(p = {}) {
  const specialties = sorted(p.specialties);
  const place = validPlace(p.place);
  return {
    v: VERSION,
    families: sorted([...(p.families || []), ...specialties.map(familyOfSpecialty)]),
    specialties,
    countries: [...new Set([...(p.countries || []), ...(place ? [place.cc] : [])])],
    place,
    languages: sorted(p.languages),
    degrees: sorted(p.degrees),
    level: LEVELS.includes(p.level) ? p.level : 'any',
    maxYears: MAX_YEARS_STEPS.includes(p.maxYears) ? p.maxYears : null,
    highest: HIGHEST.includes(p.highest) ? p.highest : 'none',
    remote: !!p.remote,
    posted: POSTED_STEPS.includes(p.posted) ? p.posted : 0,
    modes: sorted((p.modes || []).filter(m => MODES.includes(m))),
    minPay: Number.isInteger(p.minPay) && p.minPay > 0 ? Math.min(p.minPay, MAX_PAY_THOUSANDS) : 0,
    payStated: !!p.payStated,
    roles: cleanTerms(p.roles),
    vetoes: sorted(p.vetoes),
    noWords: cleanTerms(p.noWords),
  };
}
// ➤ The profile a country of the front page's table opens: that country alone. The row of
// ➤ offers with no fixed country ('xx', not a country of the catalogue) opens remote work anywhere.
export const countryProfile = cc => normaliseProfile(cc === 'xx' ? { modes: ['remote'] } : { countries: [cc] });

// ➤ Nothing set at all: the page shows its front instead of a list.
const EMPTY = JSON.stringify(normaliseProfile({}));
export const isEmptyProfile = p => JSON.stringify(normaliseProfile(p)) === EMPTY;

// ➤ cats: { families: [ids], countries: [isos], languages: [codes], degrees: [ids], vetoes: [ids] }
// ➤ in catalogue order — the same arrays the decoder must be given.
export function encodeProfile(profile, cats) {
  const p = normaliseProfile(profile);
  const w = new Writer();
  w.byte(VERSION);
  const modeBits = MODES.reduce((bits, m, i) => bits | (p.modes.includes(m) ? 1 << (4 + i) : 0), 0);
  w.byte((p.remote ? 1 : 0) | (POSTED_STEPS.indexOf(p.posted) << 1) | modeBits | (p.payStated ? 128 : 0));
  w.bits(p.families, cats.families, FAMILY_BYTES);
  w.byte((LEVELS.indexOf(p.level) << 6) | (MAX_YEARS_STEPS.indexOf(p.maxYears) << 3) | HIGHEST.indexOf(p.highest));
  w.bits(p.languages, cats.languages, LANGUAGE_BYTES);
  w.bits(p.degrees, cats.degrees, DEGREE_BYTES);
  const countries = p.countries.map(c => cats.countries.indexOf(c)).filter(i => i >= 0);
  w.varint(countries.length); for (const i of countries) w.varint(i);
  w.varint(p.roles.length); for (const r of p.roles) w.string(r);
  const vetoes = p.vetoes.map(v => cats.vetoes.indexOf(v)).filter(i => i >= 0);
  w.varint(vetoes.length); for (const i of vetoes) w.varint(i);
  w.varint(p.noWords.length); for (const r of p.noWords) w.string(r);
  const specialties = p.specialties.map(c => (cats.occupations || []).indexOf(c)).filter(i => i >= 0);
  w.varint(specialties.length); for (const i of specialties) w.varint(i);
  // ➤ The place: its country's position plus one (0 = no place), name, coordinates in hundredths
  // ➤ of a degree, and the distance's step.
  const pc = p.place ? cats.countries.indexOf(p.place.cc) : -1;
  if (pc < 0) w.varint(0);
  else { w.varint(pc + 1); w.string(p.place.name, MAX_PLACE_BYTES); w.int16(p.place.lat * 100); w.int16(p.place.lon * 100); w.byte(RADIUS_KM.indexOf(p.place.km)); }
  w.varint(p.minPay);
  const crc = crc16(w.bytes);
  w.byte(crc >> 8); w.byte(crc);
  return toBase64url(Uint8Array.from(w.bytes));
}

export function decodeProfile(code, cats) {
  const bytes = fromBase64url(code);
  if (bytes.length < 4) throw new Error('code too short');
  const body = bytes.slice(0, bytes.length - 2);
  const given = (bytes[bytes.length - 2] << 8) | bytes[bytes.length - 1];
  if (crc16(body) !== given) throw new Error('code does not check out (a character is wrong or missing)');
  const r = new Reader(body);
  const version = r.byte();
  if (version < 2) throw new Error('this code is from an earlier version of the page; make a new one');
  if (version > VERSION) throw new Error('this code is from a newer version of the page');
  const flags = r.byte();
  const families = r.bits(cats.families, FAMILY_BYTES);
  const packed = r.byte();
  const level = LEVELS[packed >> 6];
  const maxYears = MAX_YEARS_STEPS[(packed >> 3) & 7];
  const highest = HIGHEST[packed & 3];
  const languages = r.bits(cats.languages, LANGUAGE_BYTES);
  const degrees = r.bits(cats.degrees, DEGREE_BYTES);
  const nc = r.varint(); const countries = []; for (let i = 0; i < nc; i++) { const idx = r.varint(); if (cats.countries[idx]) countries.push(cats.countries[idx]); }
  const nr = r.varint(); const roles = []; for (let i = 0; i < nr; i++) roles.push(r.string());
  const nv = r.varint(); const vetoes = []; for (let i = 0; i < nv; i++) { const idx = r.varint(); if (cats.vetoes[idx]) vetoes.push(cats.vetoes[idx]); }
  const nn = r.varint(); const noWords = []; for (let i = 0; i < nn; i++) noWords.push(r.string());
  // ➤ Version 2 ends here, with two bits of posted window.
  const specialties = [];
  let place = null;
  if (version >= 3) {
    const ns = r.varint(); for (let i = 0; i < ns; i++) { const idx = r.varint(); if (cats.occupations?.[idx]) specialties.push(cats.occupations[idx]); }
    const pc = r.varint();
    if (pc) { const cc = cats.countries[pc - 1]; const name = r.string(MAX_PLACE_BYTES); const lat = r.int16() / 100; const lon = r.int16() / 100; place = { cc, name, lat, lon, km: RADIUS_KM[r.byte()] }; }
  }
  // ➤ Version 3 ends here.
  const modes = version >= 4 ? MODES.filter((_, i) => flags & (1 << (4 + i))) : [];
  const payStated = version >= 4 && !!(flags & 128);
  const minPay = version >= 4 ? r.varint() : 0;
  const posted = version === 2 ? POSTED_V2[(flags >> 1) & 3] : POSTED_STEPS[(flags >> 1) & 7];
  return normaliseProfile({ families, specialties, countries, place, languages, degrees, level, maxYears, highest, remote: !!(flags & 1), posted: posted || 0, modes, minPay, payStated, roles, vetoes, noWords });
}

// ➤ The catalogue id lists in order, from the loaded catalogue files.
export function catalogueIds(catalogues) {
  return {
    families: catalogues.families.families.map(f => f.id),
    countries: catalogues.countries.countries.map(c => c.iso),
    languages: catalogues.languages.languages.map(l => l.code),
    degrees: catalogues.degrees.degrees.map(d => d.id),
    vetoes: catalogues.vetoes.vetoes.map(v => v.id),
    occupations: (catalogues.occupations?.occupations || []).map(o => o.code),
  };
}
