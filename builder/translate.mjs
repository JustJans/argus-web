// ➤ Titles in English, the way the Telegram bot shows them: Google's free translator is
// ➤ asked once per distinct title, with the advert's language as the hint when the source
// ➤ states it, and every answer is kept in a cache on disk so a title is never asked twice.
// ➤ The result travels as `te` next to the original `t`, and only when it differs. A
// ➤ rate-limited translator stops the asking for the rest of the build; the next build
// ➤ carries on where it left off.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { fold } from 'argus/server-bot/text.mjs';

const ENDPOINT = 'https://translate.googleapis.com/translate_a/single?client=gtx&tl=en&dt=t';
const UA = 'Mozilla/5.0 (compatible; ArgusWeb/0.1; +https://github.com/JustJans/argus-web)';
const sleep = ms => new Promise(r => setTimeout(r, ms));

export function loadCache(path) {
  try { return existsSync(path) ? JSON.parse(readFileSync(path, 'utf-8')) : {}; } catch { return {}; }
}
export function saveCache(path, cache) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(cache));
}

// ➤ One question to the translator: {text, src} or null when it did not answer; a 429 is
// ➤ thrown as rateLimited so the caller can stop asking.
export async function askTranslator(text, sl = 'auto', fetchImpl = fetch) {
  const url = `${ENDPOINT}&sl=${encodeURIComponent(sl || 'auto')}&q=${encodeURIComponent(String(text).slice(0, 200))}`;
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(8_000), headers: { 'User-Agent': UA } });
  if (res.status === 429) throw Object.assign(new Error('translator rate-limited'), { rateLimited: true });
  if (!res.ok) return null;
  const data = await res.json();
  const out = (data?.[0] || []).map(seg => seg?.[0] || '').join('').trim();
  const src = typeof data?.[2] === 'string' ? data[2].toLowerCase() : '';
  return { text: out, src };
}

// ➤ Sets `te` on every record whose title has an English version that differs from the
// ➤ original. records: the pile's records (t, tl). Answers what happened, for the log.
export async function translateTitles(records, { cache, fetchImpl = fetch, gapMs = 150, maxNew = 800, log = () => {} } = {}) {
  let asked = 0, fromCache = 0, translated = 0, limited = false;
  for (const rec of records) {
    if (!rec.t || rec.tl === 'en') continue;
    const key = `${rec.tl || 'auto'}|${rec.t}`;
    let entry = cache[key];
    if (!entry) {
      if (limited || asked >= maxNew) continue;
      if (asked) await sleep(gapMs);
      try {
        const r = await askTranslator(rec.t, rec.tl || 'auto', fetchImpl);
        asked++;
        if (!r) continue;
        entry = { en: r.text, src: r.src };
        cache[key] = entry;
      } catch (e) {
        if (e.rateLimited) { limited = true; log('translator: rate-limited, the rest waits for the next build'); }
        continue;
      }
    } else fromCache++;
    if (entry.en && entry.src !== 'en' && fold(entry.en) !== fold(rec.t)) { rec.te = entry.en; translated++; }
  }
  return { asked, fromCache, translated, limited };
}
