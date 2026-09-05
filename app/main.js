// ➤ The first page. Two ways in: a plain search (words, and the filters on the left: country,
// ➤ family, date) and a code, which decodes into a profile and judges every advert on the
// ➤ device; the filters narrow either list. Everything downloads only the parts of the pile
// ➤ it needs, hides adverts past their deadline, and draws the same list. The state lives in
// ➤ the address after the #, so a search or a list can be bookmarked and shared; nothing
// ➤ about the visitor leaves the browser.
import { decodeProfile, normaliseProfile, catalogueIds } from './lib/codec.js';
import { makeJudge, sortOffers } from './lib/gates.js';
import { shardFiles, loadShards } from './lib/shards.js';
import { renderList, renderEmpty, renderDebug } from './lib/render.js';
import { wordsOf, matchesWords, isExpired, newestFirst } from './lib/search.js';
import * as engine from './lib/engine.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const text = (sel, s) => { const e = $(sel); if (e) e.textContent = s; };
const getJson = async url => { const r = await fetch(url, { cache: 'no-cache' }); if (!r.ok) throw new Error(`${r.status} for ${url}`); return r.json(); };
const STALE_HOURS = 48;

let index, cats, ids, ctx;
let loaded = null;   // ➤ the last set downloaded and judged, so filters and typing redraw without a download

// ➤ The state in the address: p = code, q = words, c = countries, f = families, d = days.
function readHash() {
  const p = new URLSearchParams(location.hash.replace(/^#/, ''));
  const list = k => (p.get(k) || '').split(',').map(s => s.trim()).filter(Boolean);
  return { code: (p.get('p') || '').trim(), q: (p.get('q') || '').trim(), c: list('c'), f: list('f'), d: Number(p.get('d')) || 0, debug: p.has('dbg') };
}
function stateFromForm() {
  const { code, debug } = readHash();
  return { p: code, q: $('#q').value.trim(), c: $$('#countries-pick input:checked').map(i => i.value).join(','), f: $$('#families-pick input:checked').map(i => i.value).join(','), d: $('#filters-form input[name="d"]:checked')?.value || '', dbg: debug ? '1' : '' };
}
function writeHash(parts, replace = false) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(parts)) if (v) p.set(k, v);
  const h = '#' + p.toString();
  if (replace) history.replaceState(null, '', h); else location.hash = h;
}

const countryName = cc => cc === 'xx' ? 'Remote' : cc === 'zz' || !cc ? 'Country not stated' : (cats.countries.countries.find(c => c.iso === cc)?.name || cc.toUpperCase());
const familyLabel = id => cats.families.families.find(f => f.id === id)?.label || id;

// ➤ One row per choice: the tick on the left, the label, today's count on the right.
function checkRow(container, { name, value, label, count }) {
  const l = document.createElement('label'); l.className = 'check-row';
  const i = document.createElement('input'); i.type = 'checkbox'; i.name = name; i.value = value;
  const s = document.createElement('span'); s.textContent = label;
  l.append(i, s);
  if (count !== undefined) { const n = document.createElement('span'); n.className = 'check-row__count'; n.textContent = count.toLocaleString('en'); l.append(n); }
  container.append(l);
  return i;
}

function drawFilters() {
  const rows = Object.entries(index.counts?.by_country || {}).filter(([cc]) => cc !== 'zz').sort((a, b) => (a[0] === 'es' ? -1 : b[0] === 'es' ? 1 : b[1] - a[1]));
  const pick = $('#countries-pick');
  pick.replaceChildren();
  for (const [cc, n] of rows) checkRow(pick, { name: 'c', value: cc, label: countryName(cc), count: n });
  drawFamilyCounts();
}

// ➤ Family counts follow the countries ticked, so the numbers always mean "in what you chose".
function drawFamilyCounts() {
  const chosen = new Set($$('#countries-pick input:checked').map(i => i.value));
  const counts = Object.entries(index.families || {}).map(([id, f]) => [id, Object.entries(f.countries || {}).filter(([cc]) => !chosen.size || chosen.has(cc)).reduce((s, [, e]) => s + (e.n || 0), 0)]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const pick = $('#families-pick');
  const ticked = new Set($$('#families-pick input:checked').map(i => i.value));
  pick.replaceChildren();
  for (const [id, n] of counts) checkRow(pick, { name: 'f', value: id, label: familyLabel(id), count: n }).checked = ticked.has(id);
}

function drawPile() {
  const hours = Math.round((Date.now() - new Date(index.generated_at).getTime()) / 36e5);
  text('#generated', `${index.counts.offers.toLocaleString('en')} offers, rebuilt ${hours <= 0 ? 'just now' : `${hours} h ago`}${index.status?.ok ? '' : ' (some sources failed this time)'}.`);
  const stale = $('#stale');
  if (hours > STALE_HOURS) { stale.textContent = `The pile was last rebuilt ${Math.round(hours / 24)} days ago; some offers may have closed since.`; stale.hidden = false; }
  const rows = Object.entries(index.counts?.by_country || {}).filter(([cc]) => cc !== 'zz').sort((a, b) => (a[0] === 'es' ? -1 : b[0] === 'es' ? 1 : b[1] - a[1]));
  const tbody = $('#countries tbody');
  tbody.replaceChildren();
  for (const [cc, n] of rows) {
    const tr = document.createElement('tr');
    const td1 = document.createElement('td'); td1.textContent = countryName(cc);
    const td2 = document.createElement('td'); td2.className = 'num'; td2.textContent = n.toLocaleString('en');
    tr.append(td1, td2); tbody.append(tr);
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

// ➤ The filters and the words, applied to what is already downloaded. No network here.
function draw() {
  if (!loaded) return;
  const { q, c, f, d, debug } = readHash();
  const words = wordsOf(q);
  const countries = new Set(c), families = new Set(f);
  const since = d ? new Date(Date.now() - d * 864e5).toISOString().slice(0, 10) : '';
  const shown = loaded.offers.filter(o =>
    (!countries.size || !o.cc || countries.has(o.cc)) &&
    (!families.size || (o.f || []).some(x => families.has(x))) &&
    (!since || (o.d && o.d >= since)) &&
    matchesWords(o, words, countryName));
  const failed = loaded.failed.length ? ` (${loaded.failed.length} part${loaded.failed.length === 1 ? '' : 's'} failed to download)` : '';
  const narrowed = countries.size || families.size || since || words.length;
  text('#results-status', `${shown.length.toLocaleString('en')} of ${loaded.total.toLocaleString('en')} offers${loaded.profile ? ' match your profile' : ''}${narrowed ? (loaded.profile ? ' and your filters' : ' match your filters') : ''}${failed}.`);
  if (shown.length) renderList($('#list'), shown, ctx); else renderEmpty($('#list'), loaded.stages, loaded.total);
  if (debug && loaded.dropped) renderDebug($('#debug'), loaded.dropped); else $('#debug').hidden = true;
  const active = countries.size + families.size + (since ? 1 : 0);
  text('#filters-toggle', active ? `☰ Filters · ${active}` : '☰ Filters');
}

// ➤ Puts the address into the controls, downloads what the scope needs, judges, draws.
async function run() {
  const { code, q, c, f, d } = readHash();
  $('#q').value = q;
  for (const i of $$('#countries-pick input')) i.checked = c.includes(i.value);
  drawFamilyCounts();
  for (const i of $$('#families-pick input')) i.checked = f.includes(i.value);
  for (const i of $$('#filters-form input[name="d"]')) i.checked = String(d || '') === i.value;
  const active = c.length + f.length + (d ? 1 : 0);
  text('#filters-toggle', active ? `☰ Filters · ${active}` : '☰ Filters');
  if (!code && !q && !active) { $('#results').hidden = true; loaded = null; return; }

  let profile = null;
  if (code) {
    try { profile = decodeProfile(code, ids); } catch (e) { $('#results').hidden = false; text('#results-title', 'Your list'); text('#results-status', `That code cannot be read: ${e.message}.`); $('#list').replaceChildren(); loaded = null; return; }
  }
  // ➤ The same scope already downloaded? Then only redraw.
  const scope = profile || normaliseProfile({ families: f, countries: c.filter(x => x !== 'xx'), remote: c.includes('xx') || !c.length });
  const key = JSON.stringify([code, scope.families, scope.countries, scope.remote]);
  if (loaded && loaded.key === key) { draw(); return; }
  loaded = null;
  $('#results').hidden = false;
  text('#results-title', profile ? 'Your list' : 'Results');
  const edit = $('#edit-link');
  edit.hidden = !profile; if (profile) edit.href = `intake/#p=${encodeURIComponent(code)}`;
  const summary = $('#profile-summary');
  summary.hidden = !profile;
  if (profile) {
    summary.textContent = [
      profile.families.map(familyLabel).join(', ') || 'every family',
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
  const stages = {}, dropped = [];
  let kept = alive;
  if (profile) {
    const judge = makeJudge(profile, cats, engine);
    kept = [];
    for (const o of alive) { const v = judge(o); if (v.ok) kept.push(o); else { dropped.push({ o, verdict: v }); stages[v.stage] = (stages[v.stage] || 0) + 1; } }
    kept = sortOffers(kept, profile);
  } else kept = newestFirst(kept);
  loaded = { key, offers: kept, total: alive.length, failed, profile, stages, dropped };
  draw();
}

// ➤ On a phone the filters are a panel the button opens and closes; on a desk they sit on the left.
function wireFilters() {
  const panel = $('#filters');
  const toggle = $('#filters-toggle');
  const open = on => { panel.classList.toggle('is-open', on); toggle.setAttribute('aria-expanded', String(on)); document.body.classList.toggle('filters-open', on); };
  toggle.addEventListener('click', () => open(!panel.classList.contains('is-open')));
  $('#filters-close').addEventListener('click', () => open(false));
  $('#filters-form').addEventListener('change', e => {
    if (e.target.name === 'c') drawFamilyCounts();
    writeHash(stateFromForm());
  });
  $('#filters-clear').addEventListener('click', () => { for (const i of $$('#filters-form input[type="checkbox"]')) i.checked = false; $('#filters-form input[name="d"][value=""]').checked = true; drawFamilyCounts(); writeHash(stateFromForm()); });
}

async function main() {
  try { index = await getJson('data/index.json'); } catch { text('#generated', 'The pile is not published yet. Come back in a few hours.'); return; }
  const names = ['families', 'countries', 'languages', 'degrees', 'seniority', 'vetoes'];
  const all = await Promise.all(names.map(n => getJson(`catalogues/${n}.json`)));
  cats = Object.fromEntries(names.map((n, i) => [n, all[i]]));
  ids = catalogueIds(cats);
  ctx = { countryName, sourceName: s => index.sources?.[s]?.name || s, languageName: code => cats.languages.languages.find(l => l.code === code)?.label || code, degreeName: id => cats.degrees.degrees.find(d => d.id === id)?.label || id };
  drawPile();
  drawFilters();
  wireFilters();

  $('#search').addEventListener('submit', e => { e.preventDefault(); writeHash(stateFromForm()); });
  $('#code-form').addEventListener('submit', e => { e.preventDefault(); const v = $('#code-input').value.trim(); if (v) writeHash({ ...stateFromForm(), p: v }); });
  // ➤ Typing redraws at once; the address follows once the typing pauses.
  let timer;
  $('#q').addEventListener('input', () => { writeHash(stateFromForm(), true); draw(); clearTimeout(timer); timer = setTimeout(() => writeHash(stateFromForm(), true), 600); });
  window.addEventListener('hashchange', () => run().catch(e => text('#results-status', `Something went wrong: ${e.message}`)));
  await run();
}

main().catch(e => { text('#generated', `Something went wrong: ${e.message}`); });
