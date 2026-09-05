// ➤ The title translator against a stand-in for Google's answer shape: cache, hints,
// ➤ English left alone, a rate limit that stops the asking.
import { harness } from 'argus/server-bot/test-harness.mjs';
import { translateTitles, askTranslator } from '../builder/translate.mjs';

const { ok, eq, done } = harness('translate');

// ➤ Google's shape: [[["translated","original",…]], null, "src"].
const answers = { 'Ingeniero mecánico': ['Mechanical engineer', 'es'], 'Maskiningenjör': ['Mechanical engineer', 'sv'], 'Project Engineer': ['Project Engineer', 'en'] };
const calls = [];
const fake = async url => {
  const u = new URL(url);
  const q = u.searchParams.get('q'); calls.push([q, u.searchParams.get('sl')]);
  if (q === 'LIMIT') return { status: 429, ok: false };
  const a = answers[q];
  return { status: 200, ok: true, json: async () => [[[a ? a[0] : q, q]], null, a ? a[1] : 'und'] };
};

{
  const cache = {};
  const recs = [{ t: 'Ingeniero mecánico', tl: 'es' }, { t: 'Maskiningenjör', tl: 'sv' }, { t: 'Project Engineer', tl: '' }, { t: 'Naval Architect', tl: 'en' }, { t: 'Ingeniero mecánico', tl: 'es' }];
  const r = await translateTitles(recs, { cache, fetchImpl: fake, gapMs: 0 });
  eq([recs[0].te, recs[1].te], ['Mechanical engineer', 'Mechanical engineer'], 'Spanish and Swedish titles get their English');
  ok(!('te' in recs[2]), 'an English title answered as English is left alone');
  ok(!('te' in recs[3]), 'a title the source says is English is not even asked');
  eq(recs[4].te, 'Mechanical engineer', 'the repeat gets it from the cache');
  eq([r.asked, r.fromCache, r.translated], [3, 1, 3], 'three questions, one cache hit, three translations');
  eq(calls[0][1], 'es', 'the source language is the hint when known');
  eq(calls[2][1], 'auto', 'auto when it is not');
  eq(Object.keys(cache).length, 3, 'the cache holds one entry per distinct title and hint');
}
{
  const cache = {};
  const recs = [{ t: 'LIMIT', tl: 'fr' }, { t: 'Ingeniero mecánico', tl: 'es' }];
  const r = await translateTitles(recs, { cache, fetchImpl: fake, gapMs: 0 });
  ok(r.limited && !('te' in recs[1]), 'a 429 stops the asking for the rest of the build');
}
{
  const cache = {};
  const recs = Array.from({ length: 5 }, (_, i) => ({ t: `Titulo ${i}`, tl: 'es' }));
  const r = await translateTitles(recs, { cache, fetchImpl: fake, gapMs: 0, maxNew: 2 });
  eq(r.asked, 2, 'no more than maxNew new questions per build');
}
{
  const r = await askTranslator('Ingeniero mecánico', 'es', fake);
  eq(r, { text: 'Mechanical engineer', src: 'es' }, 'one question, parsed');
}

done();
