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

// ➤ The words a careers link carries, in the languages of the sites read.
const CAREER_WORDS = /(?:^|[^a-z])(?:careers?|jobs?|vacanc(?:y|ies)|join[-\s]us|work(?:ing)?[-\s](?:with|for|at)[-\s]us|empleo|trabaja[-\s]con[-\s]nosotros|ofertas[-\s]de[-\s]empleo|carri[eè]res?|emplois?|recrutement|nous[-\s]rejoindre|karriere|stellen(?:angebote|anzeigen)?|vacatures?|werken[-\s]bij|lediga[-\s]jobb|jobb|ledige[-\s]stillinger|stillinger|kariera|praca|oferty[-\s]pracy|lavora[-\s]con[-\s]noi|carriere|posizioni[-\s]aperte|carreiras?|recrutamento|voln[aá][-\s]m[ií]sta|kari[eé]ra|vakances)(?![a-z])/i;

// ➤ The links on a page that lead to a careers section, by the words in their address or
// ➤ their text; the address is the stronger sign, a link to another host (an ATS) stronger
// ➤ still. Ordered by that, strongest first.
export function careerLinks(html, pageUrl) {
  const base = new URL(pageUrl);
  const scored = new Map();
  for (const m of String(html || '').matchAll(/<a\s[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let u;
    try { u = new URL(text(m[1]), base); } catch { continue; }
    if (!/^https?:$/.test(u.protocol)) continue;
    const label = text(m[2]).replace(/\s+/g, ' ').trim();
    const inHref = CAREER_WORDS.test(u.hostname + u.pathname), inText = CAREER_WORDS.test(label);
    if (!inHref && !inText) continue;
    const href = u.href.split('#')[0];
    scored.set(href, Math.max(scored.get(href) || 0, (inHref ? 2 : 0) + (inText ? 1 : 0) + (u.host === base.host ? 0 : 1)));
  }
  return [...scored.entries()].sort((a, b) => b[1] - a[1]).map(([u]) => u);
}

// ➤ The next page of a listing: a rel="next" link, or a link that says "next" in the
// ➤ languages of the sites read. Empty when the listing ends.
const NEXT_WORDS = /^(?:next|next page|siguiente|suivant|suivante|weiter|nächste|volgende|nästa|neste|næste|następna|dalej|další|seguente|successiva|próxima|seguinte|›|»|>|→)$/i;
export function nextLink(html, pageUrl) {
  const base = new URL(pageUrl);
  const s = String(html || '');
  const rel = s.match(/<(?:a|link)\s[^>]*rel\s*=\s*["']next["'][^>]*href\s*=\s*["']([^"'#]+)["']/i) || s.match(/<(?:a|link)\s[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*rel\s*=\s*["']next["']/i);
  let found = rel?.[1] || '';
  if (!found) {
    for (const m of s.matchAll(/<a\s[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      const label = text(m[2]).replace(/\s+/g, ' ').trim();
      if (NEXT_WORDS.test(label) || /aria-label\s*=\s*["'](?:next|siguiente|suivant|weiter|volgende|nästa)/i.test(m[0])) { found = m[1]; break; }
    }
  }
  if (!found) return '';
  try { const u = new URL(text(found), base); return u.host === base.host && u.href !== base.href ? u.href : ''; } catch { return ''; }
}

// ➤ The platform behind a careers address, from the address itself or from what the page
// ➤ embeds or links to: an ATS with its slug (read through the boards adapter), a vendor
// ➤ whose pages are drawn by JavaScript (named, not read), or nothing known (a site, read
// ➤ through its feed, sitemap or listing).
const ATS_MARKS = [
  ['greenhouse', /(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io\/(?:embed\/job_board(?:\/js)?\?for=)?([a-z0-9_-]+)/i],
  ['lever', /jobs\.(?:eu\.)?lever\.co\/([a-z0-9_-]+)/i],
  ['ashby', /jobs\.ashbyhq\.com\/([a-z0-9_.-]+)/i],
  ['smartrecruiters', /(?:jobs|careers)\.smartrecruiters\.com\/(?!my-applications|oneclick-ui|sign-in|api)([A-Za-z0-9_-]+)/],
  ['recruitee', /https?:\/\/([a-z0-9-]+)\.recruitee\.com/i],
  ['personio', /https?:\/\/([a-z0-9-]+)\.jobs\.personio\.(?:de|com)/i],
  ['workable', /apply\.workable\.com\/(?!api\/)([a-z0-9-]+)/i],
  ['teamtailor', /https?:\/\/([a-z0-9-]+)\.teamtailor\.com/i],
  ['workday', /https?:\/\/([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com\/(?:[a-z]{2}-[A-Za-z]{2}\/)?(?!wday\/)([A-Za-z0-9_-]+)/],
  ['oracle', /https?:\/\/([a-z0-9.-]+\.oraclecloud\.com)\/hcmUI\/CandidateExperience\/[a-z]{2}\/sites\/([A-Za-z0-9_]+)/],
];
const VENDOR_MARKS = [['icims', /[a-z0-9-]+\.icims\.com/i], ['eightfold', /[a-z0-9-]+\.eightfold\.ai/i], ['taleo', /[a-z0-9-]+\.taleo\.net/i], ['softgarden', /[a-z0-9-]+\.softgarden\.io/i]];
export function detectPlatform(url, html = '') {
  const s = `${url}\n${String(html || '')}`;
  for (const [ats, re] of ATS_MARKS) {
    const m = s.match(re);
    if (!m) continue;
    if (ats === 'workday') return { ats, slug: `${m[1]}.${m[2]}/${m[3]}` };
    if (ats === 'oracle') return { ats, slug: `${m[1]}/${m[2]}` };
    return { ats, slug: m[1] };
  }
  for (const [vendor, re] of VENDOR_MARKS) if (re.test(s)) return { vendor };
  return {};
}
