// ➤ Company boards on applicant-tracking systems with a documented public API: one entry
// ➤ per company in config/companies.yml, the whole board read on every build (absence of
// ➤ an advert means it closed). These boards carry no occupation code, so their adverts
// ➤ are classified by title later. Greenhouse, Ashby, Lever and SmartRecruiters are read
// ➤ with Argus's own parsers (scan.mjs); this file only adds the posting date and the
// ➤ remote flag the bot does not need. Recruitee and Personio have no parser in Argus yet:
// ➤ theirs follow the fields their public API documents.
import { getJson, getText } from '../http.mjs';
import { parseGreenhouse, parseAshby, parseLever, parseSmartRecruiters, unescapeEntities } from 'argus/server-bot/scan.mjs';

// ➤ Advert text from its HTML: line breaks kept where the markup had them, entities decoded.
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', euro: '€', copy: '©', reg: '®', deg: '°', middot: '·', hellip: '…', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»', iexcl: '¡', iquest: '¿', ordf: 'ª', ordm: 'º', szlig: 'ß', aelig: 'æ', AElig: 'Æ', oslash: 'ø', Oslash: 'Ø', aring: 'å', Aring: 'Å', ccedil: 'ç', Ccedil: 'Ç', ntilde: 'ñ', Ntilde: 'Ñ', aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', agrave: 'à', egrave: 'è', igrave: 'ì', ograve: 'ò', ugrave: 'ù', Agrave: 'À', Egrave: 'È', acirc: 'â', ecirc: 'ê', icirc: 'î', ocirc: 'ô', ucirc: 'û', auml: 'ä', euml: 'ë', iuml: 'ï', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', yuml: 'ÿ', atilde: 'ã', otilde: 'õ' };
export const decodeEntities = s => String(s || '')
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&([a-zA-Z]+);/g, (m, name) => (name in ENTITIES ? ENTITIES[name] : m));
export const text = html => decodeEntities(String(html || '')
  .replace(/<br\s*\/?>|<\/p>|<\/li>|<\/h\d>|<\/div>|<\/tr>/gi, '\n')
  .replace(/<[^>]+>/g, ' '))
  .replace(/[ \t ]+/g, ' ')
  .replace(/\n\s*\n+/g, '\n')
  .replace(/ +([.,;:!?])/g, '$1')
  .trim();

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

// ➤ The whole board: one answer for most ATS, page after page where the ATS says there is more.
async function readBoard(ats, slug, company) {
  const a = ATS[ats];
  if (a.xml) return a.parse(await getText(a.url(slug)), slug, company);
  const out = [];
  let got = 0;
  for (;;) {
    const j = await getJson(a.url(slug, got));
    const page = a.parse(j, slug, company);
    out.push(...page);
    got += (j.content || j.jobs || j).length || 0;
    if (!a.more || !page.length || !a.more(j, got)) break;
  }
  return out;
}

// ➤ Yields RawOffers for every enabled company; a board that fails is logged and skipped,
// ➤ never fatal — one dead board must not empty the pile.
export async function* fetchAll(ctx) {
  for (const c of ctx.companies) {
    if (c.enabled === false) continue;
    const ats = Object.keys(ATS).find(k => c[k]);
    if (!ats) { ctx.log(`boards: ${c.name} names no known ATS, skipped`); continue; }
    try {
      const jobs = await readBoard(ats, String(c[ats]), c.name);
      ctx.log(`boards: ${c.name} (${ats}) ${jobs.length}`);
      for (const p of jobs) {
        yield { source: ats, company: c.name, country: c.country || '', city: '', codes: {}, lang: c.lang || '', expires: '', ...p, sourceId: `${c[ats]}:${p.sourceId}` };
      }
    } catch (e) {
      ctx.fail(`${c.name} (${ats})`, e.message);
    }
  }
}
