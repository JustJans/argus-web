// ➤ An advert's place on the map. Job sites locate each advert before anyone searches — its place
// ➤ to coordinates against a gazetteer — so a visitor can ask for a town and a radius; this does
// ➤ it with GeoNames (catalogues/codes/places.json, built by builder/tools/places.mjs): the
// ➤ advert's town is looked up by any of its names within the advert's country. Two towns of one
// ➤ name in one country: the one in the region the advert names, else the bigger.
import { fold } from 'argus/server-bot/text.mjs';

// ➤ country → folded name → the towns that go by it.
export function compileTowns(catalogue) {
  const byCountry = new Map();
  for (const [id, name, cc, region, lat, lon, pop, names] of catalogue.places) {
    const town = { id, name, cc, region, lat, lon, pop };
    if (!byCountry.has(cc)) byCountry.set(cc, new Map());
    const byName = byCountry.get(cc);
    for (const n of [name, ...names]) {
      const k = fold(n);
      if (!byName.has(k)) byName.set(k, []);
      byName.get(k).push(town);
    }
  }
  return byCountry;
}

// ➤ The pieces a place is written in ("08940 Cornellà de Llobregat, Barcelona provincia"), each
// ➤ without its postcode; a district after a hyphen ("Ulm-Jungingen") is tried as its town too.
const pieces = text => String(text || '').split(/[,;/|()]|\s[-–]\s/)
  .map(s => s.replace(/\b[\d-]*\d[\d-]*\b/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
const withTown = piece => (piece.includes('-') ? [piece, piece.split('-')[0]] : [piece]);

// ➤ rec: a record (cc, ci, l). Answers { town, said } — the town and the words that named it —
// ➤ or null when its place names no town we know. The place's pieces are tried from the most
// ➤ precise, as addresses are written ("Terrassa, BARCELONA, ES" is Terrassa, in the province
// ➤ of Barcelona); the city read off it before comes last.
export function townOf(rec, towns) {
  const byName = towns.get(rec.cc);
  if (!byName) return null;
  const texts = [...pieces(rec.l), rec.ci].filter(Boolean).flatMap(withTown);
  const all = fold(texts.join(' '));
  for (const said of texts) {
    const found = byName.get(fold(said));
    if (!found) continue;
    const inRegion = t => (t.region && all.includes(fold(t.region)) ? 1 : 0);
    return { town: [...found].sort((a, b) => inRegion(b) - inRegion(a) || b.pop - a.pop)[0], said };
  }
  return null;
}

// ➤ Every record on the map: its coordinates as `g` (two decimals, about a kilometre), and the
// ➤ towns with offers for the place search, each under the name its adverts use most
// ➤ ("Göteborg" more than "Gothenburg"), the fullest first:
// ➤ [shown name, GeoNames' name when it differs, region, country, lat, lon, offers].
export function locate(records, towns) {
  const round = x => Math.round(x * 100) / 100;
  const tally = new Map();
  let placed = 0;
  for (const rec of records) {
    if (!rec.cc || rec.cc === 'xx') continue;
    const hit = townOf(rec, towns);
    if (!hit) continue;
    placed++;
    const { town, said } = hit;
    rec.g = [round(town.lat), round(town.lon)];
    // ➤ The card names the town the map found, as the advert wrote it ("Terrassa", not the
    // ➤ province of Barcelona that the place also names).
    rec.ci = said;
    const t = tally.get(town.id) || tally.set(town.id, { town, n: 0, names: new Map() }).get(town.id);
    t.n++;
    t.names.set(said, (t.names.get(said) || 0) + 1);
  }
  const list = [...tally.values()].sort((a, b) => b.n - a.n).map(({ town, n, names }) => {
    const shown = [...names].sort((a, b) => b[1] - a[1])[0][0];
    return [shown, fold(shown) === fold(town.name) ? '' : town.name, town.region, town.cc, round(town.lat), round(town.lon), n];
  });
  return { placed, list };
}
