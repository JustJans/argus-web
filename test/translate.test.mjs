// ➤ The title translation around Argus's translateTitle, against a stand-in for Google's
// ➤ answer shape: cache, English left alone, a rate limit that stops the asking.
import { mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { harness } from 'argus/server-bot/test-harness.mjs';
import { translateTitles, loadCache, saveCache } from '../builder/translate.mjs';

const { ok, eq, done } = harness('translate');

// ➤ Google's shape: [[["translated","original",…]], null, "src"].
const answers = { 'Ingeniero mecánico': 'Mechanical engineer', 'Maskiningenjör': 'Mechanical engineer', 'Charpentier naval': 'Shipwright' };
const calls = [];
const fake = async url => {
  const u = new URL(url);
  const q = u.searchParams.get('q'), sl = u.searchParams.get('sl');
  calls.push([q, sl]);
  if (q === 'LIMIT') return { status: 429, ok: false, json: async () => [] };
  // ➤ Like the real one on short French titles: "auto" guesses English and leaves it; told
  // ➤ it is French, it translates.
  if (q === 'Charpentier naval' && sl === 'auto') return { status: 200, ok: true, json: async () => [[[q, q]], null, 'en'] };
  return { status: 200, ok: true, json: async () => [[[answers[q] || q, q]], null, 'x'] };
};

{
  const cache = new Map();
  const recs = [
    { t: 'Ingeniero mecánico', tl: 'es', l: 'Bilbao, Spain' },
    { t: 'Maskiningenjör', tl: 'sv', l: 'Göteborg, Sweden' },
    { t: 'Project Engineer', tl: '', l: 'Rotterdam, Netherlands' },
    { t: 'Naval Architect', tl: 'en', l: '' },
    { t: 'Ingeniero mecánico', tl: 'es', l: 'Bilbao, Spain' },
    { t: 'Charpentier naval', tl: '', l: 'Brest, France' },
  ];
  const r = await translateTitles(recs, { cache, fetchImpl: fake, gapMs: 0 });
  eq([recs[0].te, recs[1].te], ['Mechanical engineer', 'Mechanical engineer'], 'Spanish and Swedish titles get their English');
  ok(!('te' in recs[2]), 'an English title comes back unchanged and stays as it is');
  ok(!('te' in recs[3]), 'a title the source says is English is not even asked');
  eq(recs[4].te, 'Mechanical engineer', 'the repeat gets it from the cache');
  eq(recs[5].te, 'Shipwright', 'the bot\'s second attempt with the country\'s language translates the French title');
  ok(calls.some(([q, sl]) => q === 'Charpentier naval' && sl === 'fr'), 'and that attempt named French');
  eq([r.asked, r.fromCache, r.translated], [4, 1, 4], 'four asked, one from the cache, four translations');
  eq(cache.size, 3, 'only real translations are kept in the cache');
}
{
  const cache = new Map();
  const recs = [{ t: 'LIMIT', tl: 'fr', l: 'Paris, France' }, { t: 'Ingeniero mecánico', tl: 'es', l: 'Bilbao, Spain' }];
  const r = await translateTitles(recs, { cache, fetchImpl: fake, gapMs: 0 });
  ok(r.limited && !('te' in recs[1]), 'a 429 stops the asking for the rest of the build');
  eq(cache.size, 0, 'and nothing wrong is cached');
}
{
  const cache = new Map();
  const recs = Array.from({ length: 5 }, (_, i) => ({ t: `Titulo ${i}`, tl: 'es', l: 'Spain' }));
  const r = await translateTitles(recs, { cache, fetchImpl: fake, gapMs: 0, maxNew: 2 });
  eq(r.asked, 2, 'no more than maxNew new questions per build');
}
{
  const dir = join(tmpdir(), `argus-web-tcache-${process.pid}`);
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const p = join(dir, 'translations.json');
  const cache = new Map([['Ingeniero mecánico Bilbao, Spain', 'Mechanical engineer']]);
  saveCache(p, cache);
  eq([...loadCache(p)], [...cache], 'the cache survives a round trip through the disk');
  eq(loadCache(join(dir, 'missing.json')).size, 0, 'no file yet: an empty cache, not a crash');
  rmSync(dir, { recursive: true, force: true });
}

done();
