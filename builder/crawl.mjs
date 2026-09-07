// ➤ The crawler: every hour it takes the sources whose last pass is older than their cadence
// ➤ (builder/config/crawl.yml) and reads them, oldest first, and writes what each gave to its
// ➤ own file in the store. It publishes nothing: the site is built from the store by
// ➤ builder/build-pile.mjs, so a slow read never delays a publish and a publish never waits
// ➤ for the network. It stops at once when builder/state/STOP exists.
// ➤   node builder/crawl.mjs [--minutes 55] [--limit 50] [--only careers|greenhouse|feeds|via]
// ➤   node builder/crawl.mjs --source careers/vanoord.com     # one source, now
// ➤   node builder/crawl.mjs --status | --purge | --dry
import { existsSync, readFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileAtomic } from 'argus/server-bot/fs-atomic.mjs';
import { allSources, sourceId, loadCrawlConfig } from './sources.mjs';
import { loadSource, saveSource, dropSource, sweepTemps, storeSize, eachSource } from './store.mjs';
import { readWithDeadline, compare } from './readers.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const STATE_DIR = join(ROOT, 'builder', 'state');
const STATUS = join(STATE_DIR, 'crawl-status.json');
const STOP = join(STATE_DIR, 'STOP');

const args = process.argv.slice(2);
const flag = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const log = line => console.log(`[${new Date().toISOString().slice(11, 19)}] ${line}`);
const stopped = () => existsSync(STOP);
const day = t => new Date(t).toISOString().slice(0, 10);
const hours = ms => Math.round(ms / 36e5);

const loadStatus = () => { try { return JSON.parse(readFileSync(STATUS, 'utf8')); } catch { return { v: 1, sources: {}, groups: {}, totals: {} }; } };
const saveStatus = st => { st.updated = new Date().toISOString(); mkdirSync(STATE_DIR, { recursive: true }); writeFileAtomic(STATUS, JSON.stringify(st)); };

const cfg = loadCrawlConfig();
export const cadenceMs = (src, c = cfg) => (c.cadence_h[src.group] ?? c.cadence_h[src.kind] ?? c.cadence_h.default) * 3600_000;
// ➤ Half an hour of jitter so the sources a run reads together do not come back together.
const jitter = () => Math.round((Math.random() - 0.5) * 60 * 60_000);

// ➤ When a source is due again: after a good pass, its cadence; after a failure, longer each
// ➤ time, and parked when it has failed for weeks. A source never read is due now.
export function nextPass(src, entry, { ok, at = Date.now(), c = cfg } = {}) {
  if (ok) return at + cadenceMs(src, c) + jitter();
  const fails = (entry?.fails || 0) + 1;
  if (fails >= c.park_after_fails) return at + 7 * 24 * 3600_000;
  return at + (c.backoff_h[Math.min(fails, c.backoff_h.length) - 1] * 3600_000);
}

// ➤ A store filled by hand or by a migration already knows when each source was read: its
// ➤ passes become the schedule, so the first run does not read everything at once.
export function adoptStore(st, sources, each, { c = cfg } = {}) {
  const known = new Map(sources.map(src => [sourceId(src), src]));
  let adopted = 0;
  for (const data of each()) {
    const id = `${data.group}/${data.key}`;
    const src = known.get(id);
    if (!src || st.sources[id] || !data.pass?.ended) continue;
    st.sources[id] = { last: data.pass.ended, ok: true, n: (data.adverts || []).length, fails: 0, next: Date.parse(data.pass.ended) + cadenceMs(src, c) };
    adopted++;
  }
  st.adopted = new Date().toISOString();
  return adopted;
}

// ➤ The sources to read now: due, in the group asked for, the most overdue first, and only so
// ➤ many never-read ones, so a scout that found five thousand does not starve the day.
export function due(sources, status, { now = Date.now(), only = null, c = cfg } = {}) {
  const known = [];
  const fresh = new Map();
  for (const src of sources) {
    if (only && src.group !== only && src.reader !== only) continue;
    const e = status.sources?.[sourceId(src)];
    if (!e) { (fresh.get(src.group) || fresh.set(src.group, []).get(src.group)).push(src); continue; }
    if ((e.next || 0) > now) continue;
    known.push({ src, next: e.next || 0 });
  }
  known.sort((a, b) => a.next - b.next);
  // ➤ The sources never read come after the ones already overdue (what the site shows stays
  // ➤ fresh before it grows), and one group at a time in turn, so eight thousand new boards
  // ➤ never push the employers' sites out of the day.
  const lists = [...fresh.values()];
  const picked = [];
  for (let i = 0; picked.length < c.budget.new_a_run && lists.some(l => l.length > i); i++) {
    for (const l of lists) { if (i < l.length && picked.length < c.budget.new_a_run) picked.push(l[i]); }
  }
  return [...known.map(x => x.src), ...picked];
}

// ➤ One pass, written to the store. Answers what changed; never throws.
async function pass(src, st, budget, tally) {
  const id = sourceId(src);
  const entry = (st.sources[id] ||= {});
  const data = loadSource(src.group, src.key);
  const before = data.adverts || [];
  const started = Date.now();
  try {
    const { adverts, meta } = await readWithDeadline(src, data, { budget, log, fail: (who, why) => log(`FAILED ${who}: ${why}`) });
    const seconds = Math.round((Date.now() - started) / 1000);
    const diff = compare(before, adverts);
    Object.assign(data, { v: 1, group: src.group, key: src.key, kind: src.kind, adverts, pass: { started: new Date(started).toISOString(), ended: new Date().toISOString(), ok: true, seconds, ...meta } });
    saveSource(data);
    Object.assign(entry, { last: data.pass.ended, ok: true, n: adverts.length, seconds, fails: 0, err: '', next: nextPass(src, entry, { ok: true }) });
    if (meta.blocks === false) entry.blocks = false; else delete entry.blocks;
    tally.read++; tally.added += diff.added; tally.gone += diff.gone;
    (tally.groups[src.group] ||= { read: 0, failed: 0, added: 0, gone: 0, adverts: 0 });
    tally.groups[src.group].read++; tally.groups[src.group].added += diff.added; tally.groups[src.group].gone += diff.gone; tally.groups[src.group].adverts += adverts.length;
    if (!src.found || diff.added || diff.gone) log(`${id}: ${adverts.length} adverts${diff.added ? ` · ${diff.added} new` : ''}${diff.gone ? ` · ${diff.gone} closed` : ''}${diff.added || diff.gone ? '' : ' · nothing changed'} · ${seconds} s`);
    return true;
  } catch (e) {
    const at = Date.now();
    // ➤ "Too many requests" is not a failure: the host said when to come back, and the whole
    // ➤ group waits, because an ATS serves every board from one host.
    if (e.status === 429 && e.until) {
      (st.groups[src.group] ||= {}).pausedUntil = e.until;
      entry.next = e.until + jitter();
      log(`${src.group}: ${e.message}; the group waits`);
      tally.paused++;
      return false;
    }
    entry.fails = (entry.fails || 0) + 1;
    entry.err = String(e.message || e).slice(0, 120);
    entry.ok = false;
    entry.next = nextPass(src, { fails: entry.fails - 1 }, { ok: false, at });
    tally.failed++;
    (tally.groups[src.group] ||= { read: 0, failed: 0, added: 0, gone: 0, adverts: 0 }).failed++;
    if (!src.found) log(`${id}: ${entry.err}`);
    if (entry.fails === 3) log(`ALERT failing 3 times: ${id} (${entry.err})`);
    if (entry.fails === cfg.park_after_fails) log(`ALERT parked after ${entry.fails} failures: ${id}`);
    return false;
  }
}

// ➤ The run: lanes over the due sources, each group with its own number of lanes, stopping at
// ➤ the minute or the page budget or STOP.
async function run() {
  const started = Date.now();
  const minutes = Number(flag('--minutes', cfg.budget.minutes));
  const endBy = started + minutes * 60_000;
  const takeUntil = endBy - 5 * 60_000;
  const only = flag('--only', null);
  const st = loadStatus();
  st.sources ||= {}; st.groups ||= {}; st.totals ||= {};
  const swept = sweepTemps();
  if (swept) log(`${swept} scratch files swept`);

  const sources = allSources();
  if (!st.adopted) { const n = adoptStore(st, sources, eachSource); if (n) log(`${n} sources already in the store keep the passes they had`); saveStatus(st); }
  const queue = due(sources, st, { only });
  if (!queue.length) { log(`nothing due of ${sources.length} sources`); saveStatus(st); return; }

  // ➤ One queue per group, so the lanes spread over hosts instead of hammering one.
  const byGroup = new Map();
  for (const src of queue) { const g = src.reader === 'browser' ? 'browser' : src.group; (byGroup.get(g) || byGroup.set(g, []).get(g)).push(src); }
  const groups = [...byGroup.keys()];
  const inFlight = Object.fromEntries(groups.map(g => [g, 0]));
  const capOf = g => cfg.budget.in_flight[g] ?? cfg.budget.in_flight.default;
  let turn = 0;

  const take = () => {
    for (let i = 0; i < groups.length; i++) {
      const g = groups[(turn + i) % groups.length];
      const list = byGroup.get(g);
      if (!list.length || inFlight[g] >= capOf(g)) continue;
      const paused = st.groups[g]?.pausedUntil || 0;
      if (paused > Date.now()) continue;
      turn = (turn + i + 1) % groups.length;
      inFlight[g]++;
      return { src: list.shift(), g };
    }
    return null;
  };
  const left = () => [...byGroup.values()].reduce((n, l) => n + l.length, 0);
  // ➤ What is still worth waiting for: a group that says "come back later" is not, so a run
  // ➤ whose only work left is a paused group ends instead of spinning until its minute.
  const waitable = () => groups.some(g => byGroup.get(g).length && (st.groups[g]?.pausedUntil || 0) <= Date.now());

  const budget = { left: cfg.budget.pages_a_run, pagesASite: cfg.budget.pages_a_site };
  const most = Number(flag('--limit', 0)) || 0;   // ➤ read at most this many sources (for a look)
  const tally = { read: 0, failed: 0, added: 0, gone: 0, paused: 0, groups: {} };
  let lastSave = Date.now(), done = 0;

  await Promise.all(Array.from({ length: cfg.budget.lanes }, async () => {
    for (;;) {
      if (stopped()) return;
      if (Date.now() > takeUntil || budget.left <= 0) return;
      if (most && done >= most) return;
      const got = take();
      if (!got) {
        if (!waitable()) { if (Object.values(inFlight).some(n => n > 0)) { await new Promise(r => setTimeout(r, 250)); continue; } return; }
        await new Promise(r => setTimeout(r, 250));
        continue;
      }
      try { await pass(got.src, st, budget, tally); } finally { inFlight[got.g]--; }
      done++;
      if (done % 50 === 0 || Date.now() - lastSave > 60_000) {
        saveStatus(st); lastSave = Date.now();
        log(`run: ${tally.read} read · ${tally.failed} failed · ${left()} still due · pages ${cfg.budget.pages_a_run - budget.left}/${cfg.budget.pages_a_run}`);
      }
    }
  }));

  // ➤ What the whole store holds now, for the daily line and the shrink guard.
  const size = storeSize();
  st.totals = { at: new Date().toISOString(), sources: size.files, bytes: size.bytes, adverts: countAdverts() };
  saveStatus(st);
  const per = Object.entries(tally.groups).map(([g, t]) => `${g} ${t.read}${t.failed ? `/${t.failed} failed` : ''}${t.added ? ` +${t.added}` : ''}${t.gone ? ` -${t.gone}` : ''}`).join(' · ');
  log(`run done in ${Math.round((Date.now() - started) / 1000)} s: ${tally.read} sources read, ${tally.failed} failed, ${tally.added} adverts new, ${tally.gone} closed, ${left()} still due`);
  if (per) log(`run by group: ${per}`);
  dailyLine(st);
  if (stopped()) log('stopped by builder/state/STOP');
}

// ➤ How many adverts the store holds, counted once a run (the publisher's own count is the
// ➤ one that matters; this is for the shrink alert).
function countAdverts() {
  let n = 0;
  for (const data of eachSource()) n += (data.adverts || []).length;
  return n;
}

// ➤ One line a day: what the crawler covered, and what is wrong.
function dailyLine(st) {
  const today = day(Date.now());
  if (st.day === today) return;
  const yesterday = st.totals_yesterday || {};
  const entries = Object.entries(st.sources);
  const passed = entries.filter(([, e]) => e.last && Date.now() - Date.parse(e.last) < 24 * 3600_000).length;
  const failing = entries.filter(([, e]) => (e.fails || 0) >= 3).length;
  const overdue = entries.filter(([, e]) => e.next && e.next < Date.now() - 12 * 3600_000).length;
  const oldest = entries.filter(([, e]) => e.last).sort((a, b) => Date.parse(a[1].last) - Date.parse(b[1].last))[0];
  log(`DAY ${today} · ${passed} of ${entries.length} sources passed in 24 h · ${st.totals.adverts} adverts in ${st.totals.sources} files (${Math.round(st.totals.bytes / 1e6)} MB) · ${failing} failing · ${overdue} overdue${oldest ? ` · oldest pass ${hours(Date.now() - Date.parse(oldest[1].last))} h ${oldest[0]}` : ''}`);
  if (yesterday.adverts && st.totals.adverts < yesterday.adverts * 0.7) log(`ALERT the store shrank: ${yesterday.adverts} → ${st.totals.adverts} adverts`);
  if (overdue > entries.length * 0.1) log(`ALERT ${overdue} sources are more than 12 h overdue`);
  st.day = today;
  st.totals_yesterday = st.totals;
  saveStatus(st);
}

// ➤ --status: what the crawler knows, without asking anyone.
function printStatus() {
  const st = loadStatus();
  const sources = allSources();
  // ➤ What the store already holds counts as read, even before the first run adopts it.
  st.sources ||= {};
  if (!st.adopted) adoptStore(st, sources, eachSource);
  const entries = Object.entries(st.sources || {});
  const now = Date.now();
  const passed = entries.filter(([, e]) => e.last && now - Date.parse(e.last) < 24 * 3600_000).length;
  const never = sources.length - entries.length;
  const size = storeSize();
  console.log(`sources: ${sources.length} known · ${entries.length} tried · ${never} never read · ${passed} passed in the last 24 h`);
  console.log(`store: ${size.files} files, ${Math.round(size.bytes / 1e6)} MB · totals ${st.totals?.adverts ?? '?'} adverts at ${st.totals?.at || 'never'}`);
  const byGroup = {};
  for (const src of sources) {
    const e = st.sources?.[sourceId(src)];
    const g = (byGroup[src.group] ||= { n: 0, read: 0, failing: 0, adverts: 0, dueNow: 0 });
    g.n++;
    if (e?.last) { g.read++; g.adverts += e.n || 0; }
    if ((e?.fails || 0) >= 3) g.failing++;
    if (!e || (e.next || 0) <= now) g.dueNow++;
  }
  for (const [g, v] of Object.entries(byGroup).sort((a, b) => b[1].n - a[1].n)) {
    console.log(`  ${g.padEnd(16)} ${String(v.n).padStart(6)} sources · ${String(v.read).padStart(6)} read · ${String(v.adverts).padStart(7)} adverts · ${v.failing} failing · ${v.dueNow} due now`);
  }
  const paused = Object.entries(st.groups || {}).filter(([, v]) => (v.pausedUntil || 0) > now);
  for (const [g, v] of paused) console.log(`  ${g}: waiting until ${new Date(v.pausedUntil).toISOString().slice(11, 16)} ("too many requests")`);
  if (existsSync(STOP)) console.log('STOP is in place: the crawler and the publisher do nothing');
}

// ➤ --purge: the files of sources no list names any more.
function purge() {
  const known = new Set(allSources().map(sourceId));
  const st = loadStatus();
  let gone = 0;
  for (const data of eachSource()) {
    const id = `${data.group}/${data.key}`;
    if (known.has(id)) continue;
    if (dropSource(data.group, data.key)) { delete st.sources[id]; gone++; }
  }
  saveStatus(st);
  console.log(`${gone} sources no list names any more were removed from the store`);
}

// ➤ Run from the command line, or imported by the tests for its scheduling.
const asked = process.argv[1] && /crawl.mjs$/.test(process.argv[1]);
if (!asked) { /* imported: nothing runs */ }
else if (args.includes('--status')) printStatus();
else if (args.includes('--purge')) purge();
else if (args.includes('--dry')) {
  const st = loadStatus();
  const all = allSources();
  st.sources ||= {};
  if (!st.adopted) adoptStore(st, all, eachSource);
  const q = due(all, st, { only: flag('--only', null) });
  const by = {};
  for (const s of q) by[s.group] = (by[s.group] || 0) + 1;
  console.log(`${q.length} sources due: ${Object.entries(by).sort((a, b) => b[1] - a[1]).map(([g, n]) => `${g} ${n}`).join(' · ')}`);
} else if (flag('--source', null)) {
  const id = flag('--source', '');
  const src = allSources().find(s => sourceId(s) === id);
  if (!src) { console.log(`no source named ${id}`); process.exit(1); }
  const st = loadStatus();
  st.sources ||= {}; st.groups ||= {};
  await pass(src, st, { left: cfg.budget.pages_a_site, pagesASite: cfg.budget.pages_a_site }, { read: 0, failed: 0, added: 0, gone: 0, paused: 0, groups: {} });
  saveStatus(st);
} else if (stopped()) {
  log('STOP is in place: nothing to do');
} else {
  await run();
}
// ➤ A read abandoned at its deadline must not keep the process alive.
if (asked) process.exit(0);
