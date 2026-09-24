// ➤ The title translation: many titles in one request, each title asked once ever, the
// ➤ language named when it is known, Azure's detection sparing the English pass, and the
// ➤ spare translator when Azure does not answer.
import { mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { harness } from 'argus/server-bot/test-harness.mjs';
import { translateTitles, loadCache, saveCache } from '../builder/translate.mjs';

const { ok, eq, done } = harness('translate');

const answers = {
  'Ingeniero mecánico': 'Mechanical engineer', 'Ingeniero de procesos': 'Process engineer',
  'Maskiningenjör': 'Mechanical engineer', 'Charpentier naval': 'Shipwright', 'Ingeniør': 'Engineer',
};
// ➤ The same titles asked in Spanish.
const spanish = { 'Naval Architect': 'Arquitecto naval', 'Maskiningenjör': 'Ingeniero mecánico', 'Project Engineer': 'Ingeniero de proyectos' };
// ➤ What Azure detects when no language is named.
const written = { 'Charpentier naval': 'fr', 'Vedoucí projektu': 'cs' };
const reply = (status, body, headers = {}) => ({ status, ok: status < 300, json: async () => body, headers: { get: n => headers[n.toLowerCase()] ?? null } });

let calls = [];
// ➤ Azure's shape: a POST with the titles as [{Text}], the languages in the address, and an
// ➤ answer per title in the same order, with the detected language when none was named.
const azure = async (url, opts) => {
  const u = new URL(url);
  const from = u.searchParams.get('from'), to = u.searchParams.get('to');
  const texts = JSON.parse(opts.body).map(x => x.Text);
  calls.push({ from, to, texts, key: opts.headers['Ocp-Apim-Subscription-Key'], region: opts.headers['Ocp-Apim-Subscription-Region'] });
  if (texts.includes('LIMIT')) return reply(429, { error: { code: 429001, message: 'too many' } });
  if (texts.includes('SPENT')) return reply(403, { error: { code: 403001, message: 'free quota exceeded' } });
  if (from === 'xx') return reply(400, { error: { code: 400035, message: 'from is not valid' } });
  const table = to === 'es' ? spanish : answers;
  const rows = texts.map(t => ({ ...(from ? {} : { detectedLanguage: { language: written[t] || 'en', score: 1 } }), translations: [{ text: table[t] || t, to }] }));
  return reply(200, rows, { 'x-metered-usage': String(texts.reduce((n, t) => n + t.length, 0)) });
};
// ➤ MyMemory's shape: one title in the address, the answer in responseData.
const withSpare = (table, { spent = false } = {}) => async (url, opts) => {
  if (!url.includes('mymemory')) return azure(url, opts);
  const u = new URL(url);
  calls.push({ spare: u.searchParams.get('q'), de: u.searchParams.get('de') });
  if (spent) return reply(200, { quotaFinished: true });
  return reply(200, { responseData: { translatedText: table[u.searchParams.get('q')] || u.searchParams.get('q') } });
};
const quick = { key: 'k', msAChar: 0 };

{
  calls = [];
  const cache = new Map();
  const recs = [
    { t: 'Ingeniero mecánico', tl: 'es', l: 'Bilbao, Spain' },
    { t: 'Ingeniero de procesos', tl: 'es', l: 'Getafe, Spain' },
    { t: 'Ingeniero mecánico', tl: 'es', l: 'Sevilla, Spain' },
    { t: 'Maskiningenjör', tl: 'sv', l: 'Göteborg, Sweden' },
    { t: 'Naval Architect', tl: 'en', l: '' },
    { t: 'Charpentier naval', tl: '', l: 'Brest, France' },
    { t: 'Project Engineer', tl: '', l: '' },
  ];
  const r = await translateTitles(recs, { ...quick, cache, fetchImpl: azure });
  eq([recs[0].te, recs[1].te, recs[3].te], ['Mechanical engineer', 'Process engineer', 'Mechanical engineer'], 'the foreign titles get their English');
  eq(recs[2].te, 'Mechanical engineer', 'the same title in another town rides on the first answer');
  ok(!('te' in recs[4]), 'a title the source says is English is not even asked');
  eq(recs[5].te, 'Shipwright', "a title with no language named is asked in the country's language");
  ok(!('te' in recs[6]), 'an English title comes back unchanged and stays as it is');
  eq(calls.length, 4, 'one request per language, not one per title');
  eq(calls.map(c => c.from || 'auto').sort(), ['auto', 'es', 'fr', 'sv'], 'each language named, the placeless title left to the detector');
  eq(calls.find(c => c.from === 'es').texts, ['Ingeniero mecánico', 'Ingeniero de procesos'], 'both Spanish titles travel in the same request');
  eq([r.asked, r.requests, r.translated], [5, 4, 5], 'five titles asked in four requests, five records in English');
  eq(r.used, ['Ingeniero mecánico', 'Ingeniero de procesos', 'Maskiningenjör', 'Charpentier naval', 'Project Engineer'].join('').length, "the characters Azure counted are added up");
  eq(cache.get('Project Engineer'), '', 'a title with nothing to translate is remembered as such');
  ok(calls.every(c => c.key === 'k' && c.region === undefined), 'the key travels in its header, and a global resource sends no region');
}
{
  // ➤ The Spanish pass first: what Azure detects on the way spares the English pass.
  calls = [];
  const detected = new Map(), inEnglish = new Map();
  const recs = [{ t: 'Naval Architect', tl: 'en', l: '' }, { t: 'Maskiningenjör', tl: 'sv', l: 'Göteborg, Sweden' }, { t: 'Ingeniero mecánico', tl: 'es', l: 'Bilbao, Spain' }, { t: 'Project Engineer', tl: '', l: '' }];
  const r = await translateTitles(recs, { ...quick, target: 'es', field: 'ts', cache: new Map(), detected, fetchImpl: azure });
  eq([recs[0].ts, recs[1].ts, 'ts' in recs[2], recs[3].ts, 'te' in recs[0]], ['Arquitecto naval', 'Ingeniero mecánico', false, 'Ingeniero de proyectos', false], 'English and Swedish titles get their Spanish, a Spanish one is left alone, and the English field is not touched');
  eq([r.translated, calls.map(c => c.from || 'auto').sort()], [3, ['auto', 'en', 'sv']], 'a title already in Spanish is not even asked');
  eq(detected.get('Project Engineer'), 'en', 'the language Azure detected is kept for the next pass');
  calls = [];
  await translateTitles(recs, { ...quick, cache: inEnglish, detected, fetchImpl: azure });
  ok(!calls.some(c => c.texts.includes('Project Engineer')), 'a title Azure found in English is not asked for English');
  eq(inEnglish.get('Project Engineer'), '', 'and the cache remembers it for the builds to come');
}
{
  // ➤ The point of the cache: a second build asks nothing.
  calls = [];
  const cache = new Map([['Ingeniero mecánico', 'Mechanical engineer'], ['Project Engineer', '']]);
  const recs = [{ t: 'Ingeniero mecánico', tl: 'es', l: 'Bilbao, Spain' }, { t: 'Project Engineer', tl: '', l: '' }];
  const r = await translateTitles(recs, { ...quick, cache, fetchImpl: azure });
  eq([calls.length, r.asked, r.translated, r.fromCache], [0, 0, 1, 2], 'nothing asked, the English comes from the cache');
}
{
  calls = [];
  const cache = new Map();
  const recs = [{ t: 'LIMIT', tl: 'cs', l: 'Praha, Czechia' }, { t: 'Ingeniero mecánico', tl: 'es', l: 'Bilbao, Spain' }];
  const r = await translateTitles(recs, { ...quick, cache, fetchImpl: withSpare({}, { spent: true }) });
  ok(r.limited && r.stopped === 'Azure asks for a rest' && !('te' in recs[1]), 'a 429 stops the asking for the rest of the build');
  eq(cache.size, 0, 'and nothing wrong is cached');
}
{
  // ➤ The month's free characters spent: the spare picks up what it can, with the contact address.
  calls = [];
  const recs = [{ t: 'SPENT', tl: 'cs', l: 'Praha, Czechia' }, { t: 'Vedoucí projektu', tl: 'cs', l: 'Praha, Czechia' }];
  const r = await translateTitles(recs, { ...quick, cache: new Map(), fetchImpl: withSpare({ 'Vedoucí projektu': 'Project manager' }), spareEmail: 'jobs@example.org' });
  eq(recs[1].te, 'Project manager', 'with Azure spent for the month, the spare answers');
  eq([r.stopped, r.spare], ["Azure's free characters for this month are spent", 2], 'the build says why Azure stopped and how many the spare took');
  ok(calls.filter(c => c.spare).every(c => c.de === 'jobs@example.org'), 'the spare is given the contact address that raises its daily quota');
}
{
  calls = [];
  const recs = [{ t: 'Vedoucí projektu', tl: 'cs', l: 'Praha, Czechia' }];
  const r = await translateTitles(recs, { ...quick, key: '', cache: new Map(), fetchImpl: withSpare({ 'Vedoucí projektu': 'Project manager' }) });
  eq([recs[0].te, r.stopped, calls.some(c => c.texts)], ['Project manager', 'no Azure key', false], 'without a key Azure is not asked and the spare answers');
}
{
  calls = [];
  const bad = async (url, opts) => (url.includes('mymemory') ? reply(200, { quotaFinished: true }) : (calls.push(url), reply(401, { error: { code: 401000, message: 'credentials' } })));
  const r = await translateTitles([{ t: 'Ingeniør', tl: 'no', l: '' }], { ...quick, cache: new Map(), fetchImpl: bad });
  eq([r.stopped, calls.length], ['the Azure key is missing or wrong', 1], 'a wrong key stops Azure after one request');
}
{
  calls = [];
  const recs = [{ t: 'Ingeniør', tl: 'no', l: '' }, { t: 'Charpentier naval', tl: 'xx', l: '' }];
  await translateTitles(recs, { ...quick, cache: new Map(), fetchImpl: azure });
  eq(calls.map(c => c.from), ['nb', 'xx', null], 'Norwegian is asked as "nb", and a language Azure does not know is asked again for it to detect');
  eq([recs[0].te, recs[1].te], ['Engineer', 'Shipwright'], 'both answered');
}
{
  calls = [];
  const recs = Array.from({ length: 120 }, (_, i) => ({ t: `Titulo ${i}`, tl: 'es', l: 'Spain' }));
  const r = await translateTitles(recs, { ...quick, cache: new Map(), fetchImpl: azure, maxNew: 50 });
  ok(r.asked <= 100 && r.requests === 1, 'the build stops asking once it has had its fill of new titles');
}
{
  // ➤ Each request waits for the characters the last one carried.
  calls = [];
  const recs = Array.from({ length: 150 }, (_, i) => ({ t: `Titulo ${i}`, tl: 'es', l: 'Spain' }));
  const started = Date.now();
  await translateTitles(recs, { key: 'k', msAChar: 0.05, cache: new Map(), fetchImpl: azure });
  const first = calls[0].texts.join('').length;
  ok(calls.length === 2 && Date.now() - started >= first * 0.05 - 5, 'the second request waits its turn');
  calls = [];
  await translateTitles([{ t: 'Ingeniør', tl: 'no', l: '' }], { ...quick, region: 'westeurope', cache: new Map(), fetchImpl: azure });
  eq(calls[0].region, 'westeurope', 'a regional resource sends its region');
}
{
  const dir = join(tmpdir(), `argus-web-tcache-${process.pid}`);
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const p = join(dir, 'translations.json');
  const cache = new Map([['Ingeniero mecánico', 'Mechanical engineer'], ['Project Engineer', '']]);
  saveCache(p, cache);
  eq([...loadCache(p)], [...cache], 'the cache survives a round trip through the disk');
  eq(loadCache(join(dir, 'missing.json')).size, 0, 'no file yet: an empty cache, not a crash');
  rmSync(dir, { recursive: true, force: true });
}

done();
