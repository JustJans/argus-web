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
// ➤ The index's name for the titles outside the vertical (no family is called that).
const BLOCKERS = '#outside';
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
  'operator', 'operador', 'operadora', 'opérateur', 'opératrice', 'operatör', 'operatore', 'operaio', 'operario', 'operaria', 'conducteur', 'conductrice',
  'inspector', 'inspectora', 'inspecteur', 'inspectrice', 'controller', 'controlador', 'controladora', 'contrôleur', 'officer', 'oficial',
  'specialist', 'especialista', 'spécialiste', 'specialista', 'specialistka', 'specialistas', 'specialistė', 'speciālists', 'speciāliste', 'vadovas', 'vadovė', 'vadītājs', 'vadītāja', 'vedoucí', 'mistr', 'meistras', 'meistars', 'consultant', 'consultor', 'consultora', 'analyst', 'analista', 'designer', 'diseñador', 'diseñadora', 'dissenyador', 'dissenyadora', 'planner', 'planificador', 'planificadora', 'assistant', 'asistente', 'auxiliar'];
const GENERIC_WORDS = new Set([...ENGINEER_WORDS, ...ROLE_WORDS].map(T.clean));
const usableTitle = label => !GENERIC_WORDS.has(T.clean(label));
// ➤ Words that put a title outside the vertical whatever else it says: sales (ISCO 24), teaching
// ➤ (23), facilities management (1219, as the ONS files it) and property or project development
// ➤ (the French "développeur de projet"), in the sources' languages. Read only when the title, not
// ➤ a code, decides.
const OUTSIDE_WORDS = /(?:^|[^a-z0-9])(?:marketing (?:manager|lead|specialist|director|executive|coordinator|officer|assistant|analyst|consultant|associate|intern|manager)|head of marketing|growth marketing|product marketing|content marketing|performance marketing|brand manager|verkoopmedewerker|kundenberater|kundenberaterin|customer service|customer success manager|account executive|ingenieur commercial|ingenieure commerciale|ingenieur d affaires|technico[ -]commerciale?|vertrieb[a-z]*|developpeu(?:r|se) (?:de projets?|foncier|fonciere|commercial|commerciale|d affaires)|facility manager|facilities manager|business developer|business development|comercial|ventas|sales|profesor|profesora|professor|docente|teacher|lecturer|formador|formadora|pardavimu|pardosanas|tirdzniecibas|prekybos|obchodni|prodej|ucitel|ucitelka|mokytojas|skolotajs)(?![a-z0-9])/;
// ➤ The computing vocabulary of job titles, in the sources' languages and in the English of
// ➤ company boards: a title that carries one and names no occupation ESCO knows is still a
// ➤ software job, and lands in ICT_FAMILY rather than among the engineers.
const ICT_WORDS = /(?:^|[^a-z0-9])(?:informatic[oa]s?|informatica|it|ict|tic|software|programador|programadora|programmeur|programmeuse|developer|developpeur|developpeuse|desarrollador|desarrolladora|datos|dades|data|ciberseguridad|cybersecurity|back[ -]?end|front[ -]?end|full[ -]?stack|mobile|devops|sre|cloud|ml|machine learning|ai|analytics|compiler|web|api|firmware|app|apps|android|ios|javascript|typescript|python|java|kubernetes|saas|crm|erp|d365|sap|salesforce|solution|solutions|database|sql|tecnico de soporte|tecnica de soporte|soporte informatico|windows administrator|windows server|windows engineer|linux|unix|vmware|citrix|azure|m365|office 365|active directory|sharepoint|teamcenter|windchill|plm|jira|atlassian|programator|programatorka|programuotojas|programmetajs|duomenu|datu|programovani|programavimo|programmesanas|skaitlotaju|datoru|kompiuteriu|pocitacovy|pocitacova)(?![a-z0-9])/;

// ➤ Where a computing title goes when ESCO names nothing more precise, by the words it carries,
// ➤ first match wins; only then the catch-all (2519, which ISCO keeps for data, AI and testing).
// ➤ The third field is ESCO's occupation for every title the route takes, where there is one.
const ICT_ROUTES = [
  [/(?:^|[^a-z])(?:security|securite|seguridad|sicherheit|cyber|iam|soc|pentest|penetration|siem|infosec)(?![a-z])/, '2529'],
  [/(?:^|[^a-z])(?:sap|s 4hana|s4hana|hana|erp|dynamics|d365|salesforce|crm|servicenow|workday consultant|oracle ebs)(?![a-z])/, '2511'],
  [/(?:^|[^a-z])(?:database|databases|dba|datenbank|base de datos|bases de datos|sql server|postgres|oracle dba)(?![a-z])/, '2521'],
  [/(?:^|[^a-z])(?:network engineer|network administrator|netzwerk|netzwerkadministrator|redes|reseau|reseaux|cisco|ccnp|ccna)(?![a-z])/, '2523', '2523.3'],
  [/(?:^|[^a-z])(?:it support|helpdesk|help desk|service desk|desktop support|support technician|1st level|2nd level|first line|second line|soporte)(?![a-z])/, '3512', '3512.1'],
  [/(?:^|[^a-z])(?:devops|devsecops|sre|site reliability|cloud|platform engineer|kubernetes|sysadmin|system administrator|systemadministrator|systemadministratorin|linux administrator|sap basis|administrador de sistemas|administrateur systeme|(?:windows|linux|unix|vmware|citrix|azure|m365|office 365|exchange|active directory|sharepoint|teamcenter|windchill|plm|cad|jira|atlassian) administrator)(?![a-z])/, '2522'],
  [/(?:^|[^a-z])(?:web developer|webentwickler|webentwicklerin|desarrollador web|developpeur web|front[ -]?end|ui developer|wordpress|shopify)(?![a-z])/, '2513', '2513.5'],
  [/(?:^|[^a-z])(?:android|ios|mobile developer|mobile engineer|app developer|flutter|react native|swift|kotlin)(?![a-z])/, '2514', '2514.2.2'],
  [/(?:^|[^a-z])(?:data|daten|datos|dades|analytics|analytic|machine learning|ml|ai|artificial intelligence|business intelligence|bi|power bi|tableau|llm|nlp|computer vision|qa|test automation|tester)(?![a-z])/, '2519'],
  [/(?:^|[^a-z])(?:consultant|consultante|berater|beraterin|consultor|consultora|business analyst|systems analyst|functional|architect|architekt|architektin|arquitecto|arquitecta)(?![a-z])/, '2511'],
  [/(?:^|[^a-z])(?:developer|desarrollador|desarrolladora|developpeur|developpeuse|entwickler|entwicklerin|ontwikkelaar|utvecklare|udvikler|utvikler|programmer|programador|programadora|programmeur|software|java|dotnet|net developer|c\+\+|python|golang|rust|scala|ruby|php|node|typescript|javascript|full stack|fullstack|backend|back end|forward deployed|embedded)(?![a-z])/, '2512', '2512.3'],
];
// ➤ Where a title that names only "engineer" goes when it also names a discipline, in the
// ➤ languages of the sources; else ISCO's engineers not elsewhere classified (2149). The third
// ➤ field is the discipline's own occupation in ESCO ("mechanical engineer").
const ENGINEER_ROUTES = [
  [/(?:^|[^a-z])(?:electronic|electronics|electronico|electronica|electronique|elektronik|elektronisch|elettronic[oa]|eletronic[oa]|analog|mixed signal|asic|fpga|pcb|hardware|rf|radio frequency|semiconductor|chip|vlsi|firmware|embedded)(?![a-z])/, '2152', '2152.1'],
  [/(?:^|[^a-z])(?:telecom|telecoms|telecommunications|telecomunicaciones|telecommunication|telekommunikation|5g|lte|radio network)(?![a-z])/, '2153', '2153.1'],
  [/(?:^|[^a-z])(?:electrical|electric|electrico|electrica|electrique|elektrotechnik|elektrotechniek|elektrotechnisch|elektro|elettric[oa]|eletric[oa]|power systems|high voltage|substation)(?![a-z])/, '2151', '2151.1'],
  [/(?:^|[^a-z])(?:mechanical|mecanico|mecanica|mecanique|maschinenbau|werktuigbouwkunde|werktuigbouwkundig|werktuigbouwkundige|maskiningenjor|meccanic[oa]|mecanic[oa]|hvac|piping|thermal)(?![a-z])/, '2144', '2144.1'],
  [/(?:^|[^a-z])(?:civil|structural|structures|estructuras|estructural|bridges|bridge|puentes|brucken|tiefbau|hochbau|geotechnical|geotecnico|highway|highways|carreteras|railway|railways|ferroviario|hidraulic[oa]|hydraulic)(?![a-z])/, '2142', '2142.1'],
  // ➤ Naval architecture and marine engineering (ESCO's marine engineer), after the civil route so
  // ➤ an offshore structural engineer stays with the structures.
  [/(?:^|[^a-z])(?:mooring|moorings|naval|marine|subsea|hydrodynamic|hydrodynamics|shipbuilding|scheepsbouw|schiffbau)(?![a-z])/, '2144', '2144.1.10'],
  [/(?:^|[^a-z])(?:chemical|quimico|quimica|chimique|chimiste|chemie|chemisch|kemi|chimic[oa])(?![a-z])/, '2145', '2145.1'],
  [/(?:^|[^a-z])(?:environmental|medioambiental|medioambiente|ambiental|environnement|umwelt|milieu|sustainability)(?![a-z])/, '2143', '2143.1'],
  [/(?:^|[^a-z])(?:mining|mineria|minas|metallurgy|metallurgical|metalurgia|metalurgico|bergbau)(?![a-z])/, '2146'],
  [/(?:^|[^a-z])(?:industrial|production|manufacturing|fabricacion|produccion|fertigung|produktion|productie|lean)(?![a-z])/, '2141', '2141.3'],
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

// ➤ A title as the gate reads it: gender marks ("Ingeniero/a", "Arquitecto/ta", "(m/w/d)", "H/F",
// ➤ and French endings in brackets or after a middle dot: "Conducteur(trice)", "Ingénieur(e)",
// ➤ "technicien·ne") go, then the shared folding. Not Argus's cleanTitle, which tidies a title
// ➤ for display.
export const matchableTitle = t => T.clean(fold(t || '')
  .replace(/\/(?:a|o|as|os|es|ra|ora|ores|e|in|f|d|ta|ca|fa|na|la|da|va|ia|ica|ico|era|ona|essa|iva|trice|rice|euse|ere|ne|ienne)(?![a-z])/g, '')
  .replace(/(?<=[a-z])(?:\((?:e|es|se|ne|trice|rice|ice|euse|ere)\)|·(?:e|es|se|ne|trice|rice|euse|ere))(?![a-z])/g, '')
  .replace(/\((?:m|w|d|f|h|x|\/|\s)+\)/g, ' ')
  // ➤ The graduate schemes' way of naming a graduate engineer ("Electrical Engineering Graduate").
  .replace(/(?<![a-z])engineering graduates?(?![a-z])/g, 'graduate engineer')
  // ➤ The misspellings of "engineer" found in the adverts left out ("Mooring & Subsea Enigneer").
  .replace(/(?<![a-z])(?:enigneer|enginner|enginer|engeneer)(s?)(?![a-z])/g, 'engineer$1'));

// ➤ The second reading, for a title the first found nothing in, cleans the words the way
// ➤ occupationcoder does, the title coder of the ONS Data Science Campus (Turrell et al., 2019):
// ➤ a plural reads as its singular, a hyphen or a slash separates words, and a few abbreviations
// ➤ and misspellings are spelt out, so "Senior Project Engineers" reads as "senior project
// ➤ engineer" and "CAD-Designer" as "cad designer". The index's titles are read the same way.
// ➤ occupationcoder also drops the words no title of the index uses, then compares what is left
// ➤ whole; this gate finds titles inside the advert's title, where a dropped word made "Site
// ➤ Selection Manager" a site manager, so every word stays. docs/research/occupation-coding.md.
// ➤ Plurals that are words of their own stay (occupationcoder's list, and "facilities"), and so
// ➤ do words ending in -ics, -ss, -us or -is (electronics, process, campus, analysis).
const KEEP_AS_IS = new Set(['accounts', 'claims', 'communications', 'complaints', 'events', 'goods', 'grounds', 'lettings', 'loans', 'operations', 'relations', 'sales', 'services', 'systems', 'years', 'facilities']);
export const lemma = w => {
  if (w.length <= 3 || KEEP_AS_IS.has(w) || /(?:ss|us|is|ics)$/.test(w)) return w;
  if (w.endsWith('men')) return `${w.slice(0, -3)}man`;
  if (w.endsWith('ies') && w.length > 4) return `${w.slice(0, -3)}y`;
  if (/(?:sh|ch|x|z)es$/.test(w) || w.endsWith('sses')) return w.slice(0, -2);
  return w.endsWith('s') ? w.slice(0, -1) : w;
};
// ➤ Abbreviations, and the misspellings found in the adverts left out (September 2026).
const SPELT_OUT = { snr: 'senior', sr: 'senior', jnr: 'junior', jr: 'junior', mgr: 'manager', engr: 'engineer', enigneer: 'engineer', enginner: 'engineer', enginer: 'engineer', engeneer: 'engineer' };
// ➤ Words are letters and digits: a hyphen or a slash separates them ("CAD-Designer").
const lemmaWords = text => T.clean(text).split(/[^a-z0-9]+/).filter(Boolean).map(w => lemma(SPELT_OUT[w] || w));
// ➤ A title as the second reading takes it, in pieces split where the title lists or joins
// ➤ ("Ingeniero técnico o industrial", "Calculator / Werkvoorbereider"): a title is never found
// ➤ across two pieces.
const PIECES = /[/,;|()[\]&+·–—]| - |(?<![a-z])(?:or|and|o|y|u|et|ou|und|oder|en|og|och|eller)(?![a-z])/;
const secondReading = title => T.clean(title).split(PIECES).map(piece => lemmaWords(piece).join(' ')).filter(Boolean);

// ➤ The job titles of every family, per language, and the names among them (ESCO's preferred
// ➤ labels and the catalogue's own extra terms). ESCO's titles come first; the official coding
// ➤ indexes add theirs (codes/titles.json: the British and Dutch statistics offices'). The gate,
// ➤ the site (for the CV reader) and the tests all build them here. catalogue: families.json;
// ➤ codes: builder/codes.mjs.
// ➤ ESCO's titles, but for the bare role words and those a national index files outside the
// ➤ vertical (codes/titles.json, not_ours): the national statistics office decides.
const escoTitles = codes => {
  const notOurs = Object.fromEntries(Object.entries(codes.titles?.not_ours || {}).map(([lang, list]) => [lang, new Set(list.map(T.clean))]));
  return lang => label => usableTitle(label) && !notOurs[lang]?.has(T.clean(label));
};

export function familyTerms(catalogue, codes = {}) {
  const out = {};
  const escoKept = escoTitles(codes);
  for (const f of catalogue.families || catalogue) {
    const labels = {}, preferred = new Set();
    for (const c of f.isco || []) {
      for (const [lang, list] of Object.entries(codes.isco?.units?.[c]?.labels || {})) (labels[lang] ||= []).push(...list.filter(escoKept(lang)));
      for (const list of Object.values(codes.isco?.units?.[c]?.preferred || {})) for (const l of list) preferred.add(T.clean(l));
      for (const [lang, list] of Object.entries(codes.titles?.units?.[c] || {})) (labels[lang] ||= []).push(...list.filter(usableTitle));
    }
    for (const [lang, list] of Object.entries(f.extra_terms || {})) { (labels[lang] ||= []).push(...list); for (const l of list) preferred.add(T.clean(l)); }
    out[f.id] = { labels, preferred: [...preferred] };
  }
  return out;
}

// ➤ codes: builder/codes.mjs (isco.json, ssyk-isco.json, titles.json).
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
  const titles = families.map(f => ({ id: f.id, preferred: new Set(terms[f.id].preferred) }));
  const blockers = {};
  for (const b of Object.values(codes.isco?.blockers || {})) for (const [lang, labels] of Object.entries(b.labels || {})) (blockers[lang] ||= []).push(...labels);
  // ➤ Per language, one index of every family's titles and of the titles outside the
  // ➤ vertical (the blockers), read in one pass per title.
  const index = {};
  for (const lang of new Set([...families.flatMap(f => Object.keys(terms[f.id].labels)), ...Object.keys(blockers)])) {
    const lists = {};
    for (const f of families) if (terms[f.id].labels[lang]?.length) lists[f.id] = terms[f.id].labels[lang];
    if (blockers[lang]?.length) lists[BLOCKERS] = blockers[lang];
    index[lang] = T.index(lists);
  }
  // ➤ The same titles as the second reading takes them, per language, but for the pieces of a
  // ➤ list ESCO split ("Klima-" of "Heizungs-/Klima-/Sanitärtechnik"): without their hyphen
  // ➤ they would read as titles.
  const reduced = {};
  const piece = l => /^\s*-|-\s*$/.test(l);
  for (const lang of Object.keys(index)) {
    const lists = {};
    for (const f of families) for (const l of terms[f.id].labels[lang] || []) if (!piece(l)) (lists[f.id] ||= []).push(lemmaWords(l).join(' '));
    for (const l of blockers[lang] || []) if (!piece(l)) (lists[BLOCKERS] ||= []).push(lemmaWords(l).join(' '));
    reduced[lang] = T.index(lists);
  }
  const reducedTitles = families.map(f => ({ id: f.id, preferred: new Set(terms[f.id].preferred.map(p => lemmaWords(p).join(' '))) }));
  // ➤ Titles that stop being ours in an industry the advert's title names (codes/titles.json),
  // ➤ under both readings' spelling of the title.
  const contexts = new Map();
  for (const [t, words] of Object.entries(codes.titles?.contexts || {})) { const w = new Set(words.map(lemma)); contexts.set(T.clean(t), w); contexts.set(lemmaWords(t).join(' '), w); }
  // ➤ Which ESCO occupation each title names, per family and language: a title's match says
  // ➤ which occupation it is, not only which family.
  const escoKept = escoTitles(codes);
  const occupations = {};
  for (const f of families) for (const c of f.isco || []) for (const o of codes.isco?.units?.[c]?.occupations || []) {
    for (const [lang, list] of Object.entries(o.labels || {})) {
      const m = ((occupations[f.id] ||= {})[lang] ||= new Map());
      for (const l of list.filter(escoKept(lang))) { const k = T.clean(l); m.set(k, [...new Set([...(m.get(k) || []), o.code])]); }
    }
  }
  return { families, byIsco, bySsyk, titles, index, reduced, reducedTitles, contexts, occupations, generic: T.alternation(ENGINEER_WORDS), genericFamily: byIsco.get(GENERIC_FAMILY) || null, ictFamily: byIsco.get(ICT_FAMILY) || null };
}

// ➤ What a cleaned title names, by the index's titles: the families that stand by the rule, and
// ➤ whether an outside occupation matched with nothing of ours over it. A title the first
// ➤ reading finds nothing in is read a second time (above). The gate asks this twice for each
// ➤ advert (its families, then its occupations): the last answer is kept.
function titleFamilies(title, langs, gate) {
  const key = `${title}\n${langs.join(',')}`;
  if (gate.last?.key === key) return gate.last.value;
  const read = (indexes, titles, text) => {
    const found = langs.map(lang => (indexes[lang] ? T.find(indexes[lang], text) : new Map()));
    const hits = [];
    for (const fam of titles) langs.forEach((lang, i) => { for (const t of found[i].get(fam.id) || []) hits.push({ id: fam.id, text: t, named: fam.preferred.has(t), lang }); });
    return { hits, blocks: found.flatMap(f => f.get(BLOCKERS) || []) };
  };
  let { hits, blocks } = read(gate.index, gate.titles, title);
  // ➤ What may shut the title out of the routes that follow: only what the first reading found.
  // ➤ A title outside the vertical that only the second reading finds still stands over our
  // ➤ titles inside it, but ESCO's odd alternative titles ("help-desk technician" among sales
  // ➤ jobs) never close the routes to a title the first reading found nothing in.
  let blocking = blocks;
  if (!hits.length && !blocks.length && gate.reduced) {
    const found = secondReading(title).map(piece => read(gate.reduced, gate.reducedTitles, piece));
    hits = found.flatMap(f => f.hits);
    blocks = found.flatMap(f => f.blocks);
    blocking = [];
  }
  if (hits.length && gate.contexts?.size) {
    const words = new Set(lemmaWords(title));
    hits = hits.filter(h => ![...(gate.contexts.get(h.text) || [])].some(w => words.has(w)));
  }
  const kept = T.winners(hits, blocks);
  const all = [...hits.map(h => h.text), ...blocks];
  const blocked = !kept.length && blocking.some(b => !all.some(o => T.inside(b, o)));
  const value = { families: [...new Set(kept.map(h => h.id))], blocked, texts: [...new Set(kept.map(h => h.text))], hits };
  gate.last = { key, value };
  return value;
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

// ➤ The ESCO occupations an advert's title names inside the families it was given: the
// ➤ specialties a visitor can narrow a family to ("naval architect" inside mechanical
// ➤ engineers). Among the titles found in those families the longest stands, as in the gate;
// ➤ a title filed by the discipline it names ("Mechanical Design Engineer") is that
// ➤ discipline's own occupation. [] when the title names none.
export function occupationsOf(raw, families, gate) {
  if (!families?.length) return [];
  const fams = new Set(families);
  const title = matchableTitle(raw.title);
  const langs = raw.lang ? languagesFor(raw.lang) : [...new Set([...(raw.hintLangs || []), 'en'])];
  const hits = titleFamilies(title, langs, gate).hits.filter(h => fams.has(h.id));
  const found = [...new Set(T.winners(hits).flatMap(h => gate.occupations?.[h.id]?.[h.lang]?.get(h.text) || []))];
  if (found.length) return found.sort();
  for (const [re, id, head] of [...ENGINEER_ROUTES, ...ICT_ROUTES]) if (head && fams.has(id) && re.test(title)) return [head];
  return [];
}

// ➤ The gate for a whole build. Titles repeat ("Software Engineer" thousands of times) and a
// ➤ title read in the same languages with the same codes always gets the same answer, so each
// ➤ is worked out once. Answers { families, occupations }, fresh arrays every time.
export function classifier(gate) {
  const known = new Map();
  return raw => {
    const key = [raw.title, raw.lang || (raw.hintLangs || []).join(','), raw.codes?.isco || '', raw.codes?.ssyk || ''].join('\n');
    let v = known.get(key);
    if (!v) {
      const families = familiesOf(raw, gate);
      v = { families, occupations: occupationsOf(raw, families, gate) };
      known.set(key, v);
    }
    return { families: [...v.families], occupations: [...v.occupations] };
  };
}

// ➤ Title terms that mean "not the job you think": a sales role that names a product, a
// ➤ recruiter hiring engineers, an internship, a labourer. In the sources' languages, kept
// ➤ short; the visitor has vetoes of their own in the profile code.
const HYGIENE = /(?:^|[^a-z0-9])(?:sales|vendedora?|venedora?|comercial|saljare|forsaljare|verkoper|vendeur|vendeuse|verkaufer|verkauferin|account manager|recruiter|talent acquisition|internship|apprenticeship|intern|praktikum|stagiaire|stage\b|becario|becaria|practicas|apprentice|apprenti|azubi|trainee|thesis|masterarbeit|bachelorarbeit|abschlussarbeit|diplomarbeit|examensarbete|exjobb|afstudeeropdracht|afstudeerstage|tfm|tfg|peon|peones|peona|prodejce|prodavac|prodavacka|pardavejas|pardaveja|pardevejs|pardeveja|praktikant|praktikantka|praktikantas|praktikante|stazista|stazuotojas|delnik|delnice|ai trainer|ai training|ai tutor|data collector|data labeling|data labelling|annotator|survey (?:panelist|assistant|taker|participant|respondent)|(?:paid|online) surveys?|study participant|task based|freelance rater|working student|werkstudent|werkstudentin|ausbildung|berufsausbildung|store ?#? ?[0-9]+|store manager|store associate|retail assistant|retail associate|shop assistant|barista|cashier|crew member|machine operator|production operator|quality control operator|qc operator|assembly operator|packing operator|forklift)(?![a-z0-9])/;
export function hygieneReason(raw) {
  return HYGIENE.test(fold(raw.title || '')) ? 'title names a sales, recruiting, trainee, labourer, retail, operative or gig role' : null;
}
