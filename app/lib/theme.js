// ➤ Light or dark: the system's choice when the page opens and whenever it changes; the switch
// ➤ in the nav overrides it for this page view only. Nothing is stored, so the next visit
// ➤ follows the system again. The page's head sets the class before the first paint; this
// ➤ keeps the switch in step and listens.
const media = matchMedia('(prefers-color-scheme: dark)');
const toggle = document.getElementById('dark-mode');
const set = dark => {
  document.documentElement.classList.toggle('dark', dark);
  if (toggle) toggle.checked = dark;
};
set(media.matches);
media.addEventListener('change', e => set(e.matches));
toggle?.addEventListener('change', () => set(toggle.checked));
