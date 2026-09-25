# The count while it loads

Research of 25 September 2026, for the owner's request: while the page waits for the number of
offers, the number should move the way a slot machine's reels do, but elegantly, without being
the machine.

## What the standard does

- **NumberFlow** (<https://number-flow.barvian.me/>), the reference component for animated
  numbers on the web, draws a number as one column per digit, moves the columns with
  transforms, fades each column's edges with gradient masks, asks for tabular figures so every
  digit keeps one width, and honours `prefers-reduced-motion` by default.
- **Odometers** (HubSpot's Odometer, Apple's numeric-text transition) roll each digit to its
  new value rather than swapping the text; the reels of a slot machine stop left to right.

## What this site does (`app/lib/roll.js`, `styles/site.css`)

- While the pile's index (the front's count) or the parts of the pile (the results' count) are
  downloading, each figure turns in its own window, at an even pace of its own (1.2 to 1.7 s a
  turn), from a phase of its own; the marks between them (the thousands' dot) stay still.
- When the number is known, the figures stop one after the other, left to right: each makes a
  last turn and slows to a halt (0.8 s for the first, 0.12 s more for each next one, an ease-out
  with no overshoot). No bounce, no blur, no flash, no colour.
- Each window is a little taller than the line (1.2 em) and faded at its top and bottom, so the
  fade never touches the ink and the stopped figures look exactly like the plain number, which
  replaces them at the end; the number's box does not move by a pixel (measured).
- Under reduced motion the number simply appears. Screen readers are told the count is loading
  (`aria-busy`) and then read the number, never the turning digits.
- Numbers are written with a dot between thousands and a comma before decimals on both pages
  ("97.189", "€14,99"), as the owner asked; Intl places the currency sign in the page's
  language.
