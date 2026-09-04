// ➤ The first page. Two ways in: a plain search (words and a country, no code needed) and a
// ➤ code, which decodes into a profile and judges every advert on the device. Both download
// ➤ only the parts of the pile they need, hide adverts past their deadline, and draw the
// ➤ same list. The state lives in the address after the #, so a search or a list can be
// ➤ bookmarked and shared; nothing about the visitor leaves the browser.
import { decodeProfile, normaliseProfile, catalogueIds } from './lib/codec.js';
import { makeJudge, sortOffers } from './lib/gates.js';
import { shardFiles, loadShards } from './lib/shards.js';
import { renderList, renderEmpty, renderDebug } from './lib/render.js';
import { wordsOf, matchesWords, isExpired, newestFirst } from './lib/search.js';
import * as engine from './lib/engine.js';

const $ = s => document.querySelector(s);
const text = (sel, s) => { const e = $(sel); if (e) e.textContent = s; };
const getJson = async url => { const r = await fetch(url, { cache: 'no-cache' }); if (!r.ok) throw new Error(`${r.status} for ${url}`); return r.json(); };
const STALE_HOURS = 48;

let index, cats, ids, ctx;
let loaded = null;   // ➤ the last set drawn: { offers, profile, judged } so typing re-filters without a download

function readHash() {
  const p = new URLSearchParams(location.hash.replace(/^#/, ''));
  return { code: (p.get('p') || '').trim(), q: (p.get('q') || '').trim(), c: (p.get('c') || '').trim(), debug: p.has('dbg') };
}
function writeHash(parts) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(parts)) if (v) p.set(k, v);
  location.hash = p.toString();
}

const countryName = cc => cc === 'xx' ? 'Remote' : cc === 'zz' || !cc ? 'Country not stated' : (cats.countries.countries.find(c => c.iso === cc)?.name || cc.toUpperCase());

function drawPile() {
  const hours = Math.round((Date.now() - new Date(index.generated_at).getTime()) / 36e5);
  text('#generated', `${index.counts.offers.toLocaleString('en')} offers, rebuilt ${hours <= 0 ? 'just now' : `${hours} h ago`}${index.status?.ok ? '' : ' (some sources failed this time)'}.`);
  const stale = $('#stale');
  if (hours > STALE_HOURS) { stale.textContent = `The pile was last rebuilt ${Math.round(hours / 24)} days ago; some offers may have closed since.`; stale.hidden = false; }
  const rows = Object.entries(index.counts?.by_country || {}).filter(([cc]) => cc !== 'zz').sort((a, b) => (a[0] === 'es' ? -1 : b[0] === 'es' ? 1 : b[1] - a[1]));
  const tbody = $('#countries tbody');
  tbody.replaceChildren();
  const select = $('#country');
  for (const [cc, n] of rows) {
    const tr = document.createElement('tr');
    const td1 = document.createElement('td'); td1.textContent = countryName(cc);
    const td2 = document.createElement('td'); td2.className = 'num'; td2.textContent = n.toLocaleString('en');
    tr.append(td1, td2); tbody.append(tr);
    const opt = document.createElement('option'); opt.value = cc; opt.textContent = `${countryName(cc)} (${n.toLocaleString('en')})`; select.append(opt);
  }
  $('#countries').hidden = rows.length === 0;
  const list = $('#source-list');
  list.replaceChildren();
  for (const s of Object.values(index.sources || {})) {
    const li = document.createElement('li');
    const a = document.createElement('a'); a.href = s.url; a.rel = 'noopener noreferrer'; a.target = '_blank'; a.textContent = s.name;
    li.append(a, document.createTextNode(` — ${s.licence}${s.credit ? `. ${s.credit}` : ''}, extracted ${String(s.extracted_at || '').slice(0, 10)}`));
    list.append(li);
  }
  $('#sources').hidden = list.children.length === 0;
}

// ➤ Draws the current set through the words typed, without touching the network.
function draw(q, debug) {
  if (!loaded) return;
  const words = wordsOf(q);
  const shown = loaded.offers.filter(o => matchesWords(o, words, countryName));
  const failed = loaded.failed.length ? ` (${loaded.failed.length} part${loaded.failed.length === 1 ? '' : 's'} failed to download)` : '';
  const of = loaded.total;
  text('#results-status', `${shown.length.toLocaleString('en')} of ${of.toLocaleString('en')} offers${loaded.profile ? ' match your profile' : ''}${words.length ? ` and your words` : ''}${failed}.`);
  if (shown.length) renderList($('#list'), shown, ctx); else renderEmpty($('#list'), loaded.stages, of);
  if (debug && loaded.dropped) renderDebug($('#debug'), loaded.dropped); else $('#debug').hidden = true;
}

async function run() {
  const { code, q, c, debug } = readHash();
  $('#q').value = q;
  $('#country').value = c;
  if (!code && !q && !c) { $('#results').hidden = true; loaded = null; return; }
  $('#results').hidden = true;
  loaded = null;

  let profile = null;
  if (code) {
    try { profile = decodeProfile(code, ids); } catch (e) { $('#results').hidden = false; text('#results-title', 'Your list'); text('#results-status', `That code cannot be read: ${e.message}.`); $('#list').replaceChildren(); return; }
  }
  const scope = profile || normaliseProfile({ countries: c ? [c] : [], remote: c === 'xx' || !c });
  $('#results').hidden = false;
  text('#results-title', profile ? 'Your list' : 'Results');
  const edit = $('#edit-link');
  edit.hidden = !profile; if (profile) edit.href = `intake/#p=${encodeURIComponent(code)}`;
  const summary = $('#profile-summary');
  summary.hidden = !profile;
  if (profile) {
    summary.textContent = [
      profile.families.map(id => cats.families.families.find(f => f.id === id)?.label || id).join(', ') || 'every family',
      profile.countries.map(countryName).join(', ') || 'every country',
      profile.level !== 'any' ? profile.level : null,
      profile.maxYears ? `up to ${profile.maxYears} years asked` : null,
    ].filter(Boolean).join(' · ');
  }
  $('#list').replaceChildren();
  const files = shardFiles(index, scope);
  text('#results-status', `Downloading ${files.length} part${files.length === 1 ? '' : 's'} of the pile…`);
  const { offers, failed } = await loadShards(files, 'data', getJson, (done, n) => text('#results-status', `Downloading ${done} of ${n}…`));
  const alive = offers.filter(o => !isExpired(o));
  const stages = {};
  const dropped = [];
  let kept = alive;
  if (profile) {
    const judge = makeJudge(profile, cats, engine);
    kept = [];
    for (const o of alive) { const v = judge(o); if (v.ok) kept.push(o); else { dropped.push({ o, verdict: v }); stages[v.stage] = (stages[v.stage] || 0) + 1; } }
    kept = sortOffers(kept, profile);
  } else {
    if (c && c !== 'xx') kept = kept.filter(o => !o.cc || o.cc === c);
    kept = newestFirst(kept);
  }
  loaded = { offers: kept, total: alive.length, failed, profile, stages, dropped };
  draw(q, debug);
}

async function main() {
  try { index = await getJson('data/index.json'); } catch { text('#generated', 'The pile is not published yet. Come back in a few hours.'); return; }
  const names = ['families', 'countries', 'languages', 'degrees', 'seniority', 'vetoes'];
  const all = await Promise.all(names.map(n => getJson(`catalogues/${n}.json`)));
  cats = Object.fromEntries(names.map((n, i) => [n, all[i]]));
  ids = catalogueIds(cats);
  ctx = { countryName, sourceName: s => index.sources?.[s]?.name || s, languageName: code => cats.languages.languages.find(l => l.code === code)?.label || code, degreeName: id => cats.degrees.degrees.find(d => d.id === id)?.label || id };
  drawPile();

  $('#search').addEventListener('submit', e => { e.preventDefault(); const { code } = readHash(); writeHash({ p: code, q: $('#q').value.trim(), c: $('#country').value }); });
  $('#code-form').addEventListener('submit', e => { e.preventDefault(); const v = $('#code-input').value.trim(); if (v) writeHash({ p: v, q: $('#q').value.trim() }); });
  $('#country').addEventListener('change', () => { const { code } = readHash(); writeHash({ p: code, q: $('#q').value.trim(), c: $('#country').value }); });
  // ➤ Typing re-filters what is already on screen; the address follows once the typing pauses.
  let timer;
  $('#q').addEventListener('input', () => { draw($('#q').value, readHash().debug); clearTimeout(timer); timer = setTimeout(() => { const { code, c } = readHash(); if (loaded) history.replaceState(null, '', '#' + new URLSearchParams(Object.fromEntries(Object.entries({ p: code, q: $('#q').value.trim(), c }).filter(([, v]) => v)))); }, 600); });
  window.addEventListener('hashchange', () => run().catch(e => text('#results-status', `Something went wrong: ${e.message}`)));
  await run();
}

main().catch(e => { text('#generated', `Something went wrong: ${e.message}`); });
