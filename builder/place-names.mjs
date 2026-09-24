// ➤ The town names the search bar must not take for a town when they stand alone. Geoparsing
// ➤ calls it geo/non-geo ambiguity: "Orange" is a company, "Change" a word, "Best" an adjective,
// ➤ and each is also a town with offers. A name is ambiguous when the pile uses it more often as
// ➤ a word, in the titles or company names of offers that are not there, than as the place of
// ➤ offers. A title that names the town its offer is in, or one next to it ("Engineer - Cagliari"),
// ➤ uses the name as a place. docs/research/single-search.md.
import { fold } from 'argus/server-bot/text.mjs';

const key = s => fold(s).replace(/[^a-z0-9]+/g, ' ').trim();
const NEAR_KM = 30;
const LONGEST = 4;   // ➤ words in the longest town name looked for

const rad = d => (d * Math.PI) / 180;
const distanceKm = ([lat1, lon1], [lat2, lon2]) => {
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
};

// ➤ list: the towns with offers, as locate() writes them; records: the pile, each with its title
// ➤ (and English title), company and coordinates. Answers the ambiguous names, folded, sorted.
export function ambiguousNames(list, records) {
  const towns = new Map();
  for (const [shown, other, , , lat, lon, n, more = []] of list) {
    for (const name of [shown, other, ...more]) {
      const k = name ? key(name) : '';
      if (k.length < 2) continue;
      if (!towns.has(k)) towns.set(k, []);
      towns.get(k).push({ lat, lon, n });
    }
  }
  const asWord = new Map();
  for (const rec of records) {
    const said = new Set();
    for (const text of [[rec.t, rec.te].filter(Boolean).join(' '), rec.c || '']) {
      const w = key(text).split(' ');
      for (let i = 0; i < w.length; i++) {
        for (let n = 1; n <= LONGEST && i + n <= w.length; n++) {
          const k = w.slice(i, i + n).join(' ');
          if (towns.has(k)) said.add(k);
        }
      }
    }
    for (const k of said) {
      const there = rec.g && towns.get(k).some(t => distanceKm(rec.g, [t.lat, t.lon]) < NEAR_KM);
      if (!there) asWord.set(k, (asWord.get(k) || 0) + 1);
    }
  }
  return [...asWord].filter(([k, c]) => c > Math.max(...towns.get(k).map(t => t.n))).map(([k]) => k).sort();
}
