// ➤ Which ISCO-08 unit groups an advert belongs to (the families of the catalogue), and the
// ➤ hygiene rule. Three ways in, in order of trust: the source's own ISCO code; the source's
// ➤ SSYK code through JobTech's official SSYK→ISCO-08 correspondence (several groups can come
// ➤ out of one code: the title picks among them when it names one, else all stay); and the
// ➤ title alone, against ESCO's job titles in the source's language and in English. The
// ➤ longest title wins ("naval architect" is not an "architect"); a title that only says
// ➤ "engineer" lands in 2149, engineers not elsewhere classified, unless it names an
// ➤ occupation ESCO files outside the vertical ("software engineer", "sales engineer").
import { fold } from 'argus/server-bot/text.mjs';

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// ➤ Titles are compared folded, with apostrophes read as spaces ("d'études" and "d études" are one).
const phrase = s => escapeRe(fold(s).replace(/['’]/g, ' ').trim()).replace(/\s+/g, '\\s+');
// ➤ One regex over many titles, longest first so the alternation prefers the longer one.
const alternation = labels => {
  const uniq = [...new Set((labels || []).map(l => fold(l).replace(/['’]/g, ' ').trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
  return uniq.length ? new RegExp(`(?:^|[^a-z0-9])(${uniq.map(phrase).join('|')})(?![a-z0-9])`, 'g') : null;
};
const matches = (re, s) => { if (!re) return []; re.lastIndex = 0; return [...s.matchAll(re)].map(m => m[1]); };

// ➤ The bare word "engineer" in the sources' languages: the fallback when no ESCO title
// ➤ matches. Plain dictionary words. There is no such fallback for "technician": in Spanish
// ➤ it names sales and office jobs as often as technical ones.
export const ENGINEER_WORDS = ['engineer', 'ingeniero', 'ingeniera', 'enginyer', 'enginyera', 'ingénieur', 'ingénieure', 'ingenieur', 'ingenieurin', 'ingenjör', 'civilingenjör', 'ingeniør', 'sivilingeniør', 'insinööri', 'ingegnere', 'engenheiro', 'engenheira', 'inżynier'];
// ➤ Bare role nouns ESCO lists among some occupations' alternative titles: on their own they
// ➤ name no occupation ("coordinador" is as often a day-care coordinator as a production
// ➤ one), so the gate does not match on them. The fallback above keeps the engineer words.
const ROLE_WORDS = ['technician', 'técnico', 'técnica', 'tècnic', 'tècnica', 'technicien', 'technicienne', 'techniker', 'technikerin', 'technicus', 'tekniker', 'teknikko', 'tecnico', 'tecnica', 'technik',
  'coordinator', 'coordinador', 'coordinadora', 'coordinateur', 'coordinatrice', 'koordinator', 'koordinatör', 'coördinator', 'coordinatore',
  'supervisor', 'supervisora', 'superviseur', 'superviseuse', 'arbetsledare', 'foreman', 'capataz',
  'manager', 'gerente', 'gestor', 'gestora', 'responsable', 'responsible', 'leader', 'lead', 'líder', 'ledare', 'director', 'directora', 'directeur', 'directrice', 'jefe', 'jefa', 'chef', 'head', 'cap',
  'operator', 'operador', 'operadora', 'opérateur', 'opératrice', 'operatör', 'operatore', 'operaio', 'operario', 'operaria',
  'inspector', 'inspectora', 'inspecteur', 'inspectrice', 'controller', 'controlador', 'controladora', 'contrôleur', 'officer', 'oficial',
  'specialist', 'especialista', 'spécialiste', 'consultant', 'consultor', 'consultora', 'analyst', 'analista', 'designer', 'diseñador', 'diseñadora', 'dissenyador', 'dissenyadora', 'planner', 'planificador', 'planificadora', 'assistant', 'asistente', 'auxiliar'];
const GENERIC_WORDS = new Set([...ENGINEER_WORDS, ...ROLE_WORDS].map(fold));
export const usableTitle = label => !GENERIC_WORDS.has(fold(label).trim());
export const GENERIC_FAMILY = '2149';

// ➤ The languages a title is read in: the source's, plus English (many adverts everywhere
// ➤ are in English); a Catalan source is also read in Spanish, which ESCO has and Catalan lacks.
export const languagesFor = lang => lang === 'ca' ? ['ca', 'es', 'en'] : lang && lang !== 'en' ? [lang, 'en'] : ['en'];

// ➤ Gender marks ("Ingeniero/a", "Enginyer/a", "(m/w/d)", "H/F") and apostrophes go before
// ➤ the words are read.
export const cleanTitle = t => fold(t || '').replace(/\/(?:a|o|as|os|es|ra|ora|ores|e|in|f|d|ta|ca|fa|na|la|da|va|ia|ica|ico|era|ona|essa|iva)(?![a-z])/g, '').replace(/\((?:m|w|d|f|h|x|\/|\s)+\)/g, ' ').replace(/['’]/g, ' ').replace(/\s+/g, ' ').trim();

const name = s => fold(s).replace(/['’]/g, ' ').trim();

// ➤ The job titles of every family, per language, and the folded names among them (ESCO's
// ➤ preferred labels and the catalogue's own extra terms). The gate, the site (for the CV
// ➤ reader) and the tests all build them here, so one rule serves everywhere.
export function familyTerms(catalogue, codes = {}) {
  const out = {};
  for (const f of catalogue.families || catalogue) {
    const labels = {}, preferred = new Set();
    for (const c of f.isco || []) {
      for (const [lang, list] of Object.entries(codes.isco?.units?.[c]?.labels || {})) (labels[lang] ||= []).push(...list.filter(usableTitle));
      for (const list of Object.values(codes.isco?.units?.[c]?.preferred || {})) for (const l of list) preferred.add(name(l));
    }
    for (const [lang, list] of Object.entries(f.extra_terms || {})) { (labels[lang] ||= []).push(...list); for (const l of list) preferred.add(name(l)); }
    out[f.id] = { labels, preferred: [...preferred] };
  }
  return out;
}

// ➤ catalogue: families.json (groups and families; each family lists its ISCO unit groups and
// ➤ may add extra_terms per language). codes: { isco: codes/isco.json, ssyk: codes/ssyk-isco.json }.
export function compileFamilies(catalogue, codes = {}) {
  const families = catalogue.families || catalogue;
  const byIsco = new Map();
  for (const f of families) for (const c of f.isco || []) byIsco.set(String(c), f.id);
  const bySsyk = new Map();
  for (const [id, c] of Object.entries(codes.ssyk?.concepts || {})) {
    const fams = [...new Set((c.isco || []).map(i => byIsco.get(String(i))).filter(Boolean))];
    if (fams.length) bySsyk.set(id, fams);
  }
  const terms = familyTerms(catalogue, codes);
  const titles = families.map(f => {
    const res = {};
    for (const [lang, labels] of Object.entries(terms[f.id].labels)) res[lang] = alternation(labels);
    return { id: f.id, res, preferred: new Set(terms[f.id].preferred) };
  });
  const blockers = {};
  for (const b of Object.values(codes.isco?.blockers || {})) for (const [lang, labels] of Object.entries(b.labels || {})) (blockers[lang] ||= []).push(...labels);
  for (const lang of Object.keys(blockers)) blockers[lang] = alternation(blockers[lang]);
  return { families, byIsco, bySsyk, titles, blockers, generic: alternation(ENGINEER_WORDS), genericFamily: byIsco.has(GENERIC_FAMILY) ? byIsco.get(GENERIC_FAMILY) : null };
}

// ➤ What a title names, by ESCO's titles: the families whose title matched and was not part of
// ➤ a longer match, and whether an outside occupation matched with nothing of ours over it.
// ➤ A title that is the name of an occupation in one family and only an alternative in
// ➤ others counts for the family that names it.
export function titleFamilies(title, langs, gate) {
  const hits = [];
  for (const fam of gate.titles) for (const lang of langs) for (const text of matches(fam.res[lang], title)) hits.push({ id: fam.id, text, named: fam.preferred.has(text) });
  const blocks = [];
  for (const lang of langs) for (const text of matches(gate.blockers[lang], title)) blocks.push(text);
  const all = [...hits.map(h => h.text), ...blocks];
  const inside = (a, b) => a !== b && new RegExp(`(?:^|[^a-z0-9])${phrase(a)}(?![a-z0-9])`).test(b);
  const longest = hits.filter(h => !all.some(o => inside(h.text, o)));
  const kept = longest.filter(h => h.named || !longest.some(o => o.text === h.text && o.named));
  const blocked = blocks.some(b => !all.some(o => inside(b, o)));
  return { families: [...new Set(kept.map(h => h.id))], blocked: blocked && !kept.length, texts: [...new Set(kept.map(h => h.text))] };
}

// ➤ The families of one advert. [] means outside the vertical.
export function familiesOf(raw, gate) {
  const codes = raw.codes || {};
  let candidates = [];
  if (codes.isco) { const f = gate.byIsco.get(String(codes.isco).slice(0, 4)); if (f) candidates = [f]; }
  if (!candidates.length && codes.ssyk && gate.bySsyk.has(codes.ssyk)) candidates = gate.bySsyk.get(codes.ssyk);
  if (candidates.length === 1) return candidates;
  const title = cleanTitle(raw.title);
  const langs = languagesFor(raw.lang);
  const byTitle = titleFamilies(title, langs, gate);
  if (candidates.length > 1) {
    const narrowed = candidates.filter(c => byTitle.families.includes(c));
    return narrowed.length ? narrowed : candidates;
  }
  // ➤ A code the vertical does not hold is the source's word: the advert is out.
  if ((codes.isco && String(codes.isco).length >= 4) || (codes.ssyk && gate.bySsyk.size)) return [];
  if (NOT_OURS.test(title)) return [];
  if (byTitle.families.length) return byTitle.families;
  if (byTitle.blocked || !gate.genericFamily) return [];
  return matches(gate.generic, title).length ? [gate.genericFamily] : [];
}
// ➤ Words that put a title outside the vertical whatever else it says: computing (ISCO 25),
// ➤ sales (24) and teaching (23). Read only when the title, not a code, decides.
const NOT_OURS = /(?:^|[^a-z0-9])(?:informatic[oa]s?|informatica|it|ict|tic|software|programador|programadora|developer|desarrollador|desarrolladora|datos|dades|data|ciberseguridad|cybersecurity|comercial|ventas|sales|profesor|profesora|professor|docente|teacher|lecturer|formador|formadora)(?![a-z0-9])/;

// ➤ Title terms that mean "not the job you think": a sales role that names a product, a
// ➤ recruiter hiring engineers, an internship. In the sources' languages, kept short; the
// ➤ visitor has vetoes of their own in the profile code.
const HYGIENE = /(?:^|[^a-z0-9])(?:sales|vendedora?|venedora?|comercial|saljare|forsaljare|verkoper|vendeur|vendeuse|verkaufer|verkauferin|account manager|recruiter|talent acquisition|internship|intern|praktikum|stagiaire|stage\b|becario|becaria|practicas|apprentice|apprenti|azubi|trainee|peon|peones|peona)(?![a-z0-9])/;
export function hygieneReason(raw) {
  return HYGIENE.test(fold(raw.title || '')) ? 'title names a sales, recruiting, trainee or labourer role' : null;
}
