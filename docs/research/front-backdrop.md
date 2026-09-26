# The front's backdrop

Research of 26 September 2026, for the owner's request: the list of today's offers on the front
becomes the page's background, seen in perspective from the upper right to the lower left, with
more offers so it fills the page, a little out of focus, and without taking any contrast from
what matters. Of two sketches he chose the one with three columns on a strongly tilted plane;
the one with a single column was set aside.

## What the standard does

- **Aceternity UI's 3D Marquee** (<https://ui.aceternity.com/components/3d-marquee>), the
  reference component for this look on landing pages: columns of cards laid on a plane turned
  in 3D with CSS transforms, each column sliding on its own, used behind a hero's text.
- **Moving it**: with `transform` only, the one property (with `opacity`) a browser moves on
  the GPU without laying out or repainting the page. Every moving layer costs GPU memory, so the
  moving parts should be few (web.dev, "Stick to compositor-only properties and manage layer
  count": <https://web.dev/articles/stick-to-compositor-only-properties-and-manage-layer-count>).
- **Blur** is the costliest filter: the cost grows with its radius and its area, and it is
  worked out again every frame when what lies under it moves. A small radius, never animated,
  on one layer, is the use that stays cheap.
- **Masks**: `mask-image` with two gradients joined by `mask-composite: intersect` (Baseline
  since December 2023: <https://developer.mozilla.org/en-US/docs/Web/CSS/mask-composite>) can
  fade the plane out at the top and clear it around the hero. Text contrast is measured against
  what lies right behind the text (WCAG 1.4.3), so text that keeps the plain ground behind it
  keeps its contrast exactly.
- **Accessibility**: decoration is hidden from screen readers (`aria-hidden`) and from the
  pointer, and stands still under `prefers-reduced-motion`. WCAG 2.2.2, "Pause, Stop, Hide"
  (<https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html>), asks that anything that
  moves by itself for more than five seconds alongside other content can be paused, stopped or
  hidden, and its Note 2 extends it to all content on the page, decoration included. The loop
  the front had before did not meet it either. The owner chose a pause control: the switch in
  the nav (docs/research/front-controls.md).

## What this site does

- `data/today.json` carries 240 offers (it carried 20), chosen as before: newest first, one
  country after another, one per company, from the employers' own sources only, and only those
  whose title and "company · town" keep to one line, so every row keeps its height
  (`builder/backdrop-offers.mjs`).
- `app/lib/backdrop.js` deals them into three columns of 80 and writes each column twice, so
  its drift starts again without a seam. The rows (title, employer · town, source, pay, work
  mode) come from `app/lib/render.js`; none is a link.
- `styles/site.css` lays the columns on a plane of 2,424 × 6,080 px, set back 150 px, tilted
  58° away and turned 36°, seen from 1,300 px. The layer is blurred by 1.6 px and drawn at half
  strength; it fades out over the top quarter of the window and makes way in an ellipse round
  the count and the search bar, so they keep the plain ground behind them. Each column drifts
  towards the visitor at 20 px a second (a whole turn in 300 s), the three a third of a turn
  apart; under reduced motion they stand still. The filters panel takes the page's ground, so
  its ticks never sit on the backdrop.
- On a phone the plane is the same, but its columns are 520 px wide and each row's tags follow
  its text: the phone's small window onto the plane otherwise fell mostly on the gaps between
  a row's text and its tags, and the screen was half empty.
- Only on the front: when results show, the backdrop goes, as the loop did.

## Measured

- Chrome on a laptop's GPU (AMD Radeon 760M), eight seconds on the front, at desk (1,440 × 900)
  and phone (390 × 844) sizes, at full speed and with the CPU slowed four times: 60 frames a
  second in every case, and the page's own work (its main thread) the same as with the loop
  (4-5 %, 12-14 % slowed). The GPU process does more: 18-23 % of a core, against 6-9 % with the
  loop, because the blurred, masked plane is drawn again every frame. That is the price of the
  motion; under reduced motion the backdrop stands still (checked) and costs nothing after its
  first frame.
- `data/today.json`: 240 offers, 56.5 KB, 18.9 KB compressed (the loop's 20 were 2.1 KB).
