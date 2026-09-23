// ➤ From a profile to a judge: one function that says, for one advert, whether it reaches
// ➤ the list and, when not, at which stage and why — the same order and the same words the
// ➤ Argus bot uses, so a visitor can read the reasons in the debug panel. The title rules
// ➤ are Argus's own (engine.js); the years, degree and language facts were read at build
// ➤ time and travel with each advert.

import { t, label, languageLabel } from './i18n.js';

// ➤ Any engineering degree satisfies an advert that asks for "an engineering degree".
const ENGINEERING_DEGREES = new Set(['mechanical', 'electrical', 'electronics-telecom', 'civil', 'industrial', 'chemical', 'aerospace', 'naval', 'mining-metallurgy', 'materials', 'environmental', 'energy', 'automation-mechatronics', 'engineering-any']);

// ➤ Specialties chosen inside a family, by family: "2144" → the ESCO occupations picked in it.
function byPrefix(list, prefixOf) {
  const out = new Map();
  for (const x of list || []) { const k = prefixOf(x); if (!out.has(k)) out.set(k, []); out.get(k).push(x); }
  return out;
}
// ➤ Kilometres between two points on the globe, by the haversine formula (a sphere of 6,371 km:
// ➤ within half a percent of the real distance, plenty for "25 km around a town").
const rad = d => (d * Math.PI) / 180;
export function distanceKm([lat1, lon1], [lat2, lon2]) {
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

// ➤ engine: { buildTitleFilter, norm } from lib/engine.js; catalogues: the loaded JSON files.
export function makeJudge(profile, catalogues, engine) {
  const levelNeg = (catalogues.seniority.levels.find(l => l.id === profile.level)?.negatives) || [];
  const vetoNeg = profile.vetoes.flatMap(id => catalogues.vetoes.vetoes.find(v => v.id === id)?.terms || []);
  const negative = [...new Set([...levelNeg, ...vetoNeg, ...profile.noWords])];
  // ➤ With no roles named the positive list is empty and the engine lets every title
  // ➤ through that test; the negatives and the explanations still apply.
  const title = engine.buildTitleFilter({ positive: profile.roles, negative });
  const families = new Set(profile.families);
  const countries = new Set(profile.countries);
  // ➤ A family with specialties chosen keeps only the adverts that name one of them. A town and a
  // ➤ distance keep, in the town's country, the adverts that close to it; as on the big sites, an
  // ➤ advert whose place could not be put on the map is not found by a search by town.
  const specialties = byPrefix(profile.specialties, code => code.slice(0, 4));
  const inFamily = o => (o.f || []).some(f => families.has(f) && (!specialties.has(f) || (o.e || []).some(e => specialties.get(f).includes(e))));
  const place = profile.place;
  const near = o => !place || o.cc !== place.cc || (o.g && distanceKm(o.g, [place.lat, place.lon]) <= place.km);
  const languages = new Set(profile.languages);
  const degrees = new Set(profile.degrees);
  const holdsEngineering = [...degrees].some(d => ENGINEERING_DEGREES.has(d));
  const languageName = languageLabel;
  const degreeName = id => label(catalogues.degrees.degrees.find(d => d.id === id)) || id;

  return function judge(o) {
    if (families.size && !(o.f || []).some(f => families.has(f))) return { ok: false, stage: 'FAMILY', reason: t('outside the families you chose') };
    if (specialties.size && !inFamily(o)) return { ok: false, stage: 'FAMILY', reason: t('outside the specialties you chose') };
    if (!title(o.t, o.l)) return { ok: false, stage: 'TITLE', reason: title.explain(o.t, o.l) || t('the title does not fit your roles') };
    if (countries.size) {
      if (o.cc === 'xx') { if (!profile.remote) return { ok: false, stage: 'COUNTRY', reason: t('remote work, and you did not allow it') }; }
      else if (o.cc && !countries.has(o.cc)) return { ok: false, stage: 'COUNTRY', reason: t('in a country you did not choose ({cc})', { cc: o.cc.toUpperCase() }) };
    }
    if (!near(o)) return { ok: false, stage: 'PLACE', reason: o.g ? t('more than {km} km from {place}', { km: place.km, place: place.name }) : t('its place is not on the map') };
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
