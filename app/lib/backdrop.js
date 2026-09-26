// ➤ The front page's backdrop: today's offers in three columns on a plane tilted away from the
// ➤ visitor, faint and out of focus behind the count and the search bar, drifting slowly
// ➤ towards the visitor (styles/site.css draws and moves it; docs/research/front-backdrop.md).
// ➤ It is only there for the look: nothing in it can be clicked, and screen readers and the
// ➤ keyboard pass it by.
const COLUMNS = 3;

// ➤ box: where it goes; offers: today's; row(offer): the element a row shows.
export function startBackdrop(box, offers, { row }) {
  if (!offers.length) return;
  const plane = document.createElement('div');
  plane.className = 'backdrop__plane';
  for (let c = 0; c < COLUMNS; c++) {
    const mine = offers.filter((_, i) => i % COLUMNS === c);
    const track = document.createElement('div');
    track.className = 'backdrop__track';
    // ➤ Each column holds its offers twice, so its drift starts again without a seam.
    for (const o of [...mine, ...mine]) track.append(row(o));
    const column = document.createElement('div');
    column.className = 'backdrop__column';
    column.append(track);
    plane.append(column);
  }
  const stage = document.createElement('div');
  stage.className = 'backdrop__stage';
  stage.append(plane);
  box.replaceChildren(stage);
}

// ➤ The switch in the nav starts and stops the drift (WCAG 2.2.2: anything that moves by itself
// ➤ can be paused). It starts off when the system asks for reduced motion; turned on, the
// ➤ backdrop drifts all the same, as the visitor chose. Nothing is stored.
export function wireMotion(input, box) {
  const set = on => {
    input.checked = on;
    box.classList.toggle('is-still', !on);
    box.classList.toggle('is-moving', on);
  };
  set(!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  input.addEventListener('change', () => set(input.checked));
}
