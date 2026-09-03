// ➤ The profile code ("plate"): a visitor's search profile packed into a short string that
// ➤ lives after the # of the address, so it never reaches a server. Catalogue choices are
// ➤ bit positions and indices (the catalogues only ever grow, so a code keeps meaning);
// ➤ free words travel as short UTF-8 strings. A checksum rejects a mistyped code. Pure:
// ➤ the same file runs in the browser and under Node's tests.

export const VERSION = 1;
export const MAX_YEARS_STEPS = [null, 1, 2, 3, 5, 7, 10, 15];   // ➤ 3 bits
export const LEVELS = ['any', 'junior', 'mid', 'senior'];         // ➤ 2 bits
export const HIGHEST = ['none', 'bachelor', 'master', 'phd'];     // ➤ 2 bits
const MAX_FREE = 8;
const MAX_TERM_BYTES = 24;

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
export function toBase64url(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
    out += B64[n >> 18] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : '') + (i + 2 < bytes.length ? B64[n & 63] : '');
  }
  return out;
}
export function fromBase64url(s) {
  const clean = String(s || '').replace(/[^A-Za-z0-9\-_]/g, '');
  const out = [];
  let buf = 0, bits = 0;
  for (const ch of clean) {
    buf = (buf << 6) | B64.indexOf(ch); bits += 6;
    if (bits >= 8) { bits -= 8; out.push((buf >> bits) & 255); }
  }
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
  bits32(mask) { this.byte(mask >>> 24); this.byte(mask >>> 16); this.byte(mask >>> 8); this.byte(mask); }
  bits16(mask) { this.byte(mask >>> 8); this.byte(mask); }
  string(s) { let b = enc.encode(String(s).trim()); if (b.length > MAX_TERM_BYTES) b = b.slice(0, MAX_TERM_BYTES); this.varint(b.length); for (const x of b) this.byte(x); }
}
class Reader {
  constructor(bytes) { this.b = bytes; this.i = 0; }
  byte() { if (this.i >= this.b.length) throw new Error('code too short'); return this.b[this.i++]; }
  varint() { let v = 0, shift = 0, b; do { b = this.byte(); v |= (b & 127) << shift; shift += 7; if (shift > 28) throw new Error('bad number'); } while (b & 128); return v >>> 0; }
  bits32() { return ((this.byte() << 24) | (this.byte() << 16) | (this.byte() << 8) | this.byte()) >>> 0; }
  bits16() { return (this.byte() << 8) | this.byte(); }
  string() { const n = this.varint(); if (n > MAX_TERM_BYTES) throw new Error('bad word'); const s = this.b.slice(this.i, this.i + n); if (s.length < n) throw new Error('code too short'); this.i += n; return dec.decode(s); }
}

const maskOf = (ids, catalogue) => { let m = 0; for (const id of ids || []) { const i = catalogue.indexOf(id); if (i >= 0 && i < 32) m |= (1 << i); } return m >>> 0; };
const idsOf = (mask, catalogue) => catalogue.filter((_, i) => i < 32 && (mask & (1 << i)));
const cleanTerms = list => [...new Set((list || []).map(s => String(s).trim()).filter(Boolean))].slice(0, MAX_FREE);

// ➤ A complete, tidy profile from whatever object came in. Sets (families, languages,
// ➤ degrees, vetoes) are sorted: their order carries no meaning and a code decodes them
// ➤ in catalogue order anyway. Countries keep their order: it is the priority.
const sorted = list => [...new Set(list || [])].sort();
export function normaliseProfile(p = {}) {
  return {
    v: VERSION,
    families: sorted(p.families),
    countries: [...new Set(p.countries || [])],
    languages: sorted(p.languages),
    degrees: sorted(p.degrees),
    level: LEVELS.includes(p.level) ? p.level : 'any',
    maxYears: MAX_YEARS_STEPS.includes(p.maxYears) ? p.maxYears : null,
    highest: HIGHEST.includes(p.highest) ? p.highest : 'none',
    remote: !!p.remote,
    roles: cleanTerms(p.roles),
    vetoes: sorted(p.vetoes),
    noWords: cleanTerms(p.noWords),
  };
}

// ➤ cats: { families: [ids], countries: [isos], languages: [codes], degrees: [ids], vetoes: [ids] }
// ➤ in catalogue order — the same arrays the decoder must be given.
export function encodeProfile(profile, cats) {
  const p = normaliseProfile(profile);
  const w = new Writer();
  w.byte(VERSION);
  w.byte(p.remote ? 1 : 0);
  w.bits32(maskOf(p.families, cats.families));
  w.byte((LEVELS.indexOf(p.level) << 6) | (MAX_YEARS_STEPS.indexOf(p.maxYears) << 3) | HIGHEST.indexOf(p.highest));
  w.bits16(maskOf(p.languages, cats.languages));
  w.bits32(maskOf(p.degrees, cats.degrees));
  const countries = p.countries.map(c => cats.countries.indexOf(c)).filter(i => i >= 0);
  w.varint(countries.length); for (const i of countries) w.varint(i);
  w.varint(p.roles.length); for (const r of p.roles) w.string(r);
  const vetoes = p.vetoes.map(v => cats.vetoes.indexOf(v)).filter(i => i >= 0);
  w.varint(vetoes.length); for (const i of vetoes) w.varint(i);
  w.varint(p.noWords.length); for (const r of p.noWords) w.string(r);
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
  if (version !== VERSION) throw new Error(`code made by version ${version}; this page reads version ${VERSION}`);
  const flags = r.byte();
  const families = idsOf(r.bits32(), cats.families);
  const packed = r.byte();
  const level = LEVELS[packed >> 6];
  const maxYears = MAX_YEARS_STEPS[(packed >> 3) & 7];
  const highest = HIGHEST[packed & 3];
  const languages = idsOf(r.bits16(), cats.languages);
  const degrees = idsOf(r.bits32(), cats.degrees);
  const nc = r.varint(); const countries = []; for (let i = 0; i < nc; i++) { const idx = r.varint(); if (cats.countries[idx]) countries.push(cats.countries[idx]); }
  const nr = r.varint(); const roles = []; for (let i = 0; i < nr; i++) roles.push(r.string());
  const nv = r.varint(); const vetoes = []; for (let i = 0; i < nv; i++) { const idx = r.varint(); if (cats.vetoes[idx]) vetoes.push(cats.vetoes[idx]); }
  const nn = r.varint(); const noWords = []; for (let i = 0; i < nn; i++) noWords.push(r.string());
  return normaliseProfile({ families, countries, languages, degrees, level, maxYears, highest, remote: !!(flags & 1), roles, vetoes, noWords });
}

// ➤ The catalogue id lists in order, from the loaded catalogue files.
export function catalogueIds(catalogues) {
  return {
    families: catalogues.families.families.map(f => f.id),
    countries: catalogues.countries.countries.map(c => c.iso),
    languages: catalogues.languages.languages.map(l => l.code),
    degrees: catalogues.degrees.degrees.map(d => d.id),
    vetoes: catalogues.vetoes.vetoes.map(v => v.id),
  };
}
