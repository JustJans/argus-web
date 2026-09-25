// ➤ The same advert reaches the pile twice when two sources carry it, or when a board and a
// ➤ feed both list it. First by address, then by company plus title in the same place (an
// ➤ aggregator's copy has another address but the same words). The same job in two towns is two
// ➤ offers, as job sites list it, up to a campaign in more than ten towns, kept once per
// ➤ country with every town it names. A board's copy beats a feed's copy: it is the page the
// ➤ employer maintains.
import { roleKey } from 'argus/server-bot/scan.mjs';
import { fold } from 'argus/server-bot/text.mjs';
export { roleKey };

const RANK = { feed: 1, board: 2 };
// ➤ Where a record is, when nothing better is given: its country and town as written.
const writtenPlace = rec => `${rec.cc || ''}|${fold(rec.ci || '')}`;
// ➤ A company and title in more towns than this is one campaign an agency runs everywhere
// ➤ ("in any of our locations"), not that many jobs: it stays once per country, and the copies
// ➤ it stands for go with it (`alsoAt`) so the place search finds it in each of their towns.
export const CAMPAIGN_TOWNS = 10;

// ➤ Of two copies, the board's; from the same kind of source, the one posted first, and a copy
// ➤ that names no day does not beat one that does.
function better(it, than) {
  const rank = x => RANK[x.kind] || 0;
  const earlier = !!it.rec.d && (!than.rec.d || it.rec.d < than.rec.d);
  return rank(it) > rank(than) || (rank(it) === rank(than) && earlier);
}

// ➤ records: [{rec, kind}] → the records to keep, and how many fell by each rule. placeOf(rec)
// ➤ names the place the same way however the sources spell it (the pile builder gives the
// ➤ GeoNames town, so "Munich" and "München" are one place).
export function dedupe(items, placeOf = writtenPlace) {
  const byUrl = new Map();
  let sameUrl = 0, sameRole = 0;
  for (const it of items) {
    const u = it.rec.u;
    const prev = byUrl.get(u);
    if (prev) { sameUrl++; if ((RANK[it.kind] || 0) > (RANK[prev.kind] || 0)) byUrl.set(u, it); continue; }
    byUrl.set(u, it);
  }
  const roles = new Map(), places = new Map(), towns = new Map();
  for (const it of byUrl.values()) {
    const role = roleKey(it.rec.c, it.rec.t);
    roles.set(it, role);
    if (!role) continue;
    places.set(it, placeOf(it.rec));
    (towns.get(role) || towns.set(role, new Set()).get(role)).add(places.get(it));
  }
  const kept = [], groups = new Map();
  for (const it of byUrl.values()) {
    const role = roles.get(it);
    if (!role) { kept.push(it); continue; }
    const campaign = towns.get(role).size > CAMPAIGN_TOWNS;
    const k = `${role}@${campaign ? `country ${it.rec.cc || ''}` : places.get(it)}`;
    (groups.get(k) || groups.set(k, { campaign, copies: [] }).get(k)).copies.push(it);
  }
  for (const { campaign, copies } of groups.values()) {
    const best = copies.reduce((a, b) => (better(b, a) ? b : a));
    sameRole += copies.length - 1;
    if (campaign && copies.length > 1) best.rec.alsoAt = copies.filter(c => c !== best).map(c => c.rec);
    kept.push(best);
  }
  return { kept: kept.map(it => it.rec), sameUrl, sameRole };
}
