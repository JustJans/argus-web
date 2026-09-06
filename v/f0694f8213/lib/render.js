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

// ➤ A card: the English title with the date at its right, the original title in small print
// ➤ when they differ, employer and place, the excerpt, and the tags (the source outlined).
export function card(o, ctx) {
  const li = el('li', 'offer');
  const h = el('h3', 'offer__title');
  const href = safeUrl(o.u);
  const shown = o.te || o.t;
  if (href) { const a = el('a', null, shown); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; h.append(a); } else h.textContent = shown;
  li.append(h, el('span', 'offer__date', relativeDay(o.d)));
  if (o.te) li.append(el('p', 'offer__original', o.t));
  const place = [o.ci, ctx.countryName(o.cc)].filter(Boolean).join(', ');
  li.append(el('p', 'offer__meta', [o.c, place].filter(Boolean).join(' · ')));
  if (o.sn) li.append(el('p', 'offer__snippet', o.sn));
  const tags = el('p', 'offer__tags');
  tags.append(el('span', 'tag tag-outline', `via ${ctx.sourceName(o.s)}`));
  if (o.y) tags.append(el('span', 'tag tag-neutral', `asks ${o.y}+ years`));
  if (o.lg?.length) tags.append(el('span', 'tag tag-neutral', `requires ${o.lg.map(ctx.languageName).join(', ')}`));
  if (o.dg?.length) tags.append(el('span', 'tag tag-neutral', `degree: ${o.dg.map(ctx.degreeName).join(' / ')}`));
  li.append(tags);
  return li;
}

export function renderList(container, offers, ctx, pageSize = 40) {
  container.replaceChildren();
  const ul = el('ul', 'offers');
  container.append(ul);
  let shown = 0;
  const more = el('button', 'btn btn-secondary more', 'Show more');
  more.type = 'button';
  const show = () => {
    for (const o of offers.slice(shown, shown + pageSize)) ul.append(card(o, ctx));
    shown = Math.min(offers.length, shown + pageSize);
    more.hidden = shown >= offers.length;
    more.textContent = `Show more (${(offers.length - shown).toLocaleString('en')} left)`;
  };
  more.addEventListener('click', show);
  container.append(more);
  show();
}

// ➤ Zero results: how many adverts fell at each stage, and how to loosen the filters.
export function renderEmpty(container, stages, total) {
  container.replaceChildren();
  const box = el('div', 'empty');
  box.append(el('h3', null, `0 of ${total.toLocaleString('en')} offers match`));
  const ul = el('ul');
  for (const [stage, count] of Object.entries(stages)) if (count) { const li = el('li'); li.append(el('span', 'empty__n', count.toLocaleString('en')), el('span', null, `dropped at ${stage.toLowerCase()}`)); ul.append(li); }
  box.append(ul);
  box.append(el('p', null, 'Loosen the filters: more occupations, more countries, fewer deal-breakers, a higher years cap.'));
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
