// ➤ The page's language and what the scripts say in it. The build writes the language into
// ➤ <html lang>: "en" at the root, "es" under es/. The English text is the key, as gettext does,
// ➤ so the code reads in English and a line with no Spanish shows the English, never nothing.
// ➤ Countries, languages, numbers and dates come from the browser's own Intl, in the page's
// ➤ language. Under Node (the tests) there is no page, and everything stays English.
export const lang = globalThis.document?.documentElement.lang === 'es' ? 'es' : 'en';
const table = lang === 'es' ? (await import('./es.js')).default.script : {};

// ➤ t('{n} offers', { n: '1,234' }): the line in the page's language, its {names} filled in.
export const t = (text, vars = {}) => (table[text] ?? text).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));

// ➤ A catalogue entry's name: its `es` on the Spanish page, else its `label`.
export const label = entry => (lang === 'es' && entry?.es) || entry?.label || '';

const upper = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const regions = new Intl.DisplayNames([lang], { type: 'region' });
const languages = new Intl.DisplayNames([lang], { type: 'language' });
export const countryLabel = cc => regions.of(cc.toUpperCase()) || cc.toUpperCase();
export const languageLabel = code => upper(languages.of(code) || code);
export const number = n => Number(n || 0).toLocaleString(lang);

// ➤ "€3,500–€4,500 a month", "3500-4500 € al mes": the pay an offer states, in its own currency
// ➤ and period, written the page's way; cents only when an hourly pay has them.
const PERIOD_TEXT = { y: '{pay} a year', m: '{pay} a month', w: '{pay} a week', d: '{pay} a day', h: '{pay} an hour' };
export function payText([min, max, currency, period]) {
  const cents = period === 'h' && !(Number.isInteger(min) && Number.isInteger(max)) ? 2 : 0;
  let pay;
  try {
    const f = new Intl.NumberFormat(lang, { style: 'currency', currency, minimumFractionDigits: cents, maximumFractionDigits: cents });
    pay = min === max ? f.format(min) : f.formatRange ? f.formatRange(min, max) : `${f.format(min)}–${f.format(max)}`;
  } catch { pay = `${min === max ? number(min) : `${number(min)}–${number(max)}`} ${currency}`; }
  return t(PERIOD_TEXT[period] || '{pay}', { pay });
}
// ➤ Euros a year, for the reasons an offer is left out: "€45,000".
export const euros = n => new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

// ➤ The three work modes, by the letter the offers carry.
const MODE_TEXT = { o: 'On-site', h: 'Hybrid', r: 'Remote' };
export const workModeLabel = letter => (MODE_TEXT[letter] ? t(MODE_TEXT[letter]) : '');

// ➤ "3 days ago", "hace 3 días": a day's distance from today, in days up to a month, then months.
const relative = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
export function ago(iso, now = Date.now()) {
  if (!iso) return '';
  const days = Math.round((now - new Date(iso).getTime()) / 864e5);
  if (Number.isNaN(days)) return '';
  return days < 30 ? relative.format(-Math.max(0, days), 'day') : relative.format(-Math.round(days / 30), 'month');
}
