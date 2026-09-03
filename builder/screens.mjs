// ➤ Two facts read from an advert's text at build time, so the visitor's browser can apply
// ➤ the degree and language rules without the whole text: which degree families the
// ➤ advert DEMANDS, and which languages it REQUIRES. The rule is Argus's: a language or a
// ➤ degree mentioned as "a plus" or "not required" does not count; only a demand does.
import { fold } from 'argus/server-bot/text.mjs';
import { sentences } from './excerpt.mjs';

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const words = list => new RegExp(`(?:^|[^a-z0-9])(?:${list.map(w => escapeRe(fold(w)).replace(/\s+/g, '\\s+')).join('|')})(?![a-z0-9])`);
// ➤ A language name may carry a tail: "Deutschkenntnisse", "Englischkenntnisse", "Nederlandstalig".
const names = list => new RegExp(`(?:^|[^a-z0-9])(?:${list.map(w => escapeRe(fold(w)).replace(/\s+/g, '\\s+')).join('|')})`);

export function compileScreens({ degrees, languages }) {
  return {
    degreeWord: new RegExp(`(?:^|[^a-z0-9])(?:${degrees.words})(?![a-z0-9])`),
    degrees: degrees.degrees.map(d => ({ id: d.id, re: new RegExp(`(?:^|[^a-z0-9])(?:${d.stems})`) })),
    languages: languages.languages.map(l => ({ code: l.code, re: names(l.names) })),
    required: words(languages.required),
    softened: words(languages.softened),
  };
}

// ➤ Degree families an advert demands: a sentence with a degree word and a family stem,
// ➤ not softened. Several families in one sentence ("mechanical or electrical
// ➤ engineering") are all listed: the visitor needs one of them.
export function requiredDegrees(text, s) {
  const out = new Set();
  for (const raw of sentences(text)) {
    const f = fold(raw);
    if (!s.degreeWord.test(f) || s.softened.test(f)) continue;
    for (const d of s.degrees) if (d.re.test(f)) out.add(d.id);
  }
  // ➤ The generic "an engineering degree" says nothing more when a field was named.
  if (out.size > 1) out.delete('engineering-any');
  return [...out];
}

// ➤ Languages an advert requires: a language name in a sentence that demands it, without
// ➤ a softener. The sentence after a demand can take it back ("not required").
export function requiredLanguages(text, s) {
  const out = new Set();
  const all = sentences(text).map(fold);
  all.forEach((f, i) => {
    if (!s.required.test(f) || s.softened.test(f)) return;
    const next = all[i + 1] || '';
    // ➤ A softener in the next sentence takes the demand back when it names the same
    // ➤ language, or names none ("Actually not required for this position").
    const takenBack = s.softened.test(next);
    for (const l of s.languages) {
      if (!l.re.test(f)) continue;
      if (takenBack && (l.re.test(next) || !s.languages.some(x => x.re.test(next)))) continue;
      out.add(l.code);
    }
  });
  return [...out];
}
