// ➤ The form a town's name and a visitor's words are compared in, the same in the builder and
// ➤ on the site: no accents, lower case, the letters no accent-stripping takes apart spelt the
// ➤ way people type them without the key (ø → o, ß → ss), anything else a single space.
const LATIN = { ø: 'o', æ: 'ae', œ: 'oe', ß: 'ss', ł: 'l', đ: 'd', ð: 'd', þ: 'th', ı: 'i', ħ: 'h' };

export const nameKey = s => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  .replace(/[øæœßłđðþıħ]/g, c => LATIN[c]).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// ➤ Whether a text names one of the keys as whole words, and not as a piece of a longer name
// ➤ joined by a hyphen ("Baden" is not in "Baden-Württemberg", "Saint-Étienne" is itself).
export function namesAny(text, keys) {
  const words = [], hyphen = [];
  let end = 0;
  for (const m of String(text || '').matchAll(/[\p{L}\p{N}]+/gu)) {
    hyphen.push(/^[-‐‑]$/.test(text.slice(end, m.index)));
    words.push(nameKey(m[0]));
    end = m.index + m[0].length;
  }
  hyphen.push(false);
  return keys.some(k => {
    const ks = k.split(' ');
    for (let i = 0; i + ks.length <= words.length; i++) {
      if (!hyphen[i] && !hyphen[i + ks.length] && ks.every((w, j) => words[i + j] === w)) return true;
    }
    return false;
  });
}

// ➤ A name's forms: its key, and the German and Nordic spelling without those letters
// ➤ ("Muenchen", "Koeln", "Aarhus", "Tromsoe") when it has them.
const SPELT = { ä: 'ae', ö: 'oe', ü: 'ue', å: 'aa', ø: 'oe' };
export const nameKeys = s => {
  const k = nameKey(s);
  const spelt = /[äöüåø]/i.test(s) ? nameKey(String(s).toLowerCase().replace(/[äöüåø]/g, c => SPELT[c])) : k;
  return spelt === k ? [k] : [k, spelt];
};
