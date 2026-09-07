// ➤ The store (a file per source) and the scheduling that decides which source is read next.
import { existsSync } from 'fs';
import { harness } from 'argus/server-bot/test-harness.mjs';
import { fileNameFor, sourcePath, loadSource, saveSource, dropSource, emptySource } from '../builder/store.mjs';
import { compare } from '../builder/readers.mjs';
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

// When a source comes back.
const site = { group: 'careers', key: 'x.example', kind: 'board' };
const board = { group: 'greenhouse', key: 'acme', kind: 'board' };
eq([cadenceMs(site, cfg) / HOUR, cadenceMs(board, cfg) / HOUR, cadenceMs({ group: 'nowhere', kind: 'feed' }, cfg) / HOUR], [24, 6, 24], 'a cadence per group, else the default');
const at = Date.parse('2026-09-07T12:00:00.000Z');
const good = nextPass(site, {}, { ok: true, at, c: cfg });
ok(good >= at + 23.5 * HOUR && good <= at + 24.5 * HOUR, 'a good pass comes back in a day, give or take half an hour');
eq([nextPass(site, {}, { ok: false, at, c: cfg }) - at, nextPass(site, { fails: 1 }, { ok: false, at, c: cfg }) - at], [6 * HOUR, 24 * HOUR], 'a failure waits longer each time');
eq(nextPass(site, { fails: 2 }, { ok: false, at, c: cfg }) - at, 7 * 24 * HOUR, 'a source that keeps failing is parked for a week');

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
