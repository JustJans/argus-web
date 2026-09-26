# The front's controls: pausing the backdrop, light and dark, applying the filters, copying

Research of 26 September 2026, for four requests of the owner made together: the switch in the
nav becomes the backdrop's pause; light and dark move to a sun and a moon beside the language
menu, "elegant, professional, not cartoons"; ticking a filter should not search at once, only
when the panel closes or on Search, because the front's backdrop went away at the first tick;
and Copy becomes an icon that says the code was copied.

## Pausing the backdrop

- WCAG 2.2.2 (Pause, Stop, Hide:
  <https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html>) asks that anything moving
  by itself for more than five seconds can be paused, decoration included (its Note 2). The
  sufficient techniques are a control that pauses and restarts it (G4), or motion that stops by
  itself within five seconds (G11).
- The site: the switch in the nav, where the light and dark switch was, starts and stops the
  drift; it stops the columns where they are (`animation-play-state`) and starts them again
  from there. It is on when the page opens, and off when the system asks for reduced motion;
  turned on then, the backdrop drifts, as the visitor chose. It shows only on the front, and
  goes with the backdrop when results show. Nothing is stored (no cookies, no storage).

## Light and dark

- A theme button's icon shows where it leads: a moon while the page is light, a sun while it
  is dark; its accessible name says what it does, or it carries its state in `aria-pressed`
  (<https://whitep4nth3r.com/blog/best-light-dark-mode-theme-toggle-javascript/>,
  <https://chrisnajman.github.io/accessible-dark-mode-toggle-button/>).
- The site: a round icon button at the end of the nav, after the language menu, on every page,
  with Lucide's sun and moon (the line icons the site already uses, stroke 1.5); its name is
  "Dark mode" and `aria-pressed` says whether the dark theme is on. CSS picks the icon from the
  page's own class, so the right one shows before any script runs.

## Applying the filters

- Nielsen Norman Group, "User Intent Affects Filter Design"
  (<https://www.nngroup.com/articles/applying-filters/>): interactive filtering (every tick
  updates the results) suits fast sites and visitors exploring one filter at a time; batch
  filtering (the results update once, when the choices are applied) suits visitors who set
  several filters and results that take a moment to arrive, and phones. Its cost is a
  combination that finds nothing, which this site's empty state answers by saying how many
  offers fell at each stage.
- The site: here a search downloads parts of the pile, and a visitor usually ticks several
  groups, so the panel works in batch. Each tick shows at once in the panel (a family's
  specialties, the marks, the count on the Filters button, the code the choices pack) and is
  searched when the panel closes or Search is pressed; Search also closes the panel so the
  results show. A code pasted into the panel ticks its filters the same way. The address keeps
  the filters last searched until then.

## Copying the code

- IBM's Carbon (<https://carbondesignsystem.com/components/code-snippet/usage/>): a copy icon
  with a confirmation tooltip, "Copied to clipboard" by default. GitHub's Primer
  (<https://primer.style/product/scenario-patterns/copy/>): the icon turns into a tick at once,
  and since an icon swap is invisible to a screen reader, a live region says it too; a failure
  shows and is announced the same way.
- The site: Copy is Lucide's copy icon; once copied it turns into a tick and "Copied to the
  clipboard" shows beside it for two seconds, in a status region screen readers read out. When
  the browser will not copy, the code is selected for copying by hand and the label says so.
