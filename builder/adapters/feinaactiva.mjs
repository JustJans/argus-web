// ➤ Catalonia: the Feina Activa XML of the Generalitat's employment service (open data,
// ➤ attribution required, no key). One <ad> per vacancy, in Catalan or Spanish; the
// ➤ description is the content plus the experience, requirements and studies lines.
import { getText } from '../http.mjs';
import { isoDay } from './lanbide.mjs';

export const id = 'feinaactiva';
export const kind = 'feed';
export const licence = {
  name: 'Feina Activa, Generalitat de Catalunya', short: 'Feina Activa', url: 'https://datos.gob.es/en/catalogo/a09002970-portal-feina-activa-ofertas-de-empleo',
  licence: 'Open data of the Generalitat de Catalunya (attribution)', credit: 'Font: Feina Activa, Generalitat de Catalunya', needsKey: false,
};

const URL_XML = 'https://feinaactiva.gencat.cat/api/offers/offers-xml';

const unescape = s => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').trim();
const tag = (block, name) => unescape((block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`)) || [])[1]);
export const titleCase = s => String(s || '').toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (m, p, ch) => p + ch.toUpperCase());

// ➤ Its page reads "Salari mensual brut des de 1416 fins a 1550": a month, gross, in euros. The
// ➤ working-hours field says how long a part-time week is: "Jornada parcial (20 hores - jornada
// ➤ setmanal)" a week, "(3 hores - jornada diaria)" a day of a five-day week.
export function payOf(min, max, workingHours) {
  if (!min && !max) return null;
  const h = String(workingHours || '').match(/\((\d+(?:[.,]\d+)?) hores - jornada (setmanal|diaria)\)/);
  const hours = h ? Number(h[1].replace(',', '.')) * (h[2] === 'diaria' ? 5 : 1) : 0;
  return { min, max, currency: 'EUR', period: 'month', hoursPerWeek: hours, partTime: /parcial/i.test(workingHours || '') };
}

export function parseFeinaActiva(xml) {
  const ads = String(xml || '').match(/<ad>[\s\S]*?<\/ad>/g) || [];
  return ads.map(block => {
    const status = tag(block, 'status');
    if (status && status !== 'PUBLISHED') return null;
    const city = titleCase(tag(block, 'city'));
    const region = titleCase(tag(block, 'region'));
    const parts = [tag(block, 'content'), tag(block, 'experience'), tag(block, 'requirements'), tag(block, 'studies')].filter(Boolean);
    return {
      source: id, sourceId: tag(block, 'id'),
      title: tag(block, 'title'), company: tag(block, 'company'),
      location: [city, region, 'Spain'].filter(Boolean).join(', '), country: 'es', city,
      url: tag(block, 'url'), description: parts.join('\n'),
      posted: isoDay(tag(block, 'date')), expires: '', codes: {}, lang: 'ca',
      pay: payOf(tag(block, 'salaryMin'), tag(block, 'salaryMax'), tag(block, 'workingHours')),
    };
  }).filter(r => r && r.url);
}

export async function* fetchAll(ctx) {
  const xml = await getText(URL_XML, { gapMs: 0 });
  const rows = parseFeinaActiva(xml);
  ctx.log(`feinaactiva: ${rows.length}`);
  for (const r of rows) yield r;
}
