// ➤ Czechia: every vacancy the Labour Office holds, as the Ministry of Labour publishes it
// ➤ (open data, no key; the national catalogue records no copyright and no database right,
// ➤ so the data is free to reuse). One gzipped JSON for the whole country, refreshed daily.
// ➤ Each vacancy carries a CZ-ISCO code, whose first four digits are its ISCO-08 unit group:
// ➤ the gate is the source's own classification, and only the vertical's rows leave here.
// ➤ Municipalities come as codes and are named through the ministry's codelist. The contact
// ➤ people the file also holds are never read.
import { gunzipSync } from 'zlib';
import { get, getJson } from '../http.mjs';

export const id = 'mpsv';
export const kind = 'feed';
export const licence = {
  name: 'Úřad práce ČR, volná místa (MPSV open data)', short: 'Úřad práce ČR', url: 'https://data.mpsv.cz/web/data/volna-mista-za-celou-cr',
  licence: 'Open data of the Czech Ministry of Labour and Social Affairs (no copyright and no database right claimed, per data.gov.cz)', credit: 'Zdroj: Ministerstvo práce a sociálních věcí, Úřad práce ČR', needsKey: false,
};

const URL_GZ = 'https://data.mpsv.cz/od/soubory/volna-mista/volna-mista.json.gz';
const URL_OBCE = 'https://data.mpsv.cz/od/soubory/ciselniky/obce.json';
const PAGE = 'https://up.gov.cz/volna-mista-v-cr/-/vm/';
// ➤ CZ-ISCO extends ISCO-08 with a fifth digit, and under 2141 it files four occupations
// ➤ ISCO-08 does not count as engineering: logistics specialists (21413), transport
// ➤ specialists (21414), crisis management (21415) and security systems (21416). Out.
const NOT_ENGINEERING = new Set(['21413', '21414', '21415', '21416']);

// ➤ "CzIsco/31152" → "31152"; the same for every coded value in the file.
const codeOf = v => String((v && typeof v === 'object' ? v.id : v) || '').split('/').pop();
const day = v => String(v || '').slice(0, 10);

// ➤ One vacancy → a RawOffer; null when the source marks it not for publishing or when its
// ➤ unit group is outside the vertical. `obce` maps municipality codes to names; `units`
// ➤ is the set of the vertical's ISCO unit groups.
export function toRaw(v, obce = {}, units = null) {
  if (!/^ano/.test(codeOf(v.zverejnovat) || 'ano')) return null;
  const isco = codeOf(v.profeseCzIsco);
  if (NOT_ENGINEERING.has(isco) || (units && !units.has(isco.slice(0, 4)))) return null;
  const site = v.mistoVykonuPrace?.pracoviste?.[0];
  const city = obce[codeOf(site?.adresa?.obec)] || '';
  return {
    source: id, sourceId: String(v.portalId || ''),
    title: String(v.pozadovanaProfese?.cs || '').trim(), company: String(v.zamestnavatel?.nazev || '').trim(),
    location: [city, 'Czechia'].filter(Boolean).join(', '), country: 'cz', city,
    url: `${PAGE}${v.portalId}`, description: String(v.upresnujiciInformace?.cs || ''),
    posted: day(v.datumVlozeni), expires: day(v.expirace), codes: { isco }, lang: 'cs',
  };
}

// ➤ The municipality codelist, "563960" → "Český Dub". Without it the adverts still go out,
// ➤ with the country as their only place.
async function municipalities() {
  try {
    const j = await getJson(URL_OBCE, { gapMs: 0 });
    return Object.fromEntries((j.polozky || []).map(o => [String(o.kod), String(o.nazev?.cs || '')]));
  } catch { return {}; }
}

export async function* fetchAll(ctx) {
  const units = ctx.iscoUnits ? new Set(ctx.iscoUnits) : null;
  const res = await get(URL_GZ, { gapMs: 0 });
  if (!res.ok) throw new Error(`${res.status} from MPSV`);
  // ➤ The server may already have unpacked the file (content-encoding); gunzip only real gzip.
  const buf = Buffer.from(await res.arrayBuffer());
  const rows = JSON.parse((buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf) : buf).toString('utf8')).polozky || [];
  const obce = await municipalities();
  let kept = 0;
  for (const v of rows) {
    const r = toRaw(v, obce, units);
    if (r) { kept++; yield r; }
  }
  ctx.log(`mpsv: ${kept} of ${rows.length} in the vertical`);
}
