// ➤ Lithuania: the Employment Service's vacancies through the state open-data API
// ➤ (data.gov.lt, CC BY 4.0, no key). Every vacancy carries a LPK occupation code whose first
// ➤ four digits are its ISCO-08 unit group, so the API is asked only for today's live
// ➤ vacancies in the vertical's minor groups: the gate is the source's own classification.
// ➤ Employer contacts, which the data also holds, are never asked for.
import { getJson } from '../http.mjs';

export const id = 'uzt';
export const kind = 'feed';
export const licence = {
  name: 'Užimtumo tarnyba, laisvos darbo vietos (data.gov.lt)', short: 'Užimtumo tarnyba', url: 'https://data.gov.lt/datasets/2894/',
  licence: 'CC BY 4.0', credit: 'Šaltinis: Užimtumo tarnyba prie LR SADM, per data.gov.lt', needsKey: false,
};

const API = 'https://get.data.gov.lt/datasets/gov/uzt/ldv/Vieta';
const FIELDS = ['darbo_vietos_id', 'profesijos_kodas', 'profesijos_pareigybes_pav', 'darbdavys', 'darbo_vietos_adresas', 'darbo_aprasymas_lt', 'reik_darbo_patirtis', 'reik_kompetencijos_lt', 'reik_gebejimai', 'reik_issilavinimo_pav', 'ikelimo_data', 'galioja_nuo', 'galioja_iki'];
const PAGE = 'https://uzt.lt/laisvos-darbo-vietos/436/p1/skelbimas/';

// ➤ "Savanorių pr. 176C, Vilnius, Lietuva" → Vilnius: the last part before the country.
export function cityOf(address) {
  const parts = String(address || '').split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length && /^lietuva$/i.test(parts[parts.length - 1])) parts.pop();
  return parts.length ? parts[parts.length - 1].replace(/\s+\d{5}$/, '') : '';
}

export function toRaw(r) {
  const city = cityOf(r.darbo_vietos_adresas);
  const text = [r.darbo_aprasymas_lt, r.reik_darbo_patirtis, r.reik_kompetencijos_lt, r.reik_gebejimai, r.reik_issilavinimo_pav].map(s => String(s || '').trim()).filter(Boolean).join('\n');
  return {
    source: id, sourceId: String(r.darbo_vietos_id || ''),
    title: String(r.profesijos_pareigybes_pav || '').trim(), company: String(r.darbdavys || '').trim(),
    location: [city, 'Lithuania'].filter(Boolean).join(', '), country: 'lt', city,
    url: `${PAGE}${r.darbo_vietos_id}`, description: text,
    posted: String(r.ikelimo_data || r.galioja_nuo || '').slice(0, 10), expires: String(r.galioja_iki || '').slice(0, 10),
    codes: { isco: String(r.profesijos_kodas || '') }, lang: 'lt',
  };
}

// ➤ One query per minor group of the vertical (the first three digits of the codes).
export async function* fetchAll(ctx) {
  const minors = [...new Set((ctx.iscoUnits || []).map(u => String(u).slice(0, 3)))];
  for (const m of minors) {
    const url = `${API}?ar_aktuali_siandien="1"&profesijos_kodas.startswith("${m}")&limit(2000)&select(${FIELDS.join(',')})`;
    const rows = (await getJson(url, { gapMs: 300 }))._data || [];
    ctx.log(`uzt ${m}: ${rows.length}`);
    for (const r of rows) if (r.darbo_vietos_id) yield toRaw(r);
  }
}
