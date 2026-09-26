// ➤ The page's language and what the scripts say in it. The build writes the language into
// ➤ <html lang>: "en" at the root, "es" under es/. The English text is the key, as gettext does,
// ➤ so the code reads in English and a line with no Spanish shows the English, never nothing.
// ➤ Countries, languages and numbers come from the browser's own Intl, in the page's
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
// ➤ Numbers as the site writes them on both pages: a dot between thousands ("97.189", and
// ➤ "6.489" too) and a comma before decimals. Intl lays them out in the page's language (where
// ➤ the currency sign goes); only the two marks are set, and thousands are always grouped
// ➤ (Spanish alone would leave four digits together).
const MARKS = { group: '.', decimal: ',' };
const marked = parts => parts.map(p => MARKS[p.type] ?? p.value).join('');
const plain = new Intl.NumberFormat(lang, { useGrouping: 'always' });
export const number = n => marked(plain.formatToParts(Number(n || 0)));

// ➤ "€3.500–€4.500 a month", "3.500-4.500 € al mes": the pay an offer states, in its own
// ➤ currency and period, written the site's way; cents only when an hourly pay has them.
const PERIOD_TEXT = { y: '{pay} a year', m: '{pay} a month', w: '{pay} a week', d: '{pay} a day', h: '{pay} an hour' };
export function payText([min, max, currency, period]) {
  const cents = period === 'h' && !(Number.isInteger(min) && Number.isInteger(max)) ? 2 : 0;
  let pay;
  try {
    const f = new Intl.NumberFormat(lang, { style: 'currency', currency, minimumFractionDigits: cents, maximumFractionDigits: cents, useGrouping: 'always' });
    pay = min === max ? marked(f.formatToParts(min)) : f.formatRangeToParts ? marked(f.formatRangeToParts(min, max)) : `${marked(f.formatToParts(min))}–${marked(f.formatToParts(max))}`;
  } catch { pay = `${min === max ? number(min) : `${number(min)}–${number(max)}`} ${currency}`; }
  return t(PERIOD_TEXT[period] || '{pay}', { pay });
}
// ➤ Euros a year, for the reasons an offer is left out: "€45.000".
export const euros = n => marked(new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0, useGrouping: 'always' }).formatToParts(n));

// ➤ The three work modes, by the letter the offers carry.
const MODE_TEXT = { o: 'On-site', h: 'Hybrid', r: 'Remote' };
export const workModeLabel = letter => (MODE_TEXT[letter] ? t(MODE_TEXT[letter]) : '');

