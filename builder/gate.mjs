// ➤ Which ISCO-08 unit groups an advert belongs to (the families of the catalogue), and the
// ➤ hygiene rule. Three ways in, in order of trust: the source's own ISCO code; the source's
// ➤ SSYK code through JobTech's official SSYK→ISCO-08 correspondence (several groups can come
// ➤ out of one code: the title picks among them when it names one, else all stay); and the
// ➤ title alone, against ESCO's job titles in the source's language and in English, by the
// ➤ rule in app/lib/titles.js. A title that only says "engineer" lands in 2149, engineers not
// ➤ elsewhere classified, unless it names an occupation ESCO files outside the vertical.
import { fold } from 'argus/server-bot/text.mjs';
import { titleRules } from '../app/lib/titles.js';

const T = titleRules(fold);

// ➤ The bare word "engineer" in the sources' languages: the fallback when no ESCO title
// ➤ matches. Plain dictionary words.
const ENGINEER_WORDS = ['engineer', 'ingeniero', 'ingeniera', 'enginyer', 'enginyera', 'ingénieur', 'ingénieure', 'ingenieur', 'ingenieurin', 'ingenjör', 'civilingenjör', 'ingeniør', 'sivilingeniør', 'insinööri', 'ingegnere', 'engenheiro', 'engenheira', 'inżynier'];
const GENERIC_FAMILY = '2149';
// ➤ Bare role nouns ESCO lists among some occupations' alternative titles. On their own they
// ➤ name no occupation ("coordinador" is as often a day-care coordinator as a production one),
// ➤ so the gate does not match on them; there is no fallback for "technician" either, which in
// ➤ Spanish names sales and office jobs as often as technical ones.
const ROLE_WORDS = ['technician', 'técnico', 'técnica', 'tècnic', 'tècnica', 'technicien', 'technicienne', 'techniker', 'technikerin', 'technicus', 'tekniker', 'teknikko', 'tecnico', 'tecnica', 'technik',
  'coordinator', 'coordinador', 'coordinadora', 'coordinateur', 'coordinatrice', 'koordinator', 'koordinatör', 'coördinator', 'coordinatore',
  'supervisor', 'supervisora', 'superviseur', 'superviseuse', 'arbetsledare', 'foreman', 'capataz',
  'manager', 'gerente', 'gestor', 'gestora', 'responsable', 'responsible', 'leader', 'lead', 'líder', 'ledare', 'director', 'directora', 'directeur', 'directrice', 'jefe', 'jefa', 'chef', 'head', 'cap',
  'operator', 'operador', 'operadora', 'opérateur', 'opératrice', 'operatör', 'operatore', 'operaio', 'operario', 'operaria',
  'inspector', 'inspectora', 'inspecteur', 'inspectrice', 'controller', 'controlador', 'controladora', 'contrôleur', 'officer', 'oficial',
  'specialist', 'especialista', 'spécialiste', 'consultant', 'consultor', 'consultora', 'analyst', 'analista', 'designer', 'diseñador', 'diseñadora', 'dissenyador', 'dissenyadora', 'planner', 'planificador', 'planificadora', 'assistant', 'asistente', 'auxiliar'];
const GENERIC_WORDS = new Set([...ENGINEER_WORDS, ...ROLE_WORDS].map(T.clean));
const usableTitle = label => !GENERIC_WORDS.has(T.clean(label));
// ➤ Words that put a title outside the vertical whatever else it says: computing (ISCO 25),
// ➤ sales (24) and teaching (23). Read only when the title, not a code, decides.
const OUTSIDE_WORDS = /(?:^|[^a-z0-9])(?:informatic[oa]s?|informatica|it|ict|tic|software|programador|programadora|developer|desarrollador|desarrolladora|datos|dades|data|ciberseguridad|cybersecurity|comercial|ventas|sales|profesor|profesora|professor|docente|teacher|lecturer|formador|formadora)(?![a-z0-9])/;

// ➤ The languages a title is read in: the source's, plus English (many adverts everywhere
// ➤ are in English); a Catalan source is also read in Spanish, which ESCO has and Catalan lacks.
const languagesFor = lang => lang === 'ca' ? ['ca', 'es', 'en'] : lang && lang !== 'en' ? [lang, 'en'] : ['en'];

// ➤ A title as the gate reads it: gender marks ("Ingeniero/a", "Arquitecto/ta", "(m/w/d)", "H/F")
// ➤ go, then the shared folding. Not Argus's cleanTitle, which tidies a title for display.
export const matchableTitle = t => T.clean(fold(t || '').replace(/\/(?:a|o|as|os|es|ra|ora|ores|e|in|f|d|ta|ca|fa|na|la|da|va|ia|ica|ico|era|ona|essa|iva)(?![a-z])/g, '').replace(/\((?:m|w|d|f|h|x|\/|\s)+\)/g, ' '));

// ➤ The job titles of every family, per language, and the names among them (ESCO's preferred
// ➤ labels and the catalogue's own extra terms). The gate, the site (for the CV reader) and the
// ➤ tests all build them here. catalogue: families.json; codes: { isco: codes/isco.json }.
export function familyTerms(catalogue, codes = {}) {
  const out = {};
  for (const f of catalogue.families || catalogue) {
    const labels = {}, preferred = new Set();
    for (const c of f.isco || []) {
      for (const [lang, list] of Object.entries(codes.isco?.units?.[c]?.labels || {})) (labels[lang] ||= []).push(...list.filter(usableTitle));
      for (const list of Object.values(codes.isco?.units?.[c]?.preferred || {})) for (const l of list) preferred.add(T.clean(l));
    }
    for (const [lang, list] of Object.entries(f.extra_terms || {})) { (labels[lang] ||= []).push(...list); for (const l of list) preferred.add(T.clean(l)); }
    out[f.id] = { labels, preferred: [...preferred] };
  }
  return out;
}

// ➤ codes: { isco: codes/isco.json, ssyk: codes/ssyk-isco.json }.
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
    for (const [lang, labels] of Object.entries(terms[f.id].labels)) res[lang] = T.alternation(labels);
    return { id: f.id, res, preferred: new Set(terms[f.id].preferred) };
  });
  const blockers = {};
  for (const b of Object.values(codes.isco?.blockers || {})) for (const [lang, labels] of Object.entries(b.labels || {})) (blockers[lang] ||= []).push(...labels);
  for (const lang of Object.keys(blockers)) blockers[lang] = T.alternation(blockers[lang]);
  return { families, byIsco, bySsyk, titles, blockers, generic: T.alternation(ENGINEER_WORDS), genericFamily: byIsco.has(GENERIC_FAMILY) ? byIsco.get(GENERIC_FAMILY) : null };
}

// ➤ What a cleaned title names, by ESCO's titles: the families that stand by the rule, and
// ➤ whether an outside occupation matched with nothing of ours over it.
function titleFamilies(title, langs, gate) {
  const hits = [];
  for (const fam of gate.titles) for (const lang of langs) for (const text of T.matches(fam.res[lang], title)) hits.push({ id: fam.id, text, named: fam.preferred.has(text) });
  const blocks = [];
  for (const lang of langs) for (const text of T.matches(gate.blockers[lang], title)) blocks.push(text);
  const kept = T.winners(hits, blocks);
  const all = [...hits.map(h => h.text), ...blocks];
  const blocked = !kept.length && blocks.some(b => !all.some(o => T.inside(b, o)));
  return { families: [...new Set(kept.map(h => h.id))], blocked, texts: [...new Set(kept.map(h => h.text))] };
}

// ➤ The families of one advert. [] means outside the vertical.
export function familiesOf(raw, gate) {
  const codes = raw.codes || {};
  let candidates = [];
  if (codes.isco) { const f = gate.byIsco.get(String(codes.isco).slice(0, 4)); if (f) candidates = [f]; }
  if (!candidates.length && codes.ssyk && gate.bySsyk.has(codes.ssyk)) candidates = gate.bySsyk.get(codes.ssyk);
  if (candidates.length === 1) return candidates;
  const title = matchableTitle(raw.title);
  const byTitle = titleFamilies(title, languagesFor(raw.lang), gate);
  if (candidates.length > 1) {
    const narrowed = candidates.filter(c => byTitle.families.includes(c));
    return narrowed.length ? narrowed : candidates;
  }
  // ➤ A code the vertical does not hold is the source's word: the advert is out.
  if (codes.isco || codes.ssyk) return [];
  if (OUTSIDE_WORDS.test(title)) return [];
  if (byTitle.families.length) return byTitle.families;
  if (byTitle.blocked || !gate.genericFamily) return [];
  return T.matches(gate.generic, title).length ? [gate.genericFamily] : [];
}

// ➤ Title terms that mean "not the job you think": a sales role that names a product, a
// ➤ recruiter hiring engineers, an internship, a labourer. In the sources' languages, kept
// ➤ short; the visitor has vetoes of their own in the profile code.
const HYGIENE = /(?:^|[^a-z0-9])(?:sales|vendedora?|venedora?|comercial|saljare|forsaljare|verkoper|vendeur|vendeuse|verkaufer|verkauferin|account manager|recruiter|talent acquisition|internship|intern|praktikum|stagiaire|stage\b|becario|becaria|practicas|apprentice|apprenti|azubi|trainee|peon|peones|peona)(?![a-z0-9])/;
export function hygieneReason(raw) {
  return HYGIENE.test(fold(raw.title || '')) ? 'title names a sales, recruiting, trainee or labourer role' : null;
}
