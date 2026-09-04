// ➤ The plain search: words typed on the first page, matched against an advert's title,
// ➤ company, city and country, accent-blind; and the one rule every list applies, code or
// ➤ not — an advert past its deadline is not shown. Pure, tested under Node.
export const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function wordsOf(q) {
  return fold(q).split(/[\s,;]+/).filter(w => w.length >= 2);
}

// ➤ Every word must appear somewhere in the advert's title, company, city, location or
// ➤ country name.
export function matchesWords(o, words, countryName = () => '') {
  if (!words.length) return true;
  const hay = fold([o.t, o.c, o.ci, o.l, countryName(o.cc)].filter(Boolean).join(' '));
  return words.every(w => hay.includes(w));
}

export function isExpired(o, today = new Date().toISOString().slice(0, 10)) {
  return !!(o.x && o.x < today);
}

export function newestFirst(offers) {
  return [...offers].sort((a, b) => String(b.d || '').localeCompare(String(a.d || '')));
}
