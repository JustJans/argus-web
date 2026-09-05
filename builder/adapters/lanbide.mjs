// ➤ Basque Country: Lanbide's open-data JSON of the vacancies it manages (CC BY 4.0, no
// ➤ key). The file is served in Windows-1252, so it is decoded by hand; the position text
// ➤ (desPuesto) is the advert body, and there is no employer name in the data.
import { get } from '../http.mjs';

export const id = 'lanbide';
export const kind = 'feed';
export const licence = {
  name: 'Lanbide, Servicio Vasco de Empleo', short: 'Lanbide', url: 'https://datos.gob.es/en/catalogo/a16003011-ofertas-de-empleo-de-lanbide1',
  licence: 'CC BY 4.0', credit: 'Fuente: Lanbide - Servicio Vasco de Empleo', needsKey: false,
};

const URL_JSON = 'https://apps.lanbide.euskadi.net/apps/OF_OFERTAS_ODE_JSON';

// ➤ "dd/mm/yyyy" or ISO → "yyyy-mm-dd".
export function isoDay(v) {
  const s = String(v || '').trim();
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
}

export function parseLanbide(buffer) {
  let text = Buffer.from(buffer).toString('utf8');
  if (text.includes('�')) text = new TextDecoder('windows-1252').decode(Buffer.from(buffer));
  const data = JSON.parse(text);
  const rows = Array.isArray(data) ? data : (Object.values(data).find(Array.isArray) || []);
  return rows.filter(r => r.url).map(r => {
    const place = [r.municipio, r.provincia].map(s => String(s || '').trim()).filter(Boolean);
    return {
      source: id, sourceId: String(r.codigo || ''),
      title: String(r.desEmpleo || '').trim(), company: '',
      location: [...place, 'Spain'].join(', '), country: 'es', city: String(r.municipio || '').trim(),
      url: String(r.url).trim(), description: String(r.desPuesto || ''),
      posted: isoDay(r.fecPub) || isoDay(r.fecMod), expires: '', codes: {}, lang: 'es',
    };
  });
}

export async function* fetchAll(ctx) {
  const res = await get(URL_JSON, { gapMs: 0 });
  if (!res.ok) throw new Error(`${res.status} from Lanbide`);
  const rows = parseLanbide(await res.arrayBuffer());
  ctx.log(`lanbide: ${rows.length}`);
  for (const r of rows) yield r;
}
