// ➤ The one page. One search bar takes what a visitor types: a title, a company, a town or a
// ➤ country (lib/query.js reads the towns and countries, which become the search's places, with
// ➤ the distance in the pill under the bar), or a code pasted whole. The Filters button opens
// ➤ the rest of the profile under the bar: country, occupations by group and their
// ➤ specialties, posted date, work mode, level and years, languages, degrees, pay, title words
// ➤ and words to avoid. The profile is packed into a short code that appears as the filters
// ➤ change; the code, the search words and the distance live in the address after the #, so a
// ➤ list can be bookmarked and shared. A CV read on the device ticks the occupations, degrees
// ➤ and languages it names. A search downloads only the parts of the pile it needs, judges
// ➤ them here, hides adverts past their deadline and draws the list; with nothing asked, the
// ➤ front shows today's offers behind it. Nothing about the visitor leaves the browser.
import { encodeProfile, decodeProfile, normaliseProfile, isEmptyProfile, catalogueIds, familyOfSpecialty } from './lib/codec.js';
import { makeJudge, sortOffers } from './lib/gates.js';
import { shardFiles, loadShards } from './lib/shards.js';
import { renderList, renderEmpty, renderDebug, backdropRow } from './lib/render.js';
import { matchesWords, isExpired, newestFirst } from './lib/search.js';
import { compileGazetteer, countryNames, readQuery, scopeCountries } from './lib/query.js';
import { startBackdrop } from './lib/backdrop.js';
import { spin, land } from './lib/roll.js';
import { readCv } from './lib/cv.js';
import * as engine from './lib/engine.js';
import { t, label, countryLabel, languageLabel, number } from './lib/i18n.js';
import './lib/theme.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const text = (sel, s) => { const e = $(sel); if (e) e.textContent = s; };
// ➤ The site's root, from the page: "" at the root, "../" for the Spanish page under es/.
const ROOT = document.documentElement.dataset.root || '';
const getJson = async url => { const r = await fetch(ROOT + url, { cache: 'no-cache' }); if (!r.ok) throw new Error(`${r.status} for ${url}`); return r.json(); };
const STALE_HOURS = 48;
const RADIUS = 100;   // ➤ km around the towns typed, until the visitor picks another
const NARROW = matchMedia('(width < 47.5625rem)');

let index, cats, ids, ctx;
let loaded = null;              // ➤ the last set downloaded and judged, so words and dates redraw without a download
const countryOrder = [];        // ➤ the order countries were ticked in: the first comes first in the list
let familyTerms = null;         // ➤ ESCO's job titles, fetched the first time a CV is read
let gazetteer = null;           // ➤ the towns and countries the bar reads, fetched the first time something is searched
let places = null;              // ➤ the same, once fetched
let backdropDrawn = false;      // ➤ the front's backdrop has been drawn

// ➤ The state in the address: p = the code (every filter), q = the search words, r = the
// ➤ distance around the towns typed, all = the whole pile was asked for with nothing set.
function readHash() {
  const p = new URLSearchParams(location.hash.replace(/^#/, ''));
  return { code: (p.get('p') || '').trim(), q: (p.get('q') || '').trim(), r: Number(p.get('r')) || RADIUS, all: p.has('all'), debug: p.has('dbg') };
}
const hashOf = parts => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(parts)) if (v) p.set(k, v); return p.toString() ? `#${p}` : ''; };
function writeHash(parts, replace = false) {
  if (replace) history.replaceState(null, '', hashOf(parts) || location.pathname + location.search); else location.hash = hashOf(parts);
}
// ➤ Search: the address changes and the browser calls run(); when it would not change (the
// ➤ words were already written while typing), run() is called here, so Search always answers.
function search(parts) {
  const h = hashOf(parts);
  if (h === location.hash) run().catch(showError); else location.hash = h;
}

const showError = e => text('#results-status', t('Something went wrong: {error}', { error: e.message }));
// ➤ A code that does not read: said under the bar, where codes are pasted.
function unreadable() {
  $('#search').classList.add('is-unreadable');
  barNote(t('That code could not be read. Check it was copied whole.'));
}
function clearNote() { $('#search').classList.remove('is-unreadable'); $('#bar-note').hidden = true; }
// ➤ A line under the bar for what stops the page itself (no pile yet, an error).
const barNote = s => { text('#bar-note', s); $('#bar-note').hidden = false; };
const countryName = cc => cc === 'xx' ? t('Remote') : cc === 'zz' || !cc ? t('Country not stated') : countryLabel(cc);
const familyOf = id => cats.families.families.find(f => f.id === id);
const groupLabel = id => label(cats.families.groups.find(g => g.id === id)) || id;
const degreeName = id => label(cats.degrees.degrees.find(d => d.id === id)) || id;
const specialtyName = code => label(cats.occupations.occupations.find(o => o.code === code)) || code;
const languageName = languageLabel;
const n = number;
// ➤ "Engineers: Mechanical, Civil · Technicians: Mechanical": the group gives a label its meaning.
function familiesSummary(fams) {
  const byGroup = new Map();
  for (const id of fams) { const f = familyOf(id); const g = f?.group || ''; byGroup.set(g, [...(byGroup.get(g) || []), label(f) || id]); }
  return [...byGroup].map(([g, labels]) => `${groupLabel(g)}: ${labels.join(', ')}`).join(' · ');
}

// ➤ The profile is what the filters say; the code is the profile packed, empty when nothing is set.
function profileFromForm() {
  const checked = name => $$(`#filters-form input[name="${name}"]:checked`).map(i => i.value);
  const words = sel => $(sel).value.split(',').map(s => s.trim()).filter(Boolean).slice(0, 8);
  const ticked = new Set(checked('c'));
  const countries = [...countryOrder.filter(c => ticked.has(c)), ...[...ticked].filter(c => !countryOrder.includes(c))];
  // ➤ A specialty left ticked under a family just unticked goes with it.
  const families = checked('f');
  const specialties = checked('e').filter(c => families.includes(familyOfSpecialty(c)));
  return normaliseProfile({
    families, specialties, countries, place: null, remote: $('#remote').checked, posted: Number($('#filters-form input[name="d"]:checked')?.value) || 0,
    modes: checked('mode'), minPay: Number($('#min-pay').value) || 0, payStated: $('#pay-stated').checked,
    level: checked('level')[0] || 'any', maxYears: Number($('#max-years').value) || null, highest: 'none',
    languages: checked('lg'), degrees: checked('dg'), roles: words('#roles'), noWords: words('#no-words'),
  });
}
function stateFromForm(profile = profileFromForm()) {
  const r = Number($('#radius').value);
  return { p: isEmptyProfile(profile) ? '' : encodeProfile(profile, ids), q: $('#q').value.trim(), r: r && r !== RADIUS ? String(r) : '', dbg: readHash().debug ? '1' : '' };
}

// ➤ One row per choice: the tick on the left, the label, today's count on the right when given.
function row(container, { name, value, label, radio = false, count }) {
  const l = document.createElement('label'); l.className = 'check-row';
  const i = document.createElement('input'); i.type = radio ? 'radio' : 'checkbox'; i.name = name; i.value = value;
  const s = document.createElement('span'); s.textContent = label;
  l.append(i, s);
  if (count !== undefined) { const c = document.createElement('span'); c.className = 'count'; c.textContent = n(count); l.append(c); }
  container.append(l);
  return i;
}
// ➤ The choices inside a ticked family (its specialties), under it.
function subRows(container, name, items) {
  if (!items.length) return;
  const box = document.createElement('div'); box.className = 'checks sub';
  for (const [value, label] of items) row(box, { name, value, label });
  container.append(box);
}
// ➤ The fullest first from the index's counts, then any the profile names that have none today.
const withChosen = (counted, chosen) => [...Object.entries(counted || {}).sort((a, b) => b[1] - a[1]).map(([k]) => k), ...chosen.filter(k => !(counted || {})[k])];

// ➤ Countries with adverts, the fullest first, plus any the profile names without adverts today (count 0).
function drawCountries(profile) {
  const counts = index.counts?.by_country || {};
  // ➤ Remote is not a country: it is the tick below the list.
  const rows = Object.entries(counts).filter(([cc]) => cc !== 'zz' && cc !== 'xx').sort((a, b) => b[1] - a[1]);
  for (const cc of profile.countries) if (!counts[cc]) rows.push([cc, 0]);
  const pick = $('#countries-pick');
  pick.replaceChildren();
  for (const [cc, count] of rows) row(pick, { name: 'c', value: cc, label: countryName(cc), count });
}

// ➤ Inside "Occupations", each group's name (Engineers, Technicians, crews…) over the families
// ➤ that have adverts in the countries ticked, the fullest first; a family the profile names
// ➤ stays listed even at zero, and a ticked family shows its specialties. The counts order the
// ➤ list and decide what is listed; they are not shown.
function drawFamilies(profile) {
  const chosen = new Set(profile.countries);
  const count = id => Object.entries(index.families?.[id]?.countries || {}).filter(([cc]) => !chosen.size || chosen.has(cc)).reduce((s, [, e]) => s + (e.n || 0), 0);
  const pick = $('#families-pick');
  pick.replaceChildren();
  for (const g of cats.families.groups) {
    const rows = cats.families.families.filter(f => f.group === g.id).map(f => [f, count(f.id)]).filter(([f, c]) => c > 0 || profile.families.includes(f.id)).sort((a, b) => b[1] - a[1]);
    if (!rows.length) continue;
    const name = document.createElement('div'); name.className = 'occupation-group'; name.textContent = label(g);
    const checks = document.createElement('div'); checks.className = 'checks';
    for (const [f] of rows) {
      row(checks, { name: 'f', value: f.id, label: label(f) });
      if (profile.families.includes(f.id)) subRows(checks, 'e', withChosen(index.families?.[f.id]?.occupations, profile.specialties.filter(c => familyOfSpecialty(c) === f.id)).map(c => [c, specialtyName(c)]));
    }
    pick.append(name, checks);
  }
}
// ➤ The lists that never change: levels, languages, degrees.
function drawStaticLists() {
  for (const l of cats.seniority.levels) row($('#levels-pick'), { name: 'level', value: l.id, label: label(l), radio: true });
  for (const l of cats.languages.languages) row($('#languages-pick'), { name: 'lg', value: l.code, label: languageName(l.code) });
  for (const d of cats.degrees.degrees) row($('#degrees-pick'), { name: 'dg', value: d.id, label: label(d) });
}

// ➤ Puts a profile into the controls. A group with something set carries a mark, and the
// ➤ Filters button counts them.
function fillFilters(p) {
  countryOrder.length = 0; countryOrder.push(...p.countries);
  drawCountries(p);
  drawFamilies(p);
  for (const i of $$('#countries-pick input[name="c"]')) i.checked = p.countries.includes(i.value);
  $('#remote').checked = p.remote;
  for (const i of $$('#families-pick input[name="f"]')) i.checked = p.families.includes(i.value);
  for (const i of $$('#families-pick input[name="e"]')) i.checked = p.specialties.includes(i.value);
  for (const i of $$('#filters-form input[name="d"]')) i.checked = (Number(i.value) || 0) === p.posted;
  for (const i of $$('#filters-form input[name="mode"]')) i.checked = p.modes.includes(i.value);
  $('#min-pay').value = p.minPay ? String(p.minPay) : '';
  $('#pay-stated').checked = p.payStated;
  for (const i of $$('#levels-pick input')) i.checked = i.value === p.level;
  $('#max-years').value = p.maxYears ? String(p.maxYears) : '';
  for (const i of $$('#languages-pick input')) i.checked = p.languages.includes(i.value);
  for (const i of $$('#degrees-pick input')) i.checked = p.degrees.includes(i.value);
  $('#roles').value = p.roles.join(', ');
  $('#no-words').value = p.noWords.join(', ');
  const active = activeGroups(p);
  for (const group of $$('#filters-form .filter-group')) group.classList.toggle('is-active', active.has(group.dataset.group));
  text('#filters-toggle-label', active.size ? `${t('Filters')} · ${active.size}` : t('Filters'));
}
function activeGroups(p) {
  const on = { country: p.countries.length || p.remote, occupations: p.families.length, posted: p.posted, mode: p.modes.length, pay: p.minPay || p.payStated, level: p.level !== 'any' || p.maxYears, languages: p.languages.length, degrees: p.degrees.length, roles: p.roles.length, exclude: p.noWords.length };
  return new Set(Object.keys(on).filter(k => on[k]));
}

// ➤ The pile's numbers: the big count on the front, the count beside the results, and the
// ➤ notice when the sources have not been read for two days.
function drawPile() {
  // ➤ The pile is built from what the crawler read, and the crawler may stop while the
  // ➤ building goes on: the age that matters is the newest read, not the newest build.
  const readHours = Math.round((Date.now() - new Date(index.crawled_at || index.generated_at).getTime()) / 36e5);
  land($('#hero-count'), n(index.counts.offers));
  text('#hero-stats', t('out of {n} listed today', { n: n(index.counts.offers) }));
  if (readHours > STALE_HOURS) { text('#stale-text', t('The sources were last read {n} days ago; some offers may have closed since.', { n: Math.round(readHours / 24) })); $('#stale').hidden = false; }
}

// ➤ The words and the date, applied to what is already downloaded and judged. No network here:
// ➤ while the visitor types, the words the bar reads now; the places change on Search.
function draw() {
  if (!loaded) return;
  const { debug } = readHash();
  const words = readQuery($('#q').value, places).words;
  const since = loaded.profile.posted ? new Date(Date.now() - loaded.profile.posted * 864e5).toISOString().slice(0, 10) : '';
  // ➤ An offer whose page names no day is not known to be old: it stays.
  const inDate = loaded.offers.filter(o => !since || !o.d || o.d >= since);
  const shown = inDate.filter(o => matchesWords(o, words, countryName));
  const lost = loaded.failed.length;
  const partsFailed = !lost ? '' : lost === 1 ? t(' (1 part failed to download)') : t(' ({n} parts failed to download)', { n: lost });
  const placed = loaded.read.towns.length || loaded.read.countries.length;
  const narrowed = words.length || placed || !isEmptyProfile(loaded.profile);
  // ➤ With no occupation and no country named, the site shows the newest of the pile rather
  // ➤ than downloading all of it: say so, and say what to do for the rest.
  const onlyNewest = !loaded.profile.families.length && !loaded.profile.countries.length && !loaded.profile.remote && !placed && index.latest?.files?.length;
  // ➤ How many match, large above the list. The status line says out of how many (the whole
  // ➤ pile, or the newest part of it that was searched) and where the ones that match are, the
  // ➤ fullest countries first.
  land($('#hero-match'), n(shown.length));
  text('#hero-match-text', !narrowed ? t('newest offers') : shown.length === 1 ? t('offer matches your filters') : t('offers match your filters'));
  const where = new Map();
  for (const o of shown) where.set(o.cc, (where.get(o.cc) || 0) + 1);
  const countries = [...where].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([cc, k]) => `${countryName(cc)} ${n(k)}`);
  const said = { shown: n(shown.length), total: n(onlyNewest ? loaded.total : index.counts.offers), pile: n(index.counts.offers) };
  const head = !narrowed ? t('{shown} newest offers', said) + (onlyNewest ? t(' of {pile}; choose a country or an occupation for the rest', said) : '')
    : onlyNewest ? t('{shown} of the newest {total} offers; choose a country or an occupation for the rest', said) : t('{shown} of {total} offers', said);
  text('#results-status', [head, ...countries].join(' · ') + partsFailed);
  // ➤ Zero results: every stage that dropped something, the date and the words included.
  const stages = { ...loaded.stages, 'posted date': loaded.offers.length - inDate.length, 'search words': inDate.length - shown.length };
  // ➤ The towns searched, so a job run in many towns names the nearest.
  ctx.places = loaded.read.towns;
  if (shown.length) renderList($('#list'), shown, ctx); else renderEmpty($('#list'), stages, loaded.total);
  if (debug && loaded.dropped) renderDebug($('#debug'), loaded.dropped); else $('#debug').hidden = true;
}

// ➤ Results shown or hidden: the front's count and backdrop make way for them.
function showResults(on) {
  $('#results').hidden = !on;
  document.body.classList.toggle('has-results', on);
}
function downloading(done, total) {
  const on = done < total;
  $('#progress').hidden = !on; $('#skeleton').hidden = !on;
  $('#progress > i').style.width = total ? `${Math.round((done / total) * 100)}%` : '0%';
}

// ➤ The towns and countries the bar reads: data/places.json, fetched once, the first time
// ➤ something is searched.
function loadGazetteer() {
  gazetteer ||= getJson('data/places.json').then(p => (places = compileGazetteer(p, countryNames(cats.countries)))).catch(() => null);
  return gazetteer;
}

// ➤ The front's backdrop of today's offers (data/today.json), drawn once.
async function drawBackdrop() {
  if (backdropDrawn) return;
  backdropDrawn = true;
  try {
    const { offers } = await getJson('data/today.json');
    startBackdrop($('#backdrop'), offers || [], { row: o => backdropRow(o, ctx) });
  } catch { $('#backdrop').hidden = true; }
}

// ➤ Reads the address, puts it into the controls, downloads what the search needs, judges,
// ➤ draws. Nothing set and nothing asked: the front. Nothing set but Search pressed: the
// ➤ newest of the pile.
// ➤ Each search is numbered: when the visitor changes the search while an earlier one is still
// ➤ downloading, the earlier one stops at its next step instead of drawing an old answer.
let searches = 0;
async function run() {
  const search = ++searches;
  const { code, q, r, all } = readHash();
  $('#q').value = q;
  $('#code-input').value = code;
  $('#radius').value = String(r);
  let profile = normaliseProfile({});
  if (code) {
    try { profile = decodeProfile(code, ids); } catch { unreadable(); showResults(false); loaded = null; drawBackdrop(); return; }
  }
  // ➤ An older code with a town in it: the town goes into the bar and its distance into the
  // ➤ pill, where the search reads places now, and the code is written again without it.
  if (profile.place) {
    const moved = { ...profile, place: null };
    const km = profile.place.km || RADIUS;
    writeHash({ p: isEmptyProfile(moved) ? '' : encodeProfile(moved, ids), q: [q, profile.place.name].filter(Boolean).join(' '), r: km !== RADIUS ? String(km) : '', dbg: readHash().debug ? '1' : '' }, true);
    return run();
  }
  fillFilters(profile);
  if (isEmptyProfile(profile) && !q && !all) { showResults(false); loaded = null; $('#radius-pill').hidden = true; drawBackdrop(); return; }

  const read = readQuery(q, q ? await loadGazetteer() : null);
  if (search !== searches) return;
  $('#radius-pill').hidden = !read.towns.length;
  // ➤ The same parts and the same places already judged? Then only redraw.
  const key = JSON.stringify([code, read.towns.map(p => [p.lat, p.lon]), read.countries, read.said, read.towns.length ? r : 0]);
  if (loaded && loaded.key === key) { showResults(true); draw(); return; }
  loaded = null;
  showResults(true);
  spin($('#hero-match'), '0.000');
  $('#list').replaceChildren();
  // ➤ The parts of the pile: the profile's, and those of the places read (a town's radius may
  // ➤ reach over a border).
  const reach = read.towns.length || read.countries.length ? scopeCountries(read, places, r) : [];
  const scope = { ...profile, countries: [...new Set([...profile.countries, ...reach])], remote: profile.remote || (!profile.countries.length && !reach.length), onlyRemote: profile.remote && !profile.countries.length && !reach.length };
  const files = shardFiles(index, scope);
  text('#results-status', files.length === 1 ? t('Downloading 1 part of the pile…') : t('Downloading {n} parts of the pile…', { n: files.length }));
  downloading(0, files.length);
  const { offers, failed: lost } = await loadShards(files, 'data', getJson, (done, total) => { if (search !== searches) return; text('#results-status', t('Downloading {done} of {total}…', { done, total })); downloading(done, total); });
  if (search !== searches) return;
  downloading(1, 1);
  const alive = offers.filter(o => !isExpired(o));
  // ➤ The search's profile: the filters, with the places the bar read.
  const judged = { ...profile, countries: [...new Set([...profile.countries, ...read.countries])], places: read.towns, said: read.said, km: r };
  const stages = {}, dropped = [];
  let kept = alive;
  if (!isEmptyProfile(profile) || read.towns.length || read.countries.length) {
    const judge = makeJudge(judged, cats, engine);
    kept = [];
    for (const o of alive) { const v = judge(o); if (v.ok) kept.push(o); else { dropped.push({ o, verdict: v }); stages[v.stage] = (stages[v.stage] || 0) + 1; } }
    kept = sortOffers(kept, judged);
  } else kept = newestFirst(kept);
  loaded = { key, offers: kept, total: alive.length, failed: lost, profile: judged, read, stages, dropped };
  draw();
}

// ➤ The CV: a text file is read as it is; a PDF through pdf.js, loaded from this site only then.
// ➤ Its job titles tick the occupations they belong to, its degree lines the degrees, its
// ➤ language lines the languages. Nothing of it is kept or sent.
const cvStatus = (state, s) => { const e = $('#cv-status'); e.dataset.state = state; e.textContent = s; };
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
  cvStatus('reading', t('Reading {name}…', { name: file.name }));
  try {
    const cv = await fileText(file);
    if (cv.trim().length < 200) { cvStatus('none', t('That file is too short to be a CV.')); return; }
    familyTerms ||= await getJson('catalogues/family-terms.json');
    const s = readCv(cv, { ...cats, familyTerms });
    const p = profileFromForm();
    const merged = normaliseProfile({ ...p, families: [...p.families, ...s.families], degrees: [...p.degrees, ...s.degrees], languages: [...p.languages, ...s.languages] });
    const found = [s.families.length ? familiesSummary(s.families) : '', s.degrees.length ? t('degrees: {list}', { list: s.degrees.map(degreeName).join(', ') }) : '', s.languages.length ? t('languages: {list}', { list: s.languages.map(languageName).join(', ') }) : ''].filter(Boolean);
    if (found.length) cvStatus('ticked', t('Ticked from your CV: {found}.', { found: found.join(' · ') })); else cvStatus('none', t('Nothing of ours found in that CV; tick the filters by hand.'));
    writeHash(stateFromForm(merged));
  } catch (e) {
    cvStatus('error', t('Could not read that file ({error}).', { error: e.message }));
  }
}

function wireControls() {
  // ➤ The Filters button opens and closes the panel under the bar.
  const toggle = $('#filters-toggle');
  toggle.addEventListener('click', () => {
    const open = $('#filters').hidden;
    $('#filters').hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  });
  // ➤ Any change in the panel is the new profile; ticking a country puts it last in the order.
  $('#filters-form').addEventListener('change', e => {
    if (e.target.name === 'c') { const k = countryOrder.indexOf(e.target.value); if (e.target.checked && k < 0) countryOrder.push(e.target.value); else if (!e.target.checked && k >= 0) countryOrder.splice(k, 1); }
    writeHash(stateFromForm());
  });
  $('#radius').addEventListener('change', () => search(stateFromForm()));
  $('#filters-clear').addEventListener('click', () => { countryOrder.length = 0; const { q, r } = stateFromForm(); writeHash({ q, r }); });
  // ➤ The bar: a code pasted whole loads the filters it packs; anything else is searched, and
  // ➤ with nothing at all, the newest of the pile. What looks like a code but does not read is
  // ➤ said under the bar, and searched as words all the same.
  $('#search').addEventListener('submit', e => {
    e.preventDefault();
    clearNote();
    const typed = $('#q').value.trim();
    if (/^[A-Za-z0-9_-]{8,}$/.test(typed)) {
      try { decodeProfile(typed, ids); $('#q').value = ''; search({ ...stateFromForm(), p: typed, q: '' }); return; } catch { if (/\d/.test(typed) && /[A-Z]/.test(typed)) unreadable(); }
    }
    const state = stateFromForm();
    if (!state.p && !state.q) state.all = '1';
    search(state);
  });
  // ➤ The code in the panel: pasted or typed over, it loads when it reads; emptied, the filters go.
  $('#code-input').addEventListener('change', () => {
    clearNote();
    const code = $('#code-input').value.trim();
    const { q, r } = stateFromForm();
    if (!code) { writeHash({ q, r }); return; }
    try { decodeProfile(code, ids); search({ p: code, q, r }); } catch { unreadable(); }
  });
  const copy = $('#copy-code');
  copy.addEventListener('click', async () => {
    const code = $('#code-input').value.trim();
    if (!code) return;
    try { await navigator.clipboard.writeText(code); text('#copy-label', t('Copied')); copy.classList.add('is-done'); setTimeout(() => { text('#copy-label', t('Copy')); copy.classList.remove('is-done'); }, 1500); } catch { $('#code-input').select(); }
  });
  $('#cv-file').addEventListener('change', e => { const file = e.target.files[0]; if (file) readCvFile(file); e.target.value = ''; });
  // ➤ Typing redraws at once; the address follows once the typing pauses.
  $('#q').addEventListener('input', () => { clearNote(); writeHash(stateFromForm(), true); draw(); });
  window.addEventListener('hashchange', () => run().catch(showError));
  // ➤ The other language keeps the visitor's search: the link takes the address's # along.
  const other = $('.nav__lang');
  if (other) other.addEventListener('click', () => { other.hash = location.hash; });
  // ➤ A phone's bar is narrower: a shorter hint.
  const hint = () => { $('#q').placeholder = NARROW.matches ? t('Title, company, town or code') : t('Title, company, town, or paste your code'); };
  hint();
  NARROW.addEventListener('change', hint);
}

async function main() {
  // ➤ The count turns while the pile's index and the catalogues come, and lands on the number.
  spin($('#hero-count'));
  try { index = await getJson('data/index.json'); } catch { land($('#hero-count'), '0'); barNote(t('The pile is not published yet. Come back in a few hours.')); return; }
  const names = ['families', 'occupations', 'countries', 'languages', 'degrees', 'seniority', 'vetoes'];
  const all = await Promise.all(names.map(name => getJson(`catalogues/${name}.json`)));
  cats = Object.fromEntries(names.map((name, i) => [name, all[i]]));
  ids = catalogueIds(cats);
  ctx = { countryName, sourceName: s => t(index.sources?.[s]?.short || index.sources?.[s]?.name || s), isVia: s => !!index.sources?.[s]?.via, languageName, degreeName };
  drawPile();
  drawStaticLists();
  wireControls();
  await run();
}

main().catch(e => barNote(t('Something went wrong: {error}', { error: e.message })));
