// ➤ The loop on the front page: today's offers, a new one entering at the top every five
// ➤ seconds while every row eases down one slot, the middle row almost solid and the others
// ➤ fading towards the edges. Only the middle row can be clicked or reached with the keyboard.
// ➤ It waits while the pointer or the focus is on it and while the tab is hidden, stays still
// ➤ when the visitor asks for reduced motion, and its Pause button stops it (WCAG 2.2.2:
// ➤ anything that moves for more than five seconds can be paused).
const EASE = 'cubic-bezier(.45,.05,.25,1)';
const OPACITY = [0.92, 0.32, 0.12];   // ➤ by slots from the middle
const narrow = globalThis.matchMedia?.('(width < 47.5625rem)');
const still = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');

// ➤ box: where the loop goes; offers: today's; row(offer): the link a row shows; button: the
// ➤ Pause button, and label(paused) its words.
export function startLoop(box, offers, { row, button, label, interval = 5000, slide = 2300 }) {
  if (!offers.length) return;
  const rows = document.createElement('div');
  rows.className = 'loop__rows';
  box.replaceChildren(rows);
  const live = new Map();
  let tick = 0, paused = false, held = false;

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
      el.tabIndex = centre ? 0 : -1;
      if (centre) el.removeAttribute('aria-hidden'); else el.setAttribute('aria-hidden', 'true');
    }
    for (const [id, el] of live) if (!wanted.has(id)) { live.delete(id); el.remove(); }
  }
  place(false);

  const moves = () => !paused && !held && !still?.matches && !document.hidden && box.offsetParent !== null;
  setInterval(() => { if (moves()) { tick++; place(true); } }, interval);
  narrow?.addEventListener('change', () => place(false));
  box.addEventListener('pointerenter', () => { held = true; });
  box.addEventListener('pointerleave', () => { held = false; });
  box.addEventListener('focusin', () => { held = true; });
  box.addEventListener('focusout', () => { held = false; });
  if (button && !still?.matches) {
    button.hidden = false;
    button.addEventListener('click', () => {
      paused = !paused;
      button.setAttribute('aria-pressed', String(paused));
      label(paused);
    });
  }
}
