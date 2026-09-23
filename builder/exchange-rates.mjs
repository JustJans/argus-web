// ➤ The European Central Bank's euro reference rates, for pay in other currencies: one small
// ➤ XML file each working day. Asked once per build and kept on disk; when the ECB cannot be
// ➤ reached, the file kept last time is read, and with none only pay in euros is read.
import { readFileSync } from 'fs';
import { writeFileAtomic } from 'argus/server-bot/fs-atomic.mjs';
import { getText } from './http.mjs';

export const ECB_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';

// ➤ The file → { day, rates }, rates as units of each currency for one euro.
export function parseEcbRates(xml) {
  const rates = { EUR: 1 };
  for (const m of String(xml || '').matchAll(/currency=['"]([A-Z]{3})['"]\s+rate=['"](\d+(?:\.\d+)?)['"]/g)) rates[m[1]] = Number(m[2]);
  const day = (String(xml || '').match(/time=['"](\d{4}-\d{2}-\d{2})['"]/) || [])[1] || '';
  return { day, rates };
}

export async function exchangeRates(path, fetchText = url => getText(url, { gapMs: 0, tries: 2 })) {
  try {
    const xml = await fetchText(ECB_URL);
    const read = parseEcbRates(xml);
    if (read.day) { writeFileAtomic(path, xml); return read; }
  } catch { /* the file kept last time */ }
  try { return parseEcbRates(readFileSync(path, 'utf8')); } catch { return { day: '', rates: { EUR: 1 } }; }
}
