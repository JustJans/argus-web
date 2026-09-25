// ➤ Two facts read from an advert's text at build time, so the visitor's browser can apply
// ➤ the degree and language rules without the whole text: which degree families the
// ➤ advert DEMANDS, and which languages it REQUIRES. The rule is Argus's: a language or a
// ➤ degree mentioned as "a plus" or "not required" does not count; only a demand does. A
// ➤ demand read where there is none leaves a good offer out for the visitor, so the readings
// ➤ below lean to reading less.
import { fold } from 'argus/server-bot/text.mjs';
import { sentences } from './sentences.mjs';

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const alternatives = list => list.map(w => escapeRe(fold(w)).replace(/\s+/g, '\\s+')).join('|');
const words = list => new RegExp(`(?:^|[^a-z0-9])(?:${alternatives(list)})(?![a-z0-9])`);
// ➤ A language's name as a whole word, or with the tail that makes it "knowledge of" or
// ➤ "speaking" it ("Deutschkenntnisse", "Nederlandstalig", "englischsprachig"); not the
// ➤ country ("Germany", "Deutschland") or another word that starts the same ("polished").
const TAILS = '(?:kenntnisse?|sprachkenntnisse|sprachig[a-z]*|talig[a-z]*|talende|talande|sprakig[a-z]*|kunskap[a-z]*|kunnskap[a-z]*)?';
// ➤ Names that, folded, are ordinary words in an advert: Spanish "fines" (purposes), English
// ➤ "fins" and "pools", Italian and Spanish "romana", German "Italien" (Italy). The catalogue
// ➤ keeps them (a CV that says "finés" means Finnish); an advert's text is not read by them.
const AMBIGUOUS = new Set(['fines', 'fins', 'pools', 'romana', 'italien']);
const names = list => new RegExp(`(?:^|[^a-z0-9])(?:${alternatives(list.filter(n => !AMBIGUOUS.has(fold(n))))})${TAILS}(?![a-z0-9])`);
// ➤ "Master" that names no degree ("Scrum Master", "master data", a master plan), "Czech
// ➤ Republic" (the country, not the language), and the Dutch "WO" only as a level ("WO-niveau"),
// ➤ never the German "wo" (where).
const NOT_A_DEGREE = /(?:scrum|quarter|web|head|post|ring|grand|toast)\s*master|master\s*(?:data|plan|file|schedul[a-z]*|class|key|copy|record|mind|piece|card|chef|brewer)/g;
const cleaned = f => f.replace(NOT_A_DEGREE, ' ').replace(/czech\s+republic/g, 'czechia');
// ➤ Words that name a place of study rather than a degree ("near the university", "Studium",
// ➤ "formación"): they count only in a sentence that demands something.
const WEAK = ['university', 'universidad', 'universite', 'universitat', 'universitet', 'universitair', 'hogeskole', 'hogskole', 'studium', 'studiengang', 'formacion', 'formation', 'opleiding', 'utbildning', 'utdanning'];
const DEMANDS = ['abgeschlossen', 'abgeschlossenes', 'abgeschlossener', 'completed', 'minimum'];

export function compileScreens({ degrees, languages }) {
  const all = String(degrees.words).split('|');
  const strong = all.filter(w => !WEAK.includes(w) && w !== 'wo');
  return {
    degreeWord: new RegExp(`(?:^|[^a-z0-9])(?:${[...strong, 'wo[ -](?:niveau|opleiding|diploma|bachelor|master)'].join('|')})(?![a-z0-9])`),
    weakDegreeWord: new RegExp(`(?:^|[^a-z0-9])(?:${all.filter(w => WEAK.includes(w)).join('|')})(?![a-z0-9])`),
    degrees: degrees.degrees.map(d => ({ id: d.id, re: new RegExp(`(?:^|[^a-z0-9])(?:${d.stems})`) })),
    languages: languages.languages.map(l => ({ code: l.code, re: names(l.names) })),
    required: words(languages.required),
    demanded: words([...languages.required, ...DEMANDS]),
    softened: words(languages.softened),
  };
}

// ➤ The parts of a text a demand or a softener speaks for: its sentences, and within one, the
// ➤ parts a semicolon keeps apart ("Fluent German is required; English is a plus").
const clauses = text => sentences(text).flatMap(s => s.split(/\s*;\s*/)).map(c => cleaned(fold(c))).filter(Boolean);

// ➤ Degree families an advert demands: a part with a degree word and a family stem, not
// ➤ softened. Several families in one part ("mechanical or electrical engineering") are all
// ➤ listed: the visitor needs one of them.
export function requiredDegrees(text, s) {
  const out = new Set();
  for (const f of clauses(text)) {
    const named = s.degreeWord.test(f) || (s.weakDegreeWord.test(f) && s.demanded.test(f));
    if (!named || s.softened.test(f)) continue;
    for (const d of s.degrees) if (d.re.test(f)) out.add(d.id);
  }
  // ➤ The generic "an engineering degree" says nothing more when a field was named.
  if (out.size > 1) out.delete('engineering-any');
  return [...out];
}

// ➤ Languages an advert requires: a language name in a part that demands it, without a
// ➤ softener. The part after a demand can take it back ("not required").
export function requiredLanguages(text, s) {
  const out = new Set();
  const all = clauses(text);
  all.forEach((f, i) => {
    if (!s.required.test(f) || s.softened.test(f)) return;
    const next = all[i + 1] || '';
    // ➤ A softener in the next part takes the demand back when it names the same language, or
    // ➤ names none ("Actually not required for this position").
    const takenBack = s.softened.test(next);
    for (const l of s.languages) {
      if (!l.re.test(f)) continue;
      if (takenBack && (l.re.test(next) || !s.languages.some(x => x.re.test(next)))) continue;
      out.add(l.code);
    }
  });
  return [...out];
}
