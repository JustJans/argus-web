// ➤ The first page: what the pile holds today, Spain first. Reads data/index.json and
// ➤ writes plain text into the tables; nothing about the visitor is read or kept.
(async () => {
  const $ = s => document.querySelector(s);
  const text = (el, s) => { el.textContent = s; };
  const NAMES = { es: 'Spain', se: 'Sweden', no: 'Norway', fr: 'France', de: 'Germany', nl: 'Netherlands', be: 'Belgium', gb: 'United Kingdom', ie: 'Ireland', it: 'Italy', pt: 'Portugal', dk: 'Denmark', fi: 'Finland', pl: 'Poland', cz: 'Czechia', lt: 'Lithuania', lv: 'Latvia', ch: 'Switzerland', at: 'Austria', xx: 'Remote', zz: 'Country not stated' };
  let index;
  try {
    const res = await fetch('data/index.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status);
    index = await res.json();
  } catch (e) {
    text($('#generated'), 'The pile is not published yet. Come back in a few hours.');
    return;
  }
  const when = new Date(index.generated_at);
  const hours = Math.round((Date.now() - when.getTime()) / 36e5);
  text($('#generated'), `${index.counts.offers.toLocaleString('en')} offers, rebuilt ${hours <= 0 ? 'just now' : `${hours} h ago`}${index.status?.ok ? '' : ' (some sources failed this time)'}.`);

  const rows = Object.entries(index.counts.by_country || {}).sort((a, b) => (a[0] === 'es' ? -1 : b[0] === 'es' ? 1 : b[1] - a[1]));
  const tbody = $('#countries tbody');
  for (const [cc, n] of rows) {
    const tr = document.createElement('tr');
    const td1 = document.createElement('td'); text(td1, NAMES[cc] || cc.toUpperCase());
    const td2 = document.createElement('td'); td2.className = 'num'; text(td2, n.toLocaleString('en'));
    tr.append(td1, td2); tbody.append(tr);
  }
  $('#countries').hidden = rows.length === 0;

  const fam = $('#families tbody');
  const spain = Object.entries(index.families || {}).map(([id, f]) => [f.label || id, f.countries?.es?.n || 0]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]);
  for (const [label, n] of spain) {
    const tr = document.createElement('tr');
    const td1 = document.createElement('td'); text(td1, label);
    const td2 = document.createElement('td'); td2.className = 'num'; text(td2, n.toLocaleString('en'));
    tr.append(td1, td2); fam.append(tr);
  }
  $('#spain').hidden = spain.length === 0;

  const list = $('#source-list');
  for (const s of Object.values(index.sources || {})) {
    const li = document.createElement('li');
    const a = document.createElement('a'); a.href = s.url; a.rel = 'noopener noreferrer'; a.target = '_blank'; text(a, s.name);
    li.append(a, document.createTextNode(` — ${s.licence}${s.credit ? `. ${s.credit}` : ''}, extracted ${String(s.extracted_at || '').slice(0, 10)}`));
    list.append(li);
  }
  $('#sources').hidden = list.children.length === 0;
})();
