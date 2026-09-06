// ➤ Reading a careers site the way a search engine does, without an API: its robots.txt
// ➤ (what may be read, how fast, where the sitemaps are), its sitemaps (the addresses of
// ➤ the vacancy pages) and the schema.org JobPosting block each vacancy page publishes for
// ➤ search engines: the same fields an ATS would hand over. Pure functions here; the
// ➤ fetching is in the adapter and the scout.
import { text } from '../adapters/boards.mjs';

// ➤ robots.txt: the Disallow lines that bind everyone or us, the crawl delay, the sitemaps.
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
  const mine = groups.find(g => g.agents.some(a => a === agent)) || groups.find(g => g.agents.includes('*')) || { rules: [], delay: 0 };
  const sitemaps = [...String(txt || '').matchAll(/^\s*sitemap\s*:\s*(\S+)/gim)].map(m => m[1]);
  return { rules: mine.rules, delay: mine.delay, sitemaps };
}

// ➤ May this path be read? The most specific rule wins, as the standard says.
export function allowed(robots, path) {
  const p = String(path || '/');
  let best = null;
  for (const r of robots?.rules || []) {
    const pattern = r.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$');
    if (new RegExp(`^${pattern}`).test(p) && (!best || r.path.length > best.path.length)) best = r;
  }
  return !best || best.allow;
}

// ➤ A sitemap or a sitemap index: the addresses it lists, with their lastmod when given.
export function parseSitemap(xml) {
  const s = String(xml || '');
  const index = /<sitemapindex/i.test(s);
  const items = [...s.matchAll(/<(?:url|sitemap)>([\s\S]*?)<\/(?:url|sitemap)>/gi)].map(m => {
    const loc = (m[1].match(/<loc>\s*([^<\s]+)\s*<\/loc>/i) || [])[1];
    const lastmod = (m[1].match(/<lastmod>\s*([^<\s]+)\s*<\/lastmod>/i) || [])[1] || '';
    return loc ? { url: text(loc).trim(), lastmod: lastmod.slice(0, 10) } : null;
  }).filter(Boolean);
  return { index, items };
}

// ➤ Addresses that look like vacancy pages, in the languages of the sites read.
const JOBBY = /\/(?:[a-z]{2}\/)?(?:jobs?|jobb|joburi|job-?(?:detail|offer|posting|opening|listing)s?|vacanc(?:y|ies)|vacante|vacantes|vacature|vacatures|vakance|vakances|career|careers|carriere|carrieres|carreira|carreiras|cariere|karriere|karrier|kariera|karijera|stellen(?:angebot|anzeige|markt)?e?|stelle|offres?(?:-d-?emploi)?|emploi|empleo|ofertas?(?:-de-(?:empleo|trabajo))?|trabajo|trabalho|vaga|vagas|lavoro|posizion[ei]|lediga-jobb|ledige-stillinger|stilling|stillinger|tyopaikat|avoimet|rekry|praca|oferty|volna-mista|nabidka|kariera|allas|allasok|posao|zaposlitev|darbo|toopakkumised|position|positions|opening|openings|recruit|recrutement|rekrutacja)(?:[/?#.-]|$)/i;
export const looksLikeJob = url => JOBBY.test(String(url || '').replace(/^https?:\/\/[^/]+/, '').toLowerCase());

// ➤ Links on a page that look like vacancy pages of the same site: what a listing page
// ➤ offers when the sitemap names only the listing.
export function jobLinks(html, pageUrl) {
  const base = new URL(pageUrl);
  const out = new Set();
  for (const m of String(html || '').matchAll(/<a\s[^>]*href\s*=\s*["']([^"'#]+)["']/gi)) {
    let u;
    try { u = new URL(text(m[1]), base); } catch { continue; }
    if (u.host !== base.host || u.href === base.href || !looksLikeJob(u.href)) continue;
    if (u.pathname.replace(/\/$/, '') === base.pathname.replace(/\/$/, '')) continue;
    out.add(u.href.split('#')[0]);
  }
  return [...out];
}

// ➤ The older way of marking a vacancy up: microdata (itemtype JobPosting, itemprop fields).
// ➤ Read leniently: a property is its content attribute, else the text inside its tag.
function microdataPostings(html, pageUrl) {
  const s = String(html || '');
  if (!/itemtype\s*=\s*["']https?:\/\/schema\.org\/JobPosting["']/i.test(s)) return [];
  const prop = name => {
    const m = s.match(new RegExp(`<([a-z0-9]+)[^>]*itemprop\\s*=\\s*["']${name}["'][^>]*?(?:\\scontent\\s*=\\s*["']([^"']*)["'][^>]*)?>`, 'i'));
    if (!m) return '';
    if (m[2] !== undefined) return text(m[2]).trim();
    const after = s.slice(m.index + m[0].length);
    const close = after.search(new RegExp(`</${m[1]}\\s*>`, 'i'));
    return text(close >= 0 ? after.slice(0, close) : after.slice(0, 400)).trim();
  };
  const title = prop('title') || prop('name');
  if (!title) return [];
  const country = prop('addressCountry');
  const location = [prop('addressLocality'), prop('addressRegion'), country].filter(Boolean).join(', ');
  return [{
    title, company: prop('hiringOrganization'), location, country: /^[A-Za-z]{2}$/.test(country) ? country.toLowerCase() : '',
    url: pageUrl, description: prop('description'), posted: prop('datePosted').slice(0, 10), expires: prop('validThrough').slice(0, 10), remote: /remote/i.test(location),
  }];
}

// ➤ Every JobPosting on a page, with the fields the pile keeps: the JSON-LD blocks, else the
// ➤ microdata. Nested organisations and places are read leniently: sites follow the schema
// ➤ loosely.
export function jobPostings(html, pageUrl) {
  const out = [];
  const str = v => (typeof v === 'string' ? v.trim() : Array.isArray(v) ? str(v[0]) : v && typeof v === 'object' ? str(v.name || v['@value'] || v.text) : '');
  for (const m of String(html || '').matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let parsed;
    try { parsed = JSON.parse(m[1].replace(/^\s*<!--|-->\s*$/g, '')); } catch { continue; }
    const nodes = [].concat(parsed?.['@graph'] || parsed || []).flatMap(n => [n, ...[].concat(n?.mainEntity || [])]);
    for (const node of nodes) {
      const type = [].concat(node?.['@type'] || []);
      if (!type.includes('JobPosting')) continue;
      const places = [].concat(node.jobLocation || []);
      const address = places.map(l => l?.address).find(a => a && typeof a === 'object') || (typeof places[0]?.address === 'string' ? { streetAddress: places[0].address } : {});
      const country = str(address.addressCountry);
      const location = [str(address.addressLocality), str(address.addressRegion), country].filter(Boolean).join(', ') || str(places[0]) || (node.jobLocationType === 'TELECOMMUTE' ? 'Remote' : '');
      const title = str(node.title) || str(node.name);
      if (!title) continue;
      out.push({
        title, company: str(node.hiringOrganization), location, country: /^[A-Za-z]{2}$/.test(country) ? country.toLowerCase() : '',
        url: str(node.url) || pageUrl, description: text(node.description || ''),
        posted: str(node.datePosted).slice(0, 10), expires: str(node.validThrough).slice(0, 10),
        remote: node.jobLocationType === 'TELECOMMUTE' || /remote/i.test(location),
      });
    }
  }
  return out.length ? out : microdataPostings(html, pageUrl);
}
