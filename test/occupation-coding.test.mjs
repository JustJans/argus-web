// ➤ Reading an advert's occupation from its title (docs/research/occupation-coding.md): the
// ➤ official coding indexes' titles, the second reading (plurals, hyphens, misspellings), the
// ➤ default rules, and the contexts that keep a title out of an industry it does not belong to.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { harness } from 'argus/server-bot/test-harness.mjs';
import { compileFamilies, classifier, lemma, hygieneReason } from '../builder/gate.mjs';
import { readCodes } from '../builder/codes.mjs';

const { ok, eq, done } = harness('occupation coding');
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const catalogue = JSON.parse(readFileSync(join(ROOT, 'catalogues', 'families.json'), 'utf8'));
const codes = readCodes(ROOT);
const classify = classifier(compileFamilies(catalogue, codes));
const families = (title, lang = 'en', hintLangs) => classify({ title, codes: {}, lang, hintLangs }).families;

// The index's titles and where they stand.
const titles = codes.titles;
eq(titles.sources.map(s => [s.id, s.lang, s.licence]), [['ons', 'en', 'Open Government Licence v3.0'], ['cbs', 'nl', 'CC BY 4.0']], 'two official indexes, each with its licence');
const ours = new Set(catalogue.families.flatMap(f => f.isco));
ok(Object.keys(titles.units).every(u => ours.has(u)), 'every title stands in one of the vertical\'s groups');

// A plural reads as its singular; words that are plurals of their own stay.
eq(['engineers', 'draughtsmen', 'technologies', 'processes', 'switches', 'systems', 'sales', 'electronics', 'analysis'].map(lemma),
  ['engineer', 'draughtsman', 'technology', 'process', 'switch', 'systems', 'sales', 'electronics', 'analysis'], 'lemmas as occupationcoder takes them');

// Titles ESCO lacks, from the indexes and the default rules.
eq([families('Site Manager'), families('Construction Site Manager'), families('Mechanical Technician'), families('BIM Coordinator')], [['3123'], ['3123'], ['3115'], ['3118']], 'site manager, mechanical technician and BIM coordinator are ours');
eq([families('Werkvoorbereider Civiel', 'nl'), families('Uitvoerder Glasvezel', 'nl'), families('BIM modelleur elektrotechniek', 'nl')], [['3112'], ['3123'], ['3118']], 'the Dutch titles of construction work');
eq([families('Senior Mooring Engineer'), families('Mooring Master'), families('Mooring Systems - Hydrodynamic Engineer')], [['2144'], ['3152'], ['2144']], 'moorings are naval architecture, and a mooring master a deck officer');

// The second reading: plurals, hyphens, graduate schemes and misspellings.
eq(families('Senior Project Engineers - Process Equipment'), ['2149'], 'a plural title is its singular');
eq(families('CAD-Designer (m/w/d)', '', ['de']), ['3118'], 'a hyphen separates words');
eq(families('Electrical Engineering Graduate'), ['2151'], 'an engineering graduate is a graduate engineer');
eq(families('Mooring & Subsea Enigneer - Geotechnical'), ['2142'], 'a misspelt engineer is an engineer');
eq(families('INGENIERO/A TÉCNICO/A O INDUSTRIAL JUNIOR', 'es'), ['2141'], 'a title is never found across the words it lists');

// Computing.
eq([families('Windows Administrator (m/w/x)'), families('Senior Teamcenter Administrator')], [['2522'], ['2522']], 'a system named before "administrator" makes a systems administrator');

// What stays out: other industries, other laboratories, trades, office jobs.
eq([families('Logistics Site Manager'), families('Site Manager - Retail Store'), families('Site Selection Manager')], [[], [], []], 'a site manager of another industry, or a title that is not one, is not a construction supervisor');
eq([families('Dental Lab Technician'), families('Lab Technician, Molecular Biology'), families('In Vivo Research Technician')], [[], [], []], 'health and life-science laboratories are not ours');
eq([families('Vehicle Technician'), families('Maintenance Technician'), families('HVAC Technician')], [[], [], []], 'trades stay out, as the ONS files them');
eq([families('Payroll Administrator'), families('Windows & Doors Fitter'), families('Computational Protein Designer')], [[], [], []], 'office work, window fitting and science are not computing');
eq([families('Office & Facilities Manager'), families('Truck Workshop Technician'), families('Ingénieur Technico-Commercial', 'fr')], [[], [], []], 'facilities management, vehicle workshops and technical sales are not ours');
eq(families('Bauleitender Monteur SHK / Obermonteur Sanitär Heizung Klima', 'de'), [], 'a piece of a list ESCO split is not a title');
eq([families('HVAC Service Technician'), families('Release Train Engineer')], [[], ['2149']], 'a heating service technician is a trade, and an agile release train engineer no train engineer');

// What the sources' own categories showed the gate missing or letting in (September 2026).
eq([families('Vertriebsmitarbeiter Nord-Ost-Deutschland (m/w) Hospitality Solutions', 'de'), families('Hoofduitvoerder Wegenbouw - A2 Limburg', 'nl')], [[], ['3123']], 'German sales stays out; a head site supervisor is a site supervisor');
eq([families('Programmeur·se Senior C++', 'fr'), families('Développeur(se) Front-End Vue.js (H/F)', 'fr')], [['2512'], ['2513']], 'French programmers and front-end developers, whatever their gender mark or hyphen');
eq([families('Développeur(se) de Projet Real Estate – Bruxelles', 'fr'), families('Développeur foncier', 'fr')], [[], []], 'a French project or land developer builds property, not software');
ok(hygieneReason({ title: 'Berufsausbildung Fachinformatiker für Systemintegration (m/w/d)' }), 'a vocational training place is hygiene, as an Ausbildung is');

// Where ESCO and a national index disagree, the national statistics office decides.
eq([families('Junior CNC Operator', 'nl'), families('Facility Manager')], [[], []], 'ESCO\'s "CNC-operator" and "facility manager" are a machine operator and a facilities manager (CBS 7223, ONS 1219)');

// A title only the second reading finds outside the vertical still goes to the routes.
eq(families('IT Help Desk Technician'), ['3512'], 'ESCO\'s "help-desk technician" among sales jobs does not close the IT support route');

done();
