// ➤ What the CV reader suggests, on two CVs written the way people write them.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { harness } from 'argus/server-bot/test-harness.mjs';
import { readCv } from '../app/lib/cv.js';

const { ok, eq, done } = harness('cv');
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const load = n => JSON.parse(readFileSync(join(ROOT, 'catalogues', `${n}.json`), 'utf-8'));
const cats = { families: load('families'), languages: load('languages'), degrees: load('degrees') };

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
  eq(s.families[0], 'marine-offshore', 'the marine family comes first, from the job titles');
  ok(!s.families.includes('architecture-planning'), 'a naval architect does not make the CV an architect\'s');
  ok(s.roles.includes('mooring engineer') && s.roles.includes('naval architect') && !s.roles.includes('architect'), 'the role words are the titles found, and "architect" alone is not one of them');
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
  ok(s.families.includes('drafting-cad') && s.families.includes('engineering-other') === false, 'families from the titles, the catch-all silenced when others exist');
}
eq(readCv('', cats).degrees.length, 0, 'nothing in, nothing out');

done();
