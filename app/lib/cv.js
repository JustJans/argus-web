// ➤ What a CV suggests for the profile, read on the device from its text alone: the degree
// ➤ families it names, the languages it lists with a level, the engineering families its
// ➤ job titles belong to. Nothing identifying is looked for and nothing leaves this
// ➤ function but those suggestions. Pure, so Node tests run it as the browser does. Argus's
// ➤ own CV readers (onboarding.mjs) need Node today; this stands in until Argus exports them
// ➤ for the browser, and the accent folding is Argus's.
import { fold } from './engine.js';
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// ➤ A level worth calling "a language you work in", and the levels that are not.
const LEVEL = /\b(?:native|fluent|bilingual|c1|c2|b1|b2|advanced|upper intermediate|intermediate|working knowledge|professional|nativo|nativa|fluido|fluida|avanzado|avanzada|intermedio|intermedia|bilingue|nivel|niveau|courant|maternelle|muttersprache|fliessend|verhandlungssicher|moedertaal|vloeiend|goed|flytande|modersmal|flytende|morsmal)\b/;
const LOW = /\b(?:a1|a2|basic|basico|basica|beginner|elementary|notions|nociones|grundkenntnisse|debutant|basis|nyborjare|nybegynner)\b/;
const SECTION = /\b(?:languages?|idiomas?|langues?|sprachen|talen|sprak|lingue|linguas?)\b/;
// ➤ "Spanish (native), English (C1), Dutch (A2)" is three statements on one line.
const segments = line => line.split(/[,;/•|.]+/).map(s => s.trim()).filter(Boolean);

export function readCv(text, catalogues) {
  const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const folded = lines.map(fold);
  const whole = folded.join('\n');

  // ➤ Degrees: a line with a degree word and a family stem.
  const degreeWord = new RegExp(`(?:^|[^a-z0-9])(?:${catalogues.degrees.words})(?![a-z0-9])`);
  const degrees = [];
  for (const d of catalogues.degrees.degrees) {
    const stem = new RegExp(`(?:^|[^a-z0-9])(?:${d.stems})`);
    if (folded.some(l => degreeWord.test(l) && stem.test(l))) degrees.push(d.id);
  }
  if (degrees.length > 1 && degrees.includes('engineering-any')) degrees.splice(degrees.indexOf('engineering-any'), 1);

  // ➤ Languages: a language name next to a level that is not a beginner's, or within a
  // ➤ few lines of a "Languages" heading; each statement on a line is read on its own.
  const languages = [];
  const headingAt = folded.findIndex(l => l.length <= 30 && SECTION.test(l));
  for (const lang of catalogues.languages.languages) {
    const re = new RegExp(`(?:^|[^a-z0-9])(?:${lang.names.map(escapeRe).join('|')})(?![a-z0-9])`);
    const hit = folded.some((l, i) => segments(l).some(seg => re.test(seg) && !LOW.test(seg) && (LEVEL.test(seg) || (headingAt >= 0 && i > headingAt && i <= headingAt + 8))));
    if (hit) languages.push(lang.code);
  }

  // ➤ Families and roles: the family terms found in the whole text, most frequent first.
  const hits = [];
  for (const f of catalogues.families.families) {
    let n = 0; const found = [];
    const unless = (f.unless || []).length ? new RegExp(`(?:^|[^a-z0-9])(?:${f.unless.map(u => escapeRe(fold(u))).join('|')})(?![a-z0-9])`) : null;
    for (const term of f.terms) {
      const re = new RegExp(`(?:^|[^a-z0-9])${escapeRe(fold(term)).replace(/\s+/g, '\\s+')}(?![a-z0-9])`, 'g');
      // ➤ Counted line by line, so an "unless" word on the same line vetoes that hit.
      for (const l of folded) {
        const m = l.match(re);
        if (m && !(unless && unless.test(l))) { n += m.length; if (!found.includes(term)) found.push(term); }
      }
    }
    if (n) hits.push({ id: f.id, n, found });
  }
  hits.sort((a, b) => b.n - a.n);
  let families = hits.map(h => h.id);
  if (families.length > 1) families = families.filter(id => id !== 'engineering-other');
  const roles = [...new Set(hits.filter(h => h.id !== 'engineering-other').flatMap(h => h.found))].slice(0, 4);

  return { degrees, languages, families: families.slice(0, 4), roles, chars: String(text || '').length };
}
