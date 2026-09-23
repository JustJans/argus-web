// ➤ The one page. The filters on the left are the visitor's whole profile: country (in the
// ➤ order ticked) or a town and a distance, occupations by group and their specialties, posted date, level and years, languages, degrees,
// ➤ title words, deal-breakers; each a fold-out. The profile is packed into a short code that
// ➤ appears as the filters change and can be copied or pasted; the code and the search words
// ➤ live in the address after the #, so a list can be bookmarked and shared. A CV read on
// ➤ the device ticks the occupations, degrees and languages it names. Everything downloads
// ➤ only the parts of the pile it needs, judges them here, hides adverts past their deadline
// ➤ and draws the list. Nothing about the visitor leaves the browser.
import { encodeProfile, decodeProfile, normaliseProfile, isEmptyProfile, catalogueIds, familyOfSpecialty, countryProfile } from './lib/codec.js';
import { makeJudge, sortOffers } from './lib/gates.js';
import { shardFiles, loadShards } from './lib/shards.js';
import { renderList, renderEmpty, renderDebug } from './lib/render.js';
import { wordsOf, matchesWords, isExpired, newestFirst } from './lib/search.js';
import { readCv } from './lib/cv.js';
import * as engine from './lib/engine.js';
import { t, label, countryLabel, languageLabel, number } from './lib/i18n.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const text = (sel, s) => { const e = $(sel); if (e) e.textContent = s; };
// ➤ The site's root, from the page: "" at the root, "../" for the Spanish page under es/.
const ROOT = document.documentElement.dataset.root || '';
const getJson = async url => { const r = await fetch(ROOT + url, { cache: 'no-cache' }); if (!r.ok) throw new Error(`${r.status} for ${url}`); return r.json(); };
const STALE_HOURS = 48;
const OPEN_BY_DEFAULT = new Set(['country', 'posted']);

let index, cats, ids, ctx;
let loaded = null;              // ➤ the last set downloaded and judged, so words and dates redraw without a download
const foldState = new Map();    // ➤ fold-outs the visitor opened or closed, kept across redraws
const countryOrder = [];        // ➤ the order countries were ticked in: the first comes first in the list
let familyTerms = null;         // ➤ ESCO's job titles, fetched the first time a CV is read
let places = null;              // ➤ the towns with offers, by the words the list shows, fetched the first time the town field is used
let chosenPlace = null;         // ➤ the town picked from that list: { cc, name, lat, lon }

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
  if (h === location.hash) run().catch(showError); else location.hash = h;
}

const showError = e => text('#results-status', t('Something went wrong: {error}', { error: e.message }));
// ➤ A code that does not read: what is wrong with it, in the page's language, and what to do.
const unreadable = e => { showResults(true); text('#results-status', t('That code cannot be read: {error}. Check it was pasted whole, or clear it and tick the filters by hand.', { error: t(e.message) })); };
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
  const place = chosenPlace && { ...chosenPlace, km: Number($('#radius').value) };
  return normaliseProfile({
    families, specialties, countries, place, remote: $('#remote').checked, posted: Number($('#filters-form input[name="d"]:checked')?.value) || 0,
    modes: checked('mode'), minPay: Number($('#min-pay').value) || 0, payStated: $('#pay-stated').checked,
    level: checked('level')[0] || 'any', maxYears: Number($('#max-years').value) || null, highest: $('#highest').value,
    languages: checked('lg'), degrees: checked('dg'), vetoes: checked('v'), roles: words('#roles'), noWords: words('#no-words'),
  });
}
function stateFromForm(profile = profileFromForm()) {
  return { p: isEmptyProfile(profile) ? '' : encodeProfile(profile, ids), q: $('#q').value.trim(), dbg: readHash().debug ? '1' : '' };
}

// ➤ One row per choice: the tick on the left, the label, today's count on the right.
function row(container, { name, value, label, radio = false }) {
  const l = document.createElement('label'); l.className = 'check-row';
  const i = document.createElement('input'); i.type = radio ? 'radio' : 'checkbox'; i.name = name; i.value = value;
  const s = document.createElement('span'); s.textContent = label;
  l.append(i, s);
  container.append(l);
  return i;
}
// ➤ The chevron every fold-out summary starts with (it turns when the fold-out opens).
function chevron() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'chev'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round'); svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', 'm9 18 6-6-6-6');
  svg.append(path);
  return svg;
}
const remember = (fold, key) => fold.addEventListener('toggle', () => foldState.set(key, fold.open));
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
  for (const [cc] of rows) row(pick, { name: 'c', value: cc, label: countryName(cc) });
}

// ➤ The town field's suggestions: the towns with offers, "München, Bavaria, Germany", the fullest
// ➤ first, with GeoNames' own name as the hint where the adverts spell it otherwise ("Munich").
// ➤ The browser draws and filters them (a datalist); only a town from the list is taken.
async function loadPlaces() {
  if (places) return;
  places = new Map();
  const options = document.createDocumentFragment();
  for (const [shown, other, region, cc, lat, lon] of (await getJson('data/places.json')).places) {
    const name = region && engine.fold(region) !== engine.fold(shown) ? `${shown}, ${region}` : shown;
    const value = `${name}, ${countryName(cc)}`;
    if (places.has(value)) continue;
    places.set(value, { cc, name, lat, lon });
    const option = document.createElement('option');
    option.value = value;
    if (other) option.label = other;
    options.append(option);
  }
  $('#places-list').append(options);
}

// ➤ Inside "Occupations", one fold-out per group (Engineers, Technicians, crews…) with the families
// ➤ that have adverts in the countries ticked, the fullest first; a family the profile names stays
// ➤ listed even at zero. The counts order the list and decide what is listed; they are not shown.
function drawFamilyCounts(profile) {
  const chosen = new Set(profile.countries);
  const count = id => Object.entries(index.families?.[id]?.countries || {}).filter(([cc]) => !chosen.size || chosen.has(cc)).reduce((s, [, e]) => s + (e.n || 0), 0);
  const pick = $('#families-pick');
  pick.replaceChildren();
  for (const g of cats.families.groups) {
    const rows = cats.families.families.filter(f => f.group === g.id).map(f => [f, count(f.id)]).filter(([f, c]) => c > 0 || profile.families.includes(f.id)).sort((a, b) => b[1] - a[1]);
    if (!rows.length) continue;
    const fold = document.createElement('details'); fold.className = 'filter-group'; fold.dataset.group = `families:${g.id}`;
    fold.open = foldState.has(fold.dataset.group) ? foldState.get(fold.dataset.group) : rows.some(([f]) => profile.families.includes(f.id));
    remember(fold, fold.dataset.group);
    const summary = document.createElement('summary'); summary.append(chevron(), document.createTextNode(label(g)));
    const checks = document.createElement('div'); checks.className = 'checks';
    fold.append(summary, checks);
    for (const [f] of rows) {
      row(checks, { name: 'f', value: f.id, label: label(f) });
      if (!profile.families.includes(f.id)) continue;
      subRows(checks, 'e', withChosen(index.families?.[f.id]?.occupations, profile.specialties.filter(c => familyOfSpecialty(c) === f.id)).map(c => [c, specialtyName(c)]));
    }
    pick.append(fold);
  }
}
// ➤ The lists that never change: levels, languages, degrees, deal-breakers.
function drawStaticLists() {
  for (const l of cats.seniority.levels) row($('#levels-pick'), { name: 'level', value: l.id, label: label(l), radio: true });
  for (const l of cats.languages.languages) row($('#languages-pick'), { name: 'lg', value: l.code, label: languageName(l.code) });
  for (const d of cats.degrees.degrees) row($('#degrees-pick'), { name: 'dg', value: d.id, label: label(d) });
  for (const v of cats.vetoes.vetoes) row($('#vetoes-pick'), { name: 'v', value: v.id, label: label(v) });
  for (const fold of $$('#filters-form > details')) remember(fold, fold.dataset.group);
}

// ➤ Puts a profile into the controls. A fold-out opens by itself only the first time it is
// ➤ drawn (the ones open by default, and any the profile already filters by); after that the
// ➤ visitor's own choice stands, so ticking a filter never unfolds the rest. A group with
// ➤ something set carries a mark, and the panel's head counts them.
function fillFilters(p) {
  countryOrder.length = 0; countryOrder.push(...p.countries);
  drawCountries(p);
  drawFamilyCounts(p);
  for (const i of $$('#countries-pick input[name="c"]')) i.checked = p.countries.includes(i.value);
  chosenPlace = p.place && { cc: p.place.cc, name: p.place.name, lat: p.place.lat, lon: p.place.lon };
  $('#place').value = p.place ? `${p.place.name}, ${countryName(p.place.cc)}` : '';
  $('#radius').value = String(p.place?.km || 25);
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
  $('#highest').value = p.highest;
  for (const i of $$('#vetoes-pick input')) i.checked = p.vetoes.includes(i.value);
  $('#roles').value = p.roles.join(', ');
  $('#no-words').value = p.noWords.join(', ');
  const active = activeGroups(p);
  for (const fold of $$('#filters-form > details')) {
    const g = fold.dataset.group;
    fold.classList.toggle('is-active', active.has(g));
    if (!foldState.has(g)) foldState.set(g, OPEN_BY_DEFAULT.has(g) || active.has(g));
    fold.open = foldState.get(g);
  }
  const head = active.size ? `${t('Filters')} · ${active.size}` : t('Filters');
  text('#filters-count', head);
  text('#filters-toggle-label', head);
}
function activeGroups(p) {
  const on = { country: p.countries.length || p.remote || p.place, occupations: p.families.length, posted: p.posted, mode: p.modes.length, pay: p.minPay || p.payStated, level: p.level !== 'any' || p.maxYears, languages: p.languages.length, degrees: p.degrees.length || p.highest !== 'none', roles: p.roles.length, vetoes: p.vetoes.length || p.noWords.length };
  return new Set(Object.keys(on).filter(k => on[k]));
}

// ➤ The pile's numbers: the big count on the front, the count and the age once there are results
// ➤ (the countries are in the filters, where they are chosen),
// ➤ the Today table, and the notice when the pile is old.
function drawPile() {
  const hours = Math.round((Date.now() - new Date(index.generated_at).getTime()) / 36e5);
  // ➤ The pile is built from what the crawler read, and the crawler may stop while the
  // ➤ building goes on: the age that matters is the newest read, not the newest build.
  const readHours = Math.round((Date.now() - new Date(index.crawled_at || index.generated_at).getTime()) / 36e5);
  const rebuilt = hours <= 0 ? t('rebuilt just now') : hours < 48 ? t('rebuilt {n} h ago', { n: hours }) : t('rebuilt {n} days ago', { n: Math.round(hours / 24) });
  const failed = index.status?.ok ? '' : t(' (some sources failed this time)');
  const rows = Object.entries(index.counts?.by_country || {}).filter(([cc]) => cc !== 'zz').sort((a, b) => b[1] - a[1]);
  text('#hero-count', n(index.counts.offers));
  const stats = $('#hero-stats');
  stats.replaceChildren();
  const b = document.createElement('b'); b.textContent = n(index.counts.offers);
  stats.append(b, document.createTextNode(` ${t('offers')} · ${rebuilt}${failed}`));
  text('#generated', t('{n} offers, {rebuilt}{failed}.', { n: n(index.counts.offers), rebuilt, failed }));
  if (readHours > STALE_HOURS) { text('#stale-text', t('The sources were last read {n} days ago; some offers may have closed since.', { n: Math.round(readHours / 24) })); $('#stale').hidden = false; }
  const tbody = $('#countries tbody');
  tbody.replaceChildren();
  // ➤ Each country opens its offers: its name is the link, and its count leads there too for a
  // ➤ pointer (hidden from the keyboard and screen readers, which meet the name). They look as
  // ➤ plain text, as the table always did.
  const link = (cc, content, quiet) => {
    if (cc !== 'xx' && !ids.countries.includes(cc)) return document.createTextNode(content);
    const a = document.createElement('a');
    a.href = `#p=${encodeProfile(countryProfile(cc), ids)}`;
    a.textContent = content;
    if (quiet) { a.tabIndex = -1; a.setAttribute('aria-hidden', 'true'); }
    return a;
  };
  // ➤ Two countries a row, read across (1 2 / 3 4), so the table is half as tall.
  for (let i = 0; i < rows.length; i += 2) {
    const tr = document.createElement('tr');
    for (const pair of [rows[i], rows[i + 1]]) {
      const name = document.createElement('td');
      const num = document.createElement('td'); num.className = 'num';
      if (pair) { name.append(link(pair[0], countryName(pair[0]), false)); num.append(link(pair[0], n(pair[1]), true)); }
      tr.append(name, num);
    }
    tbody.append(tr);
  }
  $('#countries').hidden = rows.length === 0;
}

// ➤ The words and the date, applied to what is already downloaded and judged. No network here.
function draw() {
  if (!loaded) return;
  const { q, debug } = readHash();
  const words = wordsOf(q);
  const since = loaded.profile.posted ? new Date(Date.now() - loaded.profile.posted * 864e5).toISOString().slice(0, 10) : '';
  const inDate = loaded.offers.filter(o => !since || (o.d && o.d >= since));
  const shown = inDate.filter(o => matchesWords(o, words, countryName));
  const lost = loaded.failed.length;
  const partsFailed = !lost ? '' : lost === 1 ? t(' (1 part failed to download)') : t(' ({n} parts failed to download)', { n: lost });
  const narrowed = words.length || !isEmptyProfile(loaded.profile);
  // ➤ With no occupation and no country named, the site shows the newest of the pile rather
  // ➤ than downloading all of it: say so, and say what to do for the rest.
  const onlyNewest = !loaded.profile.families.length && !loaded.profile.countries.length && index.latest?.files?.length;
  const rest = onlyNewest ? t(' of {n}; choose a country or an occupation for the rest', { n: n(index.counts.offers) }) : '';
  const said = { shown: n(shown.length), total: n(loaded.total), rest, failed: partsFailed };
  text('#results-status', narrowed ? t('{shown} of {total} offers match your filters{rest}{failed}.', said) : t('{shown} newest offers{rest}{failed}.', said));
  // ➤ Zero results: every stage that dropped something, the date and the words included.
  const stages = { ...loaded.stages, 'posted date': loaded.offers.length - inDate.length, 'search words': inDate.length - shown.length };
  if (shown.length) renderList($('#list'), shown, ctx); else renderEmpty($('#list'), stages, loaded.total);
  if (debug && loaded.dropped) renderDebug($('#debug'), loaded.dropped); else $('#debug').hidden = true;
}

// ➤ Results shown or hidden: the page changes shape with them (the hero shrinks to a line,
// ➤ How it works and Today make room).
function showResults(on) {
  $('#results').hidden = !on;
  document.body.classList.toggle('has-results', on);
}
function downloading(done, total) {
  const on = done < total;
  $('#progress').hidden = !on; $('#skeleton').hidden = !on;
  $('#progress > i').style.width = total ? `${Math.round((done / total) * 100)}%` : '0%';
}

// ➤ Reads the address, puts it into the controls, downloads what the scope needs, judges, draws.
// ➤ Nothing set and nothing asked: the front. Nothing set but Search pressed: the whole pile.
async function run() {
  const { code, q, all } = readHash();
  $('#q').value = q;
  $('#code-input').value = code;
  let profile = normaliseProfile({});
  if (code) {
    try { profile = decodeProfile(code, ids); } catch (e) { unreadable(e); $('#list').replaceChildren(); loaded = null; return; }
  }
  fillFilters(profile);
  if (isEmptyProfile(profile) && !q && !all) { showResults(false); loaded = null; return; }

  // ➤ The same scope already downloaded? Then only redraw.
  const scope = { ...profile, remote: profile.remote || !profile.countries.length };
  const key = JSON.stringify([code]);
  if (loaded && loaded.key === key) { showResults(true); draw(); return; }
  loaded = null;
  showResults(true);
  $('#list').replaceChildren();
  const files = shardFiles(index, scope);
  text('#results-status', files.length === 1 ? t('Downloading 1 part of the pile…') : t('Downloading {n} parts of the pile…', { n: files.length }));
  downloading(0, files.length);
  const { offers, failed: lost } = await loadShards(files, 'data', getJson, (done, total) => { text('#results-status', t('Downloading {done} of {total}…', { done, total })); downloading(done, total); });
  downloading(1, 1);
  const alive = offers.filter(o => !isExpired(o));
  const stages = {}, dropped = [];
  let kept = alive;
  if (!isEmptyProfile(profile)) {
    const judge = makeJudge(profile, cats, engine);
    kept = [];
    for (const o of alive) { const v = judge(o); if (v.ok) kept.push(o); else { dropped.push({ o, verdict: v }); stages[v.stage] = (stages[v.stage] || 0) + 1; } }
    kept = sortOffers(kept, profile);
  } else kept = newestFirst(kept);
  loaded = { key, offers: kept, total: alive.length, failed: lost, profile, stages, dropped };
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

// ➤ On a phone the filters are a panel the button opens and closes; on a desk they sit on the left.
function wireControls() {
  const panel = $('#filters');
  const toggle = $('#filters-toggle');
  const open = on => { panel.classList.toggle('is-open', on); toggle.setAttribute('aria-expanded', String(on)); document.body.classList.toggle('filters-open', on); };
  toggle.addEventListener('click', () => open(!panel.classList.contains('is-open')));
  $('#filters-close').addEventListener('click', () => open(false));
  // ➤ Any change in the panel is the new profile; ticking a country puts it last in the order.
  // ➤ The town: taken when the text is one of the suggestions (picked, or typed whole); an empty
  // ➤ field drops it; anything else is put back as it was when the field is left.
  const placeField = $('#place');
  placeField.addEventListener('focus', () => loadPlaces().catch(() => {}));
  placeField.addEventListener('input', () => { const hit = places?.get(placeField.value.trim()); if (hit) { chosenPlace = hit; writeHash(stateFromForm()); } });
  placeField.addEventListener('change', () => {
    if (!placeField.value.trim()) { chosenPlace = null; writeHash(stateFromForm()); } else if (!places?.has(placeField.value.trim())) run().catch(showError);
  });
  $('#radius').addEventListener('change', () => { if (chosenPlace) writeHash(stateFromForm()); });
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
      try { decodeProfile(typed, ids); state.p = typed; } catch (err) { unreadable(err); return; }
    }
    if (!state.p && !state.q) state.all = '1';
    search(state);
  });
  const copy = $('#copy-code');
  copy.addEventListener('click', async () => {
    const code = $('#code-input').value.trim();
    if (!code) return;
    try { await navigator.clipboard.writeText(code); text('#copy-label', t('Copied')); copy.classList.add('is-done'); setTimeout(() => { text('#copy-label', t('Copy')); copy.classList.remove('is-done'); }, 1500); } catch { $('#code-input').select(); }
  });
  $('#cv-file').addEventListener('change', e => { const file = e.target.files[0]; if (file) readCvFile(file); e.target.value = ''; });
  // ➤ Typing redraws at once; the address follows once the typing pauses.
  let timer;
  $('#q').addEventListener('input', () => { writeHash(stateFromForm(), true); draw(); clearTimeout(timer); timer = setTimeout(() => writeHash(stateFromForm(), true), 600); });
  window.addEventListener('hashchange', () => run().catch(showError));
  // ➤ The other language keeps the visitor's filters: the link takes the address's # along.
  const other = $('.nav__lang');
  if (other) other.addEventListener('click', () => { other.hash = location.hash; });
}

async function main() {
  try { index = await getJson('data/index.json'); } catch { text('#generated', t('The pile is not published yet. Come back in a few hours.')); text('#hero-count', '0'); return; }
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

main().catch(e => { text('#generated', t('Something went wrong: {error}', { error: e.message })); });
