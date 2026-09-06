// ➤ One polite way to fetch for every adapter: a browser-like User-Agent that names the
// ➤ project, a hard timeout, three tries on a server error, a stop on "too many requests",
// ➤ and a gap between calls to the same host so no source is ever hammered.
const UA = 'Mozilla/5.0 (compatible; ArgusWeb/0.1; +https://github.com/JustJans/argus-web)';
const TIMEOUT_MS = 20_000;
const nextSlot = new Map();   // ➤ per host: when the next request may fire
const blocked = new Map();    // ➤ per host: until when it answers "too many requests"

// ➤ "Too many requests": Retry-After says when to come back (seconds or a date; half a
// ➤ minute when absent). Until then every call to the host fails at once, with `status` 429
// ➤ and `until` on the error, so a reader can leave the host for later instead of waiting.
const retryAfterMs = h => { if (!h) return 30_000; const n = Number(h), t = Date.parse(h); return Number.isFinite(n) ? n * 1000 : Number.isFinite(t) ? Math.max(0, t - Date.now()) : 30_000; };
const tooMany = (host, until) => Object.assign(new Error(`${host} says too many requests, back in ${Math.ceil((until - Date.now()) / 60_000)} min`), { status: 429, until });

async function pace(host, gapMs) {
  const now = Date.now();
  const slot = Math.max(now, nextSlot.get(host) || 0);
  nextSlot.set(host, slot + gapMs);
  if (slot > now) await new Promise(r => setTimeout(r, slot - now));
}

// ➤ A promise that gives up after `ms`: a fetch that neither answers nor fails (seen once on
// ➤ Workable, with no connection open) must not hold a lane for ever. What was abandoned goes
// ➤ on in the background until the process ends.
export function deadline(promise, ms) {
  let timer;
  const clock = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('took too long')), ms); });
  return Promise.race([promise, clock]).finally(() => clearTimeout(timer));
}

// ➤ GET a URL; answers the Response, or throws after the last failed try. `gapMs` is the
// ➤ minimum distance between two calls to the same host (default 250 ms); `timeoutMs` the
// ➤ wait for one answer (default 20 s).
export async function get(url, { headers = {}, gapMs = 250, tries = 3, timeoutMs = TIMEOUT_MS } = {}) {
  const host = new URL(url).hostname;
  if (blocked.get(host) > Date.now()) throw tooMany(host, blocked.get(host));
  let lastError;
  for (let attempt = 0; attempt < tries; attempt++) {
    await pace(host, gapMs);
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, ...headers }, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
      if (res.status === 429) {
        const until = Date.now() + retryAfterMs(res.headers.get('retry-after'));
        blocked.set(host, until); nextSlot.set(host, until); lastError = tooMany(host, until);
        if (until - Date.now() > 60_000) break;   // ➤ a long wait: not worth a try now
        continue;
      }
      if (res.status >= 500) { lastError = new Error(`${res.status} from ${host}`); continue; }
      return res;
    } catch (e) { lastError = e; }
  }
  throw lastError || new Error(`no answer from ${host}`);
}

export async function getJson(url, opts) {
  const res = await get(url, { ...opts, headers: { Accept: 'application/json', ...(opts?.headers || {}) } });
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return res.json();
}

export async function getText(url, opts) {
  const res = await get(url, opts);
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return res.text();
}
