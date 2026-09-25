// ➤ robots.txt, as RFC 9309 has it (https://www.rfc-editor.org/rfc/rfc9309): what may be read,
// ➤ how fast, where the sitemaps are. Read once a pass per host and asked before every address
// ➤ of that host an employer's site is read at, the listing calls of the careers platforms read
// ➤ without an API (Workday, Oracle) included.
import { get } from './http.mjs';

// ➤ The groups that name us, else the groups for everyone, all of them combined when there are
// ➤ several; the crawl delay (the longest one given); the sitemaps.
export function parseRobots(txt, agent = 'argusweb') {
  const groups = [];
  let current = null;
  for (const raw of String(txt || '').split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase(), value = m[2].trim();
    if (key === 'user-agent') { if (!current || current.rules.length || current.delay) { current = { agents: [], rules: [], delay: 0 }; groups.push(current); } current.agents.push(value.toLowerCase()); }
    else if (current && key === 'disallow') { if (value) current.rules.push({ allow: false, path: value }); }
    else if (current && key === 'allow') { if (value) current.rules.push({ allow: true, path: value }); }
    else if (current && key === 'crawl-delay') current.delay = Number(value) || 0;
  }
  const named = groups.filter(g => g.agents.includes(agent));
  const mine = named.length ? named : groups.filter(g => g.agents.includes('*'));
  const sitemaps = [...String(txt || '').matchAll(/^\s*sitemap\s*:\s*(\S+)/gim)].map(m => m[1]);
  return { rules: mine.flatMap(g => g.rules), delay: Math.max(0, ...mine.map(g => g.delay)), sitemaps };
}

// ➤ May this address be read? Its path with its query, against the longest rule that matches;
// ➤ between an Allow and a Disallow as long, the Allow (2.2.2). robots.txt itself may always be
// ➤ read.
export function allowed(robots, path) {
  const p = String(path || '/');
  if (p === '/robots.txt') return true;
  let best = null;
  for (const r of robots?.rules || []) {
    const pattern = r.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$');
    if (!new RegExp(`^${pattern}`).test(p)) continue;
    if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) best = r;
  }
  return !best || best.allow;
}

// ➤ The part of an address the rules are matched against.
export const robotsPath = url => { const u = new URL(url); return u.pathname + u.search; };

// ➤ One pass's robots.txt, per host. A file that answers is obeyed; one that is not there (a
// ➤ 4xx) lets everything be read (2.3.1.3); one that does not answer (a server error, a timeout,
// ➤ "too many requests") lets nothing be read (2.3.1.4). rules(url) gives the host's rules and
// ➤ throws when its robots.txt did not answer, so a site whose own robots.txt is silent waits
// ➤ for its next pass; may(url) answers whether an address may be read, false when its host's
// ➤ robots.txt did not answer.
export function robotsOf(opts = {}) {
  const byOrigin = new Map();
  const read = origin => {
    if (!byOrigin.has(origin)) {
      const p = (async () => {
        let res;
        try { res = await get(`${origin}/robots.txt`, { ...opts, tries: 2 }); } catch (e) { throw Object.assign(new Error(`robots.txt of ${new URL(origin).host} did not answer (${String(e.message).slice(0, 40)}): nothing is read`), { status: e.status, until: e.until }); }
        return res.ok ? parseRobots(await res.text()) : { rules: [], delay: 0, sitemaps: [] };
      })();
      p.catch(() => {});
      byOrigin.set(origin, p);
    }
    return byOrigin.get(origin);
  };
  return {
    rules: url => read(new URL(url).origin),
    may: async url => { try { return allowed(await read(new URL(url).origin), robotsPath(url)); } catch { return false; } },
  };
}
