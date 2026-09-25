// ➤ The sources page's table: the sources in today's pile with their licence and credit, read
// ➤ from the pile's index, in the page's language.
import { t, number } from '../lib/i18n.js';
import '../lib/theme.js';

const root = document.documentElement.dataset.root || '';
const generated = document.getElementById('generated');
const rows = document.getElementById('source-rows');
const r = await fetch(`${root}data/index.json`, { cache: 'no-cache' }).catch(() => null);
if (!r || !r.ok) generated.textContent = t('The pile is not published yet.');
else {
  const index = await r.json();
  generated.textContent = t('{n} offers, rebuilt {when} UTC.', { n: number(index.counts.offers), when: String(index.generated_at).slice(0, 16).replace('T', ' ') });
  for (const s of Object.values(index.sources || {})) {
    const tr = document.createElement('tr');
    const name = document.createElement('td'), terms = document.createElement('td');
    // ➤ A source's link only when it is a web address; its name alone otherwise.
    const href = (() => { try { const u = new URL(s.url); return /^https?:$/.test(u.protocol) ? u.href : ''; } catch { return ''; } })();
    if (href) { const a = document.createElement('a'); a.href = href; a.rel = 'noopener noreferrer'; a.target = '_blank'; a.textContent = s.name; name.append(a); } else name.textContent = s.name;
    terms.textContent = `${s.licence}${s.credit ? ` · ${s.credit}` : ''} · ${t('extracted {day}', { day: String(s.extracted_at || '').slice(0, 10) })}`;
    tr.append(name, terms);
    rows.append(tr);
  }
}
