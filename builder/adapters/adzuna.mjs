// ➤ Adzuna: the aggregator's public API (developer.adzuna.com), free with a registered
// ➤ app_id and app_key. Its terms allow publishing its ad listings when each is labelled
// ➤ "Jobs by Adzuna" with the links the terms name (the card does that), within 250 calls a
// ➤ day and 2,500 a month. Without keys the source is skipped. The newest adverts of each
// ➤ European country and category are asked for once a day, sorted by date; what came
// ➤ earlier is kept for thirty days in builder/state/adzuna.json, so the other builds of the
// ➤ day cost no calls. Adverts link to Adzuna's page for the advert: the tracking bounce is
// ➤ replaced by the details page, as Argus does.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getJson } from '../http.mjs';

export const id = 'adzuna';
export const kind = 'feed';
export const licence = {
  name: 'Adzuna', short: 'Adzuna', url: 'https://developer.adzuna.com/docs/terms_of_service',
  licence: 'Adzuna API terms: publishing its ad listings, each labelled "Jobs by Adzuna"', credit: 'Jobs by Adzuna', needsKey: true,
};

// ➤ Adzuna's European countries, with the language its titles are read in besides English.
export const COUNTRIES = { es: 'es', de: 'de', fr: 'fr', nl: 'nl', it: 'it', at: 'de', pl: 'pl', be: 'nl', ch: 'de', gb: 'en' };
const CATEGORIES = ['engineering-jobs', 'it-jobs'];
const PAGES = 2, PER_PAGE = 50, MAX_DAYS_OLD = 3, KEEP_DAYS = 30, HOURS_BETWEEN = 20, CALLS_A_DAY = 200;
const STATE = join(dirname(dirname(dirname(fileURLToPath(import.meta.url)))), 'builder', 'state', 'adzuna.json');

export const creds = () => (process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY ? { id: process.env.ADZUNA_APP_ID, key: process.env.ADZUNA_APP_KEY } : null);

// ➤ The advert's own page on Adzuna, from the id and the country's domain.
export const detailsUrl = (redirectUrl, adId) => {
  const m = String(redirectUrl || '').match(/^(https?:\/\/[^/]*adzuna\.[a-z.]+)\//);
  return m && adId ? `${m[1]}/details/${adId}` : String(redirectUrl || '');
};

export function toRaw(r, cc) {
  const area = Array.isArray(r.location?.area) ? r.location.area : [];
  return {
    source: id, sourceId: String(r.id || ''),
    title: String(r.title || '').trim(), company: String(r.company?.display_name || '').trim(),
    location: String(r.location?.display_name || ''), country: cc, city: area.length > 1 ? String(area[area.length - 1]) : '',
    url: detailsUrl(r.redirect_url, r.id), description: String(r.description || ''),
    posted: String(r.created || '').slice(0, 10), expires: '', codes: {}, lang: COUNTRIES[cc] || 'en',
  };
}

const loadState = () => { try { return JSON.parse(readFileSync(STATE, 'utf8')); } catch { return { fetched_at: '', calls: {}, ads: {} }; } };
const saveState = s => { mkdirSync(dirname(STATE), { recursive: true }); writeFileSync(STATE, JSON.stringify(s)); };

// ➤ The day's fetch, when it is due: pages of the newest adverts per country and category,
// ➤ stopped at the daily budget or at Adzuna's "too many requests".
async function refresh(state, keys, log) {
  const today = new Date().toISOString().slice(0, 10);
  let calls = state.calls?.[today] || 0, added = 0, limited = false;
  outer: for (const cc of Object.keys(COUNTRIES)) {
    for (const category of CATEGORIES) {
      for (let page = 1; page <= PAGES; page++) {
        if (calls >= CALLS_A_DAY) break outer;
        const params = new URLSearchParams({ app_id: keys.id, app_key: keys.key, results_per_page: String(PER_PAGE), max_days_old: String(MAX_DAYS_OLD), sort_by: 'date', category, 'content-type': 'application/json' });
        let j;
        try { j = await getJson(`https://api.adzuna.com/v1/api/jobs/${cc}/search/${page}?${params}`, { gapMs: 1200, tries: 1 }); calls++; } catch (e) {
          calls++;
          if (/429/.test(e.message)) { limited = true; break outer; }
          log(`adzuna ${cc} ${category} p${page}: ${e.message.slice(0, 80)}`); break;
        }
        const results = j.results || [];
        for (const r of results) { const raw = toRaw(r, cc); if (raw.url && raw.title) { if (!state.ads[raw.sourceId]) added++; state.ads[raw.sourceId] = raw; } }
        if (results.length < PER_PAGE) break;
      }
    }
  }
  state.calls = { [today]: calls };
  state.fetched_at = new Date().toISOString();
  return { calls, added, limited };
}

export async function* fetchAll(ctx) {
  const keys = creds();
  if (!keys) { ctx.log('adzuna: no keys (ADZUNA_APP_ID, ADZUNA_APP_KEY), skipped'); return; }
  const state = loadState();
  const due = !state.fetched_at || Date.now() - new Date(state.fetched_at).getTime() > HOURS_BETWEEN * 3600 * 1000;
  if (due) {
    const r = await refresh(state, keys, ctx.log);
    ctx.log(`adzuna: ${r.calls} calls today, ${r.added} new adverts${r.limited ? ' (rate-limited, the rest waits)' : ''}`);
  }
  const floor = new Date(Date.now() - KEEP_DAYS * 864e5).toISOString().slice(0, 10);
  for (const [adId, raw] of Object.entries(state.ads)) if (!raw.posted || raw.posted < floor) delete state.ads[adId];
  saveState(state);
  const ads = Object.values(state.ads);
  ctx.log(`adzuna: ${ads.length} adverts from the last ${KEEP_DAYS} days${due ? '' : ' (from the day\'s fetch)'}`);
  for (const raw of ads) yield raw;
}
