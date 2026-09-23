// ➤ The store (a file per source) and the scheduling that decides which source is read next.
import { existsSync } from 'fs';
import { harness } from 'argus/server-bot/test-harness.mjs';
import { fileNameFor, sourcePath, loadSource, saveSource, dropSource, emptySource } from '../builder/store.mjs';
import { compare, remember, readAll } from '../builder/readers.mjs';
import { sharesHost } from '../builder/sources.mjs';
import { due, nextPass, adoptStore, cadenceMs } from '../builder/crawl.mjs';

const { ok, eq, done } = harness('store');
const cfg = { cadence_h: { default: 24, feeds: 6, careers: 24, greenhouse: 6 }, backoff_h: [6, 24, 48], park_after_fails: 3, budget: { new_a_run: 2 } };
const HOUR = 3600_000;

// A key becomes a file name; a key that would lose something on the way keeps a hash of itself.
eq(fileNameFor('careers.vanoord.com'), 'careers.vanoord.com.json', 'a plain host is its own file name');
eq(fileNameFor('Isar Aerospace'), 'isar_aerospace~5aa38aa4.json'.replace(/~[0-9a-f]{8}/, '~HASH').replace('~HASH', fileNameFor('Isar Aerospace').match(/~([0-9a-f]{8})/)[0]), 'a key with spaces is folded and hashed');
ok(fileNameFor('acme.wd3/External') !== fileNameFor('acme.wd3/Internal'), 'two Workday sites of one tenant land on different files');
ok(sourcePath('careers', 'x.example').includes('adverts'), 'sources live under the store');

// A source goes to disk and comes back the same.
const data = { ...emptySource('_test', 'round-trip'), adverts: [{ url: 'https://x.example/1', title: 'Site Engineer' }], pass: { ended: '2026-09-07T00:00:00.000Z', ok: true } };
saveSource(data);
eq(loadSource('_test', 'round-trip').adverts[0].title, 'Site Engineer', 'what was written is what is read');
ok(existsSync(sourcePath('_test', 'round-trip')), 'and it is one file');
ok(dropSource('_test', 'round-trip'), 'a source can be removed from the store');
eq(loadSource('_test', 'round-trip').adverts.length, 0, 'a source that is not there answers empty, not an error');

// What changed since the last pass.
const before = [{ url: 'a' }, { url: 'b' }, { url: 'c' }];
eq(compare(before, [{ url: 'b' }, { url: 'c' }, { url: 'd' }]), { added: 1, gone: 1, same: 2 }, 'one advert new, one closed, two the same');
eq(compare(before, before), { added: 0, gone: 0, same: 3 }, 'nothing changed');
eq(compare([], [{ url: 'a' }]), { added: 1, gone: 0, same: 0 }, 'a source read for the first time is all new');

// What a pass keeps of the last one: the earliest posted day, and the day an advert appeared.
const last = [{ url: 'a', posted: '2026-08-23' }, { url: 'b', posted: '2026-09-01', seen: '2026-09-10' }, { url: 'c' }];
const next = remember(last, [{ url: 'a', posted: '2026-08-24' }, { url: 'b', posted: '2026-09-15' }, { url: 'c' }, { url: 'd' }], { knewAll: true, today: '2026-09-22' });
eq(next.map(a => a.posted || ''), ['2026-08-23', '2026-09-01', '', ''], "a board that says '30+ days ago' every day, or gives the day of the last edit, never makes an advert younger");
eq(next.map(a => a.seen || ''), ['', '2026-09-10', '', '2026-09-22'], 'an advert new to a complete list appeared today; the others keep what they had, and what nobody saw appear stays unknown');
eq(remember(last, [{ url: 'd' }], { knewAll: false, today: '2026-09-22' })[0].seen, undefined, 'after an incomplete pass, a new advert may be an old one read late');
eq([readAll({ reader: 'board' }, { pass: { ended: 'x', listed: 3 }, adverts: [1, 2, 3] }), readAll({ reader: 'board' }, { pass: { ended: 'x', listed: 900 }, adverts: new Array(500) }), readAll({ reader: 'board' }, { pass: null })], [true, false, false], 'a board read whole; one cut at its first adverts; one never read');
eq([readAll({ reader: 'site' }, { pass: { ended: 'x', backlog: 0 } }), readAll({ reader: 'site' }, { pass: { ended: 'x', backlog: 40 } }), readAll({ reader: 'site' }, { pass: { ended: 'x' } })], [true, false, false], 'a site with no page left unread; one still filling; one read before the backlog was counted');

// Who waits when a host says "too many requests".
eq([sharesHost('greenhouse'), sharesHost('workable'), sharesHost('ashby')], [true, true, true], 'an ATS that answers for every board from one host: the group waits');
eq([sharesHost('recruitee'), sharesHost('personio'), sharesHost('teamtailor'), sharesHost('careers'), sharesHost('feeds')], [false, false, false, false, false], 'a host per source: only that source waits');

// When a source comes back.
const site = { group: 'careers', key: 'x.example', kind: 'board' };
const board = { group: 'greenhouse', key: 'acme', kind: 'board' };
eq([cadenceMs(site, cfg) / HOUR, cadenceMs(board, cfg) / HOUR, cadenceMs({ group: 'nowhere', kind: 'feed' }, cfg) / HOUR], [24, 6, 24], 'a cadence per group, else the default');
const at = Date.parse('2026-09-07T12:00:00.000Z');
const good = nextPass(site, {}, { ok: true, at, c: cfg });
ok(good >= at + 23.5 * HOUR && good <= at + 24.5 * HOUR, 'a good pass comes back in a day, give or take half an hour');
const waits = (entry, n = 200) => { const w = Array.from({ length: n }, () => (nextPass(site, entry, { ok: false, at, c: cfg }) - at) / HOUR); return [Math.min(...w), Math.max(...w)]; };
const [first, second, parked] = [waits({}), waits({ fails: 1 }), waits({ fails: 2 })];
ok(first[0] >= 3 && first[1] <= 6 && second[0] >= 12 && second[1] <= 24, 'a failure waits longer each time: three to six hours, then twelve to twenty-four');
ok(parked[0] >= 84 && parked[1] <= 168, 'a source that keeps failing is parked for half a week to a week');
ok(first[1] - first[0] > 1, 'sources that failed together come back at different times');
const weekly = nextPass(site, {}, { ok: true, at, c: { ...cfg, cadence_h: { ...cfg.cadence_h, barren: 168 } }, barren: true });
ok(weekly >= at + 167.5 * HOUR && weekly <= at + 168.5 * HOUR, 'a barren site comes back in a week');
ok(nextPass(site, {}, { ok: true, at, c: cfg, barren: true }) >= at + 167.5 * HOUR, 'a week too when the settings give barren sites no cadence of their own');
ok(nextPass(site, {}, { ok: false, at, c: cfg, barren: true }) - at <= 6 * HOUR, 'a barren site that fails waits like any other');

// The queue: due first, the most overdue first, and only so many never read.
const now = Date.parse('2026-09-07T12:00:00.000Z');
const sources = [site, board, { group: 'feeds', key: 'lanbide', kind: 'feed' }, { group: 'careers', key: 'new1.example', kind: 'board' }, { group: 'careers', key: 'new2.example', kind: 'board' }, { group: 'careers', key: 'new3.example', kind: 'board' }];
const status = { sources: { 'careers/x.example': { next: now - 5 * HOUR }, 'greenhouse/acme': { next: now - HOUR }, 'feeds/lanbide': { next: now + HOUR } } };
const queue = due(sources, status, { now, c: cfg });
eq(queue.map(s => `${s.group}/${s.key}`), ['careers/x.example', 'greenhouse/acme', 'careers/new1.example', 'careers/new2.example'], 'the most overdue first, a source not due yet left out, and at most two never read');
eq(due(sources, status, { now, only: 'careers', c: cfg }).map(s => s.key), ['x.example', 'new1.example', 'new2.example'], 'one group at a time when asked');
// Eight thousand new boards must not push the employers' sites out of the day.
const manyNew = [...sources, { group: 'greenhouse', key: 'gh1', kind: 'board' }, { group: 'greenhouse', key: 'gh2', kind: 'board' }, { group: 'greenhouse', key: 'gh3', kind: 'board' }];
eq(due(manyNew, status, { now, c: { ...cfg, budget: { new_a_run: 4 } } }).map(s => s.key), ['x.example', 'acme', 'new1.example', 'gh1', 'new2.example', 'gh2'], 'the sources never read come by turns, a group at a time');

// A store filled by a migration keeps the passes it has: the first run does not read it all.
const st = { sources: {} };
const each = () => [{ group: 'careers', key: 'x.example', pass: { ended: '2026-09-07T06:00:00.000Z' }, adverts: [1, 2] }, { group: 'careers', key: 'gone.example', pass: { ended: '2026-09-07T06:00:00.000Z' } }];
eq(adoptStore(st, sources, each, { c: cfg }), 1, 'a source the lists no longer name is not adopted');
eq([st.sources['careers/x.example'].n, st.sources['careers/x.example'].next], [2, Date.parse('2026-09-07T06:00:00.000Z') + 24 * HOUR], 'and the one adopted is due a cadence after its last pass');
eq(due(sources, st, { now, c: cfg }).map(s => s.key).includes('x.example'), false, 'so it is not due now');

done();
