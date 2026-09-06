// ➤ Latvia: the State Employment Agency's current vacancies (CC0 on data.gov.lv, no key).
// ➤ A CSV published daily under a dated name, found through the portal's catalogue. It
// ➤ carries no occupation code and no advert text, only the title, a sector, the address,
// ➤ the dates and the link, so the title decides, read in Latvian and English.
import { getJson, getText } from '../http.mjs';

export const id = 'nva';
export const kind = 'feed';
export const licence = {
  name: 'Nodarbinātības valsts aģentūra, vakances (data.gov.lv)', short: 'NVA', url: 'https://data.gov.lv/dati/lv/dataset/vakances',
  licence: 'CC0 1.0', credit: 'Avots: Nodarbinātības valsts aģentūra', needsKey: false,
};

const CATALOGUE = 'https://data.gov.lv/dati/api/3/action/package_show?id=vakances';

// ➤ A plain CSV reader: quoted fields, doubled quotes, line breaks inside quotes.
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  const s = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else quoted = false; } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.length > 1 || r[0]);
}

// ➤ "Stadiona iela 10, Ozolnieki, Ozolnieku pag., Jelgavas nov." → Ozolnieki: the last part
// ➤ that is not a parish (pag.) or a municipality (nov.).
export function cityOf(place) {
  const parts = String(place || '').split(',').map(s => s.trim()).filter(Boolean);
  while (parts.length > 1 && /\b(?:nov|pag)\.?$/i.test(parts[parts.length - 1])) parts.pop();
  return parts.length ? parts[parts.length - 1] : '';
}

export function parseNva(csv) {
  const rows = parseCsv(csv);
  const head = rows.shift() || [];
  const col = name => head.indexOf(name);
  const [iId, iDate, iTitle, iSector, iDeadline, iPlace, iUrl] = ['Vakances_Nr', 'Aktualizacijas_datums', 'Vakances_nosaukums', 'Vakances_kategorija', 'Pieteiksanas_termins', 'Vieta', 'Vakances_paplasinats_apraksts'].map(col);
  return rows.map(r => {
    const url = String(r[iUrl] || '').trim();
    if (!/^https?:\/\//.test(url)) return null;
    const place = String(r[iPlace] || '').trim();
    const city = cityOf(place);
    return {
      source: id, sourceId: String(r[iId] || '').trim(),
      title: String(r[iTitle] || '').trim(), company: '',
      location: [place, 'Latvia'].filter(Boolean).join(', '), country: 'lv', city,
      url, description: String(r[iSector] || '').trim(),
      posted: String(r[iDate] || '').slice(0, 10), expires: String(r[iDeadline] || '').slice(0, 10), codes: {}, lang: 'lv',
    };
  }).filter(Boolean);
}

// ➤ The newest CSV named in the catalogue, then the file itself.
export async function* fetchAll(ctx) {
  const pkg = await getJson(CATALOGUE, { gapMs: 0 });
  const csv = (pkg.result?.resources || []).filter(r => /csv/i.test(r.format || '') && r.url).sort((a, b) => String(b.last_modified || '').localeCompare(String(a.last_modified || '')))[0];
  if (!csv) throw new Error('no CSV in the NVA catalogue entry');
  const rows = parseNva(await getText(csv.url, { gapMs: 0 }));
  ctx.log(`nva: ${rows.length} (${csv.url.split('/').pop()})`);
  for (const r of rows) yield r;
}
