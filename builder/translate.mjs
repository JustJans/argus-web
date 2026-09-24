// ➤ Titles in English, and in Spanish for the Spanish site. Azure Translator, Microsoft's
// ➤ official API, answers a hundred titles a request; its free tier gives two million
// ➤ characters a month and stops, without charging, once they are spent. Microsoft asks for
// ➤ the free tier's hourly quota to be spent evenly, so each request waits for the characters
// ➤ the last one carried.
// ➤ A title is asked once, ever: the cache on disk is keyed by the title alone, so the same
// ➤ role in fifty towns is one question, and a title that needs no translation is remembered
// ➤ as such instead of being asked again every build. The language is named when the source
// ➤ or the country says it; otherwise Azure detects it, and a title it found already written in
// ➤ the next pass's language is not asked for that language at all.
// ➤ When Azure does not answer (no key, the month's characters spent, a rate limit), MyMemory
// ➤ answers instead: one title a request, 50,000 characters a day with a contact address and
// ➤ 5,000 without, so the backlog drains slowly rather than not at all.
// ➤ The English travels as `te` and the Spanish as `ts` next to the original `t`, only when
// ➤ they differ from it; each language has its own cache.
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { dirname } from 'path';
import { languageOfPlace } from 'argus/server-bot/notify.mjs';
import { fold } from 'argus/server-bot/text.mjs';
import { writeFileAtomic } from 'argus/server-bot/fs-atomic.mjs';

const ENDPOINT = 'https://api.cognitive.microsofttranslator.com/translate?api-version=3.0';
const TITLES_A_REQUEST = 100;     // ➤ Azure takes up to 1,000 texts and 50,000 characters a request
const CHARS_A_REQUEST = 40_000;
const CHARS_A_MINUTE = 33_000;    // ➤ two million an hour, spent evenly, as the free tier asks
const TITLES_A_BUILD = 4000;      // ➤ new titles per build: a backlog clears over a few builds
const NOTHING = '';               // ➤ cached answer for "this title is already in that language"
const AZURE_CODE = { no: 'nb', nn: 'nb' };   // ➤ Azure's Norwegian is "nb"
const SPARE = 'https://api.mymemory.translated.net/get';
const SPARE_TITLES_A_BUILD = 150;
const SPARE_GAP_MS = 900;

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ➤ The cache is a Map on disk: title → its translation, or NOTHING when the translator said
// ➤ there was nothing to translate. A title it could not answer is not cached, so it is
// ➤ asked again next build.
export function loadCache(path) {
  try { return new Map(existsSync(path) ? Object.entries(JSON.parse(readFileSync(path, 'utf-8'))) : []); } catch { return new Map(); }
}
export function saveCache(path, cache) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileAtomic(path, JSON.stringify(Object.fromEntries(cache)));
}

// ➤ One request, many titles, answered in the order sent; without a language named, Azure
// ➤ detects it and says which. `rows` is [] when the request failed, and `stop` says why Azure
// ➤ will not answer for the rest of the build. `used` is the characters Azure counted.
async function ask(titles, sl, tl, { key, region, fetchImpl }) {
  const from = sl === 'auto' ? '' : `&from=${AZURE_CODE[sl] || sl}`;
  const headers = { 'Ocp-Apim-Subscription-Key': key, 'Content-Type': 'application/json; charset=UTF-8' };
  if (region && region !== 'global') headers['Ocp-Apim-Subscription-Region'] = region;
  let res;
  try {
    res = await fetchImpl(`${ENDPOINT}&to=${tl}${from}`, { method: 'POST', headers, body: JSON.stringify(titles.map(Text => ({ Text }))), signal: AbortSignal.timeout(20_000) });
  } catch { return { rows: [] }; }
  if (!res.ok) {
    const error = (await res.json().catch(() => null))?.error || {};
    if (res.status === 401) return { rows: [], stop: 'the Azure key is missing or wrong' };
    if (error.code === 403001) return { rows: [], stop: "Azure's free characters for this month are spent" };
    if (res.status === 403) return { rows: [], stop: `Azure refused: ${error.message || 'no reason given'}` };
    if (res.status === 429) return { rows: [], stop: 'Azure asks for a rest' };
    // ➤ A language Azure does not know by that code: the batch is asked again for it to detect.
    if (res.status === 400 && from) return ask(titles, 'auto', tl, { key, region, fetchImpl });
    return { rows: [] };
  }
  let data;
  try { data = await res.json(); } catch { return { rows: [] }; }
  const used = Number(res.headers?.get?.('x-metered-usage')) || 0;
  const rows = (Array.isArray(data) ? data : []).map(r => ({ text: String(r?.translations?.[0]?.text ?? '').trim(), lang: r?.detectedLanguage?.language || '' }));
  return { rows, used };
}

// ➤ The spare translator: one title, one request, and it must be told both languages. It
// ➤ says when the day's free quota is spent.
async function askSpare(title, sl, tl, email, fetchImpl) {
  const url = `${SPARE}?q=${encodeURIComponent(title)}&langpair=${encodeURIComponent(sl)}|${tl}${email ? `&de=${encodeURIComponent(email)}` : ''}`;
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
    if (one.length >= TITLES_A_REQUEST || (one.length && chars + t.length > CHARS_A_REQUEST)) { out.push(one); one = []; chars = 0; }
    one.push(t); chars += t.length;
  }
  if (one.length) out.push(one);
  return out;
}

// ➤ The language to ask in: what the source said, else what the country says, else let the
// ➤ translator detect it.
const languageOf = rec => rec.tl || languageOfPlace(rec.l || '') || 'auto';

// ➤ target: the language to translate into; field: where the record keeps it (te, ts).
// ➤ detected: the languages Azure found in an earlier pass of the same build, title → code.
export async function translateTitles(records, {
  target = 'en', field = 'te', cache = new Map(), detected = new Map(), fetchImpl = fetch, log = () => {},
  key = process.env.AZURE_TRANSLATOR_KEY, region = process.env.AZURE_TRANSLATOR_REGION, spareEmail = process.env.MYMEMORY_EMAIL,
  msAChar = 60_000 / CHARS_A_MINUTE, maxNew = TITLES_A_BUILD,
} = {}) {
  // ➤ What is missing, by language, each title once.
  const wanted = new Map();
  for (const rec of records) {
    if (!rec.t || rec.tl === target || cache.has(rec.t)) continue;
    let lang = languageOf(rec);
    if (lang === 'auto' && detected.has(rec.t)) lang = detected.get(rec.t);
    // ➤ Already in this language: known from the source or the country every build, or from
    // ➤ Azure's detection once, which the cache then remembers.
    if (lang === target) { if (detected.get(rec.t) === target) cache.set(rec.t, NOTHING); continue; }
    if (!wanted.has(lang)) wanted.set(lang, new Set());
    wanted.get(lang).add(rec.t);
  }
  let asked = 0, requests = 0, used = 0, pause = 0, stopped = key ? '' : 'no Azure key';
  outer: for (const [lang, titles] of stopped ? [] : wanted) {
    for (const batch of batches([...titles])) {
      if (asked >= maxNew) break outer;
      if (pause) await sleep(pause);
      const answer = await ask(batch, lang, target, { key, region, fetchImpl });
      requests++;
      asked += batch.length;
      used += answer.used || 0;
      pause = batch.reduce((n, t) => n + t.length, 0) * msAChar;
      if (answer.stop) { stopped = answer.stop; break outer; }
      // ➤ A short answer means the request went wrong: those titles are left for next time.
      if (answer.rows.length !== batch.length) continue;
      batch.forEach((title, i) => {
        const { text, lang: found } = answer.rows[i];
        if (found) detected.set(title, found);
        if (!text) return;
        // ➤ Unchanged, or found to be in the language asked for: there is nothing to translate,
        // ➤ and saying so in the cache is what keeps the next build from asking again.
        cache.set(title, fold(text) === fold(title) || found === target ? NOTHING : text);
      });
    }
  }
  // ➤ Azure did not answer: the spare takes a few, so a build still moves the backlog. Only
  // ➤ titles whose language is known, which is what the spare must be told.
  let spare = 0;
  if (stopped) {
    log(`translator: ${stopped}; the spare answers what it can`);
    outer2: for (const [lang, titles] of wanted) {
      if (lang === 'auto') continue;
      for (const title of titles) {
        if (spare >= SPARE_TITLES_A_BUILD) break outer2;
        if (cache.has(title)) continue;
        if (spare) await sleep(SPARE_GAP_MS);
        const { text, spent } = await askSpare(title, lang, target, spareEmail, fetchImpl);
        spare++;
        if (spent) { log('the spare translator has spent its free quota for today'); break outer2; }
        if (text) cache.set(title, fold(text) === fold(title) ? NOTHING : text);
      }
    }
    if (spare) log(`the spare translator answered ${spare} titles`);
  }

  let translated = 0, fromCache = 0;
  for (const rec of records) {
    if (!rec.t || rec.tl === target) continue;
    const out = cache.get(rec.t);
    if (out === undefined) continue;
    fromCache++;
    if (out && fold(out) !== fold(rec.t)) { rec[field] = out; translated++; }
  }
  return { asked, requests, used, spare, fromCache, translated, limited: Boolean(stopped), stopped };
}
