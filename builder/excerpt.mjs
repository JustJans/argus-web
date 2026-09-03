// ➤ Two excerpts travel with each advert instead of its whole text: the opening lines (what
// ➤ it is) and the sentences that state a requirement — years, a degree, a language — so
// ➤ the visitor's screens have exactly the sentences they act on and nothing else.
const REQUIREMENT = /(\b\d{1,2}\s*\+?\s*(?:years?|yrs|años?|ans\b|jahre?n?|jaar|år)|\b(?:one|two|three|four|five|six|several|un|una|dos|tres|cuatro|cinco|varios|deux|trois|quatre|cinq|plusieurs|zwei|drei|vier|fünf|mehrere|twee|drie|vier|vijf|enkele|två|tre|fyra|fem|flera|to|tre|fire|fem|flere)\s+(?:years?|años?|ans\b|jahre?n?|jaar|år)|\bdegree\b|bachelor|master|\bmsc\b|\bbsc\b|\bbeng\b|\bmeng\b|\bphd\b|licenciatura|\bgrado\b|ingenier[oa]\s+(?:superior|técnic)|diplom|\bhbo\b|\bwo\b|högskole|universit|\bengineering degree|titulaci|\bfluent|\bnative\b|\blanguage|\bidioma|\blangue|\bsprache|\btaal\b|\bspråk|\benglish\b|\bgerman\b|\bdeutsch|\bfrench\b|\bfran[cç]ais|\bdutch\b|\bnederlands|\bswedish\b|\bsvenska|\bnorwegian\b|\bnorsk|\bspanish\b|\bespañol|\bcastellano|\bitalian|\bportugu)/i;

export function sentences(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .split(/(?<=[.!?])\s+|\n+|\s*[•·▪●]\s*/)
    .map(s => s.replace(/\s+/g, ' ').trim())
    .filter(s => s.length > 2);
}

// ➤ The first sentences, up to `max` characters, cut on a sentence end when possible.
export function snippet(text, max = 240) {
  const out = [];
  let len = 0;
  for (const s of sentences(text)) {
    if (len + s.length + 1 > max) { if (!out.length) out.push(s.slice(0, max - 1) + '…'); break; }
    out.push(s); len += s.length + 1;
  }
  return out.join(' ');
}

// ➤ Every sentence that states a requirement, plus the sentence after it when that one
// ➤ softens or denies ("not required", "a plus"), up to `max` characters.
const SOFTENER = /\b(?:not|no|nicht|kein\w*|geen|niet|pas|non|ej|inte|ikke|sin|plus|bonus|valorable|deseable|w[üu]nschenswert|souhait\w*|nice to have|preferred|preferably|advantage|asset|meriterande|fordel)\b/i;
export function requirements(text, max = 400) {
  const all = sentences(text);
  const keep = new Set();
  all.forEach((s, i) => { if (REQUIREMENT.test(s)) { keep.add(i); if (i + 1 < all.length && SOFTENER.test(all[i + 1])) keep.add(i + 1); } });
  const out = [];
  let len = 0;
  for (const i of [...keep].sort((a, b) => a - b)) {
    const s = all[i];
    if (len + s.length + 1 > max) break;
    out.push(s); len += s.length + 1;
  }
  return out.join(' ');
}
