// ➤ A count that turns while it loads and lands when it is known: a reel's gesture without the
// ➤ machine. Each figure turns in its own window at its own even pace; when the number comes,
// ➤ they stop one after the other, left to right, slowing to a halt, with no bounce, blur or
// ➤ flash. The windows' edges fade and the figures keep one width, as NumberFlow draws them
// ➤ (docs/research/count-animation.md). Still under reduced motion; screen readers are told the
// ➤ count is loading, then get the number, never the turning digits.
const still = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
const CELL = 1.2;          // ➤ a figure's window, in em: a little taller than the line, so the fade stays off the ink
const LAND_MS = 800;       // ➤ the first figure's stop; each next one takes a little longer
const STAGGER_MS = 120;
const EASE = 'cubic-bezier(.15,.8,.25,1)';

// ➤ The shape of a written number: its figures as 0, its other marks as they are ("97.189" → "00.000").
const shapeOf = text => String(text).replace(/\d/g, '0');

function cell(content, cls) {
  const s = document.createElement('span');
  s.className = cls;
  s.textContent = content;
  return s;
}

// ➤ The windows for a shape, each figure's strip turning from a phase of its own.
function build(el, shape) {
  const parts = [...shape].map((c, i) => {
    if (c !== '0') return cell(c, 'roll__mark');
    const col = cell('', 'roll__col');
    const strip = cell('', 'roll__strip');
    for (let k = 0; k < 30; k++) strip.append(cell(String(k % 10), 'roll__digit'));
    const turn = 1.2 + ((i * 7) % 5) * 0.12;
    strip.style.animation = `roll-turn ${turn}s linear ${-Math.random() * turn}s infinite`;
    col.append(strip);
    return col;
  });
  el.replaceChildren(...parts);
  el.dataset.shape = shape;
}

// ➤ Start turning, in the shape of the number shown now, or of `guess` when there is none.
export function spin(el, guess = '00.000') {
  if (!el || still?.matches) return;
  if (el.dataset.rolling === 'turning') return;
  el._roll = {};
  const shown = el.textContent.trim();
  build(el, /\d/.test(shown) ? shapeOf(shown) : guess);
  el.dataset.rolling = 'turning';
  el.setAttribute('aria-busy', 'true');
}

// ➤ Show `text`: turning figures land on it, anything else just shows it.
export function land(el, text) {
  if (!el) return;
  const token = {};
  el._roll = token;
  const finish = () => { if (el._roll !== token) return; el.textContent = text; delete el.dataset.rolling; delete el.dataset.shape; el.removeAttribute('aria-busy'); };
  if (el.dataset.rolling !== 'turning' || still?.matches) { finish(); return; }
  if (el.dataset.shape !== shapeOf(text)) build(el, shapeOf(text));
  const strips = [...el.querySelectorAll('.roll__strip')];
  const digits = [...String(text)].filter(c => /\d/.test(c)).map(Number);
  // ➤ Each strip is held where it is, then runs on to its figure in the third turn, so every
  // ➤ figure makes a last turn of its own before it stops.
  for (const strip of strips) {
    const m = getComputedStyle(strip).transform.match(/matrix\((?:[^,]+,){5}\s*([-\d.e]+)\)/);
    strip.style.animation = 'none';
    strip.style.transform = `translateY(${m ? Number(m[1]) : 0}px)`;
  }
  void el.offsetWidth;
  strips.forEach((strip, i) => {
    strip.style.transition = `transform ${LAND_MS + i * STAGGER_MS}ms ${EASE}`;
    strip.style.transform = `translateY(${-(20 + digits[i]) * CELL}em)`;
  });
  el.dataset.rolling = 'landing';
  setTimeout(finish, LAND_MS + strips.length * STAGGER_MS + 60);
}
