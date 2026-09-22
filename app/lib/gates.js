// ➤ From a profile to a judge: one function that says, for one advert, whether it reaches
// ➤ the list and, when not, at which stage and why — the same order and the same words the
// ➤ Argus bot uses, so a visitor can read the reasons in the debug panel. The title rules
// ➤ are Argus's own (engine.js); the years, degree and language facts were read at build
// ➤ time and travel with each advert.

// ➤ Any engineering degree satisfies an advert that asks for "an engineering degree".
const ENGINEERING_DEGREES = new Set(['mechanical', 'electrical', 'electronics-telecom', 'civil', 'industrial', 'chemical', 'aerospace', 'naval', 'mining-metallurgy', 'materials', 'environmental', 'energy', 'automation-mechatronics', 'engineering-any']);

// ➤ Specialties chosen inside a family, by family: "2144" → the ESCO occupations picked in it.
function byPrefix(list, prefixOf) {
  const out = new Map();
  for (const x of list || []) { const k = prefixOf(x); if (!out.has(k)) out.set(k, []); out.get(k).push(x); }
  return out;
}
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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
  // ➤ A family with specialties chosen keeps only the adverts that name one of them; a country
  // ➤ with cities chosen, the adverts in one of them (the city read off the place, or named in it).
  const specialties = byPrefix(profile.specialties, code => code.slice(0, 4));
  const inFamily = o => (o.f || []).some(f => families.has(f) && (!specialties.has(f) || (o.e || []).some(e => specialties.get(f).includes(e))));
  const cities = new Map([...byPrefix(profile.cities, c => c.slice(0, 2))].map(([cc, list]) => [cc, list.map(c => { const name = engine.norm(c.slice(3)); return { name, re: new RegExp(`(?:^|[^a-z0-9])${escapeRe(name)}(?![a-z0-9])`) }; })]));
  const inCity = o => !cities.has(o.cc) || cities.get(o.cc).some(c => engine.norm(o.ci || '') === c.name || c.re.test(engine.norm(o.l || '')));
  const languages = new Set(profile.languages);
  const degrees = new Set(profile.degrees);
  const holdsEngineering = [...degrees].some(d => ENGINEERING_DEGREES.has(d));
  const languageName = code => catalogues.languages.languages.find(l => l.code === code)?.label || code;
  const degreeName = id => catalogues.degrees.degrees.find(d => d.id === id)?.label || id;

  return function judge(o) {
    if (families.size && !(o.f || []).some(f => families.has(f))) return { ok: false, stage: 'FAMILY', reason: 'outside the families you chose' };
    if (specialties.size && !inFamily(o)) return { ok: false, stage: 'FAMILY', reason: 'outside the specialties you chose' };
    if (!title(o.t, o.l)) return { ok: false, stage: 'TITLE', reason: title.explain(o.t, o.l) || 'the title does not fit your roles' };
    if (countries.size) {
      if (o.cc === 'xx') { if (!profile.remote) return { ok: false, stage: 'COUNTRY', reason: 'remote work, and you did not allow it' }; }
      else if (o.cc && !countries.has(o.cc)) return { ok: false, stage: 'COUNTRY', reason: `in a country you did not choose (${o.cc.toUpperCase()})` };
      else if (!inCity(o)) return { ok: false, stage: 'COUNTRY', reason: `in ${o.ci || 'a city'}, not one of the cities you chose` };
    }
    if (profile.maxYears && o.y && o.y > profile.maxYears) return { ok: false, stage: 'YEARS', reason: `asks for ${o.y} years of experience (your cap is ${profile.maxYears})` };
    // ➤ Degrees and languages screen only when the visitor listed some: left empty, the
    // ➤ question was not asked, and "none" would hide every advert that names one.
    if (degrees.size && o.dg && o.dg.length) {
      const holds = o.dg.some(d => degrees.has(d) || (d === 'engineering-any' && holdsEngineering));
      if (!holds) return { ok: false, stage: 'DEGREE', reason: `requires a degree you did not list (${o.dg.map(degreeName).join(' or ')})` };
    }
    if (languages.size && o.lg && o.lg.length) {
      const missing = o.lg.filter(l => !languages.has(l));
      if (missing.length) return { ok: false, stage: 'LANGUAGE', reason: `requires ${missing.map(languageName).join(' and ')}` };
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
