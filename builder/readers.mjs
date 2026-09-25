// ➤ One pass over one source: ask it, and answer with everything it has right now. No
// ➤ scheduling here (that is builder/crawl.mjs) and no gate (that is the publisher): a
// ➤ reader's job ends with a list of adverts in the shape the adapters have always used.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { compileFamilies } from './gate.mjs';
import { readCodes } from './codes.mjs';
import { deadline } from './http.mjs';
import { readBoard, wrapBoardAdvert, loadCompanies } from './adapters/boards.mjs';
import * as careers from './adapters/careers.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
// ➤ A few boards list thousands (survey platforms, agencies); the big employers' boards the
// ➤ scout finds list a thousand or more too, so the cap is the ATSs' own paging limit.
const ADVERTS_A_FOUND_BOARD = 1000;

// ➤ What the feed adapters expect: the vertical's own codes, so a source that classifies by
// ➤ code is asked only for what belongs here. Built once per process.
let shared = null;
export function adapterCtx(log = () => {}, fail = () => {}) {
  if (!shared) {
    const read = p => JSON.parse(readFileSync(join(ROOT, ...p.split('/')), 'utf-8'));
    const gate = compileFamilies(read('catalogues/families.json'), readCodes(ROOT));
    shared = { families: read('catalogues/families.json').families, iscoUnits: [...gate.byIsco.keys()], ssykGroups: [...gate.bySsyk.keys()], companies: loadCompanies() };
  }
  return { ...shared, log, fail };
}

// ➤ src: a source from builder/sources.mjs · data: its file in the store, which the reader may
// ➤ change (a careers site keeps what it resolved and the pages it has read) · budget: what the
// ➤ run may still spend · until: when a careers site stops reading pages, so the pass ends in
// ➤ time with what it read. Answers { adverts, meta } or throws.
export async function readSource(src, data, { budget = {}, log = () => {}, fail = () => {}, until = Infinity } = {}) {
  if (src.reader === 'adapter') {
    const adverts = [];
    for await (const raw of src.adapter.fetchAll(adapterCtx(log, fail))) adverts.push(raw);
    return { adverts, meta: { listed: adverts.length } };
  }
  if (src.reader === 'board') {
    const all = await readBoard(src.ats, String(src.company[src.ats]), src.company.name, src.found ? { tries: 1, timeoutMs: 10000 } : {});
    const jobs = src.found ? all.slice(0, ADVERTS_A_FOUND_BOARD) : all;
    return { adverts: jobs.map(p => wrapBoardAdvert(src.ats, src.company, p)), meta: { listed: all.length } };
  }
  if (src.reader === 'site') {
    const r = await careers.readSite(src.site, data, budget, log, until);
    return { adverts: r.adverts, meta: { listed: r.listed, fetched: r.fetched, blocks: r.blocks, backlog: r.backlog, barren: r.barren, postponed: r.postponed } };
  }
  throw new Error(`no reader for ${src.reader}`);
}

// ➤ A pass with the source's own deadline: a read that neither answers nor fails must not
// ➤ hold a lane for ever. A careers site stops reading pages a minute before it (a quarter of
// ➤ the time for a short one), so a slow site keeps what it read instead of losing the pass.
export function readWithDeadline(src, data, opts) {
  const ms = src.deadlineMs || 300_000;
  return deadline(readSource(src, data, { ...opts, until: Date.now() + ms - Math.min(60_000, ms / 4) }), ms);
}

// ➤ What changed since the last pass, for the log and the status: an advert is the same when
// ➤ its address is.
export function compare(before = [], after = []) {
  const old = new Set(before.map(a => a.url));
  const now = new Set(after.map(a => a.url));
  let added = 0, gone = 0;
  for (const u of now) if (!old.has(u)) added++;
  for (const u of old) if (!now.has(u)) gone++;
  return { added, gone, same: now.size - added };
}

// ➤ Whether the last pass read the whole list: not a site with vacancy pages it had no time
// ➤ to read, nor a board cut at its first few hundred adverts.
export function readAll(src, data) {
  const p = data?.pass;
  if (!p?.ended) return false;
  if (src.reader === 'site') return p.backlog === 0;
  return !(p.listed > (data.adverts || []).length);
}

// ➤ What a pass keeps of the last one, per advert (by address). The earliest day it was said to
// ➤ be posted: a Workday board says "30+ days ago" every day and Greenhouse gives the day of the
// ➤ last edit, and neither may make an advert younger. And the day it was first seen, when the
// ➤ last pass had read the whole list (knewAll): an advert missing from a complete list and
// ➤ present now appeared in between. Before that, nobody knows when it appeared.
export function remember(before = [], after = [], { knewAll = false, today = new Date().toISOString().slice(0, 10) } = {}) {
  const old = new Map(before.map(a => [a.url, a]));
  for (const a of after) {
    const o = old.get(a.url);
    if (o?.posted && (!a.posted || o.posted < a.posted)) a.posted = o.posted;
    if (o?.seen) a.seen = o.seen;
    else if (!o && knewAll) a.seen = today;
  }
  return after;
}
