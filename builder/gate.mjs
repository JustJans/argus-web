// ➤ Which ISCO-08 unit groups an advert belongs to (the families of the catalogue: engineers,
// ➤ architects, technicians, supervisors, plant operators, crews, and since 2026-09-06 software
// ➤ and IT), and the hygiene rule. Three ways in, in order of trust: the source's own ISCO code; the source's
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
const ENGINEER_WORDS = ['engineer', 'ingeniero', 'ingeniera', 'enginyer', 'enginyera', 'ingénieur', 'ingénieure', 'ingenieur', 'ingenieurin', 'ingenjör', 'civilingenjör', 'ingeniør', 'sivilingeniør', 'insinööri', 'ingegnere', 'engenheiro', 'engenheira', 'inżynier', 'inženýr', 'inženýrka', 'inžinierius', 'inžinierė', 'inženieris', 'inženiere'];
const GENERIC_FAMILY = '2149';
// ➤ Where a computing title lands when ESCO names nothing more precise: software and
// ➤ applications developers and analysts not elsewhere classified.
const ICT_FAMILY = '2519';
// ➤ Languages that compound their engineers (būvinženieris, Bauingenieur, byggingenjör): a word
// ➤ ending in the engineer word is the bare word too. Folded forms, as the title is read.
const COMPOUND_ENGINEER = /(?:^|[^a-z])[a-z]{3,}(?:ingenieur|ingenieurin|ingenjor|ingenior|insinoori|inzenieris|inzeniere|inzynier|inzenyr|ingeniero|ingeniera)(?![a-z])/;
// ➤ Bare role nouns ESCO lists among some occupations' alternative titles. On their own they
// ➤ name no occupation ("coordinador" is as often a day-care coordinator as a production one),
// ➤ so the gate does not match on them; there is no fallback for "technician" either, which in
// ➤ Spanish names sales and office jobs as often as technical ones.
const ROLE_WORDS = ['technician', 'técnico', 'técnica', 'tècnic', 'tècnica', 'technicien', 'technicienne', 'techniker', 'technikerin', 'technicus', 'tekniker', 'teknikko', 'tecnico', 'tecnica', 'technik', 'technička', 'technikas', 'technikė', 'tehniķis', 'tehniķe',
  'coordinator', 'coordinador', 'coordinadora', 'coordinateur', 'coordinatrice', 'koordinator', 'koordinatör', 'coördinator', 'coordinatore',
  'supervisor', 'supervisora', 'superviseur', 'superviseuse', 'arbetsledare', 'foreman', 'capataz',
  'manager', 'gerente', 'gestor', 'gestora', 'responsable', 'responsible', 'leader', 'lead', 'líder', 'ledare', 'director', 'directora', 'directeur', 'directrice', 'jefe', 'jefa', 'chef', 'head', 'cap',
  'operator', 'operador', 'operadora', 'opérateur', 'opératrice', 'operatör', 'operatore', 'operaio', 'operario', 'operaria',
  'inspector', 'inspectora', 'inspecteur', 'inspectrice', 'controller', 'controlador', 'controladora', 'contrôleur', 'officer', 'oficial',
  'specialist', 'especialista', 'spécialiste', 'specialista', 'specialistka', 'specialistas', 'specialistė', 'speciālists', 'speciāliste', 'vadovas', 'vadovė', 'vadītājs', 'vadītāja', 'vedoucí', 'mistr', 'meistras', 'meistars', 'consultant', 'consultor', 'consultora', 'analyst', 'analista', 'designer', 'diseñador', 'diseñadora', 'dissenyador', 'dissenyadora', 'planner', 'planificador', 'planificadora', 'assistant', 'asistente', 'auxiliar'];
const GENERIC_WORDS = new Set([...ENGINEER_WORDS, ...ROLE_WORDS].map(T.clean));
const usableTitle = label => !GENERIC_WORDS.has(T.clean(label));
// ➤ Words that put a title outside the vertical whatever else it says: sales (ISCO 24) and
// ➤ teaching (23), in the sources' languages. Read only when the title, not a code, decides.
const OUTSIDE_WORDS = /(?:^|[^a-z0-9])(?:marketing (?:manager|lead|specialist|director|executive|coordinator|officer|assistant|analyst|consultant|associate|intern|manager)|head of marketing|growth marketing|product marketing|content marketing|performance marketing|brand manager|verkoopmedewerker|kundenberater|kundenberaterin|customer service|customer success manager|account executive|ingenieur commercial|ingenieure commerciale|ingenieur d affaires|business developer|business development|comercial|ventas|sales|profesor|profesora|professor|docente|teacher|lecturer|formador|formadora|pardavimu|pardosanas|tirdzniecibas|prekybos|obchodni|prodej|ucitel|ucitelka|mokytojas|skolotajs)(?![a-z0-9])/;
// ➤ The computing vocabulary of job titles, in the sources' languages and in the English of
// ➤ company boards: a title that carries one and names no occupation ESCO knows is still a
// ➤ software job, and lands in ICT_FAMILY rather than among the engineers.
const ICT_WORDS = /(?:^|[^a-z0-9])(?:informatic[oa]s?|informatica|it|ict|tic|software|programador|programadora|developer|desarrollador|desarrolladora|datos|dades|data|ciberseguridad|cybersecurity|backend|back end|frontend|front end|fullstack|full stack|mobile|devops|sre|cloud|ml|machine learning|ai|analytics|compiler|web|api|firmware|app|apps|android|ios|javascript|typescript|python|java|kubernetes|saas|crm|erp|d365|sap|salesforce|solution|solutions|database|sql|programator|programatorka|programuotojas|programmetajs|duomenu|datu|programovani|programavimo|programmesanas|skaitlotaju|datoru|kompiuteriu|pocitacovy|pocitacova)(?![a-z0-9])/;

// ➤ Where a computing title goes when ESCO names nothing more precise, by the words it carries,
// ➤ first match wins; only then the catch-all (2519, which ISCO keeps for data, AI and testing).
const ICT_ROUTES = [
  [/(?:^|[^a-z])(?:security|securite|seguridad|sicherheit|cyber|iam|soc|pentest|penetration|siem|infosec)(?![a-z])/, '2529'],
  [/(?:^|[^a-z])(?:sap|s 4hana|s4hana|hana|erp|dynamics|d365|salesforce|crm|servicenow|workday consultant|oracle ebs)(?![a-z])/, '2511'],
  [/(?:^|[^a-z])(?:database|databases|dba|datenbank|base de datos|bases de datos|sql server|postgres|oracle dba)(?![a-z])/, '2521'],
  [/(?:^|[^a-z])(?:network engineer|network administrator|netzwerk|netzwerkadministrator|redes|reseau|reseaux|cisco|ccnp|ccna)(?![a-z])/, '2523'],
  [/(?:^|[^a-z])(?:it support|helpdesk|help desk|service desk|desktop support|support technician|1st level|2nd level|first line|second line|soporte)(?![a-z])/, '3512'],
  [/(?:^|[^a-z])(?:devops|devsecops|sre|site reliability|cloud|platform engineer|kubernetes|sysadmin|system administrator|systemadministrator|systemadministratorin|linux administrator|sap basis|administrador de sistemas|administrateur systeme)(?![a-z])/, '2522'],
  [/(?:^|[^a-z])(?:web developer|webentwickler|webentwicklerin|desarrollador web|developpeur web|frontend|front end|ui developer|wordpress|shopify)(?![a-z])/, '2513'],
  [/(?:^|[^a-z])(?:android|ios|mobile developer|mobile engineer|app developer|flutter|react native|swift|kotlin)(?![a-z])/, '2514'],
  [/(?:^|[^a-z])(?:data|daten|datos|dades|analytics|analytic|machine learning|ml|ai|artificial intelligence|business intelligence|bi|power bi|tableau|llm|nlp|computer vision|qa|test automation|tester)(?![a-z])/, '2519'],
  [/(?:^|[^a-z])(?:consultant|consultante|berater|beraterin|consultor|consultora|business analyst|systems analyst|functional|architect|architekt|architektin|arquitecto|arquitecta)(?![a-z])/, '2511'],
  [/(?:^|[^a-z])(?:developer|desarrollador|desarrolladora|developpeur|developpeuse|entwickler|entwicklerin|ontwikkelaar|utvecklare|udvikler|utvikler|programmer|programador|programadora|programmeur|software|java|dotnet|net developer|c\+\+|python|golang|rust|scala|ruby|php|node|typescript|javascript|full stack|fullstack|backend|back end|forward deployed|embedded)(?![a-z])/, '2512'],
];
// ➤ Where a title that names only "engineer" goes when it also names a discipline, in the
// ➤ languages of the sources; else ISCO's engineers not elsewhere classified (2149).
const ENGINEER_ROUTES = [
  [/(?:^|[^a-z])(?:electronic|electronics|electronico|electronica|electronique|elektronik|elektronisch|elettronic[oa]|eletronic[oa]|analog|mixed signal|asic|fpga|pcb|hardware|rf|radio frequency|semiconductor|chip|vlsi|firmware|embedded)(?![a-z])/, '2152'],
  [/(?:^|[^a-z])(?:telecom|telecoms|telecommunications|telecomunicaciones|telecommunication|telekommunikation|5g|lte|radio network)(?![a-z])/, '2153'],
  [/(?:^|[^a-z])(?:electrical|electric|electrico|electrica|electrique|elektrotechnik|elektrotechniek|elektrotechnisch|elektro|elettric[oa]|eletric[oa]|power systems|high voltage|substation)(?![a-z])/, '2151'],
  [/(?:^|[^a-z])(?:mechanical|mecanico|mecanica|mecanique|maschinenbau|werktuigbouwkunde|werktuigbouwkundig|werktuigbouwkundige|maskiningenjor|meccanic[oa]|mecanic[oa]|hvac|piping|thermal)(?![a-z])/, '2144'],
  [/(?:^|[^a-z])(?:civil|structural|structures|estructuras|estructural|bridges|bridge|puentes|brucken|tiefbau|hochbau|geotechnical|geotecnico|highway|highways|carreteras|railway|railways|ferroviario|hidraulic[oa]|hydraulic)(?![a-z])/, '2142'],
  [/(?:^|[^a-z])(?:chemical|quimico|quimica|chimique|chimiste|chemie|chemisch|kemi|chimic[oa])(?![a-z])/, '2145'],
  [/(?:^|[^a-z])(?:environmental|medioambiental|medioambiente|ambiental|environnement|umwelt|milieu|sustainability)(?![a-z])/, '2143'],
  [/(?:^|[^a-z])(?:mining|mineria|minas|metallurgy|metallurgical|metalurgia|metalurgico|bergbau)(?![a-z])/, '2146'],
  [/(?:^|[^a-z])(?:industrial|production|manufacturing|fabricacion|produccion|fertigung|produktion|productie|lean)(?![a-z])/, '2141'],
];
const known = new WeakMap();
const route = (routes, title, gate) => {
  if (!known.has(gate)) known.set(gate, new Set(gate.families.map(f => String(f.id))));
  for (const [re, id] of routes) if (re.test(title) && known.get(gate).has(id)) return id;
  return null;
};

// ➤ The languages a title is read in: the source's, plus English (many adverts everywhere
// ➤ are in English); a Catalan source is also read in Spanish, which ESCO has and Catalan lacks.
const languagesFor = lang => lang === 'ca' ? ['ca', 'es', 'en'] : lang && lang !== 'en' ? [lang, 'en'] : ['en'];
// ➤ A source that names no language (most company boards and careers sites) was read in English
// ➤ alone, so "Bauingenieur" or "werktuigbouwkundig ingenieur" fell to the catch-alls. Such an
// ➤ advert is now also read in the languages of its country, the ones ESCO has titles for.
const COUNTRY_LANGS = { es: ['es'], ad: ['es'], fr: ['fr'], mc: ['fr'], lu: ['fr', 'de'], be: ['nl', 'fr'], nl: ['nl'], de: ['de'], at: ['de'], li: ['de'], ch: ['de', 'fr', 'it'], it: ['it'], sm: ['it'], pt: ['pt'], se: ['sv'], no: ['no'], dk: ['da'], fi: ['fi', 'sv'], pl: ['pl'], cz: ['cs'], sk: ['cs'], lt: ['lt'], lv: ['lv'] };
export const languagesOfCountry = cc => COUNTRY_LANGS[cc] || [];

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
  return { families, byIsco, bySsyk, titles, blockers, generic: T.alternation(ENGINEER_WORDS), genericFamily: byIsco.get(GENERIC_FAMILY) || null, ictFamily: byIsco.get(ICT_FAMILY) || null };
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
  const langs = raw.lang ? languagesFor(raw.lang) : [...new Set([...(raw.hintLangs || []), 'en'])];
  const byTitle = titleFamilies(title, langs, gate);
  if (candidates.length > 1) {
    const narrowed = candidates.filter(c => byTitle.families.includes(c));
    return narrowed.length ? narrowed : candidates;
  }
  // ➤ A code the vertical does not hold is the source's word: the advert is out.
  if (codes.isco || codes.ssyk) return [];
  if (OUTSIDE_WORDS.test(title)) return [];
  // ➤ ESCO's own generic engineer ("design engineer") gives way to a discipline the title names.
  if (byTitle.families.length === 1 && byTitle.families[0] === gate.genericFamily) return [route(ENGINEER_ROUTES, title, gate) || gate.genericFamily];
  if (byTitle.families.length === 1 && byTitle.families[0] === '2161' && ICT_WORDS.test(title)) return [route(ICT_ROUTES, title, gate) || '2511'];
  if (byTitle.families.length) return byTitle.families;
  if (byTitle.blocked) return [];
  if (ICT_WORDS.test(title)) { const to = route(ICT_ROUTES, title, gate) || gate.ictFamily; return to ? [to] : []; }
  if (!gate.genericFamily) return [];
  return T.matches(gate.generic, title).length || COMPOUND_ENGINEER.test(title) ? [route(ENGINEER_ROUTES, title, gate) || gate.genericFamily] : [];
}

// ➤ Title terms that mean "not the job you think": a sales role that names a product, a
// ➤ recruiter hiring engineers, an internship, a labourer. In the sources' languages, kept
// ➤ short; the visitor has vetoes of their own in the profile code.
const HYGIENE = /(?:^|[^a-z0-9])(?:sales|vendedora?|venedora?|comercial|saljare|forsaljare|verkoper|vendeur|vendeuse|verkaufer|verkauferin|account manager|recruiter|talent acquisition|internship|intern|praktikum|stagiaire|stage\b|becario|becaria|practicas|apprentice|apprenti|azubi|trainee|peon|peones|peona|prodejce|prodavac|prodavacka|pardavejas|pardaveja|pardevejs|pardeveja|praktikant|praktikantka|praktikantas|praktikante|stazista|stazuotojas|delnik|delnice|ai trainer|ai training|ai tutor|data collector|data labeling|data labelling|annotator|survey|study participant|task based|freelance rater|working student|werkstudent|werkstudentin|ausbildung|store ?#? ?[0-9]+|store manager|store associate|retail assistant|retail associate|shop assistant|barista|cashier|crew member|machine operator|production operator|quality control operator|qc operator|assembly operator|packing operator|forklift)(?![a-z0-9])/;
export function hygieneReason(raw) {
  return HYGIENE.test(fold(raw.title || '')) ? 'title names a sales, recruiting, trainee, labourer, retail, operative or gig role' : null;
}
