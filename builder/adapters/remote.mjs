// ➤ Three job boards with a public API and written permission to share their adverts on:
// ➤ Jobicy (remote jobs, asked for Europe; "credit Jobicy with a direct link" — every card
// ➤ links to the advert's page there), Remotive (remote jobs, worldwide; "link back to the
// ➤ URL on Remotive and mention Remotive as a source"; its feed runs a day late on purpose)
// ➤ and Arbeitnow (jobs from applicant-tracking systems, mostly Germany and the UK; "a link
// ➤ back to Arbeitnow.com"). None carries occupation codes: the title decides. A remote
// ➤ advert that names no European country lands under "Remote".
import { getJson } from '../http.mjs';
import { decodeEntities, text } from './boards.mjs';

const day = v => { const d = v ? new Date(typeof v === 'number' ? v * 1000 : v) : null; return d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : ''; };
const recent = (posted, days) => posted >= new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);

export const jobicy = {
  id: 'jobicy', kind: 'feed',
  licence: { name: 'Jobicy', short: 'Jobicy', url: 'https://jobicy.com/jobs-rss-feed', licence: 'Jobicy API: credit with a direct link to the advert on Jobicy', credit: 'Source: Jobicy', needsKey: false },
  parse: j => (j?.jobs || []).map(r => ({
    source: 'jobicy', sourceId: String(r.id || ''),
    title: String(r.jobTitle || '').trim(), company: String(r.companyName || '').trim(),
    location: String(r.jobGeo || ''), country: '', city: '', remote: true,
    url: String(r.url || ''), description: text(r.jobDescription || r.jobExcerpt || ''),
    posted: day(r.pubDate), expires: '', codes: {}, lang: 'en',
  })),
  async *fetchAll(ctx) {
    const rows = jobicy.parse(await getJson('https://jobicy.com/api/v2/remote-jobs?count=100&geo=europe', { gapMs: 0 }));
    ctx.log(`jobicy: ${rows.length}`);
    for (const r of rows) yield r;
  },
};

export const remotive = {
  id: 'remotive', kind: 'feed',
  licence: { name: 'Remotive', short: 'Remotive', url: 'https://remotive.com/api-documentation', licence: 'Remotive API: link back to the advert on Remotive and name Remotive as the source', credit: 'Source: Remotive (its feed runs a day late)', needsKey: false },
  parse: j => (j?.jobs || []).map(r => ({
    source: 'remotive', sourceId: String(r.id || ''),
    title: String(r.title || '').trim(), company: String(r.company_name || '').trim(),
    location: String(r.candidate_required_location || ''), country: '', city: '', remote: true,
    url: String(r.url || ''), description: text(r.description || ''),
    posted: day(r.publication_date), expires: '', codes: {}, lang: 'en',
  })),
  async *fetchAll(ctx) {
    const rows = remotive.parse(await getJson('https://remotive.com/api/remote-jobs', { gapMs: 0 })).filter(r => recent(r.posted, 45));
    ctx.log(`remotive: ${rows.length}`);
    for (const r of rows) yield r;
  },
};

export const arbeitnow = {
  id: 'arbeitnow', kind: 'feed',
  licence: { name: 'Arbeitnow', short: 'Arbeitnow', url: 'https://www.arbeitnow.com/blog/job-board-api', licence: 'Arbeitnow job board API: a link back to Arbeitnow.com', credit: 'Source: Arbeitnow', needsKey: false },
  // ➤ The description arrives as HTML with its tags escaped: unescaped first, then read as text.
  parse: j => (j?.data || []).map(r => ({
    source: 'arbeitnow', sourceId: String(r.slug || ''),
    title: String(r.title || '').trim(), company: String(r.company_name || '').trim(),
    location: String(r.location || ''), country: '', city: '', remote: !!r.remote,
    url: String(r.url || ''), description: text(decodeEntities(r.description || '')),
    posted: day(r.created_at), expires: '', codes: {}, lang: 'de',
  })),
  // ➤ Pages of 250, newest first, until the adverts are older than thirty days.
  async *fetchAll(ctx) {
    let n = 0;
    for (let page = 1; page <= 20; page++) {
      const rows = arbeitnow.parse(await getJson(`https://www.arbeitnow.com/api/job-board-api?page=${page}`, { gapMs: 600 }));
      if (!rows.length) break;
      const fresh = rows.filter(r => recent(r.posted, 30));
      for (const r of fresh) { n++; yield r; }
      if (fresh.length < rows.length) break;
    }
    ctx.log(`arbeitnow: ${n}`);
  },
};
