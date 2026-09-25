// ➤ Reading a careers site the way a search engine does, without an API: its robots.txt
// ➤ (what may be read, how fast, where the sitemaps are), its sitemaps (the addresses of
// ➤ the vacancy pages) and the schema.org JobPosting block each vacancy page publishes for
// ➤ search engines: the same fields an ATS would hand over. Pure functions here; the
// ➤ fetching is in the adapter and the scout.
import { text, decodeEntities } from '../adapters/boards.mjs';
import { tagMode } from '../work-mode.mjs';

// ➤ robots.txt lives in builder/robots.mjs; these stay importable from here.
export { parseRobots, allowed, robotsPath } from '../robots.mjs';

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
// ➤ Some portals put the whole title in the address and mark the vacancy with the number it
// ➤ carries on their system, with no job word anywhere: rexx does it on 234 of the employers'
// ➤ sites read here ("IT-Operations-Manager-de-j1186.html").
const NUMBERED = /-[a-z]{2,3}-j\d+\.html$/;
export const looksLikeJob = url => {
  const path = String(url || '').replace(/^https?:\/\/[^/]+/, '').toLowerCase();
  return JOBBY.test(path) || NUMBERED.test(path);
};

// ➤ The shape of an address with its names taken out: "/o/ict-medewerker-2-112" and
// ➤ "/o/dotnet-angular" are both "/o/W". A site whose vacancies were seen at addresses of one
// ➤ shape names the rest of them the same way, in whatever language, so a handful of known
// ➤ vacancy addresses opens a site no word list would have opened. A shape that is names and
// ➤ nothing else ("/W"), or names under a language ("/de/W"), describes every page there is,
// ➤ and is not used.
const LANG = /^(de|en|nl|fr|es|it|pt|sv|no|nb|nn|da|fi|pl|cs|sk|hu|ro|bg|el|hr|sl|et|lv|lt|tr|ru|uk|ca|eu|gl|ga|is|mt|sr|bs|mk|sq|be|zh|ja|ko|ar|he|hi)$/;
// ➤ A site that carries a hiring block on every page it has teaches the shape of its articles:
// ➤ where a site keeps its reading is not where it keeps its vacancies.
const CONTENT = /^(article|articles|news|newsroom|blog|blogs|post|posts|page|pages|story|stories|press|event|events|product|products|service|services|about|team|insight|insights)$/;
export function pathShape(url) {
  let path;
  try { path = new URL(url).pathname; } catch { return ''; }
  const parts = path.split('/').filter(Boolean).map(p => (p.length > 8 || /\d/.test(p) ? 'W' : p.toLowerCase()));
  if (parts.some(p => CONTENT.test(p))) return '';
  return parts.some(p => p !== 'W' && !LANG.test(p)) ? '/' + parts.join('/') : '';
}

// ➤ Links on a page that look like vacancy pages of the same site: what a listing page
// ➤ offers when the sitemap names only the listing. shapes: the site's own vacancy shapes.
export function jobLinks(html, pageUrl, shapes) {
  const base = new URL(pageUrl);
  const out = new Set();
  for (const m of String(html || '').matchAll(/<a\s[^>]*href\s*=\s*["']([^"'#]+)["']/gi)) {
    let u;
    try { u = new URL(text(m[1]), base); } catch { continue; }
    if (u.host !== base.host || u.href === base.href) continue;
    if (!looksLikeJob(u.href) && !(shapes && shapes.has(pathShape(u.href)))) continue;
    if (u.pathname.replace(/\/$/, '') === base.pathname.replace(/\/$/, '')) continue;
    out.add(u.href.split('#')[0]);
  }
  return [...out];
}

// ➤ The day a site names. The schema asks for 2026-09-07 or a whole timestamp; sites also write
// ➤ the month unpadded ("2026-9-4", "2026/9/04"), the way Java prints a date ("Wed Sep 09
// ➤ 02:00:00 UTC 2026", every SAP SuccessFactors careers site), with the month in words
// ➤ ("September 9, 2026", "27 augustus 2026", "Wed, 09 Sep 2026") or with dots ("18.09.2026").
// ➤ Day and month in figures with slashes only when they cannot be swapped ("25/08/2026"); a
// ➤ date without its year ("Mon Aug 24") names no day.
// ➤ The months as the sites' languages write them, whole or shortened the usual way.
const MONTHS = new Map([
  'january jan januar januari janvier enero gennaio janeiro', 'february feb februar februari fevrier febrero febbraio fevereiro',
  'march mar marz maerz maart mars marzo marco marts', 'april apr avril abril aprile',
  'may mai mei maj mayo maggio maio', 'june jun juni juin junio giugno junho',
  'july jul juli juillet julio luglio julho', 'august aug augustus augusti aout agosto',
  'september sep sept septembre septiembre settembre setembro', 'october oct oktober octobre octubre ottobre outubro',
  'november nov novembre noviembre novembro', 'december dec dezember decembre diciembre dicembre dezembro',
].flatMap((names, i) => names.split(' ').map(n => [n, i + 1])));
const monthOf = w => MONTHS.get(String(w).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()) || 0;
function calendarDay(y, m, d) {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d || y < 2000 || y > new Date().getUTCFullYear() + 1) return '';
  return date.toISOString().slice(0, 10);
}
export function day(v) {
  const s = String(v || '').trim();
  let m;
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?![\d])/))) return calendarDay(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^\p{L}{3,9},? (\p{L}{3,9})\.? (\d{1,2}) (?:\d{1,2}:\d{2}(?::\d{2})? )?(?:[a-z]{2,5} )?(\d{4})$/iu)) && monthOf(m[1])) return calendarDay(+m[3], monthOf(m[1]), +m[2]);
  if ((m = s.match(/^(?:\p{L}{3,9},? )?(\d{1,2})\.? (\p{L}{3,9})\.?,? (\d{4})(?![\d])/iu)) && monthOf(m[2])) return calendarDay(+m[3], monthOf(m[2]), +m[1]);
  if ((m = s.match(/^(\p{L}{3,9})\.? (\d{1,2})(?:st|nd|rd|th)?,? (\d{4})(?![\d])/iu)) && monthOf(m[1])) return calendarDay(+m[3], monthOf(m[1]), +m[2]);
  if ((m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?![\d])/))) return calendarDay(+m[3], +m[2], +m[1]);
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?![\d])/))) {
    const [a, b] = [+m[1], +m[2]];
    if (a > 12 && b <= 12) return calendarDay(+m[3], b, a);
    if (b > 12 && a <= 12) return calendarDay(+m[3], a, b);
  }
  return '';
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
  // ➤ SAP SuccessFactors writes the whole place in the street's field ("Bogota, CO").
  const location = [prop('addressLocality'), prop('addressRegion'), country].filter(Boolean).join(', ') || prop('streetAddress');
  return [{
    title, company: prop('hiringOrganization'), location, country: /^[A-Za-z]{2}$/.test(country) ? country.toLowerCase() : '',
    url: pageUrl, description: prop('description'), posted: day(prop('datePosted')), expires: day(prop('validThrough')), remote: /remote/i.test(location),
  }];
}

// ➤ The pay a JobPosting states (`baseSalary`), as its fields give it; builder/pay.mjs reads
// ➤ and checks it. Sites fill the block loosely: the amount in `value` or in `minValue` and
// ➤ `maxValue`, the period on the amount or on the salary, the currency on the salary or on
// ➤ the posting (`salaryCurrency`).
const isPartTime = type => { const t = [].concat(type || []).map(x => String(x).toUpperCase().replace(/[^A-Z]/g, '')); return t.includes('PARTTIME') && !t.includes('FULLTIME'); };
export function salaryOf(node) {
  const base = [].concat(node?.baseSalary || [])[0];
  if (!base || typeof base !== 'object') return null;
  const amount = base.value && typeof base.value === 'object' ? base.value : { value: base.value };
  const min = amount.minValue ?? amount.value, max = amount.maxValue ?? amount.value;
  if (min == null && max == null) return null;
  return { min, max, currency: base.currency || node.salaryCurrency || '', period: amount.unitText || base.unitText || '', partTime: isPartTime(node.employmentType) };
}

// ➤ Every JobPosting on a page, with the fields the pile keeps: the JSON-LD blocks, else the
// ➤ microdata. Nested organisations and places are read leniently: sites follow the schema
// ➤ loosely.
// ➤ Plenty of sites write the block by hand and leave a real newline or tab inside a string,
// ➤ which strict JSON refuses and search engines forgive. The control characters inside
// ➤ strings are escaped and the block is read after all; everything outside a string is left
// ➤ exactly as it was, so a block that is truly broken still fails.
export function repairJson(json) {
  const ESCAPED = { '\n': '\\n', '\r': '\\r', '\t': '\\t' };
  let out = '', inString = false, escaped = false;
  for (const ch of String(json)) {
    if (escaped) { out += ch; escaped = false; continue; }
    if (ch === '\\') { out += ch; escaped = true; continue; }
    if (ch === '"') { inString = !inString; out += ch; continue; }
    if (inString && ch < ' ') { out += ESCAPED[ch] || ' '; continue; }
    out += ch;
  }
  return out;
}
export function jobPostings(html, pageUrl) {
  const out = [];
  // ➤ Sites write the title and the company with HTML entities in them ("B2B &#8211; Pós-Venda"):
  // ➤ what the visitor should read is the character, not the escape.
  const str = v => (typeof v === 'string' ? decodeEntities(v).trim() : Array.isArray(v) ? str(v[0]) : v && typeof v === 'object' ? str(v.name || v['@value'] || v.text) : '');
  for (const m of String(html || '').matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let parsed;
    const block = m[1].replace(/^\s*<!--|-->\s*$/g, '');
    try { parsed = JSON.parse(block); } catch { try { parsed = JSON.parse(repairJson(block)); } catch { continue; } }
    const nodes = [].concat(parsed?.['@graph'] || parsed || []).flatMap(n => [n, ...[].concat(n?.mainEntity || [])]);
    for (const node of nodes) {
      const type = [].concat(node?.['@type'] || []);
      if (!type.includes('JobPosting')) continue;
      const places = [].concat(node.jobLocation || []);
      const address = places.map(l => l?.address).find(a => a && typeof a === 'object') || { streetAddress: places.map(l => l?.address).find(a => typeof a === 'string') || '' };
      const country = str(address.addressCountry);
      // ➤ Without a town, region or country, the place is whatever the address does say: the
      // ➤ address as one line ("Dublin"), the street's field, its name.
      const location = [str(address.addressLocality), str(address.addressRegion), country].filter(Boolean).join(', ')
        || str(address.streetAddress) || str(address.name) || str(places[0]) || (node.jobLocationType === 'TELECOMMUTE' ? 'Remote' : '');
      const title = str(node.title) || str(node.name);
      if (!title) continue;
      const telecommute = [].concat(node.jobLocationType || []).includes('TELECOMMUTE');
      out.push({
        title, company: str(node.hiringOrganization), location, country: /^[A-Za-z]{2}$/.test(country) ? country.toLowerCase() : '',
        url: str(node.url) || pageUrl, description: text(node.description || ''),
        posted: day(str(node.datePosted)), expires: day(str(node.validThrough)),
        remote: telecommute || /remote/i.test(location),
        mode: telecommute ? 'remote' : '', modeTag: tagMode(typeof node.description === 'string' ? node.description : ''),
        pay: salaryOf(node),
      });
    }
  }
  return out.length ? out : microdataPostings(html, pageUrl);
}

// ➤ The hosts a crawler of employers' own pages never follows: job boards and aggregators
// ➤ (their terms), recruitment agencies, social networks. A host is one of them when its
// ➤ registrable name is in the list ("jobs.linkedin.com", "es.indeed.com").
export const BOARD_HOSTS = /(?:^|\.)(?:facebook|twitter|x|instagram|youtube|tiktok|xing|wikipedia|freelance-informatique|rollingadz|php-resource|qreer|studentjob|jobteaser|indeed|linkedin|glassdoor|monster|stepstone|infojobs|infoempleo|tecnoempleo|jobrapido|jooble|adzuna|talent|neuvoo|trovit|mitula|careerjet|jobted|jobijoba|kimeta|jobware|stellenanzeigen|jobvector|hays|adecco|randstad|manpower|michaelpage|robertwalters|reed|totaljobs|cv-library|jobsite|welcometothejungle|jobteaser|hellowork|apec|francetravail|pole-emploi|arbeitsagentur|arbeitnow|jobs\.ch|jobscout24|karriere\.at|willhaben|pracuj|olx|jobs\.cz|profesia|nofluffjobs|justjoin|jobs\.bg|ejobs|bestjobs|cvbankas|cv\.lv|cvkeskus|duunitori|oikotie|finn|nav\.no|jobindex|jobnet|arbetsformedlingen|platsbanken|ledigajobb|blocket|jobsora|jobsinnetwork|jobs\.de|jobcenter|jobbnorge|thelocal|eurojobs|eures|ziprecruiter|simplyhired|careerbuilder)\.[a-z.]+$/i;

// ➤ The words a careers link carries, in the languages of the sites read.
const CAREER_WORDS = /(?:^|[^a-z])(?:careers?|jobs?|vacanc(?:y|ies)|talento?|[uú]nete|trabajar|emprego|recruit(?:ing|ment)?|work[-\s]with[-\s]us|join[-\s]us|work(?:ing)?[-\s](?:with|for|at)[-\s]us|empleo|trabaja[-\s]con[-\s]nosotros|ofertas[-\s]de[-\s]empleo|carri[eè]res?|emplois?|recrutement|nous[-\s]rejoindre|karriere|stellen(?:angebote|anzeigen)?|vacatures?|werken[-\s]bij|lediga[-\s]jobb|jobb|ledige[-\s]stillinger|stillinger|kariera|praca|oferty[-\s]pracy|lavora[-\s]con[-\s]noi|carriere|posizioni[-\s]aperte|carreiras?|recrutamento|voln[aá][-\s]m[ií]sta|kari[eé]ra|vakances)(?![a-z])/i;

// ➤ The links on a page that lead to a careers section, by the words in their address or
// ➤ their text; the address is the stronger sign, a link to another host (an ATS) stronger
// ➤ still. Ordered by that, strongest first.
export function careerLinks(html, pageUrl) {
  const base = new URL(pageUrl);
  const scored = new Map();
  for (const m of String(html || '').matchAll(/<a\s[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let u;
    try { u = new URL(text(m[1]), base); } catch { continue; }
    if (!/^https?:$/.test(u.protocol) || BOARD_HOSTS.test(u.hostname)) continue;
    const label = text(m[2]).replace(/\s+/g, ' ').trim();
    const inHref = CAREER_WORDS.test(u.hostname + u.pathname), inText = CAREER_WORDS.test(label);
    if (!inHref && !inText) continue;
    const href = u.href.split('#')[0];
    scored.set(href, Math.max(scored.get(href) || 0, (inHref ? 2 : 0) + (inText ? 1 : 0) + (u.host === base.host ? 0 : 2)));
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
  ['teamtailor', /https?:\/\/(?!tt\.|cdn\.|static\.|app\.|www\.|assets\.|images\.|api\.)([a-z0-9-]+)\.teamtailor\.com/i],
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
  // ➤ A Teamtailor site on the company's own domain: the page carries the vendor's assets, and
  // ➤ its /jobs.rss reads like any Teamtailor board.
  if (/teamtailor/i.test(String(html || ''))) { try { return { ats: 'teamtailor', slug: new URL(url).origin }; } catch { /* no origin */ } }
  for (const [vendor, re] of VENDOR_MARKS) if (re.test(s)) return { vendor };
  return {};
}

// ➤ The company a feed belongs to, from its channel title: "Jobs at SAP", "Careers at Vestas",
// ➤ "Ofertas de empleo de Navantia" are SAP, Vestas, Navantia.
export function feedName(xml) {
  const title = text((String(xml || '').match(/<channel>\s*<title>([\s\S]*?)<\/title>/i) || [])[1] || '').trim();
  return title.replace(/^(?:jobs?|careers?|vacancies|vacatures|stellen(?:angebote)?|ofertas(?:\s+de\s+(?:empleo|trabajo))?|offres(?:\s+d'emploi)?|emplois?)\s+(?:at|en|de|bei|chez|van|with|@)\s+/i, '').replace(/\s*[-|:]\s*(?:jobs?|careers?|karriere|empleo)\s*$/i, '').trim();
}
