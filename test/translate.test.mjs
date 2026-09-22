// ➤ The title translation: many titles in one request, each title asked once ever, the
// ➤ language named when it is known, and a rate limit that stops the build's asking.
import { mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { harness } from 'argus/server-bot/test-harness.mjs';
import { translateTitles, loadCache, saveCache } from '../builder/translate.mjs';

const { ok, eq, done } = harness('translate');

// ➤ Google's two shapes: with a named language a list of strings, with "auto" a list of
// ➤ [text, the language it detected].
const answers = {
  'Ingeniero mecánico': 'Mechanical engineer', 'Ingeniero de procesos': 'Process engineer',
  'Maskiningenjör': 'Mechanical engineer', 'Charpentier naval': 'Shipwright',
};
// ➤ The same titles asked in Spanish.
const spanish = { 'Naval Architect': 'Arquitecto naval', 'Maskiningenjör': 'Ingeniero mecánico' };
let calls = [];
const fake = async url => {
  const u = new URL(url);
  const q = u.searchParams.getAll('q'), sl = u.searchParams.get('sl');
  calls.push({ sl, q });
  if (q.includes('LIMIT')) return { status: 429, ok: false, json: async () => [] };
  const table = u.searchParams.get('tl') === 'es' ? spanish : answers;
  if (sl === 'auto') return { status: 200, ok: true, json: async () => q.map(t => [table[t] || t, table[t] ? 'xx' : 'en']) };
  return { status: 200, ok: true, json: async () => q.map(t => table[t] || t) };
};

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
  const r = await translateTitles(recs, { cache, fetchImpl: fake, gapMs: 0 });
  eq([recs[0].te, recs[1].te, recs[3].te], ['Mechanical engineer', 'Process engineer', 'Mechanical engineer'], 'the foreign titles get their English');
  eq(recs[2].te, 'Mechanical engineer', 'the same title in another town rides on the first answer');
  ok(!('te' in recs[4]), 'a title the source says is English is not even asked');
  eq(recs[5].te, 'Shipwright', "a title with no language named is asked in the country's language");
  ok(!('te' in recs[6]), 'an English title comes back unchanged and stays as it is');
  eq(calls.length, 4, 'one request per language, not one per title');
  eq(calls.map(c => c.sl).sort(), ['auto', 'es', 'fr', 'sv'], 'each language named, the placeless title left to the detector');
  eq(calls.find(c => c.sl === 'es').q, ['Ingeniero mecánico', 'Ingeniero de procesos'], 'both Spanish titles travel in the same request');
  eq([r.asked, r.requests, r.translated], [5, 4, 5], 'five titles asked in four requests, five records in English');
  eq(cache.get('Project Engineer'), '', 'a title with nothing to translate is remembered as such');
}
{
  // ➤ The Spanish site's titles: the same asking, into Spanish, kept as ts.
  calls = [];
  const recs = [{ t: 'Naval Architect', tl: 'en', l: '' }, { t: 'Maskiningenjör', tl: 'sv', l: 'Göteborg, Sweden' }, { t: 'Ingeniero mecánico', tl: 'es', l: 'Bilbao, Spain' }];
  const r = await translateTitles(recs, { target: 'es', field: 'ts', cache: new Map(), fetchImpl: fake, gapMs: 0 });
  eq([recs[0].ts, recs[1].ts, 'ts' in recs[2], 'te' in recs[0]], ['Arquitecto naval', 'Ingeniero mecánico', false, false], 'English and Swedish titles get their Spanish, a Spanish one is left alone, and the English field is not touched');
  eq([r.translated, calls.map(c => c.sl).sort()], [2, ['en', 'sv']], 'a title already in Spanish is not even asked');
}
{
  // ➤ The point of the cache: a second build asks nothing.
  calls = [];
  const cache = new Map([['Ingeniero mecánico', 'Mechanical engineer'], ['Project Engineer', '']]);
  const recs = [{ t: 'Ingeniero mecánico', tl: 'es', l: 'Bilbao, Spain' }, { t: 'Project Engineer', tl: '', l: '' }];
  const r = await translateTitles(recs, { cache, fetchImpl: fake, gapMs: 0 });
  eq([calls.length, r.asked, r.translated, r.fromCache], [0, 0, 1, 2], 'nothing asked, the English comes from the cache');
}
{
  calls = [];
  const cache = new Map();
  const recs = [{ t: 'LIMIT', tl: 'cs', l: 'Praha, Czechia' }, { t: 'Ingeniero mecánico', tl: 'es', l: 'Bilbao, Spain' }];
  const r = await translateTitles(recs, { cache, fetchImpl: fake, gapMs: 0 });
  ok(r.limited && !('te' in recs[1]), 'a 429 stops the asking for the rest of the build');
  eq(cache.size, 0, 'and nothing wrong is cached');
}
{
  // ➤ Google shut its door on this machine: the spare picks up what it can.
  calls = [];
  const spare = { 'Vedoucí projektu': 'Project manager' };
  const withSpare = async url => {
    if (url.includes('mymemory')) {
      const q = new URL(url).searchParams.get('q');
      calls.push({ spare: q });
      return { status: 200, ok: true, json: async () => ({ responseData: { translatedText: spare[q] || q } }) };
    }
    calls.push({ google: true });
    return { status: 429, ok: false, json: async () => [] };
  };
  const cache = new Map();
  const recs = [{ t: 'Vedoucí projektu', tl: 'cs', l: 'Praha, Czechia' }, { t: 'Neznámý titul', tl: 'cs', l: 'Brno, Czechia' }];
  const r = await translateTitles(recs, { cache, fetchImpl: withSpare, gapMs: 0 });
  eq(recs[0].te, 'Project manager', 'with the first translator shut, the spare answers');
  ok(!('te' in recs[1]), 'a title the spare returns unchanged stays as it is');
  eq([r.limited, r.spare], [true, 2], 'the build says the first was shut and how many the spare took');
}
{
  calls = [];
  const cache = new Map();
  const recs = Array.from({ length: 120 }, (_, i) => ({ t: `Titulo ${i}`, tl: 'es', l: 'Spain' }));
  const r = await translateTitles(recs, { cache, fetchImpl: fake, gapMs: 0, maxNew: 50 });
  ok(r.asked <= 80 && r.requests <= 2, 'the build stops asking once it has had its fill of new titles');
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
