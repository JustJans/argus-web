// ➤ The Spanish site: every page of the English one again under es/, its text through the
// ➤ dictionary in app/lib/es.js (the scripts read the same file), one folder deeper. A link to
// ➤ another page of the site stays inside es/; a link to anything else (scripts, styles) climbs
// ➤ the extra folder, and so does the page's data-root, which the scripts read the data from.
// ➤ Each version names the other for search engines (hreflang).
import { posix } from 'path';
import ES from '../app/lib/es.js';

export const PAGES = ['index.html', 'legal/privacy.html', 'legal/sources.html'];
export const SITE_URL = 'https://justjans.github.io/argus-web/';

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ➤ The dictionary's lines in the page: a line with tags in it is a passage, replaced whole; a
// ➤ plain line is replaced where it is a whole text between tags or a whole attribute a reader
// ➤ sees. The longest first, so "Title words to avoid" goes before "Title words".
export function translate(html, dict = ES.page) {
  let out = html;
  for (const key of Object.keys(dict).sort((a, b) => b.length - a.length)) {
    const es = dict[key];
    if (key.includes('<')) { out = out.split(key).join(es); continue; }
    const k = escapeRe(key);
    out = out.replace(new RegExp(`>(\\s*)${k}(\\s*)<`, 'g'), (m, a, b) => `>${a}${es}${b}<`)
      .replace(new RegExp(`\\b((?:content|placeholder|aria-label|title)=")${k}"`, 'g'), (m, a) => `${a}${es}"`);
  }
  return out;
}

// ➤ The page an address points to, from a page in `dir`: "./" and "../" are the first page.
function pageOf(dir, url) {
  const path = posix.normalize(posix.join(dir, url.split('#')[0]));
  return path === '.' || path === './' || path.endsWith('/') ? `${path === '.' || path === './' ? '' : path}index.html` : path;
}

// ➤ The alternates a page carries in its head, in both languages.
export const alternates = page => {
  const path = page === 'index.html' ? '' : page;
  return `<link rel="alternate" hreflang="en" href="${SITE_URL}${path}">\n  <link rel="alternate" hreflang="es" href="${SITE_URL}es/${path}">\n  <link rel="alternate" hreflang="x-default" href="${SITE_URL}${path}">\n</head>`;
};

// ➤ An English page (its path inside the site) as its Spanish twin under es/.
export function toSpanish(html, page) {
  const dir = posix.dirname(page);
  // ➤ From es/<page> back to <page>: one folder more than the page is deep.
  const english = '../'.repeat(page.split('/').length) + (page === 'index.html' ? '' : page);
  return translate(html)
    .replace(/\b(href|src)="([^"]*)"/g, (m, attr, url) => {
      if (!url || /^(?:[a-z]+:|\/|#)/i.test(url) || PAGES.includes(pageOf(dir, url))) return m;
      return `${attr}="${posix.relative(posix.join('es', dir), posix.join(dir, url))}"`;
    })
    .replace(/<a class="nav__lang"[^>]*>[^<]*<\/a>/, `<a class="nav__lang" href="${english}" hreflang="en" lang="en" aria-label="English">EN</a>`)
    .replace(/<html lang="en"(?: data-root="([^"]*)")?>/, (m, root = '') => `<html lang="es" data-root="../${root}">`);
}
