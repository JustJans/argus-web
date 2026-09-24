# Design handoff

The site follows the final design handoff "Argus Web — final design on Tailwind CSS"
(September 2026): steel blue on a light technical ground, square corners, hairline borders,
and a dark theme. The pages carry Tailwind utility classes. `styles/site.css` holds:
- the tokens (`@theme`) and the dark theme (`.dark` redefines the same tokens);
- the states the scripts set (`body.has-results`, the phone panel), outside Tailwind's layers so
  they win over the utilities;
- the classes the scripts create, defined with `@apply`.

Tailwind 4 compiles it into `app/style.css` (`npm run css`), which is kept in the repository so
the server needs no compiler. `test/style.test.mjs` fails when the two drift apart.

No font is fetched: the headings ask for Barlow Condensed and the body for Barlow, and use them
only where the visitor has them installed; system fonts otherwise. Nothing comes from a third
party (the privacy promise).

## The pages

| Page | File | What it does |
|---|---|---|
| Home / list | `app/index.html` + `app/main.js` | The home and the list of results; see below. |
| Not found | `app/404.html` | The big 404, a line, a primary button back to the list. |
| Privacy, Sources | `app/legal/*.html` | Title, subtitle, rule. Sources: today's sources as a table from the pile's index. Privacy: three statements and the fine print. |

The home and list page:
- **Nav:** the brand, the light/dark switch, Privacy, Sources and the language menu.
- **Hero:** the count of offers listed today, large, then "Offers Listed Today" and the slogan.
  Once there are results (`body.has-results`) it becomes:
  - the count that matches, with "offers match your filters", on the left;
  - "out of N listed today" on the right;
  - How it works and Today make room.
- **Filters, on the left**, as fold-outs (`details.filter-group`). They start closed; one with
  something set opens and carries a 6px accent mark. The groups:
  - Country, with today's counts;
  - Occupations, one fold-out per ISCO group, and a ticked family's specialties under it;
  - Posted; Work mode; Pay; Level and a years cap; Languages; Degrees and the highest one;
  - Title words;
  - Exclude (words to avoid).
- **The search plate:**
  - the words, the town and a radius, and Search;
  - "Read my CV";
  - the code line.
- **Results:**
  - the status line: "14 of 3,330 offers · Spain 9 · Remote 5", with the per-country counts
    of the offers that match;
  - the cards: title (title case on the English site), employer · town, and tags;
  - the intermediaries' divider, and "Show more".

On phones (up to 760px) the page is one column, and the filters are a full-screen panel with a
sticky head (Filters · n, Clear, Done). The panel opens from the Filters button in the search
plate, and its rows are 44px high. The nav drops Privacy.

**Light and dark.** The page follows the system: the head sets `.dark` before the first paint,
and `app/lib/theme.js` keeps the switch in step and listens for changes. The switch overrides the
mode for the current page view only. Nothing is stored.

**The language menu** (`builder/language-menu.mjs`) is written into every page by the build, at
the `<!-- language menu -->` mark:
- on English pages it marks English as the current one and links to the Spanish twin;
- on the Spanish twins (`builder/spanish.mjs`) it is the other way round;
- the other language's link has the class `nav__lang`, and the first page's script adds the
  visitor's filters to it.

## The contract with the scripts

- **Ids** used by the scripts: `#filters`, `#filters-form`, `#filters-count`,
  `#filters-toggle`, `#filters-toggle-label`, `#filters-close`, `#filters-clear`,
  `#countries-pick`, `#remote`, `#families-pick`, `#levels-pick`, `#max-years`,
  `#languages-pick`, `#degrees-pick`, `#highest`, `#min-pay`, `#pay-stated`, `#roles`,
  `#no-words`, `#search`, `#q`, `#place`, `#radius`, `#places-list`, `#cv-file`, `#cv-status`,
  `#code-input`, `#copy-code`, `#copy-label`, `#stale`, `#stale-text`, `#results`,
  `#results-status`, `#progress`, `#skeleton`, `#list`, `#debug`, `#hero-count`, `#hero-match`,
  `#hero-match-text`, `#hero-stats`, `#generated`, `#countries`, `#dark-mode`. On the Sources
  page: `#generated`, `#source-rows`.
- **Data hooks**:
  - `details.filter-group[data-group]`; the occupation groups inside `#families-pick` carry
    `data-group="families:<group id>"`;
  - `.is-active` on a fold-out with something set;
  - `#cv-status[data-state]`;
  - `body.has-results`, `body.filters-open`, `.filters.is-open`, and `.btn.is-done` on Copy
    after copying;
  - the classes `hero-front`, `hero-results`, `content`, `how`, `today`, `filters` and
    `filters__head`, which the states above read.
- **Classes the scripts add**: `check-row` (with a `count` span), `checks`, `sub`,
  `filter-group`, `chev`, `offers`, `offer`, `offer__title`, `offer__meta`, `offer__tags`,
  `tag`, `tag-outline` (the source), `tag-accent` (the pay), `tag-neutral`, `offers__divider`,
  `more`, `btn`, `btn-secondary`, `empty`, `empty__n`, `debug`, `num`.
- **Ticks** are real checkboxes and radios inside a `label.check-row`, the input on the left.
- **No third-party fonts, scripts or images** anywhere (the privacy promise). pdf.js is served
  from this site and loaded only when a PDF is chosen. Icons are inline SVG (Lucide shapes,
  stroke 1.5).
- **No cookies, no storage.** The visitor's state lives in the URL fragment only.
- Text is inserted with `textContent`; markup in data is never rendered.

## States

- Home with nothing chosen; results with filters; zero results (the empty state lists how many
  offers fell at each stage); an unreadable code pasted (message under Results); downloading
  (2px progress bar and three skeleton bars); the stale-pile notice.
- The CV line: idle, reading (spinner), ticked (accent), nothing found, file could not be read.
- The code line: empty (placeholder), showing the current code, Copied (accent border).

## Preview locally

```
npm ci
npm run css                                 # after changing a page, a script's classes or styles/site.css
node builder/build-pile.mjs --limit 300     # a quick pile
node builder/build-site.mjs                 # assembles site/
node ops/serve.mjs site 8787                # http://localhost:8787/
```

The pages must be opened over http (not as files) for the catalogues and the pile to load.
