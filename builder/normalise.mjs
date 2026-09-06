// ➤ From a source's RawOffer to the record the site serves: a stable id, the country and
// ➤ city read off the location, the two excerpts, the years the text demands, and the
// ➤ families the gate assigned. Nothing personal, nothing longer than 640 characters of text.
import { createHash } from 'crypto';
import { fold } from 'argus/server-bot/text.mjs';
import { extractRequiredYears } from 'argus/server-bot/requirements.mjs';
import { normalizeLocation } from 'argus/server-bot/scan.mjs';
import { cleanTitle } from 'argus/server-bot/notify.mjs';
import { snippet, requirements } from './excerpt.mjs';
import { requiredDegrees, requiredLanguages } from './screens.mjs';

// ➤ The address without its campaign tail, trailing slash or fragment: what makes two
// ➤ sightings of the same advert compare equal. Not Argus's normUrl, on purpose: that one
// ➤ drops the whole query, and Lanbide's adverts are told apart ONLY by a query parameter
// ➤ (IDRG=…), so here only the known tracking parameters go. A fragment that is a route
// ➤ ("#/pub/vakances/4621", the whole address of a single-page portal) stays; any other goes.
const TRACKING = /^(utm_.*|gclid|fbclid|msclkid|clickid|click_id|campaign_id|source|ref)$/i;
export function normUrl(u) {
  let url;
  try { url = new URL(String(u || '').trim()); } catch { return String(u || '').trim(); }
  for (const k of [...url.searchParams.keys()]) if (TRACKING.test(k)) url.searchParams.delete(k);
  if (!url.hash.startsWith('#/')) url.hash = '';
  return url.toString().replace(/\?$/, '').replace(/\/$/, '');
}

export function idFor(url) {
  return createHash('sha256').update(normUrl(url)).digest('base64url').slice(0, 8);
}

// ➤ Countries outside Europe that company boards name most, so their adverts are told apart
// ➤ from adverts whose country is merely unstated. A two-letter code ending the location
// ➤ that is not a European country counts too ("Sherbrooke, QC, CA").
const FAR = { us: ['united states', 'usa', 'u s a'], ca: ['canada'], au: ['australia'], nz: ['new zealand'], cn: ['china'], in: ['india'], jp: ['japan'], kr: ['korea', 'south korea'], sg: ['singapore'], tw: ['taiwan'], th: ['thailand'], my: ['malaysia'], id: ['indonesia'], vn: ['vietnam'], ph: ['philippines'], br: ['brazil', 'brasil'], mx: ['mexico'], ar: ['argentina'], cl: ['chile'], co: ['colombia'], pe: ['peru'], za: ['south africa'], eg: ['egypt'], ma: ['morocco'], ng: ['nigeria'], ke: ['kenya'], ae: ['united arab emirates', 'uae', 'dubai'], sa: ['saudi arabia'], qa: ['qatar'], il: ['israel'], kz: ['kazakhstan'], pk: ['pakistan'] };

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
  const city = raw.split(',')[0].trim().slice(0, 40);
  for (const [iso, names] of Object.entries(FAR)) if (names.some(n => new RegExp(`(?:^|[^a-z0-9])${n}(?![a-z0-9])`).test(f))) return { cc: iso, city };
  const last = raw.split(',').pop().trim();
  if (/^[A-Z]{2}$/.test(last) && !compiled.some(c => c.iso === last.toLowerCase())) return { cc: last.toLowerCase(), city };
  return { cc: '', city };
}

function cityIn(raw, c) {
  const f = fold(raw);
  for (const city of c.cities) if (new RegExp(`(?:^|[^a-z0-9])${fold(city).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`).test(f)) return city;
  const first = raw.split(',')[0].trim();
  return /^[A-Z]{2}$/.test(first) || fold(first) === fold(c.name) ? '' : first.slice(0, 40);
}

// ➤ E-mail addresses and phone numbers go before anything is excerpted: some feeds carry the
// ➤ contact person in the advert text, and the site keeps nothing personal.
export const withoutContacts = s => String(s || '').replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, ' ').replace(/(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?){2,4}\d{2,4}(?!\d)/g, m => (m.replace(/\D/g, '').length >= 9 ? ' ' : m));

// ➤ The record itself. `families` come from the gate; `source` is the adapter's id;
// ➤ `screens`, when given, adds the degree families and languages the text demands.
export function toRecord(raw, families, compiledCountries, screens = null) {
  const place = raw.country ? { cc: raw.country, city: raw.city || cityIn(raw.location || '', compiledCountries.find(c => c.iso === raw.country) || { cities: [], name: '' }) } : placeOf(raw.location, compiledCountries);
  if (raw.remote && !place.cc) place.cc = 'xx';
  const text = withoutContacts(raw.description);
  const years = extractRequiredYears(`${raw.title || ''}. ${text}`);
  // ➤ The title and the location cleaned the way the bot cleans them before showing them.
  const rec = {
    id: idFor(raw.url),
    t: cleanTitle(String(raw.title || '').replace(/\s+/g, ' ').trim()).slice(0, 140),
    c: String(raw.company || '').replace(/\s+/g, ' ').trim().slice(0, 80),
    l: normalizeLocation(String(raw.location || '').replace(/\s+/g, ' ').trim()).slice(0, 120),
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
