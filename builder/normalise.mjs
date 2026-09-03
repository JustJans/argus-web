// ➤ From a source's RawOffer to the record the site serves: a stable id, the country and
// ➤ city read off the location, the two excerpts, the years the text demands, and the
// ➤ families the gate assigned. Nothing personal, nothing longer than 640 characters of text.
import { createHash } from 'crypto';
import { fold } from 'argus/server-bot/text.mjs';
import { extractRequiredYears } from 'argus/server-bot/requirements.mjs';
import { snippet, requirements } from './excerpt.mjs';
import { requiredDegrees, requiredLanguages } from './screens.mjs';

// ➤ The address without its campaign tail, trailing slash or fragment: what makes two
// ➤ sightings of the same advert compare equal.
const TRACKING = /^(utm_.*|gclid|fbclid|msclkid|clickid|click_id|campaign_id|source|ref)$/i;
export function normUrl(u) {
  let url;
  try { url = new URL(String(u || '').trim()); } catch { return String(u || '').trim(); }
  for (const k of [...url.searchParams.keys()]) if (TRACKING.test(k)) url.searchParams.delete(k);
  url.hash = '';
  return url.toString().replace(/\?$/, '').replace(/\/$/, '');
}

export function idFor(url) {
  return createHash('sha256').update(normUrl(url)).digest('base64url').slice(0, 8);
}

// ➤ Country and city from a free-text location, against the countries catalogue: an ISO
// ➤ code as its own word, a country name or alias, or a known city. "Remote" is 'xx'.
export function compileCountries(countries) {
  const word = s => `(?:^|[^a-z0-9])${fold(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`;
  return countries.map(c => ({
    iso: c.iso, name: c.name,
    nameRe: new RegExp([c.name, ...(c.aliases || [])].map(word).join('|')),
    cityRe: (c.cities || []).length ? new RegExp((c.cities || []).map(word).join('|')) : null,
    cities: c.cities || [],
  }));
}

export function placeOf(location, compiled) {
  const raw = String(location || '').trim();
  const f = fold(raw);
  if (!raw) return { cc: '', city: '' };
  if (/(?:^|[^a-z])remote(?![a-z])|home ?office|teletrabajo|télétravail|homeoffice|thuiswerk|distans/.test(f)) return { cc: 'xx', city: '' };
  const isoHit = raw.match(/(?:^|[\s,(])([A-Z]{2})(?=$|[\s,)])/g);
  const codes = new Set((isoHit || []).map(s => s.replace(/[^A-Z]/g, '').toLowerCase()));
  for (const c of compiled) {
    if (c.nameRe.test(f) || codes.has(c.iso)) return { cc: c.iso, city: cityIn(raw, c) };
  }
  for (const c of compiled) if (c.cityRe && c.cityRe.test(f)) return { cc: c.iso, city: cityIn(raw, c) };
  return { cc: '', city: raw.split(',')[0].trim().slice(0, 40) };
}

function cityIn(raw, c) {
  const f = fold(raw);
  for (const city of c.cities) if (new RegExp(`(?:^|[^a-z0-9])${fold(city).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`).test(f)) return city;
  const first = raw.split(',')[0].trim();
  return /^[A-Z]{2}$/.test(first) || fold(first) === fold(c.name) ? '' : first.slice(0, 40);
}

// ➤ The record itself. `families` come from the gate; `source` is the adapter's id;
// ➤ `screens`, when given, adds the degree families and languages the text demands.
export function toRecord(raw, families, compiledCountries, screens = null) {
  const place = raw.country ? { cc: raw.country, city: raw.city || cityIn(raw.location || '', compiledCountries.find(c => c.iso === raw.country) || { cities: [], name: '' }) } : placeOf(raw.location, compiledCountries);
  if (raw.remote && !place.cc) place.cc = 'xx';
  const text = String(raw.description || '');
  const years = extractRequiredYears(`${raw.title || ''}. ${text}`);
  const rec = {
    id: idFor(raw.url),
    t: String(raw.title || '').replace(/\s+/g, ' ').trim().slice(0, 140),
    c: String(raw.company || '').replace(/\s+/g, ' ').trim().slice(0, 80),
    l: String(raw.location || '').replace(/\s+/g, ' ').trim().slice(0, 120),
    cc: place.cc, ci: place.city,
    d: raw.posted || '',
    u: normUrl(raw.url),
    s: raw.source,
    f: families,
    sn: snippet(text),
    rq: requirements(text),
  };
  const k = raw.codes?.isco ? String(raw.codes.isco).slice(0, 4) : raw.codes?.ssyk ? `ssyk:${raw.codes.ssyk}` : '';
  if (k) rec.k = k;
  if (Number.isFinite(years) && years > 0) rec.y = years;
  if (raw.lang) rec.tl = raw.lang;
  if (raw.expires) rec.x = raw.expires;
  if (screens) {
    const dg = requiredDegrees(text, screens);
    const lg = requiredLanguages(text, screens);
    if (dg.length) rec.dg = dg;
    if (lg.length) rec.lg = lg;
  }
  return rec;
}
