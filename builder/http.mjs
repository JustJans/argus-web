// ➤ One polite way to fetch for every adapter: a browser-like User-Agent that names the
// ➤ project, a hard timeout, three tries on a server error, a stop on "too many requests",
// ➤ and a gap between calls to the same host so no source is ever hammered.
const UA = 'Mozilla/5.0 (compatible; ArgusWeb/0.1; +https://github.com/JustJans/argus-web)';
const TIMEOUT_MS = 20_000;
const nextSlot = new Map();   // ➤ per host: when the next request may fire

async function pace(host, gapMs) {
  const now = Date.now();
  const slot = Math.max(now, nextSlot.get(host) || 0);
  nextSlot.set(host, slot + gapMs);
  if (slot > now) await new Promise(r => setTimeout(r, slot - now));
}

// ➤ GET a URL; answers the Response, or throws after the last failed try. `gapMs` is the
// ➤ minimum distance between two calls to the same host (default 250 ms); `timeoutMs` the
// ➤ wait for one answer (default 20 s).
export async function get(url, { headers = {}, gapMs = 250, tries = 3, timeoutMs = TIMEOUT_MS } = {}) {
  const host = new URL(url).hostname;
  let lastError;
  for (let attempt = 0; attempt < tries; attempt++) {
    await pace(host, gapMs);
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, ...headers }, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
      if (res.status === 429) { nextSlot.set(host, Date.now() + 30_000); lastError = new Error(`429 from ${host}`); continue; }
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
