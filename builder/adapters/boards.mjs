// ➤ Company boards on applicant-tracking systems with a documented public API: one entry
// ➤ per company in config/companies.yml, the whole board read on every build (absence of
// ➤ an advert means it closed). These boards carry no occupation code, so their adverts
// ➤ are classified by title later. Each ATS has the address of its board and a parser from
// ➤ its own JSON or XML to the common RawOffer shape; the parsers are pure so the tests
// ➤ feed them recorded answers.
import { getJson, getText } from '../http.mjs';

// ➤ The named entities job adverts actually use (Latin letters, quotes, the euro), plus
// ➤ any numeric one; unknown names are left as they came rather than guessed.
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', euro: '€', copy: '©', reg: '®', deg: '°', middot: '·', hellip: '…', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»', iexcl: '¡', iquest: '¿', ordf: 'ª', ordm: 'º', szlig: 'ß', aelig: 'æ', AElig: 'Æ', oslash: 'ø', Oslash: 'Ø', aring: 'å', Aring: 'Å', ccedil: 'ç', Ccedil: 'Ç', ntilde: 'ñ', Ntilde: 'Ñ', aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', agrave: 'à', egrave: 'è', igrave: 'ì', ograve: 'ò', ugrave: 'ù', Agrave: 'À', Egrave: 'È', acirc: 'â', ecirc: 'ê', icirc: 'î', ocirc: 'ô', ucirc: 'û', auml: 'ä', euml: 'ë', iuml: 'ï', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', yuml: 'ÿ', atilde: 'ã', otilde: 'õ' };
export const decodeEntities = s => String(s || '')
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&([a-zA-Z]+);/g, (m, name) => (name in ENTITIES ? ENTITIES[name] : m));

export const text = html => decodeEntities(String(html || '')
  .replace(/<br\s*\/?>|<\/p>|<\/li>|<\/h\d>|<\/div>|<\/tr>/gi, '\n')
  .replace(/<[^>]+>/g, ' '))
  .replace(/[ \t ]+/g, ' ')
  .replace(/\n\s*\n+/g, '\n')
  .trim();

const day = v => { const d = v ? new Date(v) : null; return d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : ''; };

export const ATS = {
  lever: {
    licence: { name: 'Lever Postings API', url: 'https://github.com/lever/postings-api', licence: 'Public postings API', credit: '', needsKey: false },
    url: slug => `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`,
    parse: arr => (Array.isArray(arr) ? arr : []).map(p => ({
      sourceId: String(p.id || ''), title: p.text || '', location: p.categories?.location || '', url: p.hostedUrl || '',
      description: [p.descriptionPlain, ...(p.lists || []).map(l => `${l.text}\n${text(l.content)}`), p.additionalPlain].filter(Boolean).join('\n'),
      posted: day(p.createdAt), remote: /remote/i.test(p.workplaceType || '') || /remote/i.test(p.categories?.location || ''),
    })),
  },
  greenhouse: {
    licence: { name: 'Greenhouse Job Board API', url: 'https://docs.greenhouse.io/job-board.html', licence: 'Public job board API', credit: '', needsKey: false },
    url: slug => `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`,
    parse: j => (j?.jobs || []).map(p => ({
      sourceId: String(p.id || ''), title: p.title || '', location: p.location?.name || '', url: p.absolute_url || '',
      // ➤ Greenhouse escapes the advert's HTML inside the JSON: entities first, tags after.
      description: text(decodeEntities(p.content)), posted: day(p.updated_at), remote: /remote/i.test(p.location?.name || ''),
    })),
  },
  ashby: {
    licence: { name: 'Ashby Job Board API', url: 'https://developers.ashbyhq.com/docs/public-job-posting-api', licence: 'Public job board API', credit: '', needsKey: false },
    url: slug => `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}`,
    parse: j => (j?.jobs || []).map(p => ({
      sourceId: String(p.id || ''), title: p.title || '', location: p.location || '', url: p.jobUrl || '',
      description: p.descriptionPlain || text(p.descriptionHtml), posted: day(p.publishedAt), remote: !!p.isRemote,
    })),
  },
  recruitee: {
    licence: { name: 'Recruitee Careers Site API', url: 'https://docs.recruitee.com/reference/intro-to-careers-site-api', licence: 'Public careers site API', credit: '', needsKey: false },
    url: slug => `https://${encodeURIComponent(slug)}.recruitee.com/api/offers/`,
    parse: j => (j?.offers || []).map(p => ({
      sourceId: String(p.id || ''), title: p.title || '', location: [p.city, p.country].filter(Boolean).join(', '), url: p.careers_url || '',
      description: [text(p.description), text(p.requirements)].filter(Boolean).join('\n'), posted: day(p.published_at || p.created_at), remote: !!p.remote,
    })),
  },
  personio: {
    licence: { name: 'Personio XML feed', url: 'https://developer.personio.de/v1.0/reference/get_xml', licence: 'Public XML feed', credit: '', needsKey: false },
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

export const id = 'boards';
export const kind = 'board';

async function readBoard(ats, slug) {
  const url = ATS[ats].url(slug);
  return ATS[ats].parse(ATS[ats].xml ? await getText(url) : await getJson(url), slug);
}

// ➤ Yields RawOffers for every enabled company; a board that fails is logged and skipped,
// ➤ never fatal — one dead board must not empty the pile.
export async function* fetchAll(ctx) {
  for (const c of ctx.companies) {
    if (c.enabled === false) continue;
    const ats = Object.keys(ATS).find(k => c[k]);
    if (!ats) { ctx.log(`boards: ${c.name} names no known ATS, skipped`); continue; }
    try {
      const jobs = await readBoard(ats, String(c[ats]));
      ctx.log(`boards: ${c.name} (${ats}) ${jobs.length}`);
      for (const p of jobs) {
        yield { source: ats, company: c.name, country: c.country || '', city: '', codes: {}, lang: c.lang || '', expires: '', ...p, sourceId: `${c[ats]}:${p.sourceId}` };
      }
    } catch (e) {
      ctx.fail(`${c.name} (${ats})`, e.message);
    }
  }
}
