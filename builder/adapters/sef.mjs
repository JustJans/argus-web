// ➤ Region of Murcia: the regional employment service's open offers, a JSON on the region's
// ➤ open-data portal (reuse for any purpose under Spain's Law 37/2007, the source cited; no
// ➤ key). Title, an HTML body, the municipality and the dates; no occupation code, so the
// ➤ title decides.
import { getJson } from '../http.mjs';
import { text as plain } from './boards.mjs';
import { isoDay } from './lanbide.mjs';
import { titleCase } from './feinaactiva.mjs';

export const id = 'sef';
export const kind = 'feed';
export const licence = {
  name: 'Servicio Regional de Empleo y Formación, Región de Murcia', short: 'SEF Murcia', url: 'https://datosabiertos.regiondemurcia.es/dataset/ofertas-de-empleo-activas-en-la-region-de-murcia',
  licence: 'Reuse under Law 37/2007 (Región de Murcia open data), source cited', credit: 'Origen de los datos: Servicio Regional de Empleo y Formación, Región de Murcia', needsKey: false,
};

const URL_JSON = 'https://sefapps.carm.es/sefApps/rest/ofertas/ofertas';

export function parseSef(list) {
  return (Array.isArray(list) ? list : []).filter(o => /^https?:\/\//.test(String(o.urlDetalles || ''))).map(o => {
    const city = titleCase(o.municipio?.municipio || '');
    const province = titleCase(o.municipio?.provincia?.provincia || '');
    const parts = [plain(o.adicionales), o.descNivelProfesional ? `Nivel profesional: ${o.descNivelProfesional}` : '', o.mesesExperiencia ? `Experiencia: ${o.mesesExperiencia} meses` : ''].filter(Boolean);
    return {
      source: id, sourceId: String(o.numeroOferta || ''),
      title: String(o.descripcion || '').trim(), company: '',
      location: [city, province, 'Spain'].filter(Boolean).join(', '), country: 'es', city,
      url: String(o.urlDetalles).trim(), description: parts.join('\n'),
      posted: isoDay(o.fechaDeInicio), expires: isoDay(o.fechaDeFin), codes: {}, lang: 'es',
    };
  });
}

export async function* fetchAll(ctx) {
  const rows = parseSef(await getJson(URL_JSON, { gapMs: 0 }));
  ctx.log(`sef: ${rows.length}`);
  for (const r of rows) yield r;
}
