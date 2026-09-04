// ➤ The plain search and the deadline rule the list page applies to every advert.
import { harness } from 'argus/server-bot/test-harness.mjs';
import { wordsOf, matchesWords, isExpired, newestFirst } from '../app/lib/search.js';

const { ok, eq, done } = harness('search');
const name = cc => ({ es: 'Spain', se: 'Sweden' })[cc] || '';
const o = { t: 'Ingeniero/a Mecánico', c: 'Acme Naval', ci: 'Cádiz', l: 'Cádiz, Andalucía, Spain', cc: 'es' };

eq(wordsOf('  Mecánico, cadiz '), ['mecanico', 'cadiz'], 'words are folded and split on spaces and commas');
eq(wordsOf('a'), [], 'a one-letter word is noise');
ok(matchesWords(o, wordsOf('mecanico cadiz'), name), 'every word found across title and city');
ok(matchesWords(o, wordsOf('naval spain'), name), 'company and country name count too');
ok(!matchesWords(o, wordsOf('mecanico bilbao'), name), 'one missing word is enough to fail');
ok(matchesWords(o, [], name), 'no words: everything matches');

ok(isExpired({ x: '2026-01-01' }, '2026-09-04'), 'a deadline in the past');
ok(!isExpired({ x: '2026-12-31' }, '2026-09-04'), 'a deadline ahead');
ok(!isExpired({}, '2026-09-04'), 'no deadline: never expired');
ok(!isExpired({ x: '2026-09-04' }, '2026-09-04'), 'the deadline day itself is still open');

eq(newestFirst([{ d: '2026-08-01' }, { d: '2026-09-03' }, { d: '' }]).map(x => x.d), ['2026-09-03', '2026-08-01', ''], 'newest first, undated last');

done();
