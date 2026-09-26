// ➤ Light or dark: the system's choice when the page opens and whenever it changes; the button
// ➤ at the end of the nav overrides it for this page view only. Nothing is stored, so the next
// ➤ visit follows the system again. The page's head sets the class before the first paint; the
// ➤ button shows where it leads (a moon in the light, a sun in the dark: styles/site.css) and
// ➤ tells screen readers whether the dark theme is on.
const media = matchMedia('(prefers-color-scheme: dark)');
const button = document.getElementById('theme');
const set = dark => {
  document.documentElement.classList.toggle('dark', dark);
  button?.setAttribute('aria-pressed', String(dark));
};
set(media.matches);
media.addEventListener('change', e => set(e.matches));
button?.addEventListener('click', () => set(!document.documentElement.classList.contains('dark')));
