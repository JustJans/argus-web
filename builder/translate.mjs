// ➤ Titles in English, exactly the way the Telegram bot does it: Argus's own translateTitle
// ➤ (Google's free translator, a second attempt with the country's language when the first
// ➤ comes back unchanged). This file only adds what a pile needs and a bot does not: a cache
// ➤ of its own on disk, so a title is asked once across builds, a cap per build, and a stop
// ➤ when the translator starts answering 429. The English travels as `te` next to the
// ➤ original `t`, only when it differs.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { translateTitle } from 'argus/server-bot/notify.mjs';
import { fold } from 'argus/server-bot/text.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ➤ The cache is the bot's Map, persisted as JSON: only real translations are kept, so a
// ➤ title the translator could not answer is asked again next time.
export function loadCache(path) {
  try { return new Map(existsSync(path) ? Object.entries(JSON.parse(readFileSync(path, 'utf-8'))) : []); } catch { return new Map(); }
}
export function saveCache(path, cache) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(Object.fromEntries(cache)));
}

export async function translateTitles(records, { cache = new Map(), fetchImpl = fetch, gapMs = 150, maxNew = 800, log = () => {} } = {}) {
  let asked = 0, fromCache = 0, translated = 0, limited = false;
  // ➤ A 429 anywhere stops the asking for this build; the bot's function swallows errors,
  // ➤ so the answer is watched on the way in.
  const watched = async (url, opts) => { const res = await fetchImpl(url, opts); if (res.status === 429) limited = true; return res; };
  for (const rec of records) {
    if (!rec.t || rec.tl === 'en') continue;
    const key = `${rec.t} ${rec.l || ''}`;
    let out;
    if (cache.has(key)) { out = cache.get(key); fromCache++; }
    else {
      if (limited || asked >= maxNew) continue;
      if (asked) await sleep(gapMs);
      const scratch = new Map();
      out = await translateTitle(rec.t, rec.l || '', { fetchImpl: watched, cache: scratch });
      asked++;
      if (limited) { log('translator: rate-limited, the rest waits for the next build'); continue; }
      if (fold(out) !== fold(rec.t)) cache.set(key, out);
    }
    if (out && fold(out) !== fold(rec.t)) { rec.te = out; translated++; }
  }
  return { asked, fromCache, translated, limited };
}
