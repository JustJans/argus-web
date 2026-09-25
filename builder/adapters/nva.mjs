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

// ➤ The gross pay in euros, which NVA shows with no period ("Alga bruto 2300 - 2600 EUR").
// ➤ Latvia's minimum monthly wage for full-time work is €780 (2026): on a full-time vacancy a
// ➤ figure of at least that is a month's, and one under €50 can only be an hour's. Figures in
// ➤ between, and part-time ones, are not read.
const MINIMUM_MONTHLY_WAGE = 780;
export function nvaPay(from, to, workload) {
  const low = Number(from) || 0, high = Number(to) || low;
  if (!low || !/vesela/i.test(String(workload || ''))) return null;
  const period = low >= MINIMUM_MONTHLY_WAGE ? 'month' : high < 50 ? 'hour' : '';
  return period ? { min: low, max: high, currency: 'EUR', period } : null;
}

export function parseNva(csv) {
  const rows = parseCsv(csv);
  const head = rows.shift() || [];
  const col = name => head.indexOf(name);
  const names = ['Vakances_Nr', 'Aktualizacijas_datums', 'Vakances_nosaukums', 'Vakances_kategorija', 'Pieteiksanas_termins', 'Vieta', 'Vakances_paplasinats_apraksts', 'Alga_no', 'Alga_lidz', 'Slodzes_tips'];
  // ➤ A column the file no longer has is a changed format: said, not read as empty fields.
  const missing = names.filter(n => col(n) < 0);
  if (missing.length) throw new Error(`NVA's file has no ${missing.join(', ')}`);
  const [iId, iDate, iTitle, iSector, iDeadline, iPlace, iUrl, iFrom, iTo, iLoad] = names.map(col);
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
      pay: nvaPay(r[iFrom], r[iTo], r[iLoad]),
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
