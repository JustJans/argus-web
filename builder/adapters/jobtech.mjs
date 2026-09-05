// ➤ Sweden: Arbetsförmedlingen's JobSearch API (JobTech Dev), CC0, no key. Adverts are asked
// ➤ per occupation group (SSYK-2012 concept ids listed in the families catalogue), so
// ➤ the gate is the source's own classification, not a keyword guess. The API pages 100
// ➤ at a time up to an offset of 2000: a group with more adverts than that is cut at the
// ➤ newest 2100 and the cut is reported.
import { getJson } from '../http.mjs';

export const id = 'jobtech';
export const kind = 'feed';
export const licence = {
  name: 'Arbetsförmedlingen JobSearch (JobTech Dev)', short: 'JobTech', url: 'https://data.jobtechdev.se/dataset/job-ads/',
  licence: 'CC0 1.0', credit: 'Source: Arbetsförmedlingen, JobTech Dev', needsKey: false,
};

const API = 'https://jobsearch.api.jobtechdev.se/search';
const PAGE = 100;
const MAX_OFFSET = 2000;

function toRaw(hit) {
  const a = hit.workplace_address || {};
  const city = a.municipality || a.region || '';
  return {
    source: id,
    sourceId: String(hit.id),
    title: hit.headline || '',
    company: hit.employer?.name || '',
    location: [city, 'Sweden'].filter(Boolean).join(', '),
    country: 'se',
    city,
    url: hit.webpage_url || `https://arbetsformedlingen.se/platsbanken/annonser/${hit.id}`,
    description: hit.description?.text || '',
    posted: (hit.publication_date || '').slice(0, 10),
    expires: (hit.application_deadline || '').slice(0, 10),
    codes: { ssyk: hit.occupation_group?.concept_id || '' },
    lang: 'sv',
  };
}

// ➤ Yields RawOffers for every SSYK group the families name; `ctx.log` receives one line
// ➤ per group with the count, and a warning when a group was cut at the paging ceiling.
export async function* fetchAll(ctx) {
  const groups = [...new Set(ctx.families.flatMap(f => f.ssyk || []))];
  for (const group of groups) {
    let offset = 0, total = null, got = 0;
    while (offset <= MAX_OFFSET) {
      const url = `${API}?occupation-group=${encodeURIComponent(group)}&limit=${PAGE}&offset=${offset}&sort=pubdate-desc`;
      const j = await getJson(url, { gapMs: 200 });
      if (total === null) total = j.total?.value ?? 0;
      const hits = j.hits || [];
      for (const h of hits) { got++; yield toRaw(h); }
      if (hits.length < PAGE || got >= total) break;
      offset += PAGE;
    }
    ctx.log(`jobtech ${group}: ${got}${total > got ? ` of ${total} (cut at the paging ceiling)` : ''}`);
  }
}
