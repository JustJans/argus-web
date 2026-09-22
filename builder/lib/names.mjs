// ➤ The name people know for a Workday board. The board's address carries the brand, glued or
// ➤ abbreviated ("bakerhughes", "bah", "adobe"); a vacancy page carries a legal entity, often a
// ➤ subsidiary somewhere else ("12340 Haleon Brasil Ltda."). So the address decides, and the
// ➤ legal name only spells it out: the words of the legal name that spell the address ("Baker
// ➤ Hughes") or whose initials make it ("Booz Allen Hamilton"). A name that is plainly not a
// ➤ name ("GERMANY", "CORPORATE", "Cox 1", "TRUMPF Students") is mended; anything else stays.
import { fold } from 'argus/server-bot/text.mjs';

const letters = s => fold(String(s || '')).replace(/[^a-z0-9]/g, '');
// ➤ What a careers site calls itself rather than the employer.
const SITE_WORDS = /\s*\b(?:students?|graduates?|and|professionals?|careers?|external|ext|experienced|staff|jobs|hiring|portal|site|campus|internal)\b\s*/gi;
const GENERIC = /^(?:corporate|global|international|experienced|external|careers?|jobs|students?|graduates?|professionals?|campus|internal|hiring|talent|us|uk|eu|emea|europe)$/i;
const COUNTRIES = new Set(['germany', 'deutschland', 'poland', 'spain', 'france', 'italy', 'netherlands', 'belgium', 'sweden', 'norway', 'denmark', 'finland', 'austria', 'switzerland', 'portugal', 'ireland', 'united kingdom', 'uk', 'czechia', 'czech republic', 'hungary', 'romania', 'greece', 'europe', 'emea', 'usa', 'united states', 'canada', 'india', 'mexico', 'brazil', 'china', 'japan']);
// ➤ Legal forms and what they leave dangling, taken off the end.
const LEGAL = /[,\s]+\(?(?:inc|incorporated|llc|ltd|limited|gmbh|mbh|ag|se|kg|co|corp|corporation|company|plc|bv|b\.v|nv|n\.v|sa|s\.a|sas|sl|s\.l|spa|s\.p\.a|srl|s\.r\.l|oy|ab|as|a\/s|aps|pty|pte|ltda|lp|llp|private|pvt)\.?\)?$/i;

// ➤ The legal name's words, without the internal codes in front ("631", "13-5674085", "ADUS-").
function legalWords(legal) {
  let s = String(legal || '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  for (let prev = ''; prev !== s;) { prev = s; s = s.replace(LEGAL, '').replace(/[,&\s]+$/, '').trim(); }
  return s.split(/[\s-]+/).filter(w => w && !/^\d[\d-]*$/.test(w));
}

// ➤ Shouted words longer than an acronym come down: "LEIDOS" → Leidos, "KLA" stays.
const calm = s => s.replace(/[A-ZÀ-Ý]{5,}/g, w => w[0] + w.slice(1).toLowerCase());

// ➤ Words back into a name, without the punctuation the legal name left on its ends ("Dynata,").
const tidy = words => words.join(' ').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}.)]+$/gu, '');

// ➤ The address's brand spelt out by the legal name: consecutive words that spell it, or
// ➤ consecutive capitalised words whose initials make it ("bah" → Booz Allen Hamilton).
function spelt(key, words) {
  if (key.length >= 3) for (let i = 0; i < words.length; i++) for (let j = i; j < Math.min(words.length, i + 4); j++) {
    if (letters(words.slice(i, j + 1).join('')) === key) return tidy(words.slice(i, j + 1));
  }
  if (key.length >= 2 && key.length <= 5) {
    // ➤ The capitalised words carry the initials; the small words between them stay in the
    // ➤ name ("University of Queensland", "Washington and Lee University").
    const caps = words.map((w, i) => [w, i]).filter(([w]) => /^[A-Z]/.test(w));
    for (let i = 0; i + key.length <= caps.length; i++) {
      const run = caps.slice(i, i + key.length);
      if (run.map(([w]) => letters(w)[0]).join('') === key) return tidy(words.slice(run[0][1], run.at(-1)[1] + 1));
    }
  }
  return '';
}

export function brandName(current, legal, slug) {
  const now = String(current || '').trim();
  const raw = letters(String(slug || '').split(/[./]/)[0]);
  const key = raw.replace(/(?:corporation|corp|group|hr|careers|career|jobs|inc|external|ext)$/, '') || raw;
  const words = legalWords(legal);
  // ➤ The name the site gave, without the words sites add ("TRUMPF Students" → TRUMPF).
  const mended = now.replace(SITE_WORDS, ' ').replace(/\s+\d+$/, '').replace(/\s+/g, ' ').trim();
  const broken = !mended || GENERIC.test(mended) || COUNTRIES.has(mended.toLowerCase());
  // ➤ The hunter names a board after the employer's domain, one glued word ("Jnj",
  // ➤ "Lloydsbankinggroup"): that is an address too.
  const glued = /^[A-Z][a-z0-9]{2,}$/.test(mended) ? letters(mended) : '';
  const keys = [...new Set([raw, key, glued].filter(Boolean))];
  // ➤ A name that is not an address was chosen by someone ("CommBank", "Emerson College"): it
  // ➤ stays, only cleared of the site's words.
  if (!broken && !keys.includes(letters(mended))) return mended;
  const found = keys.map(k => spelt(k, words)).find(Boolean);
  if (found) {
    const name = calm(found);
    // ➤ The same letters again only for a better spelling: words apart ("Baker Hughes"),
    // ➤ "CrowdStrike", "KLA" — not "A dec,".
    const better = name.split(' ').length > mended.split(' ').length || /[a-z][A-Z]/.test(name) || /^[A-Z]{2,4}$/.test(name);
    if (!broken && letters(name) === letters(mended) && !better) return mended;
    return name;
  }
  if (!broken) return mended;
  // ➤ Nothing left of it: the legal name, when it is short enough to be a name.
  const whole = calm(words.join(' '));
  return words.length && words.length <= 4 && !COUNTRIES.has(whole.toLowerCase()) ? whole : now;
}
