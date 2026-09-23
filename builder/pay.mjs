// ➤ Pay, as the employer states it: the figures, the currency and the period, from the fields
// ➤ each source gives (never read out of free text, never estimated). The same pay in euros a
// ➤ year feeds the filter. Anything unsure is refused. docs/research/salary.md has the reasons
// ➤ and the sources.

// ➤ The period's letter, from the words the sources use: schema.org (HOUR…YEAR), Lever
// ➤ ("per-year-salary"), Ashby ("1 YEAR"), Recruitee ("year"), Personio ("yearly"). Anything
// ➤ else, "bi-week-salary" or no period at all, is not read.
const PERIODS = {
  hour: 'h', hourly: 'h', 'per-hour-wage': 'h', '1 hour': 'h',
  day: 'd', daily: 'd', 'per-day-wage': 'd', '1 day': 'd',
  week: 'w', weekly: 'w', 'per-week-salary': 'w', '1 week': 'w',
  month: 'm', monthly: 'm', 'per-month-salary': 'm', '1 month': 'm',
  year: 'y', yearly: 'y', annual: 'y', annually: 'y', 'per-year-salary': 'y', '1 year': 'y',
};
export const periodOf = word => PERIODS[String(word || '').trim().toLowerCase()] || '';

// ➤ Units a year for a full-time job: Google Cloud Talent Solution's defaults.
export const PER_YEAR = { h: 2080, d: 260, w: 52, m: 12, y: 1 };

// ➤ An ISO 4217 code: the code itself, or one of the two signs that name one currency only.
const SIGNS = { '€': 'EUR', '£': 'GBP' };
export function currencyOf(value) {
  const s = String(value || '').trim();
  return SIGNS[s] || (/^[a-z]{3}$/i.test(s) ? s.toUpperCase() : '');
}

// ➤ A number as a machine writes it (80000, "3772.00"); "45,000", "45.000,00" or a negative
// ➤ figure is not read, rather than read wrong.
function amount(value) {
  const s = typeof value === 'number' ? String(value) : String(value ?? '').trim();
  return /^\d+(?:\.\d+)?$/.test(s) ? Math.round(Number(s) * 100) / 100 : 0;
}

// ➤ A believable year in euros, and how many times its bottom the top of a range may be. The
// ➤ bounds catch the usual slip in both directions: a month's pay labelled as a year's falls
// ➤ under €7,000 (about the lowest EU minimum wage for a year's full-time work), and a year's
// ➤ pay of €25,000 or more labelled as a month's rises over €300,000.
const YEAR_EUR = { least: 7000, most: 300000 };
const WIDEST_RANGE = 5;
// ➤ A full-time week; a part-time pay with its weekly hours stated is checked as the full-time
// ➤ pay it amounts to (3,500 koruna a month for four hours a week is a real pay). Fewer than
// ➤ four hours a week is taken for a slip of the source's form.
const FULL_TIME_HOURS = 40;
const FEWEST_HOURS = 4;

// ➤ { min, max, currency, period } as the source gives them → { p, pa } or null.
// ➤ p: [min, max, currency, period letter], the advert's own figures, for the card.
// ➤ pa: the top of the range in euros a year, for the filter. An hourly pay uses the weekly
// ➤ hours when the source states them; a part-time advert paid by the hour, day or week with
// ➤ no hours stated gets no yearly figure. `rates` are the ECB's, units for one euro.
export function readPay({ min, max, currency, period, hoursPerWeek = 0, partTime = false } = {}, rates = { EUR: 1 }) {
  const cur = currencyOf(currency);
  const per = periodOf(period);
  let low = amount(min), high = amount(max);
  if (!low) low = high;
  if (!high) high = low;
  if (!low || !cur || !per) return null;
  if (high < low || high > low * WIDEST_RANGE) return null;
  const rate = cur === 'EUR' ? 1 : rates[cur];
  if (!rate) return null;
  const hours = hoursPerWeek >= FEWEST_HOURS && hoursPerWeek <= 60 ? hoursPerWeek : 0;
  const units = per === 'h' && hours ? hours * 52 : PER_YEAR[per];
  const yearLow = low * units / rate, yearHigh = high * units / rate;
  const fullTime = hours ? Math.max(1, FULL_TIME_HOURS / hours) : 1;
  if (yearLow * fullTime < YEAR_EUR.least || yearHigh > YEAR_EUR.most) return null;
  const pay = { p: [low, high, cur, per] };
  if (!(partTime && 'hdw'.includes(per)) || (per === 'h' && hours)) pay.pa = Math.round(yearHigh / 100) * 100;
  return pay;
}
