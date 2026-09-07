// ➤ One pass over one source: ask it, and answer with everything it has right now. No
// ➤ scheduling here (that is builder/crawl.mjs) and no gate (that is the publisher): a
// ➤ reader's job ends with a list of adverts in the shape the adapters have always used.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { compileFamilies } from './gate.mjs';
import { deadline } from './http.mjs';
import { readBoard, wrapBoardAdvert, loadCompanies } from './adapters/boards.mjs';
import * as careers from './adapters/careers.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const ADVERTS_A_FOUND_BOARD = 500;   // ➤ a few boards list thousands (survey platforms, agencies)

// ➤ What the feed adapters expect: the vertical's own codes, so a source that classifies by
// ➤ code is asked only for what belongs here. Built once per process.
let shared = null;
export function adapterCtx(log = () => {}, fail = () => {}) {
  if (!shared) {
    const read = p => JSON.parse(readFileSync(join(ROOT, ...p.split('/')), 'utf-8'));
    const gate = compileFamilies(read('catalogues/families.json'), { isco: read('catalogues/codes/isco.json'), ssyk: read('catalogues/codes/ssyk-isco.json') });
    shared = { families: read('catalogues/families.json').families, iscoUnits: [...gate.byIsco.keys()], ssykGroups: [...gate.bySsyk.keys()], companies: loadCompanies() };
  }
  return { ...shared, log, fail };
}

// ➤ src: a source from builder/sources.mjs · data: its file in the store, which the reader may
// ➤ change (a careers site keeps what it resolved and the pages it has read) · budget: what the
// ➤ run may still spend. Answers { adverts, meta } or throws.
export async function readSource(src, data, { budget = {}, log = () => {}, fail = () => {} } = {}) {
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
    const r = await careers.readSite(src.site, data, budget, log);
    return { adverts: r.adverts, meta: { listed: r.listed, fetched: r.fetched, blocks: r.blocks } };
  }
  throw new Error(`no reader for ${src.reader}`);
}

// ➤ A pass with the source's own deadline: a read that neither answers nor fails must not
// ➤ hold a lane for ever.
export const readWithDeadline = (src, data, opts) => deadline(readSource(src, data, opts), src.deadlineMs || 300_000);

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
