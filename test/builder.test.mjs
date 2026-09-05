// ➤ The builder's pure parts, without a network: the gate, the place reader, the excerpts,
// ➤ the record, the dedupe and the shards. The sources' parsers are fed recorded answers.
// ➤ The gate runs on the real tables: the catalogue (ISCO-08 unit groups), ESCO's job titles
// ➤ (catalogues/codes/isco.json) and JobTech's SSYK→ISCO correspondence.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { harness } from 'argus/server-bot/test-harness.mjs';
import { compileFamilies, familiesOf, hygieneReason, cleanTitle } from '../builder/gate.mjs';
import { compileCountries, placeOf, normUrl, idFor, toRecord } from '../builder/normalise.mjs';
import { snippet, requirements } from '../builder/excerpt.mjs';
import { dedupe, roleKey } from '../builder/dedupe.mjs';
import { buildShards } from '../builder/shard.mjs';
import { parseLanbide, isoDay } from '../builder/adapters/lanbide.mjs';
import { parseFeinaActiva } from '../builder/adapters/feinaactiva.mjs';
import { parseJcyl } from '../builder/adapters/jcyl.mjs';
import { ATS } from '../builder/adapters/boards.mjs';

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
eq(catalogue.groups.map(g => g.id), ['engineers', 'architects-surveyors', 'technicians', 'supervisors', 'plant-operators', 'crews'], 'six groups, by ISCO minor group');
eq(families.length, 37, 'thirty-seven families: the unit groups of 214-216 and 311-315 minus the two designer groups');
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
eq(familiesOf({ title: 'Mechanical Engineer', codes: { isco: '2512' } }, gate), [], 'an ISCO code outside the vertical is out');

// ── The gate: titles, by ESCO's names ───────────────────────────────────
eq(familiesOf({ title: 'Mechanical Engineer', codes: {}, lang: 'en' }, gate), ['2144'], 'no code: the title; the group that names it beats the groups that list it as an alternative');
eq(familiesOf({ title: 'Naval Architect', codes: {}, lang: 'en' }, gate), ['2144'], 'a naval architect is a mechanical engineer in ISCO, not an architect: the longest title wins');
eq(familiesOf({ title: 'Chief Engineer', codes: {}, lang: 'en' }, gate), ['3151'], 'a chief engineer is a ship\'s engineer');
eq(familiesOf({ title: 'Senior Solution Architect', codes: {}, lang: 'en' }, gate), [], 'a solution architect is ICT: blocked');
eq(familiesOf({ title: 'Software Engineer', codes: {}, lang: 'en' }, gate), [], 'so is a software engineer, whatever the word engineer says');
eq(familiesOf({ title: 'Project Engineer', codes: {}, lang: 'en' }, gate), ['2149'], 'only the word engineer: engineers not elsewhere classified');
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
eq(familiesOf({ title: 'Ingeniero/a Informático/a para AUVASA (Valladolid)', codes: {}, lang: 'es' }, gate), [], 'a computing engineer is not ours, so the bare ingeniero does not rescue it');
eq(familiesOf({ title: 'COORDINADOR/A DE LLEURE', codes: {}, lang: 'ca' }, gate), [], 'a bare "coordinador" names no occupation of ours');
eq(familiesOf({ title: 'TALLYMAN, SUPERVISOR/RA', codes: {}, lang: 'es' }, gate), [], 'nor does a bare "supervisor"');
eq(familiesOf({ title: 'ARQUITECTO/TA TECNICO/CA - JEFE/FA DE OBRA', codes: {}, lang: 'es' }, gate).includes('3112') && !familiesOf({ title: 'ARQUITECTO/TA TECNICO/CA - JEFE/FA DE OBRA', codes: {}, lang: 'es' }, gate).includes('2161'), true, 'the /TA /CA /FA gender marks go too, so the building surveyor is read whole');
eq(familiesOf({ title: 'TECNICO/A DE INFRAESTRUCTURAS IT', codes: {}, lang: 'es' }, gate), [], 'IT puts a title outside the vertical whatever else it says');
ok(familiesOf({ title: "ENGINYER/A DE PONTS I CAMINS O D'OBRA CIVIL", codes: {}, lang: 'ca' }, gate).includes('2142'), 'the Catalan civil engineer');
eq(cleanTitle("Enginyer/a d'automatització (m/f)"), 'enginyer d automatitzacio', 'gender marks and apostrophes go before the words are read');
eq(hygieneReason({ title: 'Sales Engineer' }), 'title names a sales, recruiting, trainee or labourer role', 'a sales engineer is hygiene');
eq(hygieneReason({ title: 'VENDEDOR/A, INTERIORISTA, DISEÑADOR/A' }), 'title names a sales, recruiting, trainee or labourer role', 'so is a Spanish shop assistant, whatever else the title says');
eq(hygieneReason({ title: 'PEONES DE LA INDUSTRIA METALÚRGICA' }), 'title names a sales, recruiting, trainee or labourer role', 'and a labourer');
eq(hygieneReason({ title: 'Ingeniero/a de procesos' }), null, 'an engineer is not');

// ── Places ──────────────────────────────────────────────────────────────
eq(placeOf('Gorinchem, Netherlands', cc), { cc: 'nl', city: 'Gorinchem' }, 'country name and a known city');
eq(placeOf('Madrid, ES', cc), { cc: 'es', city: 'Madrid' }, 'an ISO code as its own word');
eq(placeOf('Stavanger', cc), { cc: 'no', city: 'Stavanger' }, 'a city alone names its country');
eq(placeOf('Remote - Europe', cc), { cc: 'xx', city: '' }, 'remote is its own place');
eq(placeOf('Houston, TX, United States', cc), { cc: '', city: 'Houston' }, 'outside Europe: no country, the city kept for the record');
eq(placeOf('München', cc), { cc: 'de', city: 'München' }, 'a native spelling');
eq(placeOf('', cc), { cc: '', city: '' }, 'nothing is nothing');

// ── Addresses and ids ───────────────────────────────────────────────────
eq(normUrl('https://jobs.example.com/view/12?utm_source=x&id=7#top'), 'https://jobs.example.com/view/12?id=7', 'campaign tail and fragment go, a real parameter stays');
eq(idFor('https://jobs.example.com/view/12?utm_source=x'), idFor('https://jobs.example.com/view/12/'), 'the id survives the tail and the slash');
eq(idFor('https://a.example/1').length, 8, 'eight characters');

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
  const ab = ATS.ashby.parse({ jobs: [{ id: 'z', title: 'Hardware Engineer', location: 'Berlin', jobUrl: 'https://jobs.ashbyhq.com/x/z', publishedAt: '2026-09-02T00:00:00Z', descriptionPlain: 'Plain.', isRemote: false }] }, 'x', 'Acme');
  eq([ab[0].title, ab[0].location, ab[0].posted], ['Hardware Engineer', 'Berlin', '2026-09-02'], 'Ashby: plain fields');
}

done();
