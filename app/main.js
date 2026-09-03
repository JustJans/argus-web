// ➤ The list page. With a code after the # it decodes the profile, downloads only the
// ➤ parts of the pile that profile needs, judges every advert on the device and draws the
// ➤ list. Without a code it shows what the pile holds and asks for one. Nothing about the
// ➤ visitor leaves the browser: the fragment is never sent, nothing is stored.
import { decodeProfile, catalogueIds } from './lib/codec.js';
import { makeJudge, sortOffers } from './lib/gates.js';
import { shardFiles, loadShards } from './lib/shards.js';
import { renderList, renderEmpty, renderDebug } from './lib/render.js';
import * as engine from './lib/engine.js';

const $ = s => document.querySelector(s);
const text = (sel, s) => { const e = $(sel); if (e) e.textContent = s; };
const getJson = async url => { const r = await fetch(url, { cache: 'no-cache' }); if (!r.ok) throw new Error(`${r.status} for ${url}`); return r.json(); };

async function loadCatalogues() {
  const names = ['families', 'countries', 'languages', 'degrees', 'seniority', 'vetoes'];
  const all = await Promise.all(names.map(n => getJson(`catalogues/${n}.json`)));
  return Object.fromEntries(names.map((n, i) => [n, all[i]]));
}

function readHash() {
  const h = location.hash.replace(/^#/, '');
  const params = new URLSearchParams(h);
  return { code: (params.get('p') || '').trim(), debug: params.has('dbg') };
}

function countsTable(index) {
  const names = new Map();
  const rows = Object.entries(index.counts?.by_country || {}).sort((a, b) => (a[0] === 'es' ? -1 : b[0] === 'es' ? 1 : b[1] - a[1]));
  const tbody = $('#countries tbody');
  tbody.replaceChildren();
  for (const [cc, n] of rows) {
    const tr = document.createElement('tr');
    const td1 = document.createElement('td'); td1.textContent = names.get(cc) || cc.toUpperCase();
    const td2 = document.createElement('td'); td2.className = 'num'; td2.textContent = n.toLocaleString('en');
    tr.append(td1, td2); tbody.append(tr);
  }
  $('#countries').hidden = rows.length === 0;
  return rows;
}

async function main() {
  const { code, debug } = readHash();
  let index;
  try { index = await getJson('data/index.json'); } catch { text('#generated', 'The pile is not published yet. Come back in a few hours.'); return; }
  const hours = Math.round((Date.now() - new Date(index.generated_at).getTime()) / 36e5);
  text('#generated', `${index.counts.offers.toLocaleString('en')} offers, rebuilt ${hours <= 0 ? 'just now' : `${hours} h ago`}${index.status?.ok ? '' : ' (some sources failed this time)'}.`);
  const cats = await loadCatalogues();
  const countryName = cc => cc === 'xx' ? 'Remote' : (cats.countries.countries.find(c => c.iso === cc)?.name || (cc ? cc.toUpperCase() : ''));
  const rows = countsTable(index);
  for (const tr of $('#countries tbody').children) { const cc = rows[[...tr.parentNode.children].indexOf(tr)]?.[0]; if (cc) tr.firstChild.textContent = countryName(cc) || 'Country not stated'; }
  const sources = $('#source-list');
  sources.replaceChildren();
  for (const s of Object.values(index.sources || {})) {
    const li = document.createElement('li');
    const a = document.createElement('a'); a.href = s.url; a.rel = 'noopener noreferrer'; a.target = '_blank'; a.textContent = s.name;
    li.append(a, document.createTextNode(` — ${s.licence}${s.credit ? `. ${s.credit}` : ''}, extracted ${String(s.extracted_at || '').slice(0, 10)}`));
    sources.append(li);
  }
  $('#sources').hidden = sources.children.length === 0;

  // ➤ The code form: paste a code, or make one.
  $('#code-form').addEventListener('submit', e => { e.preventDefault(); const v = $('#code-input').value.trim(); if (v) location.hash = `p=${v}`; });
  window.addEventListener('hashchange', () => location.reload());

  if (!code) { $('#landing').hidden = false; return; }
  $('#landing').hidden = true;
  $('#results').hidden = false;
  let profile;
  try { profile = decodeProfile(code, catalogueIds(cats)); } catch (e) { text('#results-status', `That code cannot be read: ${e.message}.`); return; }
  $('#edit-link').href = `intake/#p=${encodeURIComponent(code)}`;
  const summary = [
    profile.families.map(id => cats.families.families.find(f => f.id === id)?.label || id).join(', ') || 'every family',
    profile.countries.map(countryName).join(', ') || 'every country',
    profile.level !== 'any' ? profile.level : null,
    profile.maxYears ? `up to ${profile.maxYears} years asked` : null,
  ].filter(Boolean).join(' · ');
  text('#profile-summary', summary);

  const files = shardFiles(index, profile);
  text('#results-status', `Downloading ${files.length} part${files.length === 1 ? '' : 's'} of the pile…`);
  const { offers, failed } = await loadShards(files, 'data', getJson, (done, n) => text('#results-status', `Downloading ${done} of ${n}…`));
  const judge = makeJudge(profile, cats, engine);
  const kept = [], dropped = [], stages = {};
  for (const o of offers) {
    const v = judge(o);
    if (v.ok) kept.push(o); else { dropped.push({ o, verdict: v }); stages[v.stage] = (stages[v.stage] || 0) + 1; }
  }
  const sorted = sortOffers(kept, profile);
  const ctx = { countryName, sourceName: s => index.sources?.[s]?.name || s, languageName: c => cats.languages.languages.find(l => l.code === c)?.label || c, degreeName: id => cats.degrees.degrees.find(d => d.id === id)?.label || id };
  text('#results-status', `${sorted.length.toLocaleString('en')} of ${offers.length.toLocaleString('en')} offers match your profile${failed.length ? ` (${failed.length} part${failed.length === 1 ? '' : 's'} failed to download)` : ''}.`);
  if (sorted.length) renderList($('#list'), sorted, ctx); else renderEmpty($('#list'), stages, offers.length);
  if (debug) renderDebug($('#debug'), dropped);
}

main().catch(e => { text('#results-status', `Something went wrong: ${e.message}`); });
