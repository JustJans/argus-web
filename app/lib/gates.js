// ➤ From a profile to a judge: one function that says, for one advert, whether it reaches
// ➤ the list and, when not, at which stage and why — the same order and the same words the
// ➤ Argus bot uses, so a visitor can read the reasons in the debug panel. The title rules
// ➤ are Argus's own (engine.js); the years, degree and language facts were read at build
// ➤ time and travel with each advert.

import { t, label, languageLabel, euros } from './i18n.js';
import { distanceKm } from './distance.js';
import { nameKey, namesAny } from './name-key.js';

export { distanceKm };

// ➤ The profile's work modes by the letter the offers carry, and what an offer's letter says.
const MODE_LETTERS = { onsite: 'o', hybrid: 'h', remote: 'r' };
const MODE_REASONS = { o: 'on-site work', h: 'hybrid work', r: 'remote work' };

// ➤ Any engineering degree satisfies an advert that asks for "an engineering degree".
const ENGINEERING_DEGREES = new Set(['mechanical', 'electrical', 'electronics-telecom', 'civil', 'industrial', 'chemical', 'aerospace', 'naval', 'mining-metallurgy', 'materials', 'environmental', 'energy', 'automation-mechatronics', 'engineering-any']);

// ➤ Specialties chosen inside a family, by family: "2144" → the ESCO occupations picked in it.
function byPrefix(list, prefixOf) {
  const out = new Map();
  for (const x of list || []) { const k = prefixOf(x); if (!out.has(k)) out.set(k, []); out.get(k).push(x); }
  return out;
}
// ➤ Where an advert must be: in a country chosen, or within km of a town (the ones the search
// ➤ bar read, or an older code's one). A town narrows its own country to the land around it:
// ➤ Spain and Vigo is the land around Vigo; France and Vigo, all of France and the land around
// ➤ Vigo; Vigo alone, the land around Vigo, over the border too. An advert whose title, company
// ➤ or place names a place the visitor typed is there as well: one advert for several towns,
// ➤ or for a move abroad, is filed under one place only, and "Alfa Laval" or "Zurich Insurance"
// ➤ typed must still find the company. Once anything is chosen, remote work comes only when
// ➤ allowed. said: the places' names as the bar read them (lib/query.js). Answers null, or
// ➤ the stage and the reason.
export function makeLocation(profile) {
  const countries = new Set(profile.countries);
  const places = profile.places?.length ? profile.places : profile.place ? [profile.place] : [];
  const km = profile.km || profile.place?.km || 25;
  const said = profile.said || places.map(p => nameKey(p.name));
  const narrowed = new Set(places.map(p => p.cc));
  // ➤ A job run in many towns (`m`, one offer per country) is near any of them.
  const spots = o => [o.g, ...(o.m || []).filter(p => p.length === 3).map(p => [p[1], p[2]])].filter(Boolean);
  const near = o => spots(o).some(g => places.some(p => distanceKm(g, [p.lat, p.lon]) <= km));
  const names = o => said.length > 0 && namesAny([o.t, o.te, o.c, o.ci, o.l, ...(o.m || []).map(p => p[0])].filter(Boolean).join(' · '), said);
  return o => {
    if ((!countries.size && !places.length) || near(o) || names(o)) return null;
    if (o.cc === 'xx') return profile.remote ? null : { stage: 'COUNTRY', reason: t('remote work, and you did not allow it') };
    if (!o.cc) return null;
    if (narrowed.has(o.cc)) return { stage: 'PLACE', reason: spots(o).length ? t('more than {km} km from {place}', { km, place: places.map(p => p.name).join(t(' or ')) }) : t('its place is not on the map') };
    if (!countries.has(o.cc)) return { stage: 'COUNTRY', reason: t('in a country you did not choose ({cc})', { cc: o.cc.toUpperCase() }) };
    return null;
  };
}

// ➤ engine: { buildTitleFilter, norm } from lib/engine.js; catalogues: the loaded JSON files.
export function makeJudge(profile, catalogues, engine) {
  const levelNeg = (catalogues.seniority.levels.find(l => l.id === profile.level)?.negatives) || [];
  // ➤ The words to avoid are the visitor's own. The ready-made exclusions an older code may still
  // ➤ carry (sales, internships…) are read but no longer applied: one word cut good offers.
  const negative = [...new Set([...levelNeg, ...profile.noWords])];
  // ➤ With no roles named the positive list is empty and the engine lets every title
  // ➤ through that test; the negatives and the explanations still apply.
  const title = engine.buildTitleFilter({ positive: profile.roles, negative });
  const families = new Set(profile.families);
  // ➤ A family with specialties chosen keeps only the adverts that name one of them.
  const specialties = byPrefix(profile.specialties, code => code.slice(0, 4));
  // ➤ Work modes chosen keep the offers that state one of them; an offer that states none is
  // ➤ left out, as on the big sites' remote filters. A minimum pay leaves out the offers whose
  // ➤ range stays under it (a range that reaches it is kept, as Google's job search does); the
  // ➤ offers that state no pay stay unless the visitor keeps only those that state it.
  const modes = new Set((profile.modes || []).map(m => MODE_LETTERS[m]));
  const minPay = (profile.minPay || 0) * 1000;
  const inFamily = o => (o.f || []).some(f => families.has(f) && (!specialties.has(f) || (o.e || []).some(e => specialties.get(f).includes(e))));
  const location = makeLocation(profile);
  const languages = new Set(profile.languages);
  const degrees = new Set(profile.degrees);
  const holdsEngineering = [...degrees].some(d => ENGINEERING_DEGREES.has(d));
  const languageName = languageLabel;
  const degreeName = id => label(catalogues.degrees.degrees.find(d => d.id === id)) || id;

  return function judge(o) {
    if (families.size && !(o.f || []).some(f => families.has(f))) return { ok: false, stage: 'FAMILY', reason: t('outside the families you chose') };
    if (specialties.size && !inFamily(o)) return { ok: false, stage: 'FAMILY', reason: t('outside the specialties you chose') };
    if (!title(o.t, o.l)) return { ok: false, stage: 'TITLE', reason: title.explain(o.t, o.l) || t('the title does not fit your roles') };
    const where = location(o);
    if (where) return { ok: false, ...where };
    if (modes.size && !modes.has(o.w)) return { ok: false, stage: 'MODE', reason: o.w ? t(MODE_REASONS[o.w]) : t('does not say where the work is done') };
    if (profile.payStated && !o.p) return { ok: false, stage: 'PAY', reason: t('does not state the pay') };
    if (minPay && o.pa && o.pa < minPay) return { ok: false, stage: 'PAY', reason: t('pays up to {pay} a year', { pay: euros(o.pa) }) };
    if (profile.maxYears && o.y && o.y > profile.maxYears) return { ok: false, stage: 'YEARS', reason: t('asks for {n} years of experience (your cap is {max})', { n: o.y, max: profile.maxYears }) };
    // ➤ Degrees and languages screen only when the visitor listed some: left empty, the
    // ➤ question was not asked, and "none" would hide every advert that names one.
    if (degrees.size && o.dg && o.dg.length) {
      const holds = o.dg.some(d => degrees.has(d) || (d === 'engineering-any' && holdsEngineering));
      if (!holds) return { ok: false, stage: 'DEGREE', reason: t('requires a degree you did not list ({list})', { list: o.dg.map(degreeName).join(t(' or ')) }) };
    }
    if (languages.size && o.lg && o.lg.length) {
      const missing = o.lg.filter(l => !languages.has(l));
      if (missing.length) return { ok: false, stage: 'LANGUAGE', reason: t('requires {list}', { list: missing.map(languageName).join(t(' and ')) }) };
    }
    return { ok: true, stage: 'OK', reason: '' };
  };
}

// ➤ The list's order: the visitor's countries in the order they chose them, remote and
// ➤ unknown last, newest first inside each group.
export function sortOffers(offers, profile) {
  const rank = new Map(profile.countries.map((c, i) => [c, i]));
  const key = o => o.cc === 'xx' ? 900 : (o.cc ? (rank.has(o.cc) ? rank.get(o.cc) : 800) : 950);
  return [...offers].sort((a, b) => key(a) - key(b) || String(b.d || '').localeCompare(String(a.d || '')));
}
