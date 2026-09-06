// ➤ The XML job feeds intermediaries hand their partner sites (Talent.com, WhatJobs, Jobtome:
// ➤ the usual <job> schema with title, company, city, country, url, description, date). Each
// ➤ feed is named and addressed in VIA_FEEDS ("talentcom=https://…;whatjobs=https://…"), the
// ➤ address the partner programme gives once the owner has signed up; without it nothing is
// ➤ read. Intermediaries, so the site shows their adverts in their own section, after the
// ➤ employers' own, each linking to the intermediary's page as the programmes ask.
import { getText } from '../http.mjs';
import { text, decodeEntities } from './boards.mjs';

export const id = 'jobfeed';
export const kind = 'via';
export const via = true;
export const licence = { name: 'Intermediaries', short: 'Intermediary', url: '', licence: 'Partner programmes: their adverts, each linking to their page', credit: '', needsKey: true };

// ➤ The programmes known by name, for the label on the card and the sources page.
export const PROGRAMMES = {
  talentcom: { name: 'Talent.com', short: 'Talent.com', url: 'https://employers.talent.com/publishers', licence: "Talent.com's publisher programme: its adverts, each linking to Talent.com's page for the advert" },
  whatjobs: { name: 'WhatJobs', short: 'WhatJobs', url: 'https://www.whatjobs.com/affiliates', licence: "WhatJobs' affiliate programme: its adverts, each linking to WhatJobs' page for the advert" },
  jobtome: { name: 'Jobtome', short: 'Jobtome', url: 'https://www.jobtome.com/', licence: "Jobtome's publisher programme: its adverts, each linking to Jobtome's page for the advert" },
};
const PER_FEED = 50000;

// ➤ The feeds the owner has: name=url pairs, separated by semicolons.
export function feeds() {
  return String(process.env.VIA_FEEDS || '').split(';').map(p => p.trim()).filter(Boolean).map(p => { const i = p.indexOf('='); return i > 0 ? { source: p.slice(0, i).trim().toLowerCase(), url: p.slice(i + 1).trim() } : null; }).filter(f => f && /^https?:\/\//.test(f.url));
}

// ➤ The sources this adapter can yield, with their licence, for the index.
export function sourcesOf() {
  const out = {};
  for (const f of feeds()) out[f.source] = { ...(PROGRAMMES[f.source] || { name: f.source, short: f.source, url: '', licence: 'Partner programme: its adverts, each linking to its page' }), credit: `via ${PROGRAMMES[f.source]?.short || f.source}`, needsKey: true };
  return out;
}

const tag = (block, names) => {
  for (const n of names) {
    const m = block.match(new RegExp(`<${n}(?:\\s[^>]*)?>(?:\\s*<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>\\s*)?</${n}>`, 'i'));
    if (m) return decodeEntities(m[1]).trim();
  }
  return '';
};
const day = v => { const d = v ? new Date(v) : null; return d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : ''; };

// ➤ One RawOffer per <job>: the fields of the usual schema, whichever names the feed uses.
export function parseJobFeed(xml, source) {
  const out = [];
  for (const m of String(xml || '').matchAll(/<job(?:\s[^>]*)?>([\s\S]*?)<\/job>/gi)) {
    const b = m[1];
    const title = tag(b, ['title']), url = tag(b, ['url', 'link', 'joburl', 'apply_url']);
    if (!title || !/^https?:\/\//.test(url)) continue;
    const city = tag(b, ['city', 'location', 'town']), state = tag(b, ['state', 'region']), country = tag(b, ['country', 'countrycode']);
    out.push({
      source, sourceId: tag(b, ['referencenumber', 'reference', 'id', 'jobid']) || url,
      title, company: tag(b, ['company', 'companyname', 'employer', 'advertiser']),
      location: [city, state, country].filter(Boolean).join(', '), country: /^[A-Za-z]{2}$/.test(country) ? country.toLowerCase() : '', city,
      url, description: text(tag(b, ['description', 'summary', 'snippet'])),
      posted: day(tag(b, ['date', 'pubdate', 'posted', 'dateposted', 'created'])), expires: day(tag(b, ['expirationdate', 'expires', 'validthrough'])),
      codes: {}, lang: '', remote: /remote|teletrabajo|télétravail|homeoffice/i.test(tag(b, ['jobtype', 'remote', 'workplace']) + ' ' + city),
    });
    if (out.length >= PER_FEED) break;
  }
  return out;
}

export async function* fetchAll(ctx) {
  const list = feeds();
  if (!list.length) { ctx.log('jobfeed: no feeds (VIA_FEEDS), skipped'); return; }
  for (const f of list) {
    try {
      const jobs = parseJobFeed(await getText(f.url, { tries: 2, timeoutMs: 120000 }), f.source);
      ctx.log(`jobfeed: ${f.source}, ${jobs.length} adverts`);
      for (const raw of jobs) yield raw;
    } catch (e) { ctx.fail(`jobfeed ${f.source}`, e.message); }
  }
}
