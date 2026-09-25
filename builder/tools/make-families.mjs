// ➤ Writes catalogues/families.json: one family per ISCO-08 unit group of the vertical, grouped
// ➤ by minor group, with ESCO's official title kept for reference and short labels for the
// ➤ screen in English and Spanish (the group heading gives them their meaning). The extra
// ➤ terms are the hand-made part: Catalan, which ESCO lacks, and a few titles ESCO does not list. Run from the
// ➤ argus-web folder after builder/isco-esco.mjs. APPEND ONLY: a family's position is its bit
// ➤ in the profile code, so new groups go at the end and nothing is ever reordered.
import { readFileSync, writeFileSync } from 'fs';
const isco = JSON.parse(readFileSync('catalogues/codes/isco.json', 'utf8'));

const GROUPS = [
  { id: 'engineers', label: 'Engineers', es: 'Ingenieros', isco: ['214', '215'] },
  { id: 'architects-surveyors', label: 'Architects, planners and surveyors', es: 'Arquitectos, urbanistas y topógrafos', isco: ['216'] },
  { id: 'technicians', label: 'Technicians', es: 'Técnicos', isco: ['311'] },
  { id: 'supervisors', label: 'Supervisors', es: 'Supervisores', isco: ['312'] },
  { id: 'plant-operators', label: 'Plant operators', es: 'Operadores de planta', isco: ['313'] },
  { id: 'crews', label: 'Ship and aircraft crews', es: 'Tripulaciones de barco y avión', isco: ['315'] },
  // ➤ Added 2026-09-06: computing came in (the owner's decision); only trades and service jobs stay out.
  { id: 'software-it', label: 'Software and IT', es: 'Software e informática', isco: ['251', '252'] },
  { id: 'it-technicians', label: 'IT technicians', es: 'Técnicos informáticos', isco: ['351', '352'] },
];
const LABELS = {
  2141: 'Industrial and production', 2142: 'Civil', 2143: 'Environmental', 2144: 'Mechanical', 2145: 'Chemical', 2146: 'Mining and metallurgy', 2149: 'Other engineers',
  2151: 'Electrical', 2152: 'Electronics', 2153: 'Telecommunications',
  2161: 'Building architects', 2162: 'Landscape architects', 2164: 'Town and traffic planners', 2165: 'Surveyors and cartographers',
  3111: 'Chemical and physical science', 3112: 'Civil engineering', 3113: 'Electrical engineering', 3114: 'Electronics engineering', 3115: 'Mechanical engineering', 3116: 'Chemical engineering', 3117: 'Mining and metallurgy', 3118: 'Draughtspersons', 3119: 'Other technicians',
  3121: 'Mining', 3122: 'Manufacturing', 3123: 'Construction',
  3131: 'Power plants', 3132: 'Water and waste plants', 3133: 'Chemical plants', 3134: 'Oil and gas refineries', 3135: 'Metal production', 3139: 'Other plants',
  3151: "Ships' engineers", 3152: 'Deck officers and pilots', 3153: 'Aircraft pilots', 3154: 'Air traffic controllers', 3155: 'Air traffic safety electronics',
  2511: 'Systems analysts', 2512: 'Software developers', 2513: 'Web and multimedia', 2514: 'Applications programmers', 2519: 'Data, AI and other software',
  2521: 'Databases', 2522: 'Systems administrators', 2523: 'Networks', 2529: 'Security and other IT',
  3511: 'IT operations', 3512: 'User support', 3513: 'Networks and systems', 3514: 'Web', 3521: 'Broadcasting and audiovisual', 3522: 'Telecommunications',
};
// ➤ The same labels in Spanish, for the Spanish site.
const LABELS_ES = {
  2141: 'Industriales y de producción', 2142: 'Civiles', 2143: 'Medioambientales', 2144: 'Mecánicos', 2145: 'Químicos', 2146: 'Minas y metalurgia', 2149: 'Otros ingenieros',
  2151: 'Eléctricos', 2152: 'Electrónicos', 2153: 'Telecomunicaciones',
  2161: 'Arquitectos', 2162: 'Arquitectos paisajistas', 2164: 'Urbanistas y planificadores de tráfico', 2165: 'Topógrafos y cartógrafos',
  3111: 'Ciencias físicas y químicas', 3112: 'Ingeniería civil', 3113: 'Ingeniería eléctrica', 3114: 'Ingeniería electrónica', 3115: 'Ingeniería mecánica', 3116: 'Ingeniería química', 3117: 'Minas y metalurgia', 3118: 'Delineantes', 3119: 'Otros técnicos',
  3121: 'Minería', 3122: 'Industria manufacturera', 3123: 'Construcción',
  3131: 'Centrales eléctricas', 3132: 'Plantas de agua y residuos', 3133: 'Plantas químicas', 3134: 'Refinerías de petróleo y gas', 3135: 'Producción de metales', 3139: 'Otras plantas',
  3151: 'Oficiales de máquinas', 3152: 'Oficiales de puente y prácticos', 3153: 'Pilotos de aviación', 3154: 'Controladores aéreos', 3155: 'Electrónica de seguridad aérea',
  2511: 'Analistas de sistemas', 2512: 'Desarrolladores de software', 2513: 'Web y multimedia', 2514: 'Programadores de aplicaciones', 2519: 'Datos, IA y otro software',
  2521: 'Bases de datos', 2522: 'Administradores de sistemas', 2523: 'Redes', 2529: 'Seguridad y otras TI',
  3511: 'Operaciones de TI', 3512: 'Soporte al usuario', 3513: 'Redes y sistemas', 3514: 'Web', 3521: 'Radiodifusión y audiovisual', 3522: 'Telecomunicaciones',
};
const CATALAN = {
  2141: ['enginyer industrial', 'enginyera industrial', 'enginyer de producció', 'enginyera de producció', "enginyer d'organització industrial", "enginyer d'automatització", "enginyera d'automatització", 'enginyer de manteniment', 'enginyera de manteniment'],
  2142: ['enginyer civil', 'enginyera civil', 'enginyer de camins', 'enginyera de camins', 'enginyer de ponts i camins', 'enginyera de ponts i camins', "enginyer d'obra civil", "enginyera d'obra civil"],
  2143: ['enginyer ambiental', 'enginyera ambiental'],
  2144: ['enginyer mecànic', 'enginyera mecànica'],
  2145: ['enginyer químic', 'enginyera química'],
  2146: ['enginyer de mines', 'enginyera de mines'],
  2149: ['enginyer de qualitat', 'enginyera de qualitat', 'enginyer de projectes', 'enginyera de projectes', 'arquitecte tècnic', 'arquitecta tècnica', 'aparellador', 'aparelladora'],
  2151: ['enginyer elèctric', 'enginyera elèctrica'],
  2152: ['enginyer electrònic', 'enginyera electrònica'],
  2153: ['enginyer de telecomunicacions', 'enginyera de telecomunicacions'],
  2161: ['arquitecte', 'arquitecta'],
  2162: ['arquitecte paisatgista', 'arquitecta paisatgista'],
  2164: ['urbanista'],
  2165: ['topògraf', 'topògrafa', 'enginyer geomàtic', 'enginyera geomàtica'],
  3112: ["tècnic d'obra", "tècnica d'obra", 'arquitecte tècnic', 'arquitecta tècnica', 'aparellador', 'aparelladora'],
  3113: ['tècnic elèctric', 'tècnica elèctrica'],
  3114: ['tècnic electrònic', 'tècnica electrònica'],
  3115: ['tècnic mecànic', 'tècnica mecànica'],
  3116: ['tècnic químic', 'tècnica química'],
  3118: ['delineant', 'delineant projectista', 'projectista'],
  3119: ['tècnic industrial', 'tècnica industrial'],
  3122: ['encarregat de producció', 'encarregada de producció', 'cap de producció'],
  3123: ["cap d'obra", "encarregat d'obra", "encarregada d'obra"],
  3151: ['oficial de màquines', 'cap de màquines'],
  3152: ['oficial de pont', 'capità de vaixell', 'patró de vaixell'],
  3153: ["pilot d'aviació", 'pilot comercial'],
  3154: ['controlador aeri', 'controladora aèria'],
  2511: ['analista de sistemes', 'analista funcional', 'consultor informàtic', 'consultora informàtica'],
  2512: ['programador', 'programadora', 'desenvolupador', 'desenvolupadora', 'desenvolupador de software', 'enginyer de software', 'enginyera de software', 'enginyer informàtic', 'enginyera informàtica', 'analista programador', 'analista programadora'],
  2513: ['desenvolupador web', 'desenvolupadora web', 'dissenyador web', 'dissenyadora web'],
  2521: ['administrador de bases de dades', 'administradora de bases de dades'],
  2522: ['administrador de sistemes', 'administradora de sistemes'],
  2523: ['enginyer de xarxes', 'enginyera de xarxes'],
  3512: ['tècnic informàtic', 'tècnica informàtica', 'tècnic de suport', 'tècnica de suport', 'tècnic de sistemes', 'tècnica de sistemes'],
  3513: ['tècnic de xarxes', 'tècnica de xarxes'],
};
// ➤ Titles ESCO does not list: British spellings, and the English of company boards.
// ➤ Default rules, CASCOT's "score as" (docs/research/occupation-coding.md): titles no index lists,
// ➤ filed with the index title that names the same work. BIM is the CAD of buildings (ONS files
// ➤ "bim technician" and "cad coordinator" under 3118); a mooring engineer designs the moorings
// ➤ of a floating structure, which is naval architecture (2144), and a mooring master is the
// ➤ master mariner who brings ships alongside (3152).
const ENGLISH = {
  3118: ['draughtsman', 'draftsman', 'cad technician', 'cad drafter', 'cad draughtsman', 'bim coordinator', 'bim modeller', 'bim modeler', 'bim engineer', 'bim manager'],
  2144: ['mooring engineer', 'mooring analyst', 'mooring designer'],
  3152: ['mooring master'],
  // ➤ The agile "release train engineer" is no train engineer (2144): it stays where "engineer" alone goes.
  2149: ['release train engineer'],
  2512: ['software engineer', 'backend developer', 'back-end developer', 'backend engineer', 'back-end engineer', 'frontend developer', 'front-end developer', 'frontend engineer', 'front-end engineer', 'full stack developer', 'full-stack developer', 'fullstack developer', 'full stack engineer', 'full-stack engineer', 'fullstack engineer', 'mobile developer', 'mobile engineer', 'ios developer', 'android developer', 'firmware engineer', 'devops engineer', 'site reliability engineer', 'platform engineer', 'cloud engineer', 'machine learning engineer', 'ml engineer', 'ai engineer', 'ai research engineer', 'compiler engineer', 'staff engineer', 'principal engineer'],
  2519: ['qa engineer', 'test automation engineer', 'software tester', 'data engineer', 'analytics engineer'],
  2521: ['database administrator', 'dba'],
  2522: ['systems administrator', 'sysadmin', 'linux administrator'],
  2511: ['solutions architect', 'solution architect', 'software architect', 'cloud architect', 'enterprise architect', 'data architect', 'it architect', 'technical architect'],
  2529: ['security engineer', 'cybersecurity engineer', 'information security engineer', 'security analyst'],
  3512: ['it support engineer', 'it support technician', 'helpdesk technician', 'service desk analyst'],
  3513: ['network technician', 'systems technician', 'it systems technician'],
};
// ➤ The French for a construction site's manager, which ESCO lacks: INSEE files "conducteur de
// ➤ travaux" and "conducteur de chantier" together (PCS 481a, the technical and administrative
// ➤ running of one or more sites), and ISCO-08's construction supervisors (3123) take "site
// ➤ manager (construction)" among their examples. docs/research/french-site-managers.md.
const FRENCH = {
  3123: ['conducteur de travaux', 'conductrice de travaux', 'conducteur des travaux', 'conductrice des travaux', 'conducteur travaux', 'conductrice travaux',
    'conducteur de chantier', 'conductrice de chantier', 'conducteur de chantiers', 'conductrice de chantiers'],
  // ➤ The landscape designer as France Travail's ROME names it (fiche A1206, with "architecte
  // ➤ paysagiste"), so a designer's title never rests on the bare "paysagiste" of gardeners.
  2162: ['concepteur paysagiste', 'conceptrice paysagiste', 'paysagiste concepteur', 'paysagiste conceptrice'],
};
// ➤ The Dutch the CBS index lacks as a title of its own: a "werkvoorbereider" prepares the works
// ➤ (CBS: "bouwkundig projectvoorbereider", 3112), an "uitvoerder" runs the site (CBS: "uitvoerder
// ➤ bouw", 3123), and BIM is filed with CAD as in English.
const DUTCH = {
  3112: ['werkvoorbereider'],
  3123: ['uitvoerder', 'hoofduitvoerder'],
  3118: ['bim modelleur', 'bim coördinator', 'bim coordinator', 'bim engineer', 'bim tekenaar'],
};
const SPANISH = {
  3123: ['jefe de obra', 'jefa de obra'],
  2512: ['ingeniero de software', 'ingeniera de software', 'ingeniero informático', 'ingeniera informática', 'desarrollador de software', 'desarrolladora de software', 'programador', 'programadora', 'desarrollador', 'desarrolladora'],
  3512: ['técnico informático', 'técnica informática', 'técnico de sistemas', 'técnica de sistemas', 'técnico de soporte', 'técnica de soporte'],
};

const families = [];
for (const g of GROUPS) {
  for (const minor of g.isco) {
    const m = isco.groups.find(x => x.code === minor);
    if (!m) throw new Error(`minor group ${minor} not in isco.json`);
    for (const code of m.units) {
      const u = isco.units[code];
      if (!LABELS[code] || !LABELS_ES[code]) throw new Error(`no label for ${code} ${u.title}`);
      const f = { id: code, group: g.id, label: LABELS[code], es: LABELS_ES[code], isco_title: u.title, isco: [code] };
      const extra = {};
      if (ENGLISH[code]) extra.en = ENGLISH[code];
      if (SPANISH[code]) extra.es = SPANISH[code];
      if (FRENCH[code]) extra.fr = FRENCH[code];
      if (DUTCH[code]) extra.nl = DUTCH[code];
      if (CATALAN[code]) extra.ca = CATALAN[code];
      if (Object.keys(extra).length) f.extra_terms = extra;
      families.push(f);
    }
  }
}
const out = {
  _about: 'Version 2 (2026-09-05; computing groups appended 2026-09-06). One family per ISCO-08 unit group of the vertical (minor groups 214-216, 251-252, 311-315 and 351-352, minus product/garment and graphic designers), grouped by minor group. id = the ISCO code; label = what the screen shows under the group heading, es = the same in Spanish; isco_title = ISCO/ESCO\'s own title; extra_terms = job titles ESCO lacks, per language (all of Catalan; the English of company boards; a few Spanish). The gate reads the job titles per language from codes/isco.json (ESCO) and the SSYK correspondence from codes/ssyk-isco.json (JobTech). APPEND ONLY: the position of a family is its bit in the profile code. Built by builder/tools/make-families.mjs.',
  groups: GROUPS.map(g => ({ id: g.id, label: g.label, es: g.es, isco: g.isco })),
  families,
};
// ➤ APPEND ONLY, checked: every family the catalogue has keeps its place, or nothing is written.
const before = (() => { try { return JSON.parse(readFileSync('catalogues/families.json', 'utf8')).families.map(f => f.id); } catch { return []; } })();
const moved = before.filter((id, i) => families[i]?.id !== id);
if (moved.length) { console.error(`not written: ${moved.length} families would change place (${moved.slice(0, 5).join(', ')}); a family's place is its bit in every profile code out there, so new families go at the end`); process.exit(1); }
writeFileSync('catalogues/families.json', JSON.stringify(out, null, 2) + '\n');
console.log(`families.json: ${GROUPS.length} groups, ${families.length} families`);
// ➤ Where a few common titles land, to sanity-check the data.
const probe = ['automation engineer', 'project engineer', 'naval architect', 'software engineer', 'software developer', 'backend developer', 'data scientist', 'data analyst', 'data engineer', 'devops engineer', 'systems engineer', 'network engineer', 'it engineer', 'ict technician', 'web developer', 'solution architect', 'security engineer', 'database administrator', 'systems administrator', 'it consultant', 'business analyst', 'product owner', 'scrum master'];
for (const p of probe) {
  const hits = Object.entries(isco.units).filter(([, u]) => (u.labels.en || []).some(l => l.toLowerCase() === p)).map(([c]) => c);
  const extra = families.filter(f => (f.extra_terms?.en || []).includes(p)).map(f => f.id);
  const blocked = Object.entries(isco.blockers || {}).filter(([, b]) => (b.labels?.en || []).some(l => l.toLowerCase() === p)).map(([c]) => c);
  console.log(`  ${p.padEnd(26)} → ESCO ${hits.join(',') || '-'}${extra.length ? `  extra ${extra.join(',')}` : ''}${blocked.length ? `  (blocker ${blocked.join(',')})` : ''}`);
}
