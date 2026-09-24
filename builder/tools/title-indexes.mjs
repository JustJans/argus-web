// ➤ Writes catalogues/codes/titles.json: the job titles that official statistics offices file
// ➤ under the vertical's ISCO-08 unit groups. Their coding indexes are the lists they code
// ➤ survey and census answers with (the method of CASCOT, their coding tool): the ONS index for
// ➤ British English (SOC 2020, every title with its ISCO-08 code) and the CBS index for Dutch
// ➤ (ISCO-08). ESCO's titles (codes/isco.json) stay the base; these add what ESCO lacks: "site
// ➤ manager", "mechanical technician", "uitvoerder bouw". A title an index files under one of our
// ➤ groups is kept, unless it is on the reviewed list of exclusions below.
// ➤ docs/research/occupation-coding.md.   node builder/tools/title-indexes.mjs
import * as XLSX from 'xlsx';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { get } from '../http.mjs';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const CACHE = join(ROOT, 'builder', 'state', 'title-indexes');
const OUT = join(ROOT, 'catalogues', 'codes', 'titles.json');

const SOURCES = {
  ons: {
    lang: 'en',
    name: 'Office for National Statistics, SOC 2020 Volume 2: the coding index (version 14)',
    page: 'https://www.ons.gov.uk/methodology/classificationsandstandards/standardoccupationalclassificationsoc/soc2020/soc2020volume2codingrulesandconventions',
    url: 'https://www.ons.gov.uk/file?uri=/methodology/classificationsandstandards/standardoccupationalclassificationsoc/soc2020/soc2020volume2codingrulesandconventions/soc2020volume2thecodingindexexcel20260827.xlsx',
    file: 'ons-soc2020-coding-index.xlsx',
    licence: 'Open Government Licence v3.0',
  },
  cbs: {
    lang: 'nl',
    name: 'Centraal Bureau voor de Statistiek, Codelijsten en beroepenindex ISCO 2008',
    page: 'https://www.cbs.nl/nl-nl/onze-diensten/methoden/classificaties/onderwijs-en-beroepen/beroepenclassificatie--isco-en-sbc--',
    url: 'https://www.cbs.nl/-/media/_excel/2021/27/codelijstenisco08.xls',
    file: 'cbs-isco08-index.xls',
    licence: 'CC BY 4.0',
  },
};

// ➤ Titles an index files under one of our groups that are not jobs of the vertical: content and
// ➤ marketing, property, finance and legal, retail food and packing, labouring, and titles too
// ➤ vague to stand alone. Read one by one (September 2026); the rest of each group is kept.
const EXCLUDED = {
  en: [
    // content, marketing, sales and advice that is not technical
    'ai content creator', 'content analyst', 'content coordinator', 'content creator', 'content executive', 'content officer', 'content management assistant',
    'digital content assistant', 'digital content creator', 'digital content editor', 'digital content executive', 'digital content manager', 'digital content producer',
    'digital producer', 'web producer', 'website producer', 'digital experience manager', 'e-commerce content assistant', 'online content editor', 'online merchandiser',
    'web communications executive', 'web content assistant', 'web content editor', 'web content manager', 'website content manager', 'web editor', 'xr content creator',
    'desk top publisher', 'desktop publisher', 'content developer', 'technical evangelist', 'technology evangelist', 'digital consultant', 'business development officer',
    'app reviewer', 'customer support analyst', 'online facilitator', 'media resources officer', 'studio assistant', 'production consultant',
    // property, estates, finance, law, psychology
    'asset manager', 'estate surveyor', 'estates officer', 'property surveyor', 'rural surveyor', 'agricultural surveyor', 'land commissioner', 'planning and development surveyor',
    'chartered surveyor', 'valuation technician', 'systems accountant', 'data protection manager', 'clinical data manager', 'environmental psychologist',
    'patent analyst', 'patent associate', 'patent examiner', 'patent scientist', 'resident liaison officer',
    // advice and consultancy too vague to name a technical job on its own
    'technical adviser', 'technical assistant', 'technical assessor', 'technologist', 'scientific consultant', 'engineering analyst', 'it contractor',
    'aviation consultant', 'marine adviser', 'marine consultant', 'transport adviser', 'transport consultant', 'transportation consultant', 'traffic adviser', 'textile adviser', 'textile consultant',
    'service delivery manager', 'supply chain architect', 'design assistant', 'chief designer', 'space planner', 'helpdesk assistant', 'switch board attendant', 'pump attendant', 'controlman',
    // titles whose ONS family would pull an IT or generic engineer away from the right one; a
    // developer named by a programming language develops software (2512), as ESCO files it, where
    // the ONS's step from SOC to ISCO puts some under web development
    'security engineer', 'field engineer', 'service engineer', 'in engineer', 'etgii', 'java developer', 'net developer', 'full stack developer',
    // "systems engineer" is software for the ONS alone, electronics in aerospace: too vague to move;
    // an "engineering consultant" can be of any discipline, not mechanical as the ONS files it
    'systems engineer', 'engineering consultant',
    // drawing and illustration that is art, not engineering drawing
    'copy colourist', 'design painter', 'design sketcher', 'digital illustrator', 'technical illustrator', 'digitiser', 'tracer', 'weightsman',
    // crafts, food and drink, garments, labouring
    'lighting electrician', 'landscape craftsman', 'ceramicist', 'ceramist', 'head brewer', 'technical brewer', 'under brewer', 'vinegar brewer', 'working brewer', 'wine maker',
    'technical dyer', 'dyeing technician', 'textile dyeing technician', 'garment technician', 'garment technologist', 'clothing technologist', 'sensory manager', 'distiller',
    'bakery foreman', 'bakery supervisor', 'butchery supervisor', 'abattoir foreman', 'dairy foreman', 'brewer foreman', 'sewing room foreman', 'sewing room supervisor',
    'packing room foreman', 'packing supervisor', 'bottling foreman',
    'sewer flusher and cleanser', 'sewage worker', 'sewage farm worker', 'sewer operative', 'sewerman', 'water board worker', 'water environment worker', 'water sample collector',
    'water softener', 'fire marshall', 'fire prevention man', 'school laboratory technician', 'teaching laboratory technician', 'school science technician', 'school technician',
  ],
  nl: [
    // property development, history, law, sales-led advice, food and garment production
    'vastgoedontwikkelaar', 'projectontwikkelaar', 'bouwkundig projectontwikkelaar', 'planontwikkelaar', 'bouwhistoricus', 'privacy officer', 'productmanager telematica',
    'adviseur duurzaamheid', 'adviseur inbraakpreventie', 'adviseur rampenbestrijding', 'energieadviseur', 'energieconsultant', 'forensisch medewerker', 'vluchtafhandelingsemployé',
    'ploegchef industriële bakkerij', 'productiechef pluimvee- en wildslachterij', 'productiechef slachterij', 'productiechef vleeswarenindustrie', 'productieleider industriële bakkerij',
    'productieleider voedingsmiddelenindustrie', 'chef confectie-, maatkledingbedrijf', 'interieurontwerper',
  ],
};
// ➤ The ONS index files some titles differently by industry ("site manager" is a construction
// ➤ supervisor, but a retail or transport manager in those trades). A title whose plain entry is
// ➤ ours and a qualified twin is not is usually too vague for a job title alone, and is left out;
// ➤ these are the ones whose plain meaning is plainly ours.
const KEPT_DESPITE_TWINS = ['site manager', 'service technician', 'commissioning engineer', 'contract engineer', 'contracts engineer', 'network controller', "ship's captain", 'chief electrician', 'interaction designer', 'sound designer', 'quality coordinator'];

// ➤ A kept title stops being ours where a twin's industry shows in the advert's title ("Logistics
// ➤ Site Manager"): the twin's industry words, and these words the adverts use for those industries.
const INDUSTRY_WORDS = { transport: ['logistics', 'logistic', 'warehouse', 'distribution', 'depot'], retail: ['store', 'shop', 'supermarket'], educational: ['school', 'college', 'university'] };
// ➤ Laboratory titles stop being ours in a health or life-science laboratory: ISCO files medical
// ➤ and pathology laboratory technicians under 3212, dental ones under 3214 (the ONS: "dental
// ➤ laboratory assistant"), veterinary ones under 3240 (the ONS: "animal technician") and life
// ➤ science technicians under 3141, none of them in the vertical.
const LIFE_AND_HEALTH = ['dental', 'medical', 'clinical', 'hospital', 'pathology', 'veterinary', 'histology', 'phlebotomy', 'biology', 'biological', 'molecular', 'microbiology', 'cell', 'tissue', 'vivo', 'animal'];
const LABORATORY_CONTEXTS = Object.fromEntries(['lab technician', 'laboratory technician', 'lab assistant', 'laboratory assistant', 'lab analyst', 'laboratory analyst', 'research technician'].map(t => [t, LIFE_AND_HEALTH]));
// ➤ A workshop or service technician on vehicles is a motor vehicle mechanic (ISCO 7231; the ONS:
// ➤ "vehicle technician"), a trade.
const VEHICLES = ['truck', 'hgv', 'lgv', 'vehicle', 'car', 'automotive', 'motor', 'bus', 'coach', 'tyre', 'tire', 'motorcycle', 'bike', 'fleet', 'garage'];
// ➤ ...and a service technician on heating, plumbing or air conditioning is a plumber and pipe
// ➤ fitter (7126; the ONS: "hvac technician", "heating engineer").
const INSTALLATIONS = ['hvac', 'heating', 'plumbing', 'boiler'];
const EXTRA_CONTEXTS = { ...LABORATORY_CONTEXTS, 'workshop technician': VEHICLES, 'service technician': [...VEHICLES, ...INSTALLATIONS] };
// ➤ ESCO's alternative titles that a national index files outside the vertical: the national
// ➤ statistics office decides. The gate leaves them out of ESCO's titles.
const NOT_OURS = {
  en: ['facility manager'],                 // ESCO 2146.6 "mine development engineer"; ONS: "facilities manager", 1219
  nl: ['cnc-operator', 'operator cnc'],     // ESCO 2514.4 "numerical tool and process control programmer"; CBS: "cnc-machinebediener", 7223
};
const NOT_INDUSTRY = new Set(['and', 'the', 'of', 'services', 'service', 'trade', 'management', 'establishments', 'site', 'centre', 'test', 'professional', 'mfr', 'design']);

const clean = t => String(t || '').replace(/\s+/g, ' ').trim().toLowerCase();

async function source(id) {
  const s = SOURCES[id];
  const path = join(CACHE, s.file);
  if (!existsSync(path)) {
    mkdirSync(CACHE, { recursive: true });
    const res = await get(s.url, { timeoutMs: 120_000 });
    if (!res.ok) throw new Error(`${res.status} for ${s.url}`);
    writeFileSync(path, Buffer.from(await res.arrayBuffer()));
  }
  return XLSX.read(readFileSync(path));
}

// ➤ A sheet as rows of cells, from the row whose cells include every name asked for.
function table(book, names) {
  for (const sheetName of book.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(book.Sheets[sheetName], { header: 1, defval: '', raw: false });
    const at = rows.findIndex(r => names.every(n => r.includes(n)));
    if (at >= 0) { const head = rows[at]; return rows.slice(at + 1).map(r => Object.fromEntries(head.map((h, i) => [h, r[i]]))); }
  }
  throw new Error(`no sheet with the columns ${names.join(', ')}`);
}

// ➤ ONS: the plain entries (no qualifying words, no industry) are the titles as they stand. The
// ➤ industries of a kept title's twins become its contexts.
function onsTitles(book, ours) {
  const rows = table(book, ['INDEXOCC_-_natural_word_order', 'ADD', 'IND', 'ISCO-08 code based on SOC2020']);
  const entries = rows.map(r => ({ title: clean(r['INDEXOCC_-_natural_word_order']), qualifier: clean(`${r.ADD} ${r.IND}`), isco: String(r['ISCO-08 code based on SOC2020']).trim() })).filter(e => e.title);
  const twins = {};
  for (const e of entries) if (e.qualifier && !ours.has(e.isco)) (twins[e.title] ||= []).push(e.qualifier);
  const kept = entries.filter(e => !e.qualifier && ours.has(e.isco) && (!twins[e.title] || KEPT_DESPITE_TWINS.includes(e.title)));
  for (const e of kept) {
    if (!twins[e.title]) continue;
    const words = new Set(twins[e.title].flatMap(q => q.split(/[^a-z]+/)).filter(w => w.length > 2 && !NOT_INDUSTRY.has(w)));
    for (const w of [...words]) for (const extra of INDUSTRY_WORDS[w] || []) words.add(extra);
    e.contexts = [...words].sort();
  }
  return kept;
}

// ➤ CBS: every title of the index with its current ISCO-08 unit group.
function cbsTitles(book, ours) {
  return table(book, ['Voorbeeldberoepen_CBS', 'actuele code ISCO-08 unitgroup'])
    .map(r => ({ title: clean(r.Voorbeeldberoepen_CBS), isco: String(r['actuele code ISCO-08 unitgroup']).trim().padStart(4, '0') }))
    .filter(e => e.title && ours.has(e.isco));
}

const families = JSON.parse(readFileSync(join(ROOT, 'catalogues', 'families.json'), 'utf8')).families;
const ours = new Set(families.flatMap(f => f.isco));
const units = {};
const contexts = {};
const sources = [];
for (const [id, read] of [['ons', onsTitles], ['cbs', cbsTitles]]) {
  const s = SOURCES[id];
  const excluded = new Set(EXCLUDED[s.lang] || []);
  const found = read(await source(id), ours);
  let kept = 0;
  for (const { title, isco, contexts: words } of found) {
    if (excluded.has(title)) continue;
    const around = [...new Set([...(words || []), ...(EXTRA_CONTEXTS[title] || [])])].sort();
    if (around.length) contexts[title] = around;
    const list = ((units[isco] ||= {})[s.lang] ||= []);
    if (!list.includes(title)) { list.push(title); kept++; }
  }
  sources.push({ id, lang: s.lang, name: s.name, page: s.page, licence: s.licence, titles: kept });
  console.log(`${id}: ${found.length} titles in our groups, ${kept} kept`);
}
for (const u of Object.values(units)) for (const l of Object.values(u)) l.sort();
const out = {
  _about: 'Job titles that official statistics offices file under the vertical\'s ISCO-08 unit groups, from their coding indexes, per unit group and language, minus a reviewed list of exclusions. Added to ESCO\'s titles by the gate. contexts: words that, in an advert\'s title, put a kept title in another occupation (the industries the index files its twins under). not_ours: ESCO\'s alternative titles a national index files outside the vertical, left out of ESCO\'s titles. Built by builder/tools/title-indexes.mjs; docs/research/occupation-coding.md.',
  built_at: new Date().toISOString().slice(0, 10),
  sources,
  units: Object.fromEntries(Object.entries(units).sort()),
  contexts,
  not_ours: NOT_OURS,
};
writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
console.log(`titles.json: ${Object.values(units).reduce((n, u) => n + Object.values(u).reduce((m, l) => m + l.length, 0), 0)} titles in ${Object.keys(units).length} groups`);
