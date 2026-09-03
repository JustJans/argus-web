// ➤ Which engineering families an advert belongs to, and whether it is in Europe at all.
// ➤ A source that classifies its adverts (an SSYK or ISCO code) decides by code; a board
// ➤ that does not is decided by the family's title terms, whole-word and accent-blind.
import { fold } from 'argus/server-bot/text.mjs';

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ➤ Compiles the families once: a term regex per family plus code lookups.
export function compileFamilies(families) {
  const byIsco = new Map(), bySsyk = new Map();
  const compiled = families.map(f => {
    for (const c of f.isco || []) byIsco.set(c, [...(byIsco.get(c) || []), f.id]);
    for (const c of f.ssyk || []) bySsyk.set(c, [...(bySsyk.get(c) || []), f.id]);
    const terms = (f.terms || []).map(t => escapeRe(fold(t)).replace(/\s+/g, '\\s+'));
    return { id: f.id, re: terms.length ? new RegExp(`(?:^|[^a-z0-9])(?:${terms.join('|')})(?![a-z0-9])`) : null };
  });
  return { compiled, byIsco, bySsyk };
}

// ➤ The families of one advert: by its codes when it has any the catalogue knows, else by
// ➤ its title. Returns [] for an advert outside the vertical.
export function familiesOf(raw, { compiled, byIsco, bySsyk }) {
  const out = new Set();
  const codes = raw.codes || {};
  if (codes.ssyk && bySsyk.has(codes.ssyk)) for (const f of bySsyk.get(codes.ssyk)) out.add(f);
  if (codes.isco && byIsco.has(String(codes.isco).slice(0, 4))) for (const f of byIsco.get(String(codes.isco).slice(0, 4))) out.add(f);
  if (out.size) return [...out];
  // ➤ Gender marks ("Ingeniero/a", "Enginyer/a") and apostrophes go before the words are
  // ➤ read; the catch-all family only speaks when no specific one did.
  const title = fold(raw.title || '').replace(/\/(?:a|o|as|os|es|ra|ora|ores|e|in)(?![a-z])/g, '').replace(/['’]/g, ' ');
  for (const f of compiled) if (f.id !== 'engineering-other' && f.re && f.re.test(title)) out.add(f.id);
  if (!out.size) { const generic = compiled.find(f => f.id === 'engineering-other'); if (generic?.re?.test(title)) out.add(generic.id); }
  return [...out];
}

// ➤ Title terms that mean "not the job you think": a sales role that names a product, a
// ➤ recruiter hiring engineers, an internship. Kept short; the visitor has vetoes of their
// ➤ own in the profile code.
const HYGIENE = /(?:^|[^a-z0-9])(?:sales|account manager|recruiter|talent acquisition|internship|intern|praktikum|stagiaire|stage\b|becario|prácticas|apprentice|apprenti|azubi|trainee)(?![a-z0-9])/;
export function hygieneReason(raw) {
  return HYGIENE.test(fold(raw.title || '')) ? 'title names a sales, recruiting or trainee role' : null;
}
