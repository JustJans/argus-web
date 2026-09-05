// ➤ What a CV suggests for the profile, read on the device from its text alone: the degree
// ➤ families it names, the languages it lists with a level, the occupations its job titles
// ➤ belong to. Nothing identifying is looked for and nothing leaves this function but those
// ➤ suggestions. Pure, so Node tests run it as the browser does. Argus's own CV readers
// ➤ (onboarding.mjs) need Node today; this stands in until Argus exports them for the
// ➤ browser, and the accent folding is Argus's.
import { fold } from './engine.js';
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// ➤ Apostrophes read as spaces on both sides, as the gate does ("d'études" and "d études" are one).
const clean = s => fold(s).replace(/['’]/g, ' ').trim();
const phrase = s => escapeRe(clean(s)).replace(/\s+/g, '\\s+');
// ➤ A level worth calling "a language you work in", and the levels that are not.
const LEVEL = /\b(?:native|fluent|bilingual|c1|c2|b1|b2|advanced|upper intermediate|intermediate|working knowledge|professional|nativo|nativa|fluido|fluida|avanzado|avanzada|intermedio|intermedia|bilingue|nivel|niveau|courant|maternelle|muttersprache|fliessend|verhandlungssicher|moedertaal|vloeiend|goed|flytande|modersmal|flytende|morsmal)\b/;
const LOW = /\b(?:a1|a2|basic|basico|basica|beginner|elementary|notions|nociones|grundkenntnisse|debutant|basis|nyborjare|nybegynner)\b/;
const SECTION = /\b(?:languages?|idiomas?|langues?|sprachen|talen|sprak|lingue|linguas?)\b/;
// ➤ "Spanish (native), English (C1), Dutch (A2)" is three statements on one line.
const segments = line => line.split(/[,;/•|.]+/).map(s => s.trim()).filter(Boolean);

// ➤ catalogues.familyTerms: { familyId: { labels: { lang: [job titles] }, preferred: [names] } },
// ➤ ESCO's titles per family as the site ships them (catalogues/family-terms.json), all
// ➤ languages at once since a CV may be in any.
export function readCv(text, catalogues) {
  const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const folded = lines.map(clean);

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

  // ➤ Occupations: every ESCO title found, line by line, most frequent family first. On one
  // ➤ line the longest title wins ("naval architect" does not also count as "architect"), and
  // ➤ a title that is the name of an occupation in one family beats the families that only
  // ➤ list it as an alternative, as the gate does.
  const compiled = Object.entries(catalogues.familyTerms || {}).map(([id, t]) => {
    const labels = [...new Set(Object.values(t.labels || {}).flat().map(clean).filter(Boolean))].sort((a, b) => b.length - a.length);
    return { id, preferred: new Set((t.preferred || []).map(clean)), re: labels.length ? new RegExp(`(?:^|[^a-z0-9])(${labels.map(phrase).join('|')})(?![a-z0-9])`, 'g') : null };
  });
  const inside = (a, b) => a !== b && new RegExp(`(?:^|[^a-z0-9])${phrase(a)}(?![a-z0-9])`).test(b);
  const counts = new Map(), found = new Map();
  for (const l of folded) {
    const hits = [];
    for (const f of compiled) { if (!f.re) continue; f.re.lastIndex = 0; for (const m of l.matchAll(f.re)) hits.push({ id: f.id, text: m[1], named: f.preferred.has(m[1]) }); }
    const longest = hits.filter(h => !hits.some(o => inside(h.text, o.text)));
    for (const h of longest) {
      if (!h.named && longest.some(o => o.text === h.text && o.named)) continue;
      counts.set(h.id, (counts.get(h.id) || 0) + 1);
      if (!(found.get(h.id) || []).includes(h.text)) found.set(h.id, [...(found.get(h.id) || []), h.text]);
    }
  }
  const families = [...counts].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  const roles = [...new Set(families.flatMap(id => found.get(id)))].slice(0, 4);

  return { degrees, languages, families: families.slice(0, 4), roles, chars: String(text || '').length };
}
