// ➤ The language menu at the end of every page's nav: the current language's flag and code,
// ➤ and a small menu with both languages, the current one marked. The pages hold a
// ➤ `<!-- language menu -->` mark and the build writes the menu in, in each page's language,
// ➤ so the flags live in one place. The other language's link keeps the class `nav__lang`:
// ➤ the first page's script adds the visitor's filters to it.
const FLAG_CLASS = 'block flex-none opacity-80 ring-1 ring-ink/15';
const FLAGS = {
  en: `<svg width="16" height="11" viewBox="0 0 60 40" preserveAspectRatio="none" class="${FLAG_CLASS}" aria-hidden="true"><rect width="60" height="40" fill="#012169"/><path d="M0 0l60 40M60 0L0 40" stroke="#fff" stroke-width="8"/><path d="M0 0l60 40M60 0L0 40" stroke="#c8102e" stroke-width="3"/><path d="M30 0v40M0 20h60" stroke="#fff" stroke-width="12"/><path d="M30 0v40M0 20h60" stroke="#c8102e" stroke-width="7"/></svg>`,
  es: `<svg width="16" height="11" viewBox="0 0 16 11" class="${FLAG_CLASS}" aria-hidden="true"><rect width="16" height="11" fill="#c60b1e"/><rect y="2.75" width="16" height="5.5" fill="#ffc400"/></svg>`,
};
const NAMES = { en: 'English', es: 'Español' };
const CHEVRON = '<svg class="chev chev-down size-3 text-n-600 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
export const MARK = '<!-- language menu -->';

// ➤ current: 'en' or 'es'; otherHref: the same page in the other language.
export function languageMenu(current, otherHref) {
  const other = current === 'en' ? 'es' : 'en';
  // ➤ The current language is marked, not linked: a link to the page itself would drop the filters.
  const item = lang => lang === current
    ? `<span aria-current="true" class="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-ink">${FLAGS[lang]}${NAMES[lang]}</span>`
    : `<a class="nav__lang flex items-center gap-2 px-3 py-2 text-sm text-n-800 no-underline hover:bg-ink/[.06] hover:text-ink" href="${otherHref}" hreflang="${lang}" lang="${lang}">${FLAGS[lang]}${NAMES[lang]}</a>`;
  return `<details class="relative"><summary class="flex min-h-8 cursor-pointer list-none items-center gap-1.5 border border-transparent px-2 text-sm font-semibold tracking-[.04em] text-ink hover:border-line" aria-label="${current === 'es' ? 'Idioma' : 'Language'}">${FLAGS[current]}${current.toUpperCase()}${CHEVRON}</summary>`
    + `<div class="absolute right-0 top-full z-10 mt-1 flex min-w-[140px] flex-col border border-line bg-ground py-1 shadow-[0_4px_16px_rgba(29,31,32,.08)]">${item('en')}${item('es')}</div></details>`;
}
