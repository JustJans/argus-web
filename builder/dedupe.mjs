// ➤ The same advert reaches the pile twice when two sources carry it, or when a board and a
// ➤ feed both list it. First by address, then by company plus title (an aggregator's copy
// ➤ has another address but the same words). A board's copy beats a feed's copy: it is the
// ➤ page the employer maintains.
import { titleKey } from 'argus/server-bot/text.mjs';

const RANK = { feed: 1, board: 2 };

export function roleKey(company, title) {
  const who = titleKey(String(company || ''));
  if (!who) return '';
  return `${who}::${titleKey(String(title || ''))}`;
}

// ➤ records: [{rec, kind}] → the records to keep, and how many fell by each rule.
export function dedupe(items) {
  const byUrl = new Map(), byRole = new Map();
  let sameUrl = 0, sameRole = 0;
  for (const it of items) {
    const u = it.rec.u;
    const prev = byUrl.get(u);
    if (prev) { sameUrl++; if ((RANK[it.kind] || 0) > (RANK[prev.kind] || 0)) byUrl.set(u, it); continue; }
    byUrl.set(u, it);
  }
  for (const it of byUrl.values()) {
    const k = roleKey(it.rec.c, it.rec.t);
    if (!k) { byRole.set(it.rec.u, it); continue; }
    const prev = byRole.get(k);
    if (prev) {
      sameRole++;
      const r = x => RANK[x.kind] || 0;
      if (r(it) > r(prev) || (r(it) === r(prev) && (it.rec.d || '') < (prev.rec.d || ''))) byRole.set(k, it);
      continue;
    }
    byRole.set(k, it);
  }
  return { kept: [...byRole.values()].map(it => it.rec), sameUrl, sameRole };
}
