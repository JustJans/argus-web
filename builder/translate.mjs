// ➤ Titles in English. Google's free translator, the one the Telegram bot uses, also answers
// ➤ MANY titles in one request (translate_a/t with a q per title), so a pile of eighty
// ➤ thousand adverts costs a few dozen requests instead of one per advert: that is the whole
// ➤ point of this file, because asking one at a time hit the rate limit after a few hundred
// ➤ and left every build with most of its foreign titles untranslated.
// ➤ A title is asked once, ever: the cache on disk is keyed by the title alone, so the same
// ➤ role in fifty towns is one question, and a title that needs no translation is remembered
// ➤ as such instead of being asked again every build. The language is named when the source
// ➤ or the country says it (automatic detection reads short titles as English); only then is
// ➤ nothing the matter with "Charpentier naval". A 429 stops the asking for this build.
// ➤ When that endpoint shuts the door on the machine's address, which it does to a server
// ➤ that has asked too often, MyMemory answers instead: one title a request and a free
// ➤ quota of a few thousand words a day, so the backlog drains slowly rather than not at all.
// ➤ The English travels as `te` next to the original `t`, only when it differs.
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { dirname } from 'path';
import { languageOfPlace } from 'argus/server-bot/notify.mjs';
import { fold } from 'argus/server-bot/text.mjs';
import { writeFileAtomic } from 'argus/server-bot/fs-atomic.mjs';

const ENDPOINT = 'https://translate.googleapis.com/translate_a/t';
const TITLES_A_REQUEST = 40;     // ➤ the address stays well under any length limit
const CHARS_A_REQUEST = 1800;    // ➤ and so does its query
const TITLES_A_BUILD = 4000;     // ➤ new titles per build: the backlog clears over a few builds
const GAP_MS = 400;              // ➤ between requests, to stay welcome
const NOTHING = '';              // ➤ cached answer for "this title is already English"
const SPARE = 'https://api.mymemory.translated.net/get';
const SPARE_TITLES_A_BUILD = 150;   // ➤ within the free quota of a few thousand words a day
const SPARE_GAP_MS = 900;

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ➤ The cache is a Map on disk: title → its English, or NOTHING when the translator said
// ➤ there was nothing to translate. A title it could not answer is not cached, so it is
// ➤ asked again next build.
export function loadCache(path) {
  try { return new Map(existsSync(path) ? Object.entries(JSON.parse(readFileSync(path, 'utf-8'))) : []); } catch { return new Map(); }
}
export function saveCache(path, cache) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileAtomic(path, JSON.stringify(Object.fromEntries(cache)));
}

// ➤ One request, many titles. With a named language the answer is a list of strings; with
// ➤ "auto" it is a list of [text, the language it detected]. Answers [] when it fails, and
// ➤ says so when the translator asks for a rest.
async function ask(titles, sl, fetchImpl) {
  const params = new URLSearchParams({ client: 'gtx', sl, tl: 'en' });
  for (const t of titles) params.append('q', t);
  let res;
  try { res = await fetchImpl(`${ENDPOINT}?${params}`, { signal: AbortSignal.timeout(20_000) }); } catch { return { rows: [] }; }
  if (res.status === 429) return { rows: [], limited: true };
  if (!res.ok) return { rows: [] };
  let data;
  try { data = await res.json(); } catch { return { rows: [] }; }
  const list = Array.isArray(data) ? data : [];
  return { rows: list.map(row => (Array.isArray(row) ? { text: String(row[0] ?? '').trim(), lang: String(row[1] ?? '') } : { text: String(row ?? '').trim(), lang: sl })) };
}

// ➤ The spare translator: one title, one request, and it must be told both languages. It
// ➤ says when the day's free quota is spent.
async function askSpare(title, sl, fetchImpl) {
  const url = `${SPARE}?q=${encodeURIComponent(title)}&langpair=${encodeURIComponent(sl)}|en`;
  let res;
  try { res = await fetchImpl(url, { signal: AbortSignal.timeout(20_000) }); } catch { return {}; }
  if (!res.ok) return {};
  let data;
  try { data = await res.json(); } catch { return {}; }
  if (data?.quotaFinished) return { spent: true };
  const text = String(data?.responseData?.translatedText ?? '').trim();
  // ➤ It shouts its complaints in the answer field ("PLEASE SELECT TWO DISTINCT LANGUAGES").
  return /^[A-Z ,'"!.()-]+$/.test(text) && text.length > 25 ? {} : { text };
}

// ➤ Titles into batches that no request will choke on.
function batches(titles) {
  const out = [];
  let one = [], chars = 0;
  for (const t of titles) {
    const cost = encodeURIComponent(t).length + 3;
    if (one.length >= TITLES_A_REQUEST || (one.length && chars + cost > CHARS_A_REQUEST)) { out.push(one); one = []; chars = 0; }
    one.push(t); chars += cost;
  }
  if (one.length) out.push(one);
  return out;
}

// ➤ The language to ask in: what the source said, else what the country says, else let the
// ➤ translator detect it.
const languageOf = rec => rec.tl || languageOfPlace(rec.l || '') || 'auto';

export async function translateTitles(records, { cache = new Map(), fetchImpl = fetch, gapMs = GAP_MS, maxNew = TITLES_A_BUILD, log = () => {} } = {}) {
  // ➤ What is missing, by language, each title once.
  const wanted = new Map();
  for (const rec of records) {
    if (!rec.t || rec.tl === 'en' || cache.has(rec.t)) continue;
    const lang = languageOf(rec);
    if (!wanted.has(lang)) wanted.set(lang, new Set());
    wanted.get(lang).add(rec.t);
  }
  let asked = 0, requests = 0, limited = false;
  outer: for (const [lang, titles] of wanted) {
    for (const batch of batches([...titles])) {
      if (asked >= maxNew) break outer;
      if (requests) await sleep(gapMs);
      const { rows, limited: stop } = await ask(batch, lang, fetchImpl);
      requests++;
      asked += batch.length;
      if (stop) { limited = true; log('translator: rate-limited, the rest waits for the next build'); break outer; }
      // ➤ A short answer means the request went wrong: those titles are left for next time.
      if (rows.length !== batch.length) continue;
      batch.forEach((title, i) => {
        const { text, lang: detected } = rows[i];
        if (!text) return;
        // ➤ Unchanged, or detected as English: there is nothing to translate, and saying so
        // ➤ in the cache is what keeps the next build from asking again.
        cache.set(title, fold(text) === fold(title) || detected === 'en' ? NOTHING : text);
      });
    }
  }
  // ➤ Google said no: the spare takes a few, so a build still moves the backlog. Only
  // ➤ titles whose language is known, which is what the spare must be told.
  let spare = 0;
  if (limited) {
    outer2: for (const [lang, titles] of wanted) {
      if (lang === 'auto') continue;
      for (const title of titles) {
        if (spare >= SPARE_TITLES_A_BUILD) break outer2;
        if (cache.has(title)) continue;
        if (spare) await sleep(SPARE_GAP_MS);
        const { text, spent } = await askSpare(title, lang, fetchImpl);
        spare++;
        if (spent) { log('the spare translator has spent its free quota for today'); break outer2; }
        if (text) cache.set(title, fold(text) === fold(title) ? NOTHING : text);
      }
    }
    if (spare) log(`the spare translator answered ${spare} titles`);
  }

  let translated = 0, fromCache = 0;
  for (const rec of records) {
    if (!rec.t || rec.tl === 'en') continue;
    const out = cache.get(rec.t);
    if (out === undefined) continue;
    fromCache++;
    if (out && fold(out) !== fold(rec.t)) { rec.te = out; translated++; }
  }
  return { asked, requests, spare, fromCache, translated, limited };
}
