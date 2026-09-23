// ➤ Where the work is done: on site, hybrid or remote, or not said. Read from the advert's
// ➤ source when it states it, else from a LinkedIn tag in the advert's text (#LI-Remote,
// ➤ #LI-Hybrid, #LI-Onsite) and a location that names remote work instead of a place, when
// ➤ they do not contradict each other. The advert's wording is not read: word lists misread
// ➤ it about one time in six. docs/research/work-mode.md has the sources.
import { fold } from 'argus/server-bot/text.mjs';

// ➤ The sources' words for the three, reduced to their letters: "On Site", "on-site",
// ➤ "OnSite", "ORA_ON_SITE" and "#LI-Onsite" all read "onsite". JobTech's "Arbete på plats" is
// ➤ left out on purpose: it is its form's default, set on remote and hybrid adverts too.
const MODES = {
  onsite: 'onsite', oraonsite: 'onsite', lionsite: 'onsite',
  hybrid: 'hybrid', orahybrid: 'hybrid', lihybrid: 'hybrid', hybridarbete: 'hybrid',
  remote: 'remote', oraremote: 'remote', liremote: 'remote', fullyremote: 'remote', distansarbete: 'remote',
};
export const modeWord = value => MODES[String(value || '').toLowerCase().replace(/[^a-z]/g, '')] || '';

// ➤ An employer that offers several modes counts as the most flexible one: the filter asks
// ➤ "can I work this way?".
const FLEXIBILITY = ['onsite', 'hybrid', 'remote'];
export const mostFlexible = modes => modes.filter(m => FLEXIBILITY.includes(m)).sort((a, b) => FLEXIBILITY.indexOf(b) - FLEXIBILITY.indexOf(a))[0] || '';

// ➤ LinkedIn's tags for jobs it copies from employers' sites; Indeed and Monster read them too.
const LINKEDIN_TAG = /#LI-(Remote|Hybrid|On-?site)\b/gi;
export const tagMode = text => mostFlexible([...String(text || '').matchAll(LINKEDIN_TAG)].map(m => modeWord(m[1])));

// ➤ A location that names remote work: Indeed's location words for telework (OECD, 2021,
// ➤ Annex Table A.2) and their neighbours, compared without accents or case.
const REMOTE_PLACE = /(?:^|[^a-z0-9])(?:remote|remoto|home ?office|home-office|home based|teletravail|teletrabajo|teletreball|telelavoro|werk van thuis|thuiswerk(?:en)?|zdalnie|praca zdalna|jobba hemifran|distans(?:arbete)?|lavoro da casa|desde casa)(?![a-z0-9])/;
const HYBRID_PLACE = /(?:^|[^a-z0-9])(?:hybrid|hybride|hibrido|ibrido|hybrydow[a-z]*)(?![a-z0-9])/;
export const namesRemoteWork = location => REMOTE_PLACE.test(fold(String(location || '')));
export function placeMode(location) {
  const f = fold(String(location || ''));
  return REMOTE_PLACE.test(f) ? 'remote' : HYBRID_PLACE.test(f) ? 'hybrid' : '';
}

// ➤ The mode of a RawOffer: its source's own field (`mode`) when it has one. Else the LinkedIn
// ➤ tag (`modeTag`, read by the adapter in the whole text, or found in the text kept) and the
// ➤ location: one of them alone decides, and when they disagree ("#LI-Onsite" on an advert
// ➤ whose location is "Remote", a template's tag) the advert says nothing for sure. The
// ➤ letter the records carry: o, h or r; '' when nothing says.
const LETTER = { onsite: 'o', hybrid: 'h', remote: 'r' };
export function workModeOf(raw) {
  const field = modeWord(raw.mode);
  if (field) return LETTER[field];
  const tag = modeWord(raw.modeTag) || tagMode(raw.description);
  const place = placeMode(raw.location);
  return tag && place && tag !== place ? '' : LETTER[tag || place] || '';
}
