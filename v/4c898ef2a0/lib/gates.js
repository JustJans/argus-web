// ➤ From a profile to a judge: one function that says, for one advert, whether it reaches
// ➤ the list and, when not, at which stage and why — the same order and the same words the
// ➤ Argus bot uses, so a visitor can read the reasons in the debug panel. The title rules
// ➤ are Argus's own (engine.js); the years, degree and language facts were read at build
// ➤ time and travel with each advert.

// ➤ Any engineering degree satisfies an advert that asks for "an engineering degree".
const ENGINEERING_DEGREES = new Set(['mechanical', 'electrical', 'electronics-telecom', 'civil', 'industrial', 'chemical', 'aerospace', 'naval', 'mining-metallurgy', 'materials', 'environmental', 'energy', 'automation-mechatronics', 'engineering-any']);

// ➤ engine: { buildTitleFilter, fold } from lib/engine.js; catalogues: the loaded JSON files.
export function makeJudge(profile, catalogues, engine) {
  const levelNeg = (catalogues.seniority.levels.find(l => l.id === profile.level)?.negatives) || [];
  const vetoNeg = profile.vetoes.flatMap(id => catalogues.vetoes.vetoes.find(v => v.id === id)?.terms || []);
  const negative = [...new Set([...levelNeg, ...vetoNeg, ...profile.noWords])];
  // ➤ With no roles named the positive list is empty and the engine lets every title
  // ➤ through that test; the negatives and the explanations still apply.
  const title = engine.buildTitleFilter({ positive: profile.roles, negative });
  const families = new Set(profile.families);
  const countries = new Set(profile.countries);
  const languages = new Set(profile.languages);
  const degrees = new Set(profile.degrees);
  const holdsEngineering = [...degrees].some(d => ENGINEERING_DEGREES.has(d));
  const languageName = code => catalogues.languages.languages.find(l => l.code === code)?.label || code;
  const degreeName = id => catalogues.degrees.degrees.find(d => d.id === id)?.label || id;

  return function judge(o) {
    if (families.size && !(o.f || []).some(f => families.has(f))) return { ok: false, stage: 'FAMILY', reason: 'outside the families you chose' };
    if (!title(o.t, o.l)) return { ok: false, stage: 'TITLE', reason: title.explain(o.t, o.l) || 'the title does not fit your roles' };
    if (countries.size) {
      if (o.cc === 'xx') { if (!profile.remote) return { ok: false, stage: 'COUNTRY', reason: 'remote work, and you did not allow it' }; }
      else if (o.cc && !countries.has(o.cc)) return { ok: false, stage: 'COUNTRY', reason: `in a country you did not choose (${o.cc.toUpperCase()})` };
    }
    if (profile.maxYears && o.y && o.y > profile.maxYears) return { ok: false, stage: 'YEARS', reason: `asks for ${o.y} years of experience (your cap is ${profile.maxYears})` };
    if (o.dg && o.dg.length) {
      const holds = o.dg.some(d => degrees.has(d) || (d === 'engineering-any' && holdsEngineering));
      if (!holds) return { ok: false, stage: 'DEGREE', reason: `requires a degree you did not list (${o.dg.map(degreeName).join(' or ')})` };
    }
    if (o.lg && o.lg.length) {
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
