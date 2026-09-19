// ➤ The one rule for reading a job title against lists of known titles, shared by the pile's
// ➤ gate (Node, with Argus's fold) and the CV reader (browser, with the engine's fold), which
// ➤ is why `fold` is passed in. Titles compare folded, with apostrophes read as spaces; on one
// ➤ text the longest match wins ("naval architect" is not an "architect"); among equal matches
// ➤ the family that names the occupation beats those that list it as an alternative.
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function titleRules(fold) {
  const clean = s => fold(String(s || '')).replace(/['’]/g, ' ').replace(/\s+/g, ' ').trim();
  const phrase = s => escapeRe(clean(s)).replace(/ /g, '\\s+');
  // ➤ One regex over many titles, longest first so the alternation prefers the longer one.
  const alternation = labels => {
    const uniq = [...new Set((labels || []).map(clean).filter(Boolean))].sort((a, b) => b.length - a.length);
    return uniq.length ? new RegExp(`(?:^|[^a-z0-9])(${uniq.map(phrase).join('|')})(?![a-z0-9])`, 'g') : null;
  };
  const matches = (re, text) => { if (!re) return []; re.lastIndex = 0; return [...text.matchAll(re)].map(m => m[1]); };
  const inside = (a, b) => a !== b && new RegExp(`(?:^|[^a-z0-9])${phrase(a)}(?![a-z0-9])`).test(b);
  // ➤ hits: [{ id, text, named }] found in one text; others: texts found by other lists that
  // ➤ count for length too (the gate's blockers). Returns the hits that stand.
  const winners = (hits, others = []) => {
    const all = [...hits.map(h => h.text), ...others];
    const longest = hits.filter(h => !all.some(o => inside(h.text, o)));
    return longest.filter(h => h.named || !longest.some(o => o.text === h.text && o.named));
  };
  return { clean, phrase, alternation, matches, inside, winners };
}
