// ➤ Every source the crawler knows, from the same lists the pile was always built from: the
// ➤ public employment services and remote boards (one adapter each), the intermediaries, the
// ➤ company boards on applicant-tracking systems (one per company) and the employers' own
// ➤ careers sites (one per site). A source is a thing that is read in one pass and answers
// ➤ with its whole list of adverts.
import { existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import yaml from 'js-yaml';
import * as jobtech from './adapters/jobtech.mjs';
import * as lanbide from './adapters/lanbide.mjs';
import * as feinaactiva from './adapters/feinaactiva.mjs';
import * as jcyl from './adapters/jcyl.mjs';
import * as sef from './adapters/sef.mjs';
import * as mpsv from './adapters/mpsv.mjs';
import * as uzt from './adapters/uzt.mjs';
import * as nva from './adapters/nva.mjs';
import * as adzuna from './adapters/adzuna.mjs';
import * as jooble from './adapters/jooble.mjs';
import * as jobfeed from './adapters/jobfeed.mjs';
import { jobicy, remotive, arbeitnow } from './adapters/remote.mjs';
import * as careers from './adapters/careers.mjs';
import { ATS, loadCompanies } from './adapters/boards.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

export const FEED_ADAPTERS = [lanbide, feinaactiva, jcyl, sef, jobtech, mpsv, uzt, nva, jobicy, remotive, arbeitnow];
export const VIA_ADAPTERS = [adzuna, jooble, jobfeed];

// ➤ How hard the crawler works and how often it comes back: builder/config/crawl.yml.
export function loadCrawlConfig() {
  const p = join(ROOT, 'builder', 'config', 'crawl.yml');
  const cfg = existsSync(p) ? (yaml.load(readFileSync(p, 'utf-8')) || {}) : {};
  return {
    cadence_h: { default: 24, ...(cfg.cadence_h || {}) },
    budget: { minutes: 55, pages_a_run: 6000, pages_a_site: 200, renders_a_run: 200, new_a_run: 400, lanes: 16, ...(cfg.budget || {}), in_flight: { default: 2, careers: 12, feeds: 2, via: 1, browser: 2, ...((cfg.budget || {}).in_flight || {}) } },
    backoff_h: cfg.backoff_h || [6, 24, 48],
    park_after_fails: cfg.park_after_fails || 14,
  };
}

export const sourceId = src => `${src.group}/${src.key}`;

// ➤ Does one host serve every source of this group? Greenhouse and Workable answer for all
// ➤ their boards, so "too many requests" from one concerns the lot; Recruitee, Personio,
// ➤ Teamtailor and the employers' own sites live on a host each, so it concerns one source.
export function sharesHost(group) {
  const ats = ATS[group];
  if (!ats) return false;
  try { return new URL(ats.url('one')).hostname === new URL(ats.url('two')).hostname; } catch { return false; }
}

// ➤ The whole catalogue, read fresh every run so a source found last night joins today.
export function allSources() {
  const out = [];
  for (const a of FEED_ADAPTERS) out.push({ group: 'feeds', key: a.id, kind: 'feed', reader: 'adapter', adapter: a, licence: a.licence, deadlineMs: 20 * 60_000 });
  for (const a of VIA_ADAPTERS) out.push({ group: 'via', key: a.id, kind: 'via', reader: 'adapter', adapter: a, licence: a.licence, deadlineMs: 10 * 60_000 });
  for (const c of loadCompanies()) {
    if (c.enabled === false) continue;
    const ats = Object.keys(ATS).find(k => c[k]);
    if (!ats) continue;
    out.push({ group: ats, key: String(c[ats]).toLowerCase(), kind: 'board', reader: 'board', ats, company: c, found: !!c.found, licence: ATS[ats].licence, deadlineMs: c.found ? 120_000 : 300_000 });
  }
  for (const s of careers.loadSites()) {
    out.push({ group: 'careers', key: careers.siteKey(s), kind: 'board', reader: s.render ? 'browser' : 'site', site: s, found: !!s.found, licence: careers.licence, deadlineMs: s.found ? 400_000 : 900_000 });
  }
  // ➤ A key names one source: a list that repeats one is read once.
  const seen = new Set();
  return out.filter(src => { const id = sourceId(src); if (seen.has(id)) return false; seen.add(id); return true; });
}

// ➤ The licence behind a source name as the adverts carry it (`raw.source`): an ATS, the
// ➤ careers sites, one of the feeds, or one of the feeds an intermediary hands over.
export function licenceFor(id) {
  if (ATS[id]) return { ...ATS[id].licence, kind: 'board' };
  if (id === careers.id) return { ...careers.licence, kind: 'board' };
  const adapter = [...FEED_ADAPTERS, ...VIA_ADAPTERS].find(a => a.id === id);
  if (adapter) return { ...adapter.licence, kind: adapter.kind, ...(adapter.via ? { via: true } : {}) };
  for (const a of VIA_ADAPTERS) { const lic = a.sourcesOf?.()[id]; if (lic) return { ...lic, kind: a.kind, via: true }; }
  return null;
}
