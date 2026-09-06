// ➤ Company boards on applicant-tracking systems with a documented public API: one entry
// ➤ per company in config/companies.yml, the whole board read on every build (absence of
// ➤ an advert means it closed). These boards carry no occupation code, so their adverts
// ➤ are classified by title later. Greenhouse, Ashby, Lever and SmartRecruiters are read
// ➤ with Argus's own parsers (scan.mjs); this file only adds the posting date and the
// ➤ remote flag the bot does not need. Recruitee and Personio have no parser in Argus yet:
// ➤ theirs follow the fields their public API documents.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import yaml from 'js-yaml';
import { getJson, getText, deadline } from '../http.mjs';
import { parseGreenhouse, parseAshby, parseLever, parseSmartRecruiters, unescapeEntities } from 'argus/server-bot/scan.mjs';

// ➤ Advert text from its HTML: line breaks kept where the markup had them, entities decoded.
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', euro: '€', copy: '©', reg: '®', deg: '°', middot: '·', hellip: '…', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»', iexcl: '¡', iquest: '¿', ordf: 'ª', ordm: 'º', szlig: 'ß', aelig: 'æ', AElig: 'Æ', oslash: 'ø', Oslash: 'Ø', aring: 'å', Aring: 'Å', ccedil: 'ç', Ccedil: 'Ç', ntilde: 'ñ', Ntilde: 'Ñ', aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', agrave: 'à', egrave: 'è', igrave: 'ì', ograve: 'ò', ugrave: 'ù', Agrave: 'À', Egrave: 'È', acirc: 'â', ecirc: 'ê', icirc: 'î', ocirc: 'ô', ucirc: 'û', auml: 'ä', euml: 'ë', iuml: 'ï', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', yuml: 'ÿ', atilde: 'ã', otilde: 'õ' };
export const decodeEntities = s => String(s || '')
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&([a-zA-Z]+);/g, (m, name) => (name in ENTITIES ? ENTITIES[name] : m));
// ➤ Four thousand characters are plenty: the record keeps excerpts, and thousands of boards
// ➤ are read in one build.
export const text = html => decodeEntities(String(html || '').slice(0, 20000)
  .replace(/<br\s*\/?>|<\/p>|<\/li>|<\/h\d>|<\/div>|<\/tr>/gi, '\n')
  .replace(/<[^>]+>/g, ' '))
  .replace(/[ \t ]+/g, ' ')
  .replace(/\n\s*\n+/g, '\n')
  .replace(/ +([.,;:!?])/g, '$1')
  .trim()
  .slice(0, 4000);

const day = v => { const d = v ? new Date(v) : null; return d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : ''; };
const remoteWord = s => /remote/i.test(String(s || ''));

export const ATS = {
  greenhouse: {
    licence: { name: 'Greenhouse Job Board API', short: 'Greenhouse', url: 'https://docs.greenhouse.io/job-board.html', licence: 'Public job board API', credit: '', needsKey: false },
    url: slug => `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`,
    parse: (j, slug, company = slug) => parseGreenhouse(j, company).map((p, i) => ({
      sourceId: String(j.jobs[i]?.id || ''), title: p.title, location: p.location, url: p.url,
      description: text(p.description), posted: day(j.jobs[i]?.updated_at), remote: remoteWord(p.location),
    })),
  },
  ashby: {
    licence: { name: 'Ashby Job Board API', short: 'Ashby', url: 'https://developers.ashbyhq.com/docs/public-job-posting-api', licence: 'Public job board API', credit: '', needsKey: false },
    url: slug => `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}`,
    parse: (j, slug, company = slug) => parseAshby(j, company).map((p, i) => ({
      sourceId: String(j.jobs[i]?.id || ''), title: p.title, location: p.location, url: p.url,
      description: text(p.description), posted: day(j.jobs[i]?.publishedAt), remote: !!j.jobs[i]?.isRemote,
    })),
  },
  lever: {
    licence: { name: 'Lever Postings API', short: 'Lever', url: 'https://github.com/lever/postings-api', licence: 'Public postings API', credit: '', needsKey: false },
    url: slug => `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`,
    parse: (arr, slug, company = slug) => parseLever(arr, company).map((p, i) => ({
      sourceId: String(arr[i]?.id || ''), title: p.title, location: p.location, url: p.url,
      description: text(p.description), posted: day(arr[i]?.createdAt), remote: remoteWord(arr[i]?.workplaceType) || remoteWord(p.location),
    })),
  },
  smartrecruiters: {
    licence: { name: 'SmartRecruiters Posting API', short: 'SmartRecruiters', url: 'https://developers.smartrecruiters.com/docs/posting-api', licence: 'Public posting API, where the company enables it', credit: '', needsKey: false },
    url: (slug, offset = 0) => `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(slug)}/postings?limit=100&offset=${offset}`,
    // ➤ A hundred per page; the answer says how many there are in all.
    more: (j, got) => got < Math.min(Number(j.totalFound) || 0, 1000),
    // ➤ The list carries no advert text (that is a second call per posting the pile does not make).
    parse: (j, slug, company = slug) => parseSmartRecruiters(j, company).map((p, i) => ({
      sourceId: String(j.content[i]?.id || ''), title: p.title, location: p.location, url: p.url,
      description: '', posted: day(j.content[i]?.releasedDate), remote: !!j.content[i]?.location?.remote,
    })).filter(p => p.url),
  },
  recruitee: {
    licence: { name: 'Recruitee Careers Site API', short: 'Recruitee', url: 'https://docs.recruitee.com/reference/intro-to-careers-site-api', licence: 'Public careers site API', credit: '', needsKey: false },
    url: slug => `https://${encodeURIComponent(slug)}.recruitee.com/api/offers/`,
    parse: j => (j?.offers || []).map(p => ({
      sourceId: String(p.id || ''), title: p.title || '', location: [p.city, p.country].filter(Boolean).join(', '), url: p.careers_url || '',
      description: [text(p.description), text(p.requirements)].filter(Boolean).join('\n'), posted: day(p.published_at || p.created_at), remote: !!p.remote,
    })),
  },
  workable: {
    daily: true,   // ➤ about a thousand calls a day for an IP, then 429 for a day: read once a day
    licence: { name: 'Workable careers widget API', short: 'Workable', url: 'https://apply.workable.com/', licence: 'Public careers widget API', credit: '', needsKey: false },
    url: slug => `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(slug)}`,
    // ➤ The widget answer names the company and lists the jobs with their first location.
    parse: (j, slug, company = slug) => (j?.jobs || []).map(p => {
      const loc = p.locations?.[0] || p.location || {};
      return {
        sourceId: String(p.shortcode || p.id || ''), title: String(p.title || p.full_title || '').trim(),
        location: [loc.city || p.city, loc.region, loc.country || p.country].filter(Boolean).join(', '),
        url: p.url || p.application_url || p.shortlink || `https://apply.workable.com/${slug}/j/${p.shortcode}`,
        description: text(p.description || ''), posted: day(p.published_on || p.created_at), remote: !!(p.remote || p.telecommuting || /remote/i.test(p.workplace || '')),
        company: j?.name || company,
      };
    }).filter(p => p.sourceId && p.title),
  },
  teamtailor: {
    licence: { name: 'Teamtailor careers site (RSS)', short: 'Teamtailor', url: 'https://www.teamtailor.com/', licence: "The employer's own careers site, read through the RSS it publishes", credit: '', needsKey: false },
    url: slug => `https://${encodeURIComponent(slug)}.teamtailor.com/jobs.rss`,
    xml: true,
    // ➤ One RSS item per job: title, link, date, the description as HTML, the location in tt: tags.
    parse: (xml, slug) => {
      const tag = (block, name) => decodeEntities((block.match(new RegExp(`<${name}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${name}>`)) || [])[1] || '').trim();
      const s = String(xml || '');
      const company = tag(s.split('<item>')[0] || '', 'title');
      return (s.match(/<item>[\s\S]*?<\/item>/g) || []).map(block => ({
        sourceId: tag(block, 'guid') || tag(block, 'link'), title: tag(block, 'title'),
        location: tag(block, 'tt:name') || [tag(block, 'tt:city'), tag(block, 'tt:country')].filter(Boolean).join(', '), url: tag(block, 'link'),
        description: text(tag(block, 'description')), posted: day(tag(block, 'pubDate')), remote: /remote|hybrid/i.test(tag(block, 'tt:remoteStatus') || tag(block, 'remoteStatus')),
        company,
      })).filter(p => p.url && p.title);
    },
  },
  personio: {
    licence: { name: 'Personio XML feed', short: 'Personio', url: 'https://developer.personio.de/v1.0/reference/get_xml', licence: 'Public XML feed', credit: '', needsKey: false },
    url: slug => `https://${encodeURIComponent(slug)}.jobs.personio.de/xml`,
    xml: true,
    parse: (xml, slug) => {
      const tag = (block, name) => (block.match(new RegExp(`<${name}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${name}>`)) || [])[1] || '';
      return (String(xml || '').match(/<position>[\s\S]*?<\/position>/g) || []).map(block => {
        const pid = tag(block, 'id').trim();
        return {
          sourceId: pid, title: tag(block, 'name').trim(), location: tag(block, 'office').trim(), url: `https://${slug}.jobs.personio.de/job/${pid}`,
          description: [...block.matchAll(/<value>([\s\S]*?)<\/value>/g)].map(m => text(m[1].replace(/^\s*<!\[CDATA\[/, '').replace(/\]\]>\s*$/, ''))).join('\n'),
          posted: day(tag(block, 'createdAt').trim()), remote: false,
        };
      });
    },
  },
};
export { unescapeEntities };

export const id = 'boards';
export const kind = 'board';

// ➤ The company boards to read: the hand-made list (config/companies.yml), then the scout's
// ➤ (companies-found.yml, marked found); a slug the hand-made list names is left to it.
export function loadCompanies() {
  const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
  const read = file => { const p = join(root, 'builder', 'config', file); return existsSync(p) ? (yaml.load(readFileSync(p, 'utf-8')) || {}).companies || [] : []; };
  const hand = read('companies.yml');
  const slugOf = c => Object.keys(ATS).map(k => c[k] && `${k}:${String(c[k]).toLowerCase()}`).find(Boolean);
  const named = new Set(hand.map(slugOf));
  return [...hand, ...read('companies-found.yml').filter(c => !named.has(slugOf(c))).map(c => ({ ...c, found: true }))];
}

// ➤ The whole board: one answer for most ATS, page after page where the ATS says there is more.
async function readBoard(ats, slug, company, opts = {}) {
  const a = ATS[ats];
  if (a.xml) return a.parse(await getText(a.url(slug), opts), slug, company);
  const out = [];
  let got = 0;
  for (;;) {
    const j = await getJson(a.url(slug, got), opts);
    const page = a.parse(j, slug, company);
    out.push(...page);
    got += (j.content || j.jobs || j).length || 0;
    if (!a.more || !page.length || !a.more(j, got)) break;
  }
  return out;
}

// ➤ Yields RawOffers for every enabled company. The six ATS live on different hosts, so
// ➤ they are read side by side, one board after another within each. A board that fails is
// ➤ logged and skipped, never fatal: one dead board must not empty the pile; the boards the
// ➤ scout found (found: true) are many, so they get one try and a short wait, and only
// ➤ their count is logged.
// ➤ The adverts of the ATS read once a day (Workable), kept between builds per board.
const DAILY = join(dirname(dirname(dirname(fileURLToPath(import.meta.url)))), 'builder', 'state', 'boards-daily.json');
const loadDaily = ats => { try { return JSON.parse(readFileSync(DAILY, 'utf8'))[ats] || {}; } catch { return {}; } };
const saveDaily = (ats, boards) => { let all = {}; try { all = JSON.parse(readFileSync(DAILY, 'utf8')); } catch { /* first time */ } all[ats] = boards; mkdirSync(dirname(DAILY), { recursive: true }); writeFileSync(DAILY, JSON.stringify(all)); };

export async function* fetchAll(ctx) {
  const lanes = {};
  for (const c of ctx.companies) {
    if (c.enabled === false) continue;
    const ats = Object.keys(ATS).find(k => c[k]);
    if (!ats) { ctx.log(`boards: ${c.name} names no known ATS, skipped`); continue; }
    (lanes[ats] ||= []).push(c);
  }
  // ➤ The lanes hand their adverts over as they come, and the builder takes them at once, so
  // ➤ thousands of boards never sit in memory together.
  const pending = [];
  let wake = null;
  const lanesDone = Promise.all(Object.entries(lanes).map(async ([ats, list]) => {
    let found = 0, foundAdverts = 0, dead = 0, waiting = 0, blockedUntil = 0;
    // ➤ An ATS with a daily quota is read once a day: a board's adverts wait in the state file
    // ➤ between builds, and once the ATS says "too many requests" the boards not read yet show
    // ➤ their last adverts, or wait for the next build.
    const daily = ATS[ats].daily ? loadDaily(ats) : null;
    // ➤ One host for every board (Greenhouse, Workable) or a host per board (Recruitee): "too
    // ➤ many requests" from a shared host concerns the whole lane, from a board's own host
    // ➤ that board only.
    const shared = new URL(ATS[ats].url('one')).hostname === new URL(ATS[ats].url('two')).hostname;
    const read = async (c, cached) => {
      if (cached && Date.now() - Date.parse(cached.at) < 20 * 3600 * 1000) return cached.jobs;
      if (blockedUntil) { if (cached) return cached.jobs; waiting++; return null; }
      try {
        // ➤ A board the scout found is read with one try, a short wait, a deadline, and at most
        // ➤ 500 adverts: a few boards list thousands (survey platforms, agencies) and would crowd
        // ➤ the pile.
        const all = await deadline(readBoard(ats, String(c[ats]), c.name, c.found ? { tries: 1, timeoutMs: 10000 } : {}), c.found ? 120_000 : 300_000);
        if (daily) daily[String(c[ats]).toLowerCase()] = { at: new Date().toISOString(), jobs: all.slice(0, 500) };
        return all;
      } catch (e) {
        if (e.status !== 429 || !shared) throw e;
        // ➤ A short wait is waited out once; a long one leaves the lane's other boards for the next build.
        if (e.until - Date.now() <= 5 * 60_000 && !c.retried) { await new Promise(r => setTimeout(r, e.until - Date.now() + 500)); return read({ ...c, retried: true }, cached); }
        blockedUntil = e.until;
        ctx.log(`boards: ${ats}: ${e.message}; the boards not read yet show their last adverts or wait for the next build`);
        if (cached) return cached.jobs;
        waiting++; return null;
      }
    };
    for (const c of list) {
      // ➤ The lanes wait while the builder is behind: adverts pending are memory.
      while (pending.length > 5000) await new Promise(r => setTimeout(r, 100));
      try {
        const all = await read(c, daily?.[String(c[ats]).toLowerCase()]);
        if (!all) continue;
        const jobs = c.found ? all.slice(0, 500) : all;
        if (c.found) { found++; foundAdverts += jobs.length; } else ctx.log(`boards: ${c.name} (${ats}) ${jobs.length}`);
        // ➤ The board's own company name wins over the slug the scout guessed; a name given by hand wins over both.
        for (const p of jobs) pending.push({ source: ats, country: c.country || '', city: '', codes: {}, lang: c.lang || '', expires: '', ...p, company: c.found && p.company ? p.company : c.name, sourceId: `${c[ats]}:${p.sourceId}` });
      } catch (e) {
        if (e.message === 'took too long') ctx.log(`boards: ${c.name} (${ats}) took too long, left`);
        if (c.found) dead++; else ctx.fail(`${c.name} (${ats})`, e.message);
      }
      if (wake) { wake(); wake = null; }
    }
    if (daily) saveDaily(ats, daily);
    if (found || dead || waiting) ctx.log(`boards: ${ats}, ${found} boards the scout found answered with ${foundAdverts} adverts${dead ? `, ${dead} did not answer` : ''}${waiting ? `, ${waiting} wait for the next build` : ''}`);
  }));
  let done = false;
  lanesDone.then(() => { done = true; if (wake) { wake(); wake = null; } });
  while (!done || pending.length) {
    if (pending.length) { yield pending.shift(); continue; }
    await new Promise(r => { wake = r; });
  }
  await lanesDone;
}
