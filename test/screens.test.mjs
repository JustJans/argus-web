// ➤ The two facts the builder reads for the visitor's screens: the degree an advert
// ➤ demands and the language it requires, in the languages adverts come in.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { harness } from 'argus/server-bot/test-harness.mjs';
import { compileScreens, requiredDegrees, requiredLanguages } from '../builder/screens.mjs';

const { ok, eq, done } = harness('screens');
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const s = compileScreens({ degrees: JSON.parse(readFileSync(join(ROOT, 'catalogues', 'degrees.json'), 'utf-8')), languages: JSON.parse(readFileSync(join(ROOT, 'catalogues', 'languages.json'), 'utf-8')) });

eq(requiredDegrees('Bachelor or Master in Mechanical Engineering required.', s), ['mechanical'], 'an English degree demand');
eq(requiredDegrees('Titulación: Ingeniería Industrial o Mecánica.', s).sort(), ['industrial', 'mechanical'], 'two Spanish fields in one sentence: either will do');
eq(requiredDegrees('Abgeschlossenes Studium im Bereich Elektrotechnik.', s).includes('electrical'), true, 'a German Studium');
eq(requiredDegrees('Afgeronde HBO opleiding werktuigbouwkunde.', s), ['mechanical'], 'a Dutch HBO');
eq(requiredDegrees('Civilingenjör inom kemiteknik.', s), ['chemical'], 'a Swedish civilingenjör');
eq(requiredDegrees('An engineering degree is required.', s), ['engineering-any'], 'a degree with no field named is the generic one');
eq(requiredDegrees('Engineering degree, preferably in naval architecture.', s), ['naval'], 'the generic word steps back when a field is named');
eq(requiredDegrees('A degree in physics would be a plus.', s), [], 'a softened mention is not a demand');
eq(requiredDegrees('We are a mechanical engineering company with 20 years of history.', s), [], 'no degree word, no demand');

eq(requiredLanguages('Fluent German is required for this role.', s), ['de'], 'an English demand of German');
eq(requiredLanguages('Imprescindible nivel alto de inglés.', s), ['en'], 'a Spanish demand of English');
eq(requiredLanguages('Sehr gute Deutschkenntnisse erforderlich.', s), ['de'], 'a German demand of German');
eq(requiredLanguages('Je spreekt vloeiend Nederlands.', s), ['nl'], 'a Dutch demand of Dutch');
eq(requiredLanguages('Du behärskar svenska flytande i tal och skrift.', s), ['sv'], 'a Swedish demand of Swedish');
eq(requiredLanguages('Flytende norsk kreves.', s), ['no'], 'a Norwegian demand of Norwegian');
eq(requiredLanguages('French is a plus. English required.', s), ['en'], 'a plus is not a demand; a demand is');
eq(requiredLanguages('German required. Actually not required for this position.', s), [], 'the next sentence can take it back');
eq(requiredLanguages('Our office is in Germany, near the German border.', s), [], 'a country is not a language demand');
eq(requiredLanguages('Excellent communication skills in English and Spanish are essential.', s).sort(), ['en', 'es'], 'two languages in one demand');

done();
