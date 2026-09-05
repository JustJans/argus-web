// ➤ The one page. The filters on the left are the visitor's whole profile: country (in the
// ➤ order ticked), occupations by group, posted date, level and years, languages, degrees,
// ➤ title words, deal-breakers; each a fold-out. The profile is packed into a short code that
// ➤ appears as the filters change and can be copied or pasted; the code and the search words
// ➤ live in the address after the #, so a list can be bookmarked and shared. A CV read on
// ➤ the device ticks the occupations, degrees and languages it names. Everything downloads
// ➤ only the parts of the pile it needs, judges them here, hides adverts past their deadline
// ➤ and draws the list. Nothing about the visitor leaves the browser.
import { encodeProfile, decodeProfile, normaliseProfile, isEmptyProfile, catalogueIds } from './lib/codec.js';
import { makeJudge, sortOffers } from './lib/gates.js';
import { shardFiles, loadShards } from './lib/shards.js';
import { renderList, renderEmpty, renderDebug } from './lib/render.js';
import { wordsOf, matchesWords, isExpired, newestFirst } from './lib/search.js';
import { readCv } from './lib/cv.js';
import * as engine from './lib/engine.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const text = (sel, s) => { const e = $(sel); if (e) e.textContent = s; };
const getJson = async url => { const r = await fetch(url, { cache: 'no-cache' }); if (!r.ok) throw new Error(`${r.status} for ${url}`); return r.json(); };
const STALE_HOURS = 48;
const OPEN_BY_DEFAULT = new Set(['country', 'posted']);

let index, cats, ids, ctx;
let loaded = null;              // ➤ the last set downloaded and judged, so words and dates redraw without a download
const foldState = new Map();    // ➤ fold-outs the visitor opened or closed, kept across redraws
const countryOrder = [];        // ➤ the order countries were ticked in: the first comes first in the list
let familyTerms = null;         // ➤ ESCO's job titles, fetched the first time a CV is read

// ➤ The state in the address: p = the code (every filter), q = the search words, all = the
// ➤ whole pile was asked for with nothing set.
function readHash() {
  const p = new URLSearchParams(location.hash.replace(/^#/, ''));
  return { code: (p.get('p') || '').trim(), q: (p.get('q') || '').trim(), all: p.has('all'), debug: p.has('dbg') };
}
const hashOf = parts => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(parts)) if (v) p.set(k, v); return p.toString() ? `#${p}` : ''; };
function writeHash(parts, replace = false) {
  if (replace) history.replaceState(null, '', hashOf(parts) || location.pathname + location.search); else location.hash = hashOf(parts);
}
// ➤ Search: the address changes and the browser calls run(); when it would not change (the
// ➤ words were already written while typing), run() is called here, so Search always answers.
function search(parts) {
  const h = hashOf(parts);
  if (h === location.hash) run().catch(e => text('#results-status', `Something went wrong: ${e.message}`)); else location.hash = h;
}

const countryName = cc => cc === 'xx' ? 'Remote' : cc === 'zz' || !cc ? 'Country not stated' : (cats.countries.countries.find(c => c.iso === cc)?.name || cc.toUpperCase());
const familyOf = id => cats.families.families.find(f => f.id === id);
const groupLabel = id => cats.families.groups.find(g => g.id === id)?.label || id;
const degreeName = id => cats.degrees.degrees.find(d => d.id === id)?.label || id;
const languageName = code => cats.languages.languages.find(l => l.code === code)?.label || code;
// ➤ "Engineers: Mechanical, Civil · Technicians: Mechanical": the group gives a label its meaning.
function familiesSummary(fams) {
  const byGroup = new Map();
  for (const id of fams) { const f = familyOf(id); const g = f?.group || ''; byGroup.set(g, [...(byGroup.get(g) || []), f?.label || id]); }
  return [...byGroup].map(([g, labels]) => `${groupLabel(g)}: ${labels.join(', ')}`).join(' · ');
}

// ➤ The profile is what the filters say; the code is the profile packed, empty when nothing is set.
function profileFromForm() {
  const checked = name => $$(`#filters-form input[name="${name}"]:checked`).map(i => i.value);
  const words = sel => $(sel).value.split(',').map(s => s.trim()).filter(Boolean).slice(0, 8);
  const ticked = new Set(checked('c'));
  const countries = [...countryOrder.filter(c => ticked.has(c)), ...[...ticked].filter(c => !countryOrder.includes(c))];
  return normaliseProfile({
    families: checked('f'), countries, remote: $('#remote').checked, posted: Number($('#filters-form input[name="d"]:checked')?.value) || 0,
    level: checked('level')[0] || 'any', maxYears: Number($('#max-years').value) || null, highest: $('#highest').value,
    languages: checked('lg'), degrees: checked('dg'), vetoes: checked('v'), roles: words('#roles'), noWords: words('#no-words'),
  });
}
function stateFromForm(profile = profileFromForm()) {
  return { p: isEmptyProfile(profile) ? '' : encodeProfile(profile, ids), q: $('#q').value.trim(), dbg: readHash().debug ? '1' : '' };
}

// ➤ One row per choice: the tick on the left, the label, today's count on the right.
function row(container, { name, value, label, count, radio = false }) {
  const l = document.createElement('label'); l.className = 'check-row';
  const i = document.createElement('input'); i.type = radio ? 'radio' : 'checkbox'; i.name = name; i.value = value;
  const s = document.createElement('span'); s.textContent = label;
  l.append(i, s);
  if (count !== undefined) { const n = document.createElement('span'); n.className = 'check-row__count'; n.textContent = count.toLocaleString('en'); l.append(n); }
  container.append(l);
  return i;
}
const remember = (fold, key) => fold.addEventListener('toggle', () => foldState.set(key, fold.open));

// ➤ Countries with adverts, Spain first, plus any the profile names without adverts today (count 0).
function drawCountries(profile) {
  const counts = index.counts?.by_country || {};
  const rows = Object.entries(counts).filter(([cc]) => cc !== 'zz').sort((a, b) => (a[0] === 'es' ? -1 : b[0] === 'es' ? 1 : b[1] - a[1]));
  for (const cc of profile.countries) if (!counts[cc]) rows.push([cc, 0]);
  const pick = $('#countries-pick');
  pick.replaceChildren();
  for (const [cc, n] of rows) row(pick, { name: 'c', value: cc, label: countryName(cc), count: n });
}

// ➤ Inside "Occupations", one fold-out per group (Engineers, Technicians, crews…) with the families
// ➤ that have adverts in the countries ticked, so the numbers always mean "in what you chose";
// ➤ a family the profile names stays listed even at zero.
function drawFamilyCounts(profile) {
  const chosen = new Set(profile.countries);
  const count = id => Object.entries(index.families?.[id]?.countries || {}).filter(([cc]) => !chosen.size || chosen.has(cc)).reduce((s, [, e]) => s + (e.n || 0), 0);
  const pick = $('#families-pick');
  pick.replaceChildren();
  for (const g of cats.families.groups) {
    const rows = cats.families.families.filter(f => f.group === g.id).map(f => [f, count(f.id)]).filter(([f, n]) => n > 0 || profile.families.includes(f.id)).sort((a, b) => b[1] - a[1]);
    if (!rows.length) continue;
    const fold = document.createElement('details'); fold.className = 'filter-group'; fold.dataset.group = `families:${g.id}`;
    fold.open = foldState.has(fold.dataset.group) ? foldState.get(fold.dataset.group) : rows.some(([f]) => profile.families.includes(f.id));
    remember(fold, fold.dataset.group);
    const summary = document.createElement('summary'); summary.textContent = g.label;
    const checks = document.createElement('div'); checks.className = 'checks';
    fold.append(summary, checks);
    for (const [f, n] of rows) row(checks, { name: 'f', value: f.id, label: f.label, count: n });
    pick.append(fold);
  }
}
// ➤ The lists that never change: levels, languages, degrees, deal-breakers.
function drawStaticLists() {
  for (const l of cats.seniority.levels) row($('#levels-pick'), { name: 'level', value: l.id, label: l.label, radio: true });
  for (const l of cats.languages.languages) row($('#languages-pick'), { name: 'lg', value: l.code, label: l.label });
  for (const d of cats.degrees.degrees) row($('#degrees-pick'), { name: 'dg', value: d.id, label: d.label });
  for (const v of cats.vetoes.vetoes) row($('#vetoes-pick'), { name: 'v', value: v.id, label: v.label });
  for (const fold of $$('#filters-form > details')) remember(fold, fold.dataset.group);
}

// ➤ Puts a profile into the controls. A fold-out is open when the visitor left it open, when it
// ➤ is open by default, or when something inside is set; it never closes on its own.
function fillFilters(p) {
  countryOrder.length = 0; countryOrder.push(...p.countries);
  drawCountries(p);
  drawFamilyCounts(p);
  for (const i of $$('#countries-pick input')) i.checked = p.countries.includes(i.value);
  $('#remote').checked = p.remote;
  for (const i of $$('#families-pick input')) i.checked = p.families.includes(i.value);
  for (const i of $$('#filters-form input[name="d"]')) i.checked = (Number(i.value) || 0) === p.posted;
  for (const i of $$('#levels-pick input')) i.checked = i.value === p.level;
  $('#max-years').value = p.maxYears ? String(p.maxYears) : '';
  for (const i of $$('#languages-pick input')) i.checked = p.languages.includes(i.value);
  for (const i of $$('#degrees-pick input')) i.checked = p.degrees.includes(i.value);
  $('#highest').value = p.highest;
  for (const i of $$('#vetoes-pick input')) i.checked = p.vetoes.includes(i.value);
  $('#roles').value = p.roles.join(', ');
  $('#no-words').value = p.noWords.join(', ');
  const active = activeGroups(p);
  for (const fold of $$('#filters-form > details')) {
    const g = fold.dataset.group;
    fold.open = foldState.has(g) ? foldState.get(g) || active.has(g) : OPEN_BY_DEFAULT.has(g) || active.has(g);
  }
}
function activeGroups(p) {
  const on = { country: p.countries.length || p.remote, occupations: p.families.length, posted: p.posted, level: p.level !== 'any' || p.maxYears, languages: p.languages.length, degrees: p.degrees.length || p.highest !== 'none', roles: p.roles.length, vetoes: p.vetoes.length || p.noWords.length };
  return new Set(Object.keys(on).filter(k => on[k]));
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
}

// ➤ The words and the date, applied to what is already downloaded and judged. No network here.
function draw() {
  if (!loaded) return;
  const { q, debug } = readHash();
  const words = wordsOf(q);
  const since = loaded.profile.posted ? new Date(Date.now() - loaded.profile.posted * 864e5).toISOString().slice(0, 10) : '';
  const shown = loaded.offers.filter(o => (!since || (o.d && o.d >= since)) && matchesWords(o, words, countryName));
  const failed = loaded.failed.length ? ` (${loaded.failed.length} part${loaded.failed.length === 1 ? '' : 's'} failed to download)` : '';
  const narrowed = words.length || !isEmptyProfile(loaded.profile);
  text('#results-status', narrowed ? `${shown.length.toLocaleString('en')} of ${loaded.total.toLocaleString('en')} offers match your filters${failed}.` : `${shown.length.toLocaleString('en')} offers, newest first${failed}.`);
  if (shown.length) renderList($('#list'), shown, ctx); else renderEmpty($('#list'), loaded.stages, loaded.total);
  if (debug && loaded.dropped) renderDebug($('#debug'), loaded.dropped); else $('#debug').hidden = true;
}

// ➤ Reads the address, puts it into the controls, downloads what the scope needs, judges, draws.
// ➤ Nothing set and nothing asked: the front. Nothing set but Search pressed: the whole pile.
async function run() {
  const { code, q, all } = readHash();
  $('#q').value = q;
  $('#code-input').value = code;
  let profile = normaliseProfile({});
  if (code) {
    try { profile = decodeProfile(code, ids); } catch (e) { $('#results').hidden = false; text('#results-status', `That code cannot be read: ${e.message}.`); $('#list').replaceChildren(); loaded = null; return; }
  }
  fillFilters(profile);
  const active = activeGroups(profile).size;
  text('#filters-toggle', active ? `☰ Filters · ${active}` : '☰ Filters');
  if (isEmptyProfile(profile) && !q && !all) { $('#results').hidden = true; loaded = null; return; }

  // ➤ The same scope already downloaded? Then only redraw.
  const scope = { ...profile, remote: profile.remote || !profile.countries.length };
  const key = JSON.stringify([code]);
  if (loaded && loaded.key === key) { draw(); return; }
  loaded = null;
  $('#results').hidden = false;
  $('#list').replaceChildren();
  const files = shardFiles(index, scope);
  text('#results-status', `Downloading ${files.length} part${files.length === 1 ? '' : 's'} of the pile…`);
  const { offers, failed } = await loadShards(files, 'data', getJson, (done, n) => text('#results-status', `Downloading ${done} of ${n}…`));
  const alive = offers.filter(o => !isExpired(o));
  const stages = {}, dropped = [];
  let kept = alive;
  if (!isEmptyProfile(profile)) {
    const judge = makeJudge(profile, cats, engine);
    kept = [];
    for (const o of alive) { const v = judge(o); if (v.ok) kept.push(o); else { dropped.push({ o, verdict: v }); stages[v.stage] = (stages[v.stage] || 0) + 1; } }
    kept = sortOffers(kept, profile);
  } else kept = newestFirst(kept);
  loaded = { key, offers: kept, total: alive.length, failed, profile, stages, dropped };
  draw();
}

// ➤ The CV: a text file is read as it is; a PDF through pdf.js, loaded from this site only then.
// ➤ Its job titles tick the occupations they belong to, its degree lines the degrees, its
// ➤ language lines the languages. Nothing of it is kept or sent.
async function fileText(file) {
  if (/\.(txt|md)$/i.test(file.name) || file.type.startsWith('text/')) return file.text();
  const pdfjs = await import('./vendor/pdf.min.js');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.min.js', import.meta.url).href;
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) pages.push((await (await doc.getPage(i)).getTextContent()).items.map(it => it.str).join(' '));
  return pages.join('\n');
}
async function readCvFile(file) {
  text('#cv-status', `Reading ${file.name}…`);
  try {
    const t = await fileText(file);
    if (t.trim().length < 200) { text('#cv-status', 'That file is too short to be a CV.'); return; }
    familyTerms ||= await getJson('catalogues/family-terms.json');
    const s = readCv(t, { ...cats, familyTerms });
    const p = profileFromForm();
    const merged = normaliseProfile({ ...p, families: [...p.families, ...s.families], degrees: [...p.degrees, ...s.degrees], languages: [...p.languages, ...s.languages] });
    const found = [s.families.length ? familiesSummary(s.families) : '', s.degrees.length ? `degrees: ${s.degrees.map(degreeName).join(', ')}` : '', s.languages.length ? `languages: ${s.languages.map(languageName).join(', ')}` : ''].filter(Boolean);
    text('#cv-status', found.length ? `Ticked from your CV: ${found.join(' · ')}.` : 'Nothing of ours found in that CV; tick the filters by hand.');
    writeHash(stateFromForm(merged));
  } catch (e) {
    text('#cv-status', `Could not read that file (${e.message}).`);
  }
}

// ➤ On a phone the filters are a panel the button opens and closes; on a desk they sit on the left.
function wireControls() {
  const panel = $('#filters');
  const toggle = $('#filters-toggle');
  const open = on => { panel.classList.toggle('is-open', on); toggle.setAttribute('aria-expanded', String(on)); document.body.classList.toggle('filters-open', on); };
  toggle.addEventListener('click', () => open(!panel.classList.contains('is-open')));
  $('#filters-close').addEventListener('click', () => open(false));
  // ➤ Any change in the panel is the new profile; ticking a country puts it last in the order.
  $('#filters-form').addEventListener('change', e => {
    if (e.target.name === 'c') { const k = countryOrder.indexOf(e.target.value); if (e.target.checked && k < 0) countryOrder.push(e.target.value); else if (!e.target.checked && k >= 0) countryOrder.splice(k, 1); }
    writeHash(stateFromForm());
  });
  $('#filters-clear').addEventListener('click', () => { countryOrder.length = 0; writeHash({ q: $('#q').value.trim() }); });
  // ➤ Search: a code pasted over the current one loads it; otherwise the filters and words as
  // ➤ they are; with nothing at all, the whole pile.
  $('#search').addEventListener('submit', e => {
    e.preventDefault();
    const state = stateFromForm();
    const typed = $('#code-input').value.trim();
    if (typed && typed !== state.p) {
      try { decodeProfile(typed, ids); state.p = typed; } catch (err) { $('#results').hidden = false; text('#results-status', `That code cannot be read: ${err.message}.`); return; }
    }
    if (!state.p && !state.q) state.all = '1';
    search(state);
  });
  $('#copy-code').addEventListener('click', async () => {
    const code = $('#code-input').value.trim();
    if (!code) return;
    try { await navigator.clipboard.writeText(code); text('#copy-code', 'Copied'); setTimeout(() => text('#copy-code', 'Copy'), 1500); } catch { $('#code-input').select(); }
  });
  $('#cv-file').addEventListener('change', e => { const file = e.target.files[0]; if (file) readCvFile(file); e.target.value = ''; });
  // ➤ Typing redraws at once; the address follows once the typing pauses.
  let timer;
  $('#q').addEventListener('input', () => { writeHash(stateFromForm(), true); draw(); clearTimeout(timer); timer = setTimeout(() => writeHash(stateFromForm(), true), 600); });
  window.addEventListener('hashchange', () => run().catch(e => text('#results-status', `Something went wrong: ${e.message}`)));
}

async function main() {
  try { index = await getJson('data/index.json'); } catch { text('#generated', 'The pile is not published yet. Come back in a few hours.'); return; }
  const names = ['families', 'countries', 'languages', 'degrees', 'seniority', 'vetoes'];
  const all = await Promise.all(names.map(n => getJson(`catalogues/${n}.json`)));
  cats = Object.fromEntries(names.map((n, i) => [n, all[i]]));
  ids = catalogueIds(cats);
  ctx = { countryName, sourceName: s => index.sources?.[s]?.short || index.sources?.[s]?.name || s, languageName, degreeName };
  drawPile();
  drawStaticLists();
  wireControls();
  await run();
}

main().catch(e => { text('#generated', `Something went wrong: ${e.message}`); });
