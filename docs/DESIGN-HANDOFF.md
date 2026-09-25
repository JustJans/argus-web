# Design handoff

The site follows the final design handoff "Argus Web, final design (search-first, Tailwind
CSS)" (September 2026): one big search bar, the filters in a panel under it, a slow loop of
today's offers on the front, steel blue on a light technical ground, rounded controls, cards
and panels, hairline borders, and a dark theme. The pages carry Tailwind utility classes.
`styles/site.css` holds:
- the tokens (`@theme`) and the dark theme (`.dark` redefines the same tokens);
- the Archivo font of the counts and titles, served from this site (`builder/vendor.mjs` copies
  it from `@fontsource-variable/archivo`, SIL Open Font License, into `fonts/`);
- the states the scripts set (`body.has-results`, the open Filters button, an unreadable code),
  outside Tailwind's layers so they win over the utilities;
- the classes the scripts create, defined with `@apply`.

Tailwind 4 compiles it into `app/style.css` (`npm run css`), which is kept in the repository so
the server needs no compiler. `test/style.test.mjs` fails when the two drift apart.

The headings ask for Barlow Condensed and the body for Barlow, used only where the visitor has
them installed; system fonts otherwise. Nothing comes from a third party (the privacy promise).

## The pages

| Page | File | What it does |
|---|---|---|
| Home / list | `app/index.html` + `app/main.js` | The home and the list of results; see below. |
| Not found | `app/404.html` | The big 404, a line, a Back to search button. |
| Privacy, Sources | `app/legal/*.html` | Title, subtitle, rule. Sources: today's sources in a rounded table from the pile's index. Privacy: three statements and the fine print. |

The home and list page:
- **Nav:** the brand, the light/dark switch, Privacy, Sources and the language menu.
- **Hero:** the count of offers listed today, large (Archivo), then "Offers Listed Today". Once
  there are results (`body.has-results`) it becomes the count that matches, with "offers match
  your filters", and "out of N listed today" under it.
- **The search bar:** one field for titles, companies, towns, countries and pasted codes
  (`app/lib/query.js` reads the towns and countries: docs/research/single-search.md). Under it,
  the Filters button and, once the bar has read a town, the radius pill.
- **Filters:** a panel that opens under the bar: the code band (the code and Copy), the CV row
  (Read my CV, Clear), then the groups in four columns (Country with today's counts,
  Occupations by group with a ticked family's specialties, Posted, Work mode, Level and a years
  cap, Languages, Degrees and the highest one), then Pay at least, Title words and Exclude.
- **The loop** (front only), there for the look: today's offers from `data/today.json`, faint,
  sliding down one slot every two seconds (`app/lib/ticker.js`).
- **Results:**
  - the status line: "14 of 3,330 offers · Spain 9 · Remote 5", with the per-country counts
    of the offers that match;
  - the cards: title (title case on the English site), employer · town, and tags;
  - the intermediaries' divider, and "Show more".

On phones (up to 760px) the bar is 56px with a round search button, the panel stacks its parts
with rows 44px high, the loop shows three rows, and the nav drops Privacy.

**Light and dark.** The page follows the system: the head sets `.dark` before the first paint,
and `app/lib/theme.js` keeps the switch in step and listens for changes. The switch overrides the
mode for the current page view only. Nothing is stored.

**The language menu** (`builder/language-menu.mjs`) is written into every page by the build, at
the `<!-- language menu -->` mark:
- on English pages it marks English as the current one and links to the Spanish twin;
- on the Spanish twins (`builder/spanish.mjs`) it is the other way round;
- the other language's link has the class `nav__lang`, and the first page's script adds the
  visitor's search to it.

## The contract with the scripts

- **Ids** used by the scripts: `#search`, `#q`, `#bar-note`, `#filters-toggle`,
  `#filters-toggle-label`, `#radius-pill`, `#radius`, `#filters`, `#code-input`, `#copy-code`,
  `#copy-label`, `#cv-file`, `#cv-status`, `#filters-clear`, `#filters-form`, `#countries-pick`,
  `#remote`, `#families-pick`, `#levels-pick`, `#max-years`, `#languages-pick`,
  `#degrees-pick`, `#highest`, `#min-pay`, `#pay-stated`, `#roles`, `#no-words`, `#stale`,
  `#stale-text`, `#loop`, `#results`, `#results-status`,
  `#progress`, `#skeleton`, `#list`, `#debug`, `#hero-count`, `#hero-match`,
  `#hero-match-text`, `#hero-stats`, `#dark-mode`. On the Sources page: `#generated`,
  `#source-rows`.
- **Data hooks**:
  - `.filter-group[data-group]` for each group of the panel, and `.is-active` on one with
    something set;
  - `#cv-status[data-state]`;
  - `body.has-results`, `#filters-toggle[aria-expanded]`, `#search.is-unreadable`, and
    `.btn.is-done` on Copy after copying;
  - the classes `hero-front`, `hero-results` and `loop`, which the states above read.
- **Classes the scripts add**: `check-row` (with a `count` span), `checks`, `sub`,
  `occupation-group`, `offers`, `offer`, `offer__title`, `offer__meta`, `offer__tags`, `tag`,
  `tag-outline` (the source), `tag-accent` (the pay), `tag-neutral`, `offers__divider`, `more`,
  `btn`, `btn-secondary`, `empty`, `empty__n`, `debug`, `num`, and for the loop `loop__rows`,
  `loop__row`, `loop__text`, `loop__title`, `loop__meta`, `loop__tags`.
- **Ticks** are real checkboxes and radios inside a `label.check-row`, the input on the left.
- **No third-party fonts, scripts or images** anywhere (the privacy promise). pdf.js and the
  Archivo font are served from this site; pdf.js loads only when a PDF is chosen. Icons are
  inline SVG (Lucide shapes, stroke 1.5).
- **No cookies, no storage.** The visitor's state lives in the URL fragment only: `p` the code,
  `q` the search words, `r` the radius.
- Text is inserted with `textContent`; markup in data is never rendered. Nothing is cut short:
  the loop only takes offers whose title fits whole.

## States

- Home with nothing chosen (the loop); results with filters; zero results (the empty state lists
  how many offers fell at each stage); an unreadable code (a line under the bar, and the bar's
  border darker); downloading (a rounded progress bar and a skeleton card); the stale-pile
  notice.
- The CV line: idle, reading (spinner), ticked (accent), nothing found, file could not be read.
- The code line: empty (placeholder), showing the current code, Copied (accent border).
- The loop: always moving, even under the pointer; resting in a hidden tab, still under reduced
  motion. It is decoration: hidden from screen readers and out of the keyboard's way.

## Preview locally

```
npm ci
npm run css                                 # after changing a page, a script's classes or styles/site.css
node builder/build-pile.mjs --limit 300     # a quick pile
node builder/build-site.mjs                 # assembles site/
node ops/serve.mjs site 8787                # http://localhost:8787/
```

The pages must be opened over http (not as files) for the catalogues and the pile to load.
