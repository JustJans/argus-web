// ➤ What the CV reader suggests, on two CVs written the way people write them. The occupation
// ➤ titles are the ones the site ships (ESCO's per family, built as build-site builds them).
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { harness } from 'argus/server-bot/test-harness.mjs';
import { readCv } from '../app/lib/cv.js';
import { familyTerms } from '../builder/gate.mjs';

const { ok, eq, done } = harness('cv');
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const read = p => JSON.parse(readFileSync(join(ROOT, ...p.split('/')), 'utf-8'));
const families = read('catalogues/families.json');
const cats = { families, languages: read('catalogues/languages.json'), degrees: read('catalogues/degrees.json'), familyTerms: familyTerms(families, { isco: read('catalogues/codes/isco.json') }) };

const english = `Jane Doe
Naval architect with 2 years in offshore mooring design.
EXPERIENCE
Mooring Engineer, Acme Offshore, 2024-2026
Naval Architect (graduate), Shipyard BV, 2023-2024
EDUCATION
MSc Naval Architecture and Marine Engineering, Delft University of Technology, 2023
BSc Mechanical Engineering, University of Cadiz, 2021
LANGUAGES
Spanish (native), English (C1), Dutch (A2)
SKILLS
OrcaFlex, AutoCAD, Python`;
{
  const s = readCv(english, cats);
  eq(s.degrees.sort(), ['mechanical', 'naval'], 'the two degrees, by their lines');
  eq(s.languages.sort(), ['en', 'es'], 'languages with a level; the A2 one is not claimed');
  eq(s.families[0], '2144', 'mechanical engineers (where ISCO files the naval architect) comes first, from the job titles');
  ok(!s.families.includes('2161'), 'a naval architect does not make the CV an architect\'s');
  ok(s.roles.includes('naval architect') && !s.roles.includes('architect'), 'the title words are the occupations found, and "architect" alone is not one of them');
}

const spanish = `Perfil
Ingeniero industrial junior, especialidad mecánica.
Experiencia
Ingeniero de mantenimiento industrial, Fábrica S.A., 2025
Delineante proyectista, Estudio Técnico, 2023-2024
Formación
Grado en Ingeniería Mecánica, Universidad de Sevilla, 2023
Idiomas
Español nativo. Inglés nivel B2. Francés básico.`;
{
  const s = readCv(spanish, cats);
  eq(s.degrees, ['mechanical'], 'a Spanish grado');
  eq(s.languages.sort(), ['en', 'es'], 'the two languages with a working level; "básico" does not count');
  ok(s.families.includes('2141') && s.families.includes('3118'), `industrial engineers and draughtspersons, from the titles (${s.families.join(', ')})`);
  ok(!s.families.includes('3115'), '"ingeniero industrial" names industrial engineers and is only an alternative title for a mechanical technician: the name wins');
  ok(s.roles.includes('ingeniero industrial') && s.roles.includes('delineante'), 'the title words are the Spanish occupations found');
}
eq(readCv('', cats).degrees.length, 0, 'nothing in, nothing out');
eq(readCv(english, { ...cats, familyTerms: {} }).families.length, 0, 'without the occupation titles, no occupations and no crash');

done();
