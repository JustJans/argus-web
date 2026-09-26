// ➤ The offers behind the front page (app/lib/backdrop.js), written to data/today.json: the
// ➤ newest from the employers' own boards and sites (no intermediaries), one country after
// ➤ another so the backdrop shows the pile's spread, one offer per company, and only offers
// ➤ whose title and "company · town" keep to one line in both languages, so every row keeps
// ➤ its height and nothing is cut short.
const TITLE = 40;
const META = 40;

// ➤ records: the pile; isVia(source): the source is an intermediary; n: three columns of 80.
export function backdropOffers(records, isVia = () => false, n = 240) {
  const fits = r => [r.te || r.t, r.ts || r.t].every(s => s && s.length <= TITLE) && `${r.c} · ${r.ci}`.length <= META;
  const byCountry = new Map();
  for (const r of [...records].sort((a, b) => String(b.d || '').localeCompare(String(a.d || '')))) {
    if (!r.u || !r.c || !r.ci || !r.cc || r.cc === 'xx' || isVia(r.s) || !fits(r)) continue;
    if (!byCountry.has(r.cc)) byCountry.set(r.cc, []);
    byCountry.get(r.cc).push(r);
  }
  // ➤ The fullest countries first, then one from each in turn.
  const queues = [...byCountry.values()].sort((a, b) => b.length - a.length);
  const out = [], companies = new Set();
  while (out.length < n && queues.some(q => q.length)) {
    for (const q of queues) {
      while (q.length && companies.has(q[0].c)) q.shift();
      const r = q.shift();
      if (!r) continue;
      companies.add(r.c);
      out.push({ id: r.id, t: r.t, te: r.te, ts: r.ts, c: r.c, ci: r.ci, cc: r.cc, u: r.u, s: r.s, p: r.p, w: r.w });
      if (out.length === n) break;
    }
  }
  return out;
}
