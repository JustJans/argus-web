// ➤ Everything that draws: cards, the empty state, the debug panel. Text goes in through
// ➤ textContent only, links are set only when they parse as http(s), and every outbound
// ➤ link opens in a new tab without a referrer.
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; };

const safeUrl = u => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : null; } catch { return null; } };

export function relativeDay(iso) {
  if (!iso) return '';
  const days = Math.round((Date.now() - new Date(iso).getTime()) / 864e5);
  if (Number.isNaN(days)) return '';
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return `${Math.round(days / 30)} months ago`;
}

export function card(o, ctx) {
  const li = el('li', 'offer');
  // ➤ The English title leads; the original follows in small print when they differ.
  const h = el('h3', 'offer__title');
  const href = safeUrl(o.u);
  const shown = o.te || o.t;
  if (href) { const a = el('a', null, shown); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; h.append(a); } else h.textContent = shown;
  li.append(h);
  if (o.te) li.append(el('p', 'offer__original', o.t));
  const meta = el('p', 'offer__meta');
  const bits = [o.c, [o.ci, ctx.countryName(o.cc)].filter(Boolean).join(', '), relativeDay(o.d)].filter(Boolean);
  meta.textContent = bits.join(' · ');
  li.append(meta);
  if (o.sn) li.append(el('p', 'offer__snippet', o.sn));
  const tags = el('p', 'offer__tags');
  tags.append(el('span', 'tag tag--source', `via ${ctx.sourceName(o.s)}`));
  if (o.y) tags.append(el('span', 'tag', `asks ${o.y}+ years`));
  if (o.lg?.length) tags.append(el('span', 'tag', `requires ${o.lg.map(ctx.languageName).join(', ')}`));
  if (o.dg?.length) tags.append(el('span', 'tag', `degree: ${o.dg.map(ctx.degreeName).join(' / ')}`));
  li.append(tags);
  return li;
}

export function renderList(container, offers, ctx, pageSize = 40) {
  container.replaceChildren();
  const ul = el('ul', 'offers');
  container.append(ul);
  let shown = 0;
  const more = el('button', 'button', 'Show more');
  const show = () => {
    for (const o of offers.slice(shown, shown + pageSize)) ul.append(card(o, ctx));
    shown = Math.min(offers.length, shown + pageSize);
    more.hidden = shown >= offers.length;
    more.textContent = `Show more (${offers.length - shown} left)`;
  };
  more.addEventListener('click', show);
  container.append(more);
  show();
}

export function renderEmpty(container, stages, total) {
  container.replaceChildren();
  const box = el('div', 'empty');
  box.append(el('h3', null, `0 of ${total} offers match`));
  const ul = el('ul');
  for (const [stage, n] of Object.entries(stages)) if (n) ul.append(el('li', null, `${n} dropped at ${stage.toLowerCase()}`));
  box.append(ul);
  box.append(el('p', 'muted', 'Loosen the profile: more families, more countries, fewer deal-breakers, a higher years cap.'));
  container.append(box);
}

export function renderDebug(container, rows) {
  container.replaceChildren();
  container.hidden = false;
  container.append(el('h3', null, `Dropped offers (${rows.length})`));
  const ul = el('ul', 'debug');
  for (const { o, verdict } of rows.slice(0, 300)) ul.append(el('li', null, `[${verdict.stage}] ${o.t} — ${o.c || '?'} — ${verdict.reason}`));
  container.append(ul);
}
