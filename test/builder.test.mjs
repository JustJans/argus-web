// ➤ The builder's pure parts, without a network: the gate, the place reader, the excerpts,
// ➤ the record, the dedupe and the shards. The sources' parsers are fed recorded answers.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { harness } from 'argus/server-bot/test-harness.mjs';
import { compileFamilies, familiesOf, hygieneReason } from '../builder/gate.mjs';
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
const families = JSON.parse(readFileSync(join(ROOT, 'catalogues', 'families.json'), 'utf-8')).families;
const countries = JSON.parse(readFileSync(join(ROOT, 'catalogues', 'countries.json'), 'utf-8')).countries;
const gate = compileFamilies(families);
const cc = compileCountries(countries);

// ── The gate ────────────────────────────────────────────────────────────
eq(familiesOf({ title: 'Säkerhetskontrollant', codes: { ssyk: 'PRQn_9yw_NJA' } }, gate), ['mechanical'], 'a Swedish SSYK code decides, whatever the title says');
ok(familiesOf({ title: 'Anything', codes: { isco: '2142' } }, gate).includes('civil-structural'), 'an ISCO code decides too');
eq(familiesOf({ title: 'Mechanical Design Engineer', codes: {} }, gate), ['mechanical'], 'no code: the English title');
ok(familiesOf({ title: 'INGENIERO/A TÉCNICO/A O INDUSTRIAL JUNIOR', codes: {} }, gate).includes('engineering-other'), 'a Spanish title with gender marks still reads as an engineer');
ok(familiesOf({ title: "Enginyer/a d'automatització", codes: {} }, gate).includes('automation-instrumentation'), 'a Catalan title with an apostrophe');
eq(familiesOf({ title: 'Ingénieur études et conception mécanique H/F', codes: {} }, gate), ['mechanical'], 'accents do not get in the way, and a specific family silences the catch-all');
eq(familiesOf({ title: 'Fisioterapeuta', codes: {} }, gate), [], 'a physiotherapist is outside the vertical');
eq(familiesOf({ title: 'Software Engineer', codes: {} }, gate), ['engineering-other'], 'a software engineer only matches the generic word — the visitor\'s roles refine it');
ok(!familiesOf({ title: 'Ingeniería del software - Comercial', codes: {} }, gate).includes('mechanical'), 'a word inside another word does not match');
eq(hygieneReason({ title: 'Sales Engineer' }), 'title names a sales, recruiting or trainee role', 'a sales engineer is hygiene');
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
  const rec = toRecord(raw, ['marine-offshore'], cc);
  eq([rec.t, rec.c, rec.cc, rec.ci, rec.u, rec.s, rec.f, rec.y, rec.tl], ['Marine Engineer', 'Damen', 'nl', 'Gorinchem', 'https://jobs.lever.co/damen/1', 'lever', ['marine-offshore'], 3, 'en'], 'the fields, cleaned');
  ok(rec.rq.includes('3 years'), 'the years sentence is in the requirements excerpt');
  ok(!('k' in rec), 'no code when the source had none');
  const sv = toRecord({ source: 'jobtech', title: 'Maskiningenjör', company: 'AB', location: 'Göteborg, Sweden', country: 'se', city: 'Göteborg', url: 'https://arbetsformedlingen.se/platsbanken/annonser/1', description: '', posted: '2026-09-02', expires: '2026-10-01', codes: { ssyk: 'PRQn_9yw_NJA' }, lang: 'sv' }, ['mechanical'], cc);
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
    { id: 'a', f: ['mechanical'], cc: 'es', d: '2026-09-01' },
    { id: 'b', f: ['mechanical', 'marine-offshore'], cc: 'es', d: '2026-09-02' },
    { id: 'c', f: ['mechanical'], cc: '', d: '2026-09-03' },
  ];
  const { files, families: idx } = buildShards(recs, families, '2026-09-03T00:00:00Z');
  eq(Object.keys(files).sort(), ['offers/marine-offshore-es.json', 'offers/mechanical-es.json', 'offers/mechanical-zz.json'], 'one file per family and country, unknown country as zz');
  eq(JSON.parse(files['offers/mechanical-es.json']).offers.map(o => o.id), ['b', 'a'], 'newest first');
  eq(idx.mechanical.countries.es.n, 2, 'the index counts');
  eq(idx['marine-offshore'].countries.es.files, ['offers/marine-offshore-es.json'], 'and names the files');
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
  const json = '{"document": {"date": "x", "list": [{"element": {"attribute": [{"name": "Identificador", "valor": "9"}, {"name": "Titulo_es", "text": "Ingeniero de procesos para Burgos"}, {"name": "Provincia", "valor": [{"string": "Burgos"}]}, {"name": "FechaPublicacion", "date": "20260902"}, {"name": "Descripcion_es", "text": "<p>Se requieren <strong>3 a&ntilde;os</strong> de experiencia.</p>"}, {"name": "LocalidadAsset_NombreLocalidad", "valor": "Miranda de Ebro"}, {"name": "FuenteContenido", "valor": "Infoempleo"}, {"name": "Enlace al contenido", "valor": "https://empleo.jcyl.es/oferta/9"}]}}]}}';
  const rows = parseJcyl(json);
  eq(rows.length, 1, 'the control character does not break the parse');
  eq([rows[0].title, rows[0].location, rows[0].posted, rows[0].origin, rows[0].url], ['Ingeniero de procesos para Burgos', 'Miranda de Ebro, Burgos, Spain', '2026-09-02', 'Infoempleo', 'https://empleo.jcyl.es/oferta/9'], 'attributes flattened into fields');
  ok(rows[0].description.includes('3 años'), 'the HTML body is turned into text with its entities decoded');
}
{
  const gh = ATS.greenhouse.parse({ jobs: [{ id: 1, title: 'Naval Architect', location: { name: 'Rotterdam, Netherlands' }, absolute_url: 'https://boards.greenhouse.io/x/jobs/1', updated_at: '2026-09-01T10:00:00Z', content: '&lt;p&gt;Design &amp; build.&lt;/p&gt;' }] });
  eq([gh[0].title, gh[0].location, gh[0].description, gh[0].posted], ['Naval Architect', 'Rotterdam, Netherlands', 'Design & build.', '2026-09-01'], 'Greenhouse: escaped HTML content becomes text');
  const lv = ATS.lever.parse([{ id: 'a', text: 'PLC Engineer', categories: { location: 'Remote' }, hostedUrl: 'https://jobs.lever.co/x/a', createdAt: 1756720000000, descriptionPlain: 'Intro.', lists: [{ text: 'Requirements', content: '<li>2 years</li>' }], workplaceType: 'remote' }]);
  eq([lv[0].title, lv[0].remote, lv[0].description.includes('2 years')], ['PLC Engineer', true, true], 'Lever: lists join the description, remote is read');
  const rc = ATS.recruitee.parse({ offers: [{ id: 5, title: 'Commissioning Engineer', city: 'Bilbao', country: 'Spain', careers_url: 'https://x.recruitee.com/o/c', description: '<p>Body</p>', requirements: '<ul><li>Degree</li></ul>', published_at: '2026-08-30' }] });
  eq([rc[0].location, rc[0].description.includes('Degree'), rc[0].posted], ['Bilbao, Spain', true, '2026-08-30'], 'Recruitee: city and country, requirements appended');
  const pe = ATS.personio.parse('<workzag-jobs><position><id>77</id><name>Konstrukteur (m/w/d)</name><office>Kiel</office><createdAt>2026-08-29</createdAt><jobDescriptions><jobDescription><name>Aufgaben</name><value><![CDATA[<p>Konstruktion.</p>]]></value></jobDescription></jobDescriptions></position></workzag-jobs>', 'acme');
  eq([pe[0].title, pe[0].location, pe[0].url, pe[0].description], ['Konstrukteur (m/w/d)', 'Kiel', 'https://acme.jobs.personio.de/job/77', 'Konstruktion.'], 'Personio: XML positions with CDATA bodies');
  const ab = ATS.ashby.parse({ jobs: [{ id: 'z', title: 'Hardware Engineer', location: 'Berlin', jobUrl: 'https://jobs.ashbyhq.com/x/z', publishedAt: '2026-09-02T00:00:00Z', descriptionPlain: 'Plain.', isRemote: false }] });
  eq([ab[0].title, ab[0].location, ab[0].posted], ['Hardware Engineer', 'Berlin', '2026-09-02'], 'Ashby: plain fields');
}

done();
