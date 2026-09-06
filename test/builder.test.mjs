// ➤ The builder's pure parts, without a network: the gate, the place reader, the excerpts,
// ➤ the record, the dedupe and the shards. The sources' parsers are fed recorded answers.
// ➤ The gate runs on the real tables: the catalogue (ISCO-08 unit groups), ESCO's job titles
// ➤ (catalogues/codes/isco.json) and JobTech's SSYK→ISCO correspondence.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { harness } from 'argus/server-bot/test-harness.mjs';
import { compileFamilies, familiesOf, hygieneReason, matchableTitle } from '../builder/gate.mjs';
import { compileCountries, placeOf, placeOfAdvert, normUrl, idFor, toRecord } from '../builder/normalise.mjs';
import { snippet, requirements } from '../builder/excerpt.mjs';
import { dedupe, roleKey } from '../builder/dedupe.mjs';
import { buildShards } from '../builder/shard.mjs';
import { parseLanbide, isoDay } from '../builder/adapters/lanbide.mjs';
import { parseFeinaActiva } from '../builder/adapters/feinaactiva.mjs';
import { parseJcyl } from '../builder/adapters/jcyl.mjs';
import { ATS } from '../builder/adapters/boards.mjs';
import { toRaw as mpsvRaw } from '../builder/adapters/mpsv.mjs';
import { toRaw as uztRaw, cityOf as ltCity } from '../builder/adapters/uzt.mjs';
import { parseNva, parseCsv, cityOf as lvCity } from '../builder/adapters/nva.mjs';
import { parseSef } from '../builder/adapters/sef.mjs';
import { withoutContacts } from '../builder/normalise.mjs';
import { toRaw as adzunaRaw, detailsUrl } from '../builder/adapters/adzuna.mjs';
import { jobicy, remotive, arbeitnow } from '../builder/adapters/remote.mjs';
import { parseRobots, allowed, parseSitemap, looksLikeJob, jobPostings } from '../builder/lib/crawl.mjs';
import { toRaw as careersRaw } from '../builder/adapters/careers.mjs';
import { deadline } from '../builder/http.mjs';

const { ok, eq, done } = harness('builder');
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const read = p => JSON.parse(readFileSync(join(ROOT, ...p.split('/')), 'utf-8'));
const catalogue = read('catalogues/families.json');
const families = catalogue.families;
const codes = { isco: read('catalogues/codes/isco.json'), ssyk: read('catalogues/codes/ssyk-isco.json') };
const countries = read('catalogues/countries.json').countries;
const gate = compileFamilies(catalogue, codes);
const cc = compileCountries(countries);
const ssykOf = code => Object.entries(codes.ssyk.concepts).find(([, c]) => c.ssyk === code)[0];

// ── The catalogue ───────────────────────────────────────────────────────
eq(catalogue.groups.map(g => g.id), ['engineers', 'architects-surveyors', 'technicians', 'supervisors', 'plant-operators', 'crews', 'software-it', 'it-technicians'], 'eight groups, by ISCO minor group, the computing ones appended last');
eq(families.length, 52, 'fifty-two families: the unit groups of 214-216, 251-252, 311-315 and 351-352 minus the two designer groups');
eq(families.slice(0, 37).map(f => f.id).join(' '), '2141 2142 2143 2144 2145 2146 2149 2151 2152 2153 2161 2162 2164 2165 3111 3112 3113 3114 3115 3116 3117 3118 3119 3121 3122 3123 3131 3132 3133 3134 3135 3139 3151 3152 3153 3154 3155', 'the first thirty-seven keep their places: they are bits in every code out there');
ok(families.every(f => /^\d{4}$/.test(f.id) && f.isco[0] === f.id && catalogue.groups.some(g => g.id === f.group) && f.label && f.isco_title), 'every family is an ISCO code with its group, a label and ISCO\'s own title');
ok(families.every(f => codes.isco.units[f.id]?.labels?.en?.length), 'every family has ESCO job titles in English');
eq(new Set(families.map(f => f.id)).size, families.length, 'ids are unique');

// ── The gate: codes ─────────────────────────────────────────────────────
ok(gate.bySsyk.size >= 30, `JobTech's SSYK groups that fall in the vertical (${gate.bySsyk.size})`);
eq(familiesOf({ title: 'Säkerhetskontrollant', codes: { ssyk: 'PRQn_9yw_NJA' }, lang: 'sv' }, gate), ['2144'], 'a Swedish SSYK code decides through the official correspondence, whatever the title says');
eq(familiesOf({ title: 'Telekomingenjör', codes: { ssyk: ssykOf('2143') }, lang: 'sv' }, gate), ['2153'], 'a code that spans several groups: the title picks the one it names');
eq(familiesOf({ title: 'Ingenjör', codes: { ssyk: ssykOf('2143') }, lang: 'sv' }, gate).sort(), ['2151', '2152', '2153'], 'and keeps them all when it names none');
eq(familiesOf({ title: 'Mechanical Engineer', codes: { ssyk: ssykOf('3323') }, lang: 'sv' }, gate), [], 'a code outside the vertical is the source\'s word: out, whatever the title');
eq(familiesOf({ title: 'Anything', codes: { isco: '2142' } }, gate), ['2142'], 'an ISCO code decides too');
eq(familiesOf({ title: 'Mechanical Engineer', codes: { isco: '2512' } }, gate), ['2512'], 'an ISCO code in the computing groups is in since 2026-09-06');
eq(familiesOf({ title: 'Anything', codes: { isco: '5120' } }, gate), [], 'a cook is out, whatever the title');
eq(familiesOf({ title: 'Konstruktér/ka', codes: { isco: '31152' }, lang: 'cs' }, gate), ['3115'], 'a five-digit CZ-ISCO code decides by its first four digits');
eq(familiesOf({ title: 'Automatikos inžinierius', codes: { isco: '214911' }, lang: 'lt' }, gate), ['2149'], 'a six-digit Lithuanian LPK code, the same way');

// ── The gate: titles, by ESCO's names ───────────────────────────────────
eq(familiesOf({ title: 'Mechanical Engineer', codes: {}, lang: 'en' }, gate), ['2144'], 'no code: the title; the group that names it beats the groups that list it as an alternative');
eq(familiesOf({ title: 'Naval Architect', codes: {}, lang: 'en' }, gate), ['2144'], 'a naval architect is a mechanical engineer in ISCO, not an architect: the longest title wins');
eq(familiesOf({ title: 'Chief Engineer', codes: {}, lang: 'en' }, gate), ['3151'], 'a chief engineer is a ship\'s engineer');
eq(familiesOf({ title: 'Senior Solution Architect', codes: {}, lang: 'en' }, gate), ['2511'], 'a solution architect goes with the systems analysts, not with the building architects');
eq(familiesOf({ title: 'Software Engineer', codes: {}, lang: 'en' }, gate), ['2512'], 'a software engineer is a software developer');
eq(familiesOf({ title: 'Project Engineer', codes: {}, lang: 'en' }, gate), ['2149'], 'only the word engineer: engineers not elsewhere classified');
eq(familiesOf({ title: 'Senior Backend Engineer', codes: {}, lang: 'en' }, gate), ['2512'], 'a backend engineer is a software developer');
eq(familiesOf({ title: 'AI Research Engineer - Computer Vision', codes: {}, lang: 'en' }, gate), ['2512'], 'so is an AI research engineer');
eq(familiesOf({ title: 'Lead D365 F&O Solutions Architect Finance', codes: {}, lang: 'en' }, gate), ['2511'], 'and a solutions architect is not a building architect');
eq(familiesOf({ title: 'Head Chef', codes: {}, lang: 'en' }, gate), [], 'a chef is out');
eq(familiesOf({ title: 'Welder', codes: {}, lang: 'en' }, gate), [], 'a welder is out');
eq(familiesOf({ title: 'Advanced Mechanical Design Engineer (Thermal Runaway)', codes: {}, lang: 'en' }, gate), ['2149'], 'a mechanical design engineer stays in, as an engineer not elsewhere classified');
eq(familiesOf({ title: 'Draughtsman', codes: {}, lang: 'en' }, gate), ['3118'], 'a British spelling ESCO lacks comes from the extra terms');
eq(familiesOf({ title: 'INGENIERO/A MECÁNICO/A', codes: {}, lang: 'es' }, gate), ['2144'], 'Spanish, with gender marks');
eq(familiesOf({ title: 'INGENIERO/A TÉCNICO/A O INDUSTRIAL JUNIOR', codes: {}, lang: 'es' }, gate), ['2149'], 'a Spanish title with only the word ingeniero falls into 2149');
eq(familiesOf({ title: 'Ingeniero de procesos para Burgos', codes: {}, lang: 'es' }, gate), ['2141'], 'a Spanish process engineer');
eq(familiesOf({ title: 'Técnico comercial', codes: {}, lang: 'es' }, gate), [], 'the bare word técnico names no occupation');
eq(familiesOf({ title: 'Arquitecto/a para Ayto. de Medina del Campo (Valladolid)', codes: {}, lang: 'es' }, gate), ['2161'], 'an architect is an architect');
eq(familiesOf({ title: 'Encargado/a de obra', codes: {}, lang: 'es' }, gate), ['3123'], 'a construction supervisor');
eq(familiesOf({ title: 'ENGINYER/A INDUSTRIAL', codes: {}, lang: 'ca' }, gate), ['2141'], 'Catalan, from the catalogue\'s extra terms (ESCO has no Catalan)');
eq(familiesOf({ title: "Enginyer/a d'automatització", codes: {}, lang: 'ca' }, gate), ['2141'], 'a Catalan title with an apostrophe');
eq(familiesOf({ title: 'Ingénieur études et conception mécanique H/F', codes: {}, lang: 'fr' }, gate), ['2149'], 'French: the bare ingénieur alone falls into 2149');
eq(familiesOf({ title: 'Fisioterapeuta', codes: {}, lang: 'es' }, gate), [], 'a physiotherapist is outside the vertical');
eq(familiesOf({ title: "CAP D'OBRA - APARELLADOR/A - ARQUITECTE/A TÈCNIC/A", codes: {}, lang: 'ca' }, gate).sort(), ['2149', '3112', '3123'], 'a Catalan site manager and building surveyor: the longer "arquitecte tècnic" beats "arquitecte"');
eq(familiesOf({ title: 'Ingeniero/a Informático/a para AUVASA (Valladolid)', codes: {}, lang: 'es' }, gate), ['2512'], 'a Spanish computing engineer is a software developer');
eq(familiesOf({ title: 'COORDINADOR/A DE LLEURE', codes: {}, lang: 'ca' }, gate), [], 'a bare "coordinador" names no occupation of ours');
eq(familiesOf({ title: 'TALLYMAN, SUPERVISOR/RA', codes: {}, lang: 'es' }, gate), [], 'nor does a bare "supervisor"');
eq(familiesOf({ title: 'ARQUITECTO/TA TECNICO/CA - JEFE/FA DE OBRA', codes: {}, lang: 'es' }, gate).includes('3112') && !familiesOf({ title: 'ARQUITECTO/TA TECNICO/CA - JEFE/FA DE OBRA', codes: {}, lang: 'es' }, gate).includes('2161'), true, 'the /TA /CA /FA gender marks go too, so the building surveyor is read whole');
eq(familiesOf({ title: 'ESPECIALISTA IT', codes: {}, lang: 'es' }, gate), ['2519'], 'a computing word with no occupation ESCO knows lands in the software group not elsewhere classified');
ok(familiesOf({ title: "ENGINYER/A DE PONTS I CAMINS O D'OBRA CIVIL", codes: {}, lang: 'ca' }, gate).includes('2142'), 'the Catalan civil engineer');
eq(matchableTitle("Enginyer/a d'automatització (m/f)"), 'enginyer d automatitzacio', 'gender marks and apostrophes go before the words are read');
eq(familiesOf({ title: 'BŪVINŽENIERIS', codes: {}, lang: 'lv' }, gate), ['2142'], 'Latvian, by ESCO\'s Latvian titles');
eq(familiesOf({ title: 'ELEKTROTEHNIĶIS (ELEKTRISKO IEKĀRTU SPECIĀLISTS)', codes: {}, lang: 'lv' }, gate), ['3113'], 'a Latvian electrical technician');
eq(familiesOf({ title: 'PROGRAMMĒTĀJS', codes: {}, lang: 'lv' }, gate), ['2519'], 'a Latvian programmer, by the computing words');
eq(familiesOf({ title: 'PROGRAMMĒŠANAS INŽENIERIS', codes: {}, lang: 'lv' }, gate), ['2519'], 'a programming engineer is software, whatever the compound says');
eq(familiesOf({ title: 'Stavební inženýr', codes: {}, lang: 'cs' }, gate), ['2142'], 'Czech, by ESCO\'s Czech titles (the feed carries codes; this is the fallback)');
eq(familiesOf({ title: 'KOMUNĀLINŽENIERIS', codes: {}, lang: 'lv' }, gate), ['2149'], 'a Latvian compound with the engineer word inside falls into 2149');
eq(familiesOf({ title: 'Bauingenieur (m/w/d)', codes: {}, lang: 'de' }, gate).length > 0, true, 'so does a German one');
eq(familiesOf({ title: 'JEFE/A DE OBRA', codes: {}, lang: 'es' }, gate), ['3123'], 'a Spanish site manager is a construction supervisor');
eq(hygieneReason({ title: 'PĀRDEVĒJS' }), 'title names a sales, recruiting, trainee, labourer or gig role', 'a Latvian shop assistant is hygiene');
eq(hygieneReason({ title: 'Sales Engineer' }), 'title names a sales, recruiting, trainee, labourer or gig role', 'a sales engineer is hygiene');
eq(hygieneReason({ title: 'VENDEDOR/A, INTERIORISTA, DISEÑADOR/A' }), 'title names a sales, recruiting, trainee, labourer or gig role', 'so is a Spanish shop assistant, whatever else the title says');
eq(hygieneReason({ title: 'PEONES DE LA INDUSTRIA METALÚRGICA' }), 'title names a sales, recruiting, trainee, labourer or gig role', 'and a labourer');
eq(hygieneReason({ title: 'Ingeniero/a de procesos' }), null, 'an engineer is not');
ok(hygieneReason({ title: 'AI Trainer – Aerospace Engineers - CAD Expertise (Remote Advisory - US)' }), 'a gig-platform task is hygiene, whatever engineer it asks for');

// ── Places ──────────────────────────────────────────────────────────────
eq(placeOf('Gorinchem, Netherlands', cc), { cc: 'nl', city: 'Gorinchem' }, 'country name and a known city');
eq(placeOf('Madrid, ES', cc), { cc: 'es', city: 'Madrid' }, 'an ISO code as its own word');
eq(placeOf('Stavanger', cc), { cc: 'no', city: 'Stavanger' }, 'a city alone names its country');
eq(placeOf('Remote - Europe', cc), { cc: 'xx', city: '' }, 'remote is its own place');
eq(placeOf('Remote - USA', cc).cc, 'us', 'a remote job in a named country outside Europe is outside Europe');
eq(placeOf('Remote, Germany', cc).cc, 'de', 'and one in a named European country is in it');
eq(placeOf('Baltimore, MD', cc).cc, 'us', 'MD after a town is Maryland, not Moldova');
eq(placeOf('Rockville, MD, US', cc).cc, 'us', 'a country outside Europe coded at the end wins over a European code');
eq([placeOf('Chisinau, MD', cc).cc, placeOf('Chișinău, Moldova', cc).cc], ['md', 'md'], 'MD with a Moldovan city, or Moldova named, is Moldova');
eq([placeOf('Huntsville, AL', cc).cc, placeOf('Tirana, AL', cc).cc], ['us', 'al'], 'AL is Alabama unless an Albanian city is named');
eq([placeOf("St. Julian's, MT", cc).cc, placeOf('Billings, MT', cc).cc, placeOf('Portland, ME', cc).cc], ['mt', 'us', 'us'], 'MT and ME the same way');
eq([placeOf('Wilmington, DE', cc).cc, placeOf('Rottach-Egern, DE', cc).cc], ['us', 'de'], 'DE is Germany except for the towns of Delaware');
eq([placeOf('Saskatoon, SK', cc).cc, placeOf('Trnava, SK', cc).cc, placeOf("St. John's, NL, CA", cc).cc, placeOf('Zwolle, NL', cc).cc], ['ca', 'sk', 'ca', 'nl'], 'SK and NL the same way');
eq([placeOf('Erfurt, TH, DE', cc).cc, placeOf('Rockville, MD or Hawthorne, CA', cc).cc], ['de', 'ca'], 'the last code is the country: a code before it is a region');
eq(placeOf('KR - Seoul', cc).cc, 'kr', 'a code outside Europe anywhere in the text');
eq(placeOf('New York', cc).cc, 'us', 'a big city outside Europe, unnamed country');
eq(placeOf('São Paulo', cc).cc, 'br', 'accents and all');
eq(placeOf('Houston, TX, United States', cc), { cc: 'us', city: 'Houston' }, 'outside Europe by name: the country is named, so the builder can drop it');
eq(placeOf('Sherbrooke, QC, CA', cc), { cc: 'ca', city: 'Sherbrooke' }, 'outside Europe by a code at the end');
eq(placeOf('Head Office', cc), { cc: '', city: 'Head Office' }, 'nothing known: no country, the text kept as the city');
eq(placeOfAdvert({ title: 'Site Engineer - Lyon, France', location: 'Statistician Network' }, cc).cc, 'fr', 'a board that puts the place in the title: the title is read when the location names no country');
eq(placeOfAdvert({ title: 'Sports Data Collector (American Football) - Albuquerque, New Mexico, USA', location: 'Network' }, cc).cc, 'us', 'and a place outside Europe in the title is read too');
eq(placeOfAdvert({ title: 'Mechanical Engineer', location: 'Gorinchem, Netherlands' }, cc).cc, 'nl', 'the location first, when it has a country');
eq(placeOf('München', cc), { cc: 'de', city: 'München' }, 'a native spelling');
eq(placeOf('', cc), { cc: '', city: '' }, 'nothing is nothing');

// ── Addresses and ids ───────────────────────────────────────────────────
eq(normUrl('https://jobs.example.com/view/12?utm_source=x&id=7#top'), 'https://jobs.example.com/view/12?id=7', 'campaign tail and fragment go, a real parameter stays');
eq(idFor('https://jobs.example.com/view/12?utm_source=x'), idFor('https://jobs.example.com/view/12/'), 'the id survives the tail and the slash');
eq(idFor('https://a.example/1').length, 8, 'eight characters');
eq(normUrl('https://cvvp.nva.gov.lv/#/pub/vakances/462167750'), 'https://cvvp.nva.gov.lv/#/pub/vakances/462167750', 'a route in the fragment is the address itself and stays');
ok(idFor('https://cvvp.nva.gov.lv/#/pub/vakances/1') !== idFor('https://cvvp.nva.gov.lv/#/pub/vakances/2'), 'two routes, two ids');

// ── Excerpts ────────────────────────────────────────────────────────────
{
  const body = 'We design offshore mooring systems. You will join a team of twelve. Requirements: 5+ years of experience in marine engineering. A master\'s degree in naval architecture is preferred. Fluent English required; Dutch is a plus. We offer a laptop.';
  eq(snippet(body, 60), 'We design offshore mooring systems.', 'the opening sentences, cut on a sentence end');
  const rq = requirements(body);
  ok(rq.includes('5+ years') && rq.includes('degree') && rq.includes('Fluent English'), 'every requirement sentence is kept');
  ok(!rq.includes('laptop'), 'and the perks are not');
  ok(rq.includes('Dutch is a plus'), 'the sentence after a requirement rides along');
}
eq(snippet('A'.repeat(300), 50).length, 50, 'a single overlong sentence is cut');

// ── The record ──────────────────────────────────────────────────────────
{
  const raw = { source: 'lever', title: '  Marine   Engineer ', company: 'Damen', location: 'Gorinchem, Netherlands', url: 'https://jobs.lever.co/damen/1?utm_source=adzuna', description: 'Minimum 3 years of experience with ship design. You speak Dutch.', posted: '2026-09-01', codes: {}, lang: 'en' };
  const rec = toRecord(raw, ['2144'], cc);
  eq([rec.t, rec.c, rec.cc, rec.ci, rec.u, rec.s, rec.f, rec.y, rec.tl], ['Marine Engineer', 'Damen', 'nl', 'Gorinchem', 'https://jobs.lever.co/damen/1', 'lever', ['2144'], 3, 'en'], 'the fields, cleaned');
  ok(rec.rq.includes('3 years'), 'the years sentence is in the requirements excerpt');
  ok(!('k' in rec), 'no code when the source had none');
  const sv = toRecord({ source: 'jobtech', title: 'Maskiningenjör', company: 'AB', location: 'Göteborg, Sweden', country: 'se', city: 'Göteborg', url: 'https://arbetsformedlingen.se/platsbanken/annonser/1', description: '', posted: '2026-09-02', expires: '2026-10-01', codes: { ssyk: 'PRQn_9yw_NJA' }, lang: 'sv' }, ['2144'], cc);
  eq([sv.cc, sv.ci, sv.k, sv.x], ['se', 'Göteborg', 'ssyk:PRQn_9yw_NJA', '2026-10-01'], 'a feed that states the country keeps it, with its code and deadline');
}

// ── Dedupe ──────────────────────────────────────────────────────────────
{
  const mk = (u, c, t, kind, d = '2026-09-01') => ({ rec: { u, c, t, d }, kind });
  const r = dedupe([
    mk('https://a.example/1', 'Acme', 'Mechanical Engineer', 'feed'),
    mk('https://a.example/1', 'Acme', 'Mechanical Engineer', 'board'),
    mk('https://b.example/9', 'Acme', 'Mechanical Engineer (m/w/d)', 'feed', '2026-08-20'),
    mk('https://c.example/2', '', 'Engineer', 'feed'),
    mk('https://c.example/3', '', 'Engineer', 'feed'),
  ]);
  eq(r.kept.length, 3, 'same address once, same role once, nameless adverts kept apart');
  eq(r.kept.find(x => x.u === 'https://a.example/1') ? 'board-wins' : 'lost', 'board-wins', 'the board copy of a shared address wins');
  eq([r.sameUrl, r.sameRole], [1, 1], 'and the counts say what fell');
  eq(roleKey('', 'Engineer'), '', 'no employer, no role key');
}

// ── Shards ──────────────────────────────────────────────────────────────
{
  const recs = [
    { id: 'a', f: ['2144'], cc: 'es', d: '2026-09-01' },
    { id: 'b', f: ['2144', '3151'], cc: 'es', d: '2026-09-02' },
    { id: 'c', f: ['2144'], cc: '', d: '2026-09-03' },
  ];
  const { files, families: idx } = buildShards(recs, families, '2026-09-03T00:00:00Z');
  eq(Object.keys(files).sort(), ['offers/2144-es.json', 'offers/2144-zz.json', 'offers/3151-es.json'], 'one file per family and country, unknown country as zz');
  eq(JSON.parse(files['offers/2144-es.json']).offers.map(o => o.id), ['b', 'a'], 'newest first');
  eq(idx['2144'].countries.es.n, 2, 'the index counts');
  eq([idx['3151'].countries.es.files, idx['3151'].group], [['offers/3151-es.json'], 'crews'], 'and names the files and the group');
}

// ── The sources' parsers, on recorded answers ───────────────────────────
{
  const json = '[{"codigo":"1","desEmpleo":"INGENIERO/A MECÁNICO/A","desPuesto":"Diseño de máquinas.","tipo":"1","pais":"ESPAÑA","provincia":"BIZKAIA","municipio":"BILBAO","fecMod":"03/09/2026","fecPub":"02/09/2026","disc":"N","url":"https://web.lanbide.eus/x?IDRG=1"},{"codigo":"2","desEmpleo":"SIN ENLACE","url":""}]';
  const buf = Buffer.from(json, 'latin1');   // ➤ the file really arrives in Windows-1252
  const rows = parseLanbide(buf);
  eq(rows.length, 1, 'a row without a link is dropped');
  eq([rows[0].title, rows[0].description, rows[0].location, rows[0].city, rows[0].posted, rows[0].country], ['INGENIERO/A MECÁNICO/A', 'Diseño de máquinas.', 'BILBAO, BIZKAIA, Spain', 'BILBAO', '2026-09-02', 'es'], 'decoded, placed, dated');
  eq(isoDay('2026-09-02T10:00:00'), '2026-09-02', 'ISO dates pass through');
}
{
  const xml = '<ofertes><feinaactiva><ad><id>FA1</id><url>https://feinaactiva.gencat.cat/search/offers/detail/FA1</url><title>ENGINYER/A INDUSTRIAL</title><content>Projectes &amp; legalitzacions.</content><company>PROTEJA, S.L.</company><experience>Experiència 1 anys.</experience><requirements>Permisos de conduir: b</requirements><studies>enginyeria - industrial</studies><date>26/08/2026</date><city>CALELLA</city><region>BARCELONA</region><status>PUBLISHED</status></ad><ad><id>FA2</id><url>https://x/2</url><title>Old</title><status>CLOSED</status></ad></ofertes>';
  const rows = parseFeinaActiva(xml);
  eq(rows.length, 1, 'only published adverts');
  eq([rows[0].title, rows[0].company, rows[0].location, rows[0].posted], ['ENGINYER/A INDUSTRIAL', 'PROTEJA, S.L.', 'Calella, Barcelona, Spain', '2026-08-26'], 'fields read, entities decoded, places title-cased');
  ok(rows[0].description.includes('Projectes & legalitzacions.') && rows[0].description.includes('enginyeria - industrial'), 'content, experience, requirements and studies make the body');
}
{
  const json = '{"document": {"date": "x", "list": [{"element": {"attribute": [{"name": "Identificador", "valor": "9"}, {"name": "Titulo_es", "text": "Ingeniero de procesos para Burgos"}, {"name": "Provincia", "valor": [{"string": "Burgos"}]}, {"name": "FechaPublicacion", "date": "20260902"}, {"name": "Descripcion_es", "text": "<p>Se requieren <strong>3 a&ntilde;os</strong> de experiencia.</p>"}, {"name": "LocalidadAsset_NombreLocalidad", "valor": "Miranda de Ebro"}, {"name": "FuenteContenido", "valor": "Infoempleo"}, {"name": "Enlace al contenido", "valor": "https://empleo.jcyl.es/oferta/9"}]}}]}}';
  const rows = parseJcyl(json);
  eq(rows.length, 1, 'the control character does not break the parse');
  eq([rows[0].title, rows[0].location, rows[0].posted, rows[0].origin, rows[0].url], ['Ingeniero de procesos para Burgos', 'Miranda de Ebro, Burgos, Spain', '2026-09-02', 'Infoempleo', 'https://empleo.jcyl.es/oferta/9'], 'attributes flattened into fields');
  ok(rows[0].description.includes('3 años'), 'the HTML body is turned into text with its entities decoded');
}
{
  const gh = ATS.greenhouse.parse({ jobs: [{ id: 1, title: 'Naval Architect', location: { name: 'Rotterdam, Netherlands' }, absolute_url: 'https://boards.greenhouse.io/x/jobs/1', updated_at: '2026-09-01T10:00:00Z', content: '&lt;p&gt;Design &amp; build.&lt;/p&gt;' }] }, 'x', 'Acme');
  eq([gh[0].title, gh[0].location, gh[0].description, gh[0].posted, gh[0].sourceId], ['Naval Architect', 'Rotterdam, Netherlands', 'Design & build.', '2026-09-01', '1'], 'Greenhouse through Argus\'s parser: escaped HTML content becomes text, the date rides along');
  const lv = ATS.lever.parse([{ id: 'a', text: 'PLC Engineer', categories: { location: 'Remote' }, hostedUrl: 'https://jobs.lever.co/x/a', createdAt: 1756720000000, descriptionPlain: 'Intro.', lists: [{ text: 'Requirements', content: '<li>2 years</li>' }], workplaceType: 'remote' }], 'x', 'Acme');
  eq([lv[0].title, lv[0].remote, lv[0].description.includes('2 years')], ['PLC Engineer', true, true], 'Lever through Argus\'s parser: lists join the description, remote is read');
  const sr = ATS.smartrecruiters.parse({ content: [{ id: '99', name: 'Commissioning Engineer', location: { city: 'Bilbao', region: 'Bizkaia', country: 'es', remote: false }, company: { identifier: 'Acme1' }, releasedDate: '2026-09-02T08:00:00.000Z' }] }, 'Acme1', 'Acme');
  eq([sr[0].title, sr[0].url, sr[0].location, sr[0].posted], ['Commissioning Engineer', 'https://jobs.smartrecruiters.com/Acme1/99', 'Bilbao, Bizkaia, ES', '2026-09-02'], 'SmartRecruiters through Argus\'s parser: the posting address is built and the date read');
  const rc = ATS.recruitee.parse({ offers: [{ id: 5, title: 'Commissioning Engineer', city: 'Bilbao', country: 'Spain', careers_url: 'https://x.recruitee.com/o/c', description: '<p>Body</p>', requirements: '<ul><li>Degree</li></ul>', published_at: '2026-08-30' }] });
  eq([rc[0].location, rc[0].description.includes('Degree'), rc[0].posted], ['Bilbao, Spain', true, '2026-08-30'], 'Recruitee: city and country, requirements appended');
  const pe = ATS.personio.parse('<workzag-jobs><position><id>77</id><name>Konstrukteur (m/w/d)</name><office>Kiel</office><createdAt>2026-08-29</createdAt><jobDescriptions><jobDescription><name>Aufgaben</name><value><![CDATA[<p>Konstruktion.</p>]]></value></jobDescription></jobDescriptions></position></workzag-jobs>', 'acme');
  eq([pe[0].title, pe[0].location, pe[0].url, pe[0].description], ['Konstrukteur (m/w/d)', 'Kiel', 'https://acme.jobs.personio.de/job/77', 'Konstruktion.'], 'Personio: XML positions with CDATA bodies');
  eq(withoutContacts('Write to jana.novak@firma.cz or call +420 602 123 456, tel. 482428663; 5 years, 40 hours, 2026-09-04.'), 'Write to   or call  , tel.  ; 5 years, 40 hours, 2026-09-04.', 'e-mails and phone numbers go, short numbers and dates stay');
  const wk = ATS.workable.parse({ name: 'Acme Robotics', jobs: [{ shortcode: 'AB12', title: 'Mechanical Engineer', locations: [{ city: 'Athens', region: 'Attica', country: 'Greece', countryCode: 'GR' }], url: 'https://apply.workable.com/acme/j/AB12/', published_on: '2026-09-01', description: '<p>Build robots.</p>' }] }, 'acme');
  eq([wk[0].title, wk[0].company, wk[0].location, wk[0].url, wk[0].posted, wk[0].description], ['Mechanical Engineer', 'Acme Robotics', 'Athens, Attica, Greece', 'https://apply.workable.com/acme/j/AB12/', '2026-09-01', 'Build robots.'], 'Workable: the widget names the company, the first location is the place');
  const tt = ATS.teamtailor.parse('<?xml version="1.0"?><rss xmlns:tt="https://teamtailor.com/rss"><channel><title>Northvolt</title><item><title>Battery Cell Engineer</title><link>https://northvolt.teamtailor.com/jobs/1-battery-cell-engineer</link><guid>1</guid><pubDate>Mon, 01 Sep 2026 10:00:00 +0000</pubDate><description><![CDATA[<p>Cells &amp; modules.</p>]]></description><tt:locations><tt:location><tt:name>Skellefteå</tt:name><tt:city>Skellefteå</tt:city><tt:country>Sweden</tt:country></tt:location></tt:locations><tt:remoteStatus>hybrid</tt:remoteStatus></item></channel></rss>', 'northvolt');
  eq([tt[0].title, tt[0].company, tt[0].location, tt[0].url, tt[0].posted, tt[0].description, tt[0].remote], ['Battery Cell Engineer', 'Northvolt', 'Skellefteå', 'https://northvolt.teamtailor.com/jobs/1-battery-cell-engineer', '2026-09-01', 'Cells & modules.', true], 'Teamtailor: RSS items with the location in its own tags');
  const ab = ATS.ashby.parse({ jobs: [{ id: 'z', title: 'Hardware Engineer', location: 'Berlin', jobUrl: 'https://jobs.ashbyhq.com/x/z', publishedAt: '2026-09-02T00:00:00Z', descriptionPlain: 'Plain.', isRemote: false }] }, 'x', 'Acme');
  eq([ab[0].title, ab[0].location, ab[0].posted], ['Hardware Engineer', 'Berlin', '2026-09-02'], 'Ashby: plain fields');
}

{
  const obce = { '563960': 'Český Dub' };
  const units = new Set(['3115', '2144']);
  const v = { portalId: 67289171, zverejnovat: { id: 'ZverejnovatVpm/ano' }, profeseCzIsco: { id: 'CzIsco/31152' }, pozadovanaProfese: { cs: 'Konstruktér (m/ž)' }, upresnujiciInformace: { cs: 'Konstrukce strojů. Kontakt: 482428663.' }, zamestnavatel: { ico: '1', nazev: 'KOOL Trading, spol. s r.o.' }, datumVlozeni: '2026-09-04T00:00:00.000Z', expirace: null, mistoVykonuPrace: { pracoviste: [{ adresa: { obec: { id: 'Obec/563960' }, psc: '46343' } }] } };
  const r = mpsvRaw(v, obce, units);
  eq([r.title, r.company, r.location, r.city, r.url, r.posted, r.expires, r.codes.isco, r.lang], ['Konstruktér (m/ž)', 'KOOL Trading, spol. s r.o.', 'Český Dub, Czechia', 'Český Dub', 'https://up.gov.cz/volna-mista-v-cr/-/vm/67289171', '2026-09-04', '', '31152', 'cs'], 'Czechia: named municipality, portal address, the CZ-ISCO code');
  eq(mpsvRaw({ ...v, profeseCzIsco: { id: 'CzIsco/52230' } }, obce, units), null, 'a code outside the vertical never leaves the adapter');
  eq(mpsvRaw({ ...v, zverejnovat: { id: 'ZverejnovatVpm/ne' } }, obce, units), null, 'nor does a vacancy the source does not publish');
  eq(mpsvRaw({ ...v, mistoVykonuPrace: null }, obce, units).location, 'Czechia', 'no workplace: the country alone');
}
{
  const r = uztRaw({ darbo_vietos_id: 'DV-01-996748329', profesijos_kodas: '214201', profesijos_pareigybes_pav: 'Statybos inžinierius', darbdavys: 'UAB "ENERGUS GROUP"', darbo_vietos_adresas: 'Savanorių pr. 176C, Vilnius, Lietuva', darbo_aprasymas_lt: 'Projektų valdymas.', reik_darbo_patirtis: '2 metai', ikelimo_data: '2026-07-03', galioja_nuo: '2026-07-03', galioja_iki: '2026-10-01' });
  eq([r.title, r.company, r.city, r.location, r.url, r.posted, r.expires, r.codes.isco, r.lang], ['Statybos inžinierius', 'UAB "ENERGUS GROUP"', 'Vilnius', 'Vilnius, Lithuania', 'https://uzt.lt/laisvos-darbo-vietos/436/p1/skelbimas/DV-01-996748329', '2026-07-03', '2026-10-01', '214201', 'lt'], 'Lithuania: the city before the country, the LPK code');
  ok(r.description.includes('2 metai'), 'the requirement lines join the description');
  eq([ltCity('Vilnius, Lietuva'), ltCity('Kaunas'), ltCity('')], ['Vilnius', 'Kaunas', ''], 'the city reader');
}
{
  const csv = '\ufeffVakances_Nr,Aktualizacijas_datums,Iestades_registracijas_numurs,Vakances_nosaukums,Vakances_kategorija,Alga_no,Alga_lidz,Slodzes_tips,Darba_laika_veids,Darba_stundas_nedela,Pieteiksanas_termins,Attels,Vieta,Vakances_paplasinats_apraksts\r\n260828-62,2026-08-28,40003575567,"BŪVINŽENIERIS, PROJEKTU VADĪTĀJS",Būvniecība / Nekustamais īpašums,1650.000,2000.000,Viena vesela slodze,Normālais darba laiks,"",2026-09-17,"","Stadiona iela 10, Ozolnieki, Ozolnieku pag., Jelgavas nov.",https://cvvp.nva.gov.lv/#/pub/vakances/462167750\r\n260828-63,2026-08-28,1,BEZ SAITES,Cita,,,,,,,,,\r\n';
  eq(parseCsv('a,"b ""c"", d",e\n1,,3')[0], ['a', 'b "c", d', 'e'], 'quoted fields with commas and doubled quotes');
  const rows = parseNva(csv);
  eq(rows.length, 1, 'a row without a link is dropped');
  eq([rows[0].title, rows[0].city, rows[0].location, rows[0].posted, rows[0].expires, rows[0].url, rows[0].description, rows[0].lang], ['BŪVINŽENIERIS, PROJEKTU VADĪTĀJS', 'Ozolnieki', 'Stadiona iela 10, Ozolnieki, Ozolnieku pag., Jelgavas nov., Latvia', '2026-08-28', '2026-09-17', 'https://cvvp.nva.gov.lv/#/pub/vakances/462167750', 'Būvniecība / Nekustamais īpašums', 'lv'], 'Latvia: the town before the parish and the municipality, the sector as the only text');
  eq(lvCity('Dārzciema iela 86, Rīga'), 'Rīga', 'a street and the city');
}
{
  const rows = parseSef([{ numeroOferta: '142026005104', fechaDeInicio: '04/09/2026', fechaDeFin: '03/10/2026', municipio: { municipio: 'SAN JAVIER', provincia: { provincia: 'MURCIA' } }, descripcion: 'INGENIERO/A DE PROCESOS', adicionales: 'EMPRESA NECESITA <B>INGENIERO/A</B><BR/>-Diseño de procesos.', mesesExperiencia: 12, descNivelProfesional: 'TÉCNICOS', urlDetalles: 'https://sefoficinavirtual.carm.es/sefoficinavirtual/public/oferta/detalle-oferta.xhtml?id=57571' }, { numeroOferta: '2', descripcion: 'SIN ENLACE', urlDetalles: '' }]);
  eq(rows.length, 1, 'a row without a link is dropped');
  eq([rows[0].title, rows[0].location, rows[0].city, rows[0].posted, rows[0].expires, rows[0].url], ['INGENIERO/A DE PROCESOS', 'San Javier, Murcia, Spain', 'San Javier', '2026-09-04', '2026-10-03', 'https://sefoficinavirtual.carm.es/sefoficinavirtual/public/oferta/detalle-oferta.xhtml?id=57571'], 'Murcia: places title-cased, Spanish dates read');
  ok(rows[0].description.includes('Diseño de procesos.') && rows[0].description.includes('Experiencia: 12 meses'), 'the HTML body becomes text, the experience line rides along');
}

{
  const r = adzunaRaw({ id: 5178901, title: 'Ingeniero de procesos', company: { display_name: 'Acme SL' }, location: { display_name: 'Getafe, Madrid', area: ['España', 'Comunidad de Madrid', 'Madrid', 'Getafe'] }, redirect_url: 'https://www.adzuna.es/land/ad/5178901?se=abc&utm_medium=api', description: 'Se busca ingeniero con 3 años.', created: '2026-09-05T08:00:00Z' }, 'es');
  eq([r.title, r.company, r.location, r.city, r.country, r.url, r.posted, r.lang], ['Ingeniero de procesos', 'Acme SL', 'Getafe, Madrid', 'Getafe', 'es', 'https://www.adzuna.es/details/5178901', '2026-09-05', 'es'], 'Adzuna: the details page instead of the tracking bounce, the narrowest area as the city');
  eq(detailsUrl('https://example.com/x', 1), 'https://example.com/x', 'a redirect that is not Adzuna\'s stays as it is');
  const jb = jobicy.parse({ jobs: [{ id: 151870, url: 'https://jobicy.com/jobs/151870-x', jobTitle: 'DevOps Engineer', companyName: 'Alma', jobGeo: 'Italy', jobExcerpt: 'Short.', jobDescription: '<p>Long &amp; full.</p>', pubDate: '2026-09-06T06:05:03+00:00' }] });
  eq([jb[0].title, jb[0].location, jb[0].remote, jb[0].description, jb[0].posted, jb[0].url], ['DevOps Engineer', 'Italy', true, 'Long & full.', '2026-09-06', 'https://jobicy.com/jobs/151870-x'], 'Jobicy: remote, the country as the place, the full text');
  const rm = remotive.parse({ jobs: [{ id: 9, url: 'https://remotive.com/remote-jobs/software-dev/x-9', title: 'Backend Engineer', company_name: 'Acme', candidate_required_location: 'Europe', publication_date: '2026-09-04T10:00:00', description: '<p>Body</p>' }] });
  eq([rm[0].title, rm[0].location, rm[0].remote, rm[0].posted, rm[0].description], ['Backend Engineer', 'Europe', true, '2026-09-04', 'Body'], 'Remotive: the required location kept as the place');
  const ab = arbeitnow.parse({ data: [{ slug: 'x-1', company_name: 'Superchat', title: 'Tech Lead (m/f/d)', description: '&lt;p&gt;We&#39;re &lt;strong&gt;hiring&lt;/strong&gt;.&lt;/p&gt;', remote: false, url: 'https://www.arbeitnow.com/jobs/companies/superchat/x-1', location: 'Berlin', created_at: Date.UTC(2026, 8, 5, 12) / 1000 }] });
  eq([ab[0].title, ab[0].company, ab[0].location, ab[0].description, ab[0].posted, ab[0].lang], ['Tech Lead (m/f/d)', 'Superchat', 'Berlin', "We're hiring.", '2026-09-05', 'de'], 'Arbeitnow: escaped HTML read as text, the epoch as a day');
}

{
  const robots = parseRobots('User-agent: *\nDisallow: /admin/\nDisallow: /jobs/apply\nAllow: /jobs/apply/faq\nCrawl-delay: 2\nSitemap: https://x.example/sitemap.xml\n\nUser-agent: GPTBot\nDisallow: /\n');
  eq([robots.delay, robots.sitemaps, robots.rules.length], [2, ['https://x.example/sitemap.xml'], 3], 'robots.txt: the group that binds everyone, its delay, the sitemaps');
  eq([allowed(robots, '/jobs/123'), allowed(robots, '/admin/x'), allowed(robots, '/jobs/apply/now'), allowed(robots, '/jobs/apply/faq')], [true, false, false, true], 'the most specific rule wins');
  eq(allowed({ rules: [] }, '/anything'), true, 'no rules: everything may be read');
  const sm = parseSitemap('<?xml version="1.0"?><urlset><url><loc>https://x.example/vacancies/engineer-12</loc><lastmod>2026-09-01T10:00:00+00:00</lastmod></url><url><loc> https://x.example/about </loc></url></urlset>');
  eq([sm.index, sm.items.length, sm.items[0].url, sm.items[0].lastmod, sm.items[1].lastmod], [false, 2, 'https://x.example/vacancies/engineer-12', '2026-09-01', ''], 'a sitemap: addresses and lastmod, trimmed');
  eq(parseSitemap('<sitemapindex><sitemap><loc>https://x.example/sitemap-jobs.xml</loc></sitemap></sitemapindex>').index, true, 'a sitemap index is told apart');
  eq(await deadline(Promise.resolve('fast'), 1000), 'fast', 'a read that answers in time is handed over');
  eq(await deadline(new Promise(r => setTimeout(() => r('slow'), 300)), 30).catch(e => e.message), 'took too long', 'a read that neither answers nor fails is given up at its deadline');
  eq([looksLikeJob('https://x.example/vacancies/engineer-12'), looksLikeJob('https://x.example/de/karriere/stellenangebote/abc'), looksLikeJob('https://x.example/ofertas-de-empleo/123'), looksLikeJob('https://x.example/about-us'), looksLikeJob('https://x.example/blog/jobs-of-the-future')], [true, true, true, false, true], 'addresses that look like vacancy pages');
  const html = '<html><head><script type="application/ld+json">{"@context":"https://schema.org","@type":"JobPosting","title":"Mechanical Engineer","datePosted":"2026-09-02","validThrough":"2026-10-02T00:00","hiringOrganization":{"@type":"Organization","name":"Damen"},"jobLocation":{"@type":"Place","address":{"@type":"PostalAddress","addressLocality":"Gorinchem","addressCountry":"NL"}},"description":"<p>Design &amp; build.</p>","url":"https://x.example/vacancies/12"}</script></head></html>';
  const jobs = jobPostings(html, 'https://x.example/page');
  eq([jobs.length, jobs[0].title, jobs[0].company, jobs[0].location, jobs[0].country, jobs[0].posted, jobs[0].expires, jobs[0].description, jobs[0].url], [1, 'Mechanical Engineer', 'Damen', 'Gorinchem, NL', 'nl', '2026-09-02', '2026-10-02', 'Design & build.', 'https://x.example/vacancies/12'], 'a JobPosting block: the fields the pile keeps');
  eq(jobPostings('<script type="application/ld+json">{"@graph":[{"@type":"Organization","name":"X"},{"@type":["JobPosting"],"name":"Welder","jobLocationType":"TELECOMMUTE"}]}</script>', 'https://x.example/p').map(j => [j.title, j.location, j.remote])[0], ['Welder', 'Remote', true], 'a graph, a type in a list, a remote job');
  eq(jobPostings('<script type="application/ld+json">not json</script><p>no block</p>', 'u'), [], 'no block, nothing');
  const raw = careersRaw(jobs[0], { name: 'Damen Shipyards', sitemap: 'https://x.example/sitemap.xml', lang: 'nl' }, 'https://x.example/vacancies/12');
  eq([raw.source, raw.company, raw.country, raw.lang, raw.url, raw.sourceId], ['careers', 'Damen', 'nl', 'nl', 'https://x.example/vacancies/12', 'https://x.example/vacancies/12'], 'a careers advert: the organisation on the page, the site\'s language');
}

done();
