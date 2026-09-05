// ➤ The code page: chips from the catalogues and the code at the end. Everything happens in
// ➤ this document; the only network calls are the catalogues (same origin, at load). It
// ➤ starts filled in from the address: a code to edit (#p=), or what the first page ticked and
// ➤ read from a CV (#f= occupations, #dg= degrees, #lg= languages).
import { encodeProfile, decodeProfile, normaliseProfile, catalogueIds } from '../lib/codec.js';

const $ = s => document.querySelector(s);
const getJson = async url => { const r = await fetch(url, { cache: 'no-cache' }); if (!r.ok) throw new Error(`${r.status} for ${url}`); return r.json(); };

const names = ['families', 'countries', 'languages', 'degrees', 'seniority', 'vetoes'];
const cats = Object.fromEntries(names.map((n, i) => [n, null]));
await Promise.all(names.map(async n => { cats[n] = await getJson(`../catalogues/${n}.json`); }));
const ids = catalogueIds(cats);
const countryOrder = [];   // ➤ the order the visitor ticked countries in

function chip(container, { name, value, label, radio = false }) {
  const l = document.createElement('label');
  l.className = 'chip';
  const i = document.createElement('input');
  i.type = radio ? 'radio' : 'checkbox'; i.name = name; i.value = value;
  const s = document.createElement('span'); s.textContent = label;
  l.append(i, s);
  container.append(l);
  return i;
}
// ➤ Occupations by group: a heading per group (Engineers, Technicians, crews…), its families as chips.
for (const g of cats.families.groups) {
  const h = document.createElement('h3'); h.className = 'chips__group'; h.textContent = g.label;
  const box = document.createElement('div'); box.className = 'chips';
  $('#families').append(h, box);
  for (const f of cats.families.families.filter(f => f.group === g.id)) chip(box, { name: 'family', value: f.id, label: f.label });
}
for (const l of cats.seniority.levels) chip($('#levels'), { name: 'level', value: l.id, label: l.label, radio: true });
$('#levels input[value="any"]').checked = true;
for (const l of cats.languages.languages) chip($('#languages'), { name: 'language', value: l.code, label: l.label });
for (const d of cats.degrees.degrees) chip($('#degrees'), { name: 'degree', value: d.id, label: d.label });
for (const c of cats.countries.countries) {
  const i = chip($('#countries'), { name: 'country', value: c.iso, label: c.name });
  i.addEventListener('change', () => {
    const k = countryOrder.indexOf(c.iso);
    if (i.checked && k < 0) countryOrder.push(c.iso); else if (!i.checked && k >= 0) countryOrder.splice(k, 1);
    renderOrder();
  });
}
for (const v of cats.vetoes.vetoes) chip($('#vetoes'), { name: 'veto', value: v.id, label: v.label });

function renderOrder() {
  for (const l of $('#countries').querySelectorAll('.chip')) {
    const iso = l.querySelector('input').value; const k = countryOrder.indexOf(iso);
    l.dataset.order = k >= 0 ? String(k + 1) : '';
  }
}

const checked = name => [...document.querySelectorAll(`input[name="${name}"]:checked`)].map(i => i.value);
const terms = id => $(id).value.split(',').map(s => s.trim()).filter(Boolean).slice(0, 8);

function readForm() {
  return normaliseProfile({
    families: checked('family'), countries: [...countryOrder], languages: checked('language'), degrees: checked('degree'),
    level: checked('level')[0] || 'any', maxYears: Number($('#max-years').value) || null, highest: $('#highest').value,
    remote: $('#remote').checked, roles: terms('#roles'), vetoes: checked('veto'), noWords: terms('#no-words'),
  });
}

function fillForm(p) {
  for (const i of document.querySelectorAll('input[name="family"]')) i.checked = p.families.includes(i.value);
  for (const i of document.querySelectorAll('input[name="language"]')) i.checked = p.languages.includes(i.value);
  for (const i of document.querySelectorAll('input[name="degree"]')) i.checked = p.degrees.includes(i.value);
  for (const i of document.querySelectorAll('input[name="veto"]')) i.checked = p.vetoes.includes(i.value);
  for (const i of document.querySelectorAll('input[name="level"]')) i.checked = i.value === p.level;
  countryOrder.length = 0; countryOrder.push(...p.countries);
  for (const i of document.querySelectorAll('input[name="country"]')) i.checked = p.countries.includes(i.value);
  renderOrder();
  $('#max-years').value = p.maxYears ? String(p.maxYears) : '';
  $('#highest').value = p.highest;
  $('#remote').checked = p.remote;
  $('#roles').value = p.roles.join(', ');
  $('#no-words').value = p.noWords.join(', ');
}

// ➤ The start: a code to edit, or the first page's ticks and CV findings.
{
  const h = new URLSearchParams(location.hash.replace(/^#/, ''));
  const list = k => (h.get(k) || '').split(',').map(s => s.trim()).filter(Boolean);
  const code = (h.get('p') || '').trim();
  if (code) { try { fillForm(decodeProfile(code, ids)); } catch { /* a bad code: start fresh */ } }
  else if (h.has('f') || h.has('dg') || h.has('lg')) fillForm(normaliseProfile({ families: list('f'), degrees: list('dg'), languages: list('lg') }));
}

// ➤ The code.
$('#intake').addEventListener('submit', e => {
  e.preventDefault();
  const code = encodeProfile(readForm(), ids);
  $('#code-out').value = code;
  $('#open').href = `../#p=${code}`;
  $('#result').hidden = false;
  $('#result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (navigator.share) { $('#share').hidden = false; $('#share').onclick = ev => { ev.preventDefault(); navigator.share({ title: 'My Argus Web code', url: new URL(`../#p=${code}`, location.href).href }).catch(() => {}); }; }
});
$('#copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('#code-out').value); $('#copy').textContent = 'Copied'; setTimeout(() => { $('#copy').textContent = 'Copy'; }, 1500); }
  catch { $('#code-out').select(); }
});
