// ➤ The loop on the front page, there for the look (it may become the page's background):
// ➤ today's offers sliding down one slot every two seconds, a new one entering at the top, all
// ➤ of them faint and the middle one a little less so. It never stops under the pointer; it
// ➤ rests only while the tab is hidden, and stays still when the visitor asks the system for
// ➤ reduced motion. Being decoration, screen readers and the keyboard pass it by; the middle
// ➤ row can still be clicked.
const EASE = 'cubic-bezier(.45,.05,.25,1)';
const OPACITY = [0.55, 0.25, 0.1];   // ➤ by slots from the middle
const narrow = globalThis.matchMedia?.('(width < 47.5625rem)');
const still = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');

// ➤ box: where the loop goes; offers: today's; row(offer): the link a row shows.
export function startLoop(box, offers, { row, interval = 2000, slide = 1500 }) {
  if (!offers.length) return;
  const rows = document.createElement('div');
  rows.className = 'loop__rows';
  box.replaceChildren(rows);
  box.setAttribute('aria-hidden', 'true');
  const live = new Map();
  let tick = 0;

  // ➤ Five rows of 76px on a desk, three of 92px on a phone; the row just above waits unseen,
  // ➤ and the one just below fades out.
  function place(moving) {
    const [height, n] = narrow?.matches ? [92, 3] : [76, 5];
    const middle = (n - 1) / 2;
    rows.style.height = `${height * n}px`;
    const wanted = new Set();
    for (let k = -1; k <= n; k++) {
      const id = tick - k;
      wanted.add(id);
      let el = live.get(id);
      if (!el) {
        el = row(offers[((id % offers.length) + offers.length) % offers.length]);
        el.style.transform = `translateY(${k * height}px)`;
        el.style.opacity = '0';
        live.set(id, el);
        rows.append(el);
      }
      const seen = k >= 0 && k < n;
      const centre = seen && k === middle;
      el.style.height = `${height}px`;
      el.style.transition = moving ? `transform ${slide}ms ${EASE}, opacity ${slide}ms ${EASE}` : 'none';
      el.style.transform = `translateY(${k * height}px)`;
      el.style.opacity = seen ? String(OPACITY[Math.min(Math.abs(k - middle), 2)]) : '0';
      el.tabIndex = -1;
      if (centre) el.removeAttribute('aria-hidden'); else el.setAttribute('aria-hidden', 'true');
    }
    for (const [id, el] of live) if (!wanted.has(id)) { live.delete(id); el.remove(); }
  }
  place(false);

  const moves = () => !still?.matches && !document.hidden && box.offsetParent !== null;
  setInterval(() => { if (moves()) { tick++; place(true); } }, interval);
  narrow?.addEventListener('change', () => place(false));
}
