// ➤ Everything that draws: cards, the empty state, the debug panel. Text goes in through
// ➤ textContent only, links are set only when they parse as http(s), and every outbound
// ➤ link opens in a new tab without a referrer.
import { splitVia } from './search.js';
import { t, number, lang, payText, workModeLabel } from './i18n.js';
import { distanceKm } from './distance.js';

const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; };

const safeUrl = u => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : null; } catch { return null; } };

// ➤ Adzuna's terms want each of its adverts labelled "Jobs by Adzuna", both words linking to
// ➤ Adzuna's site in the advert's country.
const ADZUNA = { es: 'adzuna.es', de: 'adzuna.de', fr: 'adzuna.fr', nl: 'adzuna.nl', it: 'adzuna.it', at: 'adzuna.at', pl: 'adzuna.pl', be: 'adzuna.be', ch: 'adzuna.ch', gb: 'adzuna.co.uk' };
function adzunaLabel(cc) {
  const host = `https://www.${ADZUNA[cc] || 'adzuna.co.uk'}/`;
  const tag = el('span', 'tag tag-outline');
  const link = txt => { const a = el('a', null, txt); a.href = host; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; };
  tag.append(link('Jobs'), document.createTextNode(' by '), link('Adzuna'));
  return tag;
}

// ➤ The title in the page's language (English, or Spanish on the Spanish site) when the
// ➤ original is in another.
const titleOf = o => (lang === 'es' ? o.ts : o.te) || o.t;

// ➤ The town, or the country when the advert names no town ("Remote" for no fixed country). A
// ➤ job run in many towns (`m`) names the town nearest the place searched, and how many more.
function placeOf(o, ctx) {
  if (!o.m?.length) return o.ci || ctx.countryName(o.cc);
  const all = [[o.ci, ...(o.g || [])], ...o.m];
  const away = p => (p.length === 3 && ctx.places?.length ? Math.min(...ctx.places.map(q => distanceKm([p[1], p[2]], [q.lat, q.lon]))) : Infinity);
  const town = all.reduce((a, b) => (away(b) < away(a) ? b : a))[0] || ctx.countryName(o.cc);
  const more = all.length - 1;
  return more === 1 ? t('{town} and one more town', { town }) : t('{town} and {n} more towns', { town, n: number(more) });
}

// ➤ A card: the title, then the employer and the town, then the tags: the source outlined, then
// ➤ the pay and the work mode when the source states them. The advert's own text is not shown:
// ➤ the title, the employer and the place say what it is, and the link says the rest.
export function card(o, ctx) {
  const li = el('li', 'offer');
  const h = el('h3', 'offer__title');
  const href = safeUrl(o.u);
  const shown = titleOf(o);
  if (href) { const a = el('a', null, shown); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; h.append(a); } else h.textContent = shown;
  li.append(h);
  li.append(el('p', 'offer__meta', [o.c, placeOf(o, ctx)].filter(Boolean).join(' · ')));
  const tags = el('p', 'offer__tags');
  tags.append(o.s === 'adzuna' ? adzunaLabel(o.cc) : el('span', 'tag tag-outline', t('via {source}', { source: ctx.sourceName(o.s) })));
  if (o.p) tags.append(el('span', 'tag tag-accent', payText(o.p)));
  if (o.w) tags.append(el('span', 'tag tag-neutral', workModeLabel(o.w)));
  if (o.y) tags.append(el('span', 'tag tag-neutral', t('asks {n}+ years', { n: o.y })));
  if (o.lg?.length) tags.append(el('span', 'tag tag-neutral', t('requires {list}', { list: o.lg.map(ctx.languageName).join(', ') })));
  if (o.dg?.length) tags.append(el('span', 'tag tag-neutral', t('degree: {list}', { list: o.dg.map(ctx.degreeName).join(' / ') })));
  li.append(tags);
  return li;
}

// ➤ A row of the front page's loop (lib/ticker.js): the advert's link, with its title, the
// ➤ employer and the town, and the source, the pay and the work mode.
export function loopRow(o, ctx) {
  const a = el('a', 'loop__row');
  const href = safeUrl(o.u);
  if (href) { a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; }
  const text = el('div', 'loop__text');
  text.append(el('div', 'loop__title', titleOf(o)), el('div', 'loop__meta', [o.c, o.ci || ctx.countryName(o.cc)].filter(Boolean).join(' · ')));
  const tags = el('div', 'loop__tags');
  tags.append(el('span', 'tag tag-outline', t('via {source}', { source: ctx.sourceName(o.s) })));
  if (o.p) tags.append(el('span', 'tag tag-accent', payText(o.p)));
  if (o.w) tags.append(el('span', 'tag tag-neutral', workModeLabel(o.w)));
  a.append(text, tags);
  return a;
}

// ➤ The intermediaries' adverts come after the employers' own, under one line that says so.
export function renderList(container, offers, ctx, pageSize = 40) {
  container.replaceChildren();
  const ul = el('ul', 'offers');
  container.append(ul);
  const { origin, via } = ctx.isVia ? splitVia(offers, ctx.isVia) : { origin: offers, via: [] };
  const rows = via.length ? [...origin, { divider: via.length }, ...via] : origin;
  let shown = 0;
  const more = el('button', 'btn btn-secondary more');
  more.type = 'button';
  const show = () => {
    for (const o of rows.slice(shown, shown + pageSize)) ul.append(o.divider ? el('li', 'offers__divider', t('Via intermediaries ({n})', { n: number(o.divider) })) : card(o, ctx));
    shown = Math.min(rows.length, shown + pageSize);
    more.hidden = shown >= rows.length;
    more.textContent = t('Show more ({n} left)', { n: number(rows.length - shown) });
  };
  more.addEventListener('click', show);
  container.append(more);
  show();
}

// ➤ Zero results: how many adverts fell at each stage, and how to loosen the filters.
const STAGES = { FAMILY: 'left out by occupation', TITLE: 'left out by title words', COUNTRY: 'left out by country', PLACE: 'left out by distance', MODE: 'left out by work mode', PAY: 'left out by pay', YEARS: 'left out by years asked', DEGREE: 'left out by degree', LANGUAGE: 'left out by language', 'posted date': 'left out by posted date', 'search words': 'left out by search words' };
export function renderEmpty(container, stages, total) {
  container.replaceChildren();
  const box = el('div', 'empty');
  box.append(el('h3', null, t('0 of {total} offers match', { total: number(total) })));
  const ul = el('ul');
  for (const [stage, count] of Object.entries(stages)) if (count) { const li = el('li'); li.append(el('span', 'empty__n', number(count)), el('span', null, t(STAGES[stage] || stage))); ul.append(li); }
  box.append(ul);
  box.append(el('p', null, t('Loosen the filters: more occupations, more countries, fewer words to avoid, a higher years cap.')));
  container.append(box);
}

export function renderDebug(container, rows) {
  container.replaceChildren();
  container.hidden = false;
  container.append(el('h3', null, t('Dropped offers ({n})', { n: number(rows.length) })));
  const ul = el('ul', 'debug');
  for (const { o, verdict } of rows.slice(0, 300)) ul.append(el('li', null, `[${verdict.stage}] ${o.t} — ${o.c || '?'} — ${verdict.reason}`));
  container.append(ul);
}
