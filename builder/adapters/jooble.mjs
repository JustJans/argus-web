// ➤ Jooble, through the API it gives partner sites for free (jooble.org/api/about): the
// ➤ aggregator's adverts, each linking to Jooble's page, as its programme asks. An
// ➤ intermediary, so the site shows these in their own section, after the employers' own
// ➤ adverts. Without a key the source is skipped. Once a day, a few searches per country
// ➤ (the words for engineer, technician and developer in the country's language) are asked
// ➤ for, newest first, within a budget of calls; what came earlier is kept for thirty days in
// ➤ builder/state/jooble.json, so the other builds of the day cost no calls.
// ➤ Keys: JOOBLE_KEY for one key, or JOOBLE_KEYS="es=KEY1,de=KEY2" when Jooble gives one per country.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getJson } from '../http.mjs';
import { writeFileAtomic } from 'argus/server-bot/fs-atomic.mjs';
import { text } from './boards.mjs';

export const id = 'jooble';
export const kind = 'via';
export const via = true;
export const licence = {
  name: 'Jooble', short: 'Jooble', url: 'https://jooble.org/api/about',
  licence: "Jooble's partner API: its adverts, each linking to Jooble's page for the advert", credit: 'via Jooble', needsKey: true,
};

// ➤ The countries asked for, the name Jooble's location field takes and the language of the words.
export const COUNTRIES = {
  es: ['Spain', 'es'], pt: ['Portugal', 'pt'], fr: ['France', 'fr'], be: ['Belgium', 'fr'], de: ['Germany', 'de'], at: ['Austria', 'de'], ch: ['Switzerland', 'de'],
  it: ['Italy', 'it'], nl: ['Netherlands', 'nl'], pl: ['Poland', 'pl'], cz: ['Czech Republic', 'cs'], gb: ['United Kingdom', 'en'], ie: ['Ireland', 'en'],
  se: ['Sweden', 'sv'], no: ['Norway', 'no'], dk: ['Denmark', 'da'], fi: ['Finland', 'en'], hu: ['Hungary', 'en'], ro: ['Romania', 'en'], gr: ['Greece', 'en'],
};
const WORDS = {
  es: ['ingeniero', 'técnico', 'desarrollador'], pt: ['engenheiro', 'técnico', 'programador'], fr: ['ingénieur', 'technicien', 'développeur'],
  de: ['ingenieur', 'techniker', 'entwickler'], it: ['ingegnere', 'tecnico', 'sviluppatore'], nl: ['ingenieur', 'technicus', 'developer'],
  pl: ['inżynier', 'technik', 'programista'], cs: ['inženýr', 'technik', 'vývojář'], sv: ['ingenjör', 'tekniker', 'utvecklare'],
  no: ['ingeniør', 'tekniker', 'utvikler'], da: ['ingeniør', 'tekniker', 'udvikler'], en: ['engineer', 'technician', 'developer'],
};
const PAGES = 2, KEEP_DAYS = 30, HOURS_BETWEEN = 20, CALLS_A_DAY = 200;
const STATE = join(dirname(dirname(dirname(fileURLToPath(import.meta.url)))), 'builder', 'state', 'jooble.json');

// ➤ The key for a country: its own, else the one key.
export function keys() {
  const perCountry = Object.fromEntries(String(process.env.JOOBLE_KEYS || '').split(',').map(p => p.trim().split('=')).filter(p => p.length === 2 && p[0] && p[1]));
  const one = process.env.JOOBLE_KEY || '';
  return one || Object.keys(perCountry).length ? { one, perCountry } : null;
}

export function toRaw(j, cc) {
  return {
    source: id, sourceId: String(j.id || j.link || ''),
    title: String(j.title || '').trim(), company: String(j.company || '').trim(),
    location: String(j.location || ''), country: cc, city: '',
    url: String(j.link || ''), description: text(j.snippet || ''),
    posted: String(j.updated || '').slice(0, 10), expires: '', codes: {}, lang: COUNTRIES[cc]?.[1] || 'en',
  };
}

const loadState = () => { try { return JSON.parse(readFileSync(STATE, 'utf8')); } catch { return { fetched_at: '', calls: {}, ads: {} }; } };
const saveState = s => { mkdirSync(dirname(STATE), { recursive: true }); writeFileAtomic(STATE, JSON.stringify(s)); };

// ➤ The day's fetch, when it is due: pages of each country's searches, stopped at the daily
// ➤ budget or at Jooble's "too many requests".
async function refresh(state, k, log) {
  const today = new Date().toISOString().slice(0, 10);
  let calls = state.calls?.[today] || 0, added = 0, limited = false;
  outer: for (const [cc, [place, lang]] of Object.entries(COUNTRIES)) {
    const key = k.perCountry[cc] || k.one;
    if (!key) continue;
    for (const word of WORDS[lang] || WORDS.en) {
      for (let page = 1; page <= PAGES; page++) {
        if (calls >= CALLS_A_DAY) break outer;
        let j;
        try {
          j = await getJson(`https://jooble.org/api/${encodeURIComponent(key)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keywords: word, location: place, page }), gapMs: 1200, tries: 1 });
          calls++;
        } catch (e) {
          calls++;
          if (e.status === 429 || /429/.test(e.message)) { limited = true; break outer; }
          log(`jooble ${cc} ${word} p${page}: ${e.message.slice(0, 80)}`); break;
        }
        const jobs = j?.jobs || [];
        for (const r of jobs) { const raw = toRaw(r, cc); if (raw.url && raw.title) { if (!state.ads[raw.sourceId]) added++; state.ads[raw.sourceId] = raw; } }
        if (jobs.length < 20) break;
      }
    }
  }
  state.calls = { [today]: calls };
  state.fetched_at = new Date().toISOString();
  return { calls, added, limited };
}

export async function* fetchAll(ctx) {
  const k = keys();
  if (!k) { ctx.log('jooble: no key (JOOBLE_KEY or JOOBLE_KEYS), skipped'); return; }
  const state = loadState();
  const due = !state.fetched_at || Date.now() - new Date(state.fetched_at).getTime() > HOURS_BETWEEN * 3600 * 1000;
  if (due) {
    const r = await refresh(state, k, ctx.log);
    ctx.log(`jooble: ${r.calls} calls today, ${r.added} new adverts${r.limited ? ' (rate-limited, the rest waits)' : ''}`);
  }
  const floor = new Date(Date.now() - KEEP_DAYS * 864e5).toISOString().slice(0, 10);
  for (const [adId, raw] of Object.entries(state.ads)) if (!raw.posted || raw.posted < floor) delete state.ads[adId];
  saveState(state);
  const ads = Object.values(state.ads);
  ctx.log(`jooble: ${ads.length} adverts from the last ${KEEP_DAYS} days${due ? '' : " (from the day's fetch)"}`);
  for (const raw of ads) yield raw;
}
