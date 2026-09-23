// ➤ Pay: the reader of the figures each source states (builder/pay.mjs), the ECB's rates, and
// ➤ every source's own pay fields as they arrive (shapes seen on 23 September 2026).
import { harness } from 'argus/server-bot/test-harness.mjs';
import { readPay, periodOf, currencyOf } from '../builder/pay.mjs';
import { parseEcbRates, exchangeRates } from '../builder/exchange-rates.mjs';
import { ATS } from '../builder/adapters/boards.mjs';
import { salaryOf, jobPostings } from '../builder/lib/crawl.mjs';
import { toRaw as mpsvRaw } from '../builder/adapters/mpsv.mjs';
import { toRaw as uztRaw } from '../builder/adapters/uzt.mjs';
import { nvaPay } from '../builder/adapters/nva.mjs';
import { parseFeinaActiva, payOf as catalanPay } from '../builder/adapters/feinaactiva.mjs';

const { eq, ok, done } = harness('pay');
const RATES = { EUR: 1, GBP: 0.8578, USD: 1.1463, CZK: 24.344, PLN: 4.348 };

// ── Periods and currencies ──────────────────────────────────────────────
eq(['YEAR', 'per-year-salary', '1 YEAR', 'yearly', 'annual'].map(periodOf), ['y', 'y', 'y', 'y', 'y'], 'a year in the words of schema.org, Lever, Ashby and Personio');
eq(['MONTH', 'Monthly', 'per-month-salary', '1 MONTH', 'month'].map(periodOf), ['m', 'm', 'm', 'm', 'm'], 'a month, in any case');
eq(['HOUR', 'per-hour-wage', '1 HOUR', 'hourly', 'DAY', 'per-day-wage', 'WEEK', 'per-week-salary'].map(periodOf), ['h', 'h', 'h', 'h', 'd', 'd', 'w', 'w'], 'an hour, a day, a week');
eq(['bi-week-salary', 'bi-month-salary', '', null, 'per annum please'].map(periodOf), ['', '', '', '', ''], 'anything else is not a period this site reads');
eq(['eur', '€', '£', 'CZK', '$', 'EURO', ''].map(currencyOf), ['EUR', 'EUR', 'GBP', 'CZK', '', '', ''], 'ISO codes and the two signs that name one currency; the dollar sign names several');

// ── Reading a pay ───────────────────────────────────────────────────────
eq(readPay({ min: '3500', max: '4500', currency: 'EUR', period: 'month' }), { p: [3500, 4500, 'EUR', 'm'], pa: 54000 }, 'a monthly range in euros: the card shows it as given, the filter sees the top of a year');
eq(readPay({ min: 45000, max: 55000, currency: 'GBP', period: 'per-year-salary' }, RATES), { p: [45000, 55000, 'GBP', 'y'], pa: 64100 }, 'pounds a year, in euros at the ECB rate');
eq(readPay({ min: 30, max: 34, currency: 'USD', period: '1 HOUR' }, RATES).pa, 61700, 'an hourly pay is 2,080 hours a year');
eq(readPay({ min: 195, max: 195, currency: 'CZK', period: 'hour', hoursPerWeek: 40 }, RATES).pa, 16700, 'an hourly wage with its weekly hours: those hours, 52 weeks');
eq(readPay({ min: 195, currency: 'CZK', period: 'hour', hoursPerWeek: 20 }, RATES).pa, 8300, 'half the hours, half the year');
eq(readPay({ min: 25, max: 30, currency: 'EUR', period: 'hourly', partTime: true }), { p: [25, 30, 'EUR', 'h'] }, 'part-time by the hour: shown, but no year (the hours are unknown)');
eq(readPay({ min: 1200, currency: 'EUR', period: 'month', partTime: true }).pa, 14400, 'part-time by the month: a year is twelve of them');
eq(readPay({ min: 3500, currency: 'CZK', period: 'month', hoursPerWeek: 4 }, RATES), { p: [3500, 3500, 'CZK', 'm'], pa: 1700 }, 'a small pay for four hours a week is checked as the full-time pay it amounts to, and keeps its real year');
eq([readPay({ min: 3500, currency: 'CZK', period: 'month' }, RATES), readPay({ min: 3500, currency: 'CZK', period: 'month', hoursPerWeek: 1 }, RATES)], [null, null], 'without the hours, or with fewer than four, it is too small a year: refused');
eq(readPay({ min: 22, currency: 'EUR', period: 'hour', partTime: true, hoursPerWeek: 20 }).pa, 22900, 'part-time by the hour with its hours: a year after all');
eq(readPay({ max: 60000, currency: 'EUR', period: 'YEAR' }).p, [60000, 60000, 'EUR', 'y'], 'one figure is a point');
eq(readPay({ min: 3000, max: 3000, currency: 'EUR', period: 'YEAR' }), null, 'a month labelled as a year: under the believable year, refused');
eq(readPay({ min: 55000, max: 65000, currency: 'EUR', period: 'MONTH' }), null, 'a year labelled as a month: over it, refused');
eq(readPay({ min: 3500, max: 45000, currency: 'EUR', period: 'month' }), null, 'a range whose top is over five times its bottom mixes periods: refused');
eq(readPay({ min: 60000, max: 50000, currency: 'EUR', period: 'year' }), null, 'a range upside down: refused');
eq(readPay({ min: 50000, currency: 'EUR' }), null, 'no period: refused');
eq(readPay({ min: 50000, period: 'year' }), null, 'no currency: refused');
eq(readPay({ min: 900000, currency: 'RSD', period: 'year' }, RATES), null, 'a currency the ECB does not quote: refused');
eq(readPay({ min: 50000, currency: 'GBP', period: 'year' }), null, 'without the rates, only euros are read');
eq(readPay({ min: '45,000', currency: 'EUR', period: 'year' }), null, 'a number written for people, not machines, is not guessed');
eq(readPay({ min: -5, max: 40000, currency: 'EUR', period: 'year' }).p, [40000, 40000, 'EUR', 'y'], 'a negative figure is no figure');
eq(readPay(), null, 'nothing, nothing');

// ── The ECB's rates ─────────────────────────────────────────────────────
const ecb = "<gesmes:Envelope><Cube><Cube time='2026-09-22'><Cube currency='USD' rate='1.1463'/><Cube currency='CZK' rate='24.344'/><Cube currency='GBP' rate='0.85780'/></Cube></Cube></gesmes:Envelope>";
eq(parseEcbRates(ecb), { day: '2026-09-22', rates: { EUR: 1, USD: 1.1463, CZK: 24.344, GBP: 0.8578 } }, "the ECB's daily file: its day and units for one euro");
eq(parseEcbRates('<html>maintenance</html>'), { day: '', rates: { EUR: 1 } }, 'a page that is not the file: no day, euros only');
const kept = await exchangeRates('does/not/exist.xml', async () => { throw new Error('offline'); });
eq(kept, { day: '', rates: { EUR: 1 } }, 'no network and no file kept: euros only, and the build goes on');

// ── Each source's own fields ────────────────────────────────────────────
const lever = ATS.lever.parse([{ id: 'a', text: 'PLC Engineer', categories: { location: 'Madrid', commitment: 'Full-time' }, hostedUrl: 'https://jobs.lever.co/x/a', createdAt: 1756720000000, descriptionPlain: 'Intro.', lists: [], salaryRange: { min: 40000, max: 48000, currency: 'EUR', interval: 'per-year-salary' } }], 'x', 'Acme');
eq(lever[0].pay, { min: 40000, max: 48000, currency: 'EUR', period: 'per-year-salary', partTime: false }, 'Lever: salaryRange with its interval');
const ashby = job => ATS.ashby.parse({ jobs: [{ id: 'z', title: 'Hardware Engineer', location: 'Berlin', jobUrl: 'https://jobs.ashbyhq.com/x/z', publishedAt: '2026-09-02T00:00:00Z', descriptionPlain: 'Plain.', employmentType: 'FullTime', compensation: { summaryComponents: [{ compensationType: 'EquityPercentage', interval: 'NONE' }, { compensationType: 'Salary', interval: '1 YEAR', currencyCode: 'EUR', minValue: 70000, maxValue: 85000 }] }, ...job }] }, 'x', 'Acme')[0];
eq(ashby({}).pay, { min: 70000, max: 85000, currency: 'EUR', period: '1 YEAR', partTime: false }, 'Ashby: the Salary part of the compensation, not the equity');
eq(ashby({ shouldDisplayCompensationOnJobPostings: false }).pay, null, 'Ashby: not when the employer chose not to show pay');
ok(ATS.ashby.url('acme').endsWith('?includeCompensation=true'), 'Ashby is asked for its compensation');
const recruitee = ATS.recruitee.parse({ offers: [{ id: 5, title: 'Commissioning Engineer', city: 'Amersfoort', country: 'Netherlands', careers_url: 'https://x.recruitee.com/o/c', description: '<p>Body</p>', employment_type_code: 'fulltime_permanent', max_hours: 40, salary: { min: '3500', max: '4500', period: 'month', currency: 'EUR' } }] });
eq(recruitee[0].pay, { min: '3500', max: '4500', currency: 'EUR', period: 'month', hoursPerWeek: 40, partTime: false }, 'Recruitee: salary with its period, and the weekly hours');
const personio = ATS.personio.parse('<workzag-jobs><position><id>77</id><name>Konstrukteur (m/w/d)</name><office>Kiel</office><createdAt>2026-08-29</createdAt><schedule>full-time</schedule><salaryInformation><min>3772.00</min><max>4084.00</max><currencySymbol>€</currencySymbol><currencyCode>EUR</currencyCode><type>monthly</type></salaryInformation><jobDescriptions><jobDescription><name>Aufgaben</name><value><![CDATA[<p>CAD.</p>]]></value></jobDescription></jobDescriptions></position></workzag-jobs>', 'acme');
eq(personio[0].pay, { min: '3772.00', max: '4084.00', currency: 'EUR', period: 'monthly', partTime: false }, 'Personio: salaryInformation');
eq(readPay(personio[0].pay).p, [3772, 4084, 'EUR', 'm'], 'and it reads');
const greenhouse = ATS.greenhouse.parse({ jobs: [{ id: 1, title: 'Naval Architect', location: { name: 'Rotterdam' }, absolute_url: 'https://boards.greenhouse.io/x/jobs/1', updated_at: '2026-09-01T10:00:00Z', content: '&lt;p&gt;Hulls.&lt;/p&gt;', pay_input_ranges: [{ min_cents: 5000000, max_cents: 6000000, currency_type: 'EUR', title: 'Pay Range' }] }] }, 'x', 'Acme');
eq(greenhouse[0].pay, undefined, 'Greenhouse: its ranges carry no period, so none is read');

// ── Employers' pages: the JobPosting block ──────────────────────────────
eq(salaryOf({ baseSalary: { '@type': 'MonetaryAmount', currency: 'EUR', value: { '@type': 'QuantitativeValue', minValue: 50000, maxValue: 60000, unitText: 'YEAR' } }, employmentType: 'FULL_TIME' }), { min: 50000, max: 60000, currency: 'EUR', period: 'YEAR', partTime: false }, "Google's own example shape");
eq(salaryOf({ baseSalary: { currency: 'GBP', value: 42000, unitText: 'YEAR' } }), { min: 42000, max: 42000, currency: 'GBP', period: 'YEAR', partTime: false }, 'a bare number with the period on the salary');
eq(salaryOf({ salaryCurrency: 'PLN', baseSalary: { value: { value: 12000, unitText: 'MONTH' } } }), { min: 12000, max: 12000, currency: 'PLN', period: 'MONTH', partTime: false }, 'the currency on the posting');
eq(salaryOf({ baseSalary: { currency: 'EUR', value: { minValue: 20, maxValue: 25, unitText: 'HOUR' } }, employmentType: ['PART_TIME'] }).partTime, true, 'part-time when the posting says only that');
eq([salaryOf({}), salaryOf({ baseSalary: 'Competitive' }), salaryOf({ baseSalary: { currency: 'EUR' } }), salaryOf({ baseSalary: { currency: 'EUR', value: { minValue: null, maxValue: null, unitText: 'YEAR' } } })], [null, null, null, null], 'no salary, a word, or a salary with no amount (an empty template): nothing');
const page = jobPostings('<script type="application/ld+json">{"@type":"JobPosting","title":"Site Engineer","baseSalary":{"@type":"MonetaryAmount","currency":"EUR","value":{"@type":"QuantitativeValue","minValue":3000,"maxValue":3800,"unitText":"MONTH"}}}</script>', 'https://x.example/1')[0];
eq(readPay(page.pay).p, [3000, 3800, 'EUR', 'm'], 'a page read end to end');

// ── Public services ─────────────────────────────────────────────────────
const cz = { portalId: 1, profeseCzIsco: { id: 'CzIsco/21441' }, pozadovanaProfese: { cs: 'Konstruktér' }, zamestnavatel: { nazev: 'Acme s.r.o.' }, mesicniMzdaOd: 45000, mesicniMzdaDo: 60000, typMzdy: { id: 'TypMzdy/mesic' } };
eq(mpsvRaw(cz).pay, { min: 45000, max: 60000, currency: 'CZK', period: 'month', hoursPerWeek: 0 }, 'Czechia: a monthly wage in koruna');
eq(mpsvRaw({ ...cz, mesicniMzdaOd: 250, mesicniMzdaDo: null, typMzdy: { id: 'TypMzdy/hod' }, pocetHodinTydne: 40 }).pay, { min: 250, max: 250, currency: 'CZK', period: 'hour', hoursPerWeek: 40 }, 'an hourly wage type: the "monthly" fields hold the hour');
eq(mpsvRaw({ ...cz, typMzdy: null }).pay, null, 'no wage type, no pay');
const lt = uztRaw({ darbo_vietos_id: 'DV-1', profesijos_kodas: '214201', profesijos_pareigybes_pav: 'Statybos inžinierius', vid_darbo_uzmokestis: 2600, prelim_darbo_uzmokestis: 2600, maks_darbo_uzmokestis: 3300, valiuta: 'EUR' });
eq(lt.pay, { min: 2600, max: 3300, currency: 'EUR', period: 'month' }, 'Lithuania: the base pay and the top of its range, monthly before taxes');
eq(uztRaw({ darbo_vietos_id: 'DV-2', profesijos_kodas: '214201', profesijos_pareigybes_pav: 'X' }).pay, null, 'no pay fields, no pay');
eq([nvaPay('2300.000', '2600.000', 'Viena vesela slodze'), nvaPay('4.690', '4.690', 'Viena vesela slodze')], [{ min: 2300, max: 2600, currency: 'EUR', period: 'month' }, { min: 4.69, max: 4.69, currency: 'EUR', period: 'hour' }], 'Latvia, full time: over the minimum monthly wage a month, under €50 an hour');
eq([nvaPay('300', '400', 'Viena vesela slodze'), nvaPay('900', '1000', 'Nepilna slodze'), nvaPay('', '', 'Viena vesela slodze')], [null, null, null], 'in between, part time, or empty: not read');
const ca = parseFeinaActiva('<ads><ad><id>FA1</id><url>https://feinaactiva.gencat.cat/search/offers/detail/FA1</url><title>Enginyer</title><status>PUBLISHED</status><salaryMin>1416</salaryMin><salaryMax>1550</salaryMax></ad><ad><id>FA2</id><url>https://feinaactiva.gencat.cat/search/offers/detail/FA2</url><title>Tècnic</title><status>PUBLISHED</status></ad></ads>');
eq(ca.map(r => r.pay), [{ min: '1416', max: '1550', currency: 'EUR', period: 'month', hoursPerWeek: 0, partTime: false }, null], 'Catalonia: a monthly gross range, or nothing');
eq([catalanPay('900', '900', 'Jornada parcial (20 hores - jornada setmanal)'), catalanPay('600', '', 'Jornada parcial matí (3 hores - jornada diaria)')].map(p => [p.hoursPerWeek, p.partTime]), [[20, true], [15, true]], 'and the part-time hours its own field states, a week or a day of five');

done();
