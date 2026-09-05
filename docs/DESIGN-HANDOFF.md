# Design handoff

Everything a designer needs to restyle Argus Web without breaking it.

## The pages

| Page | File | What it does |
|---|---|---|
| Home / list | `app/index.html` + `app/main.js` | Filters on the left as fold-outs (`details`/`summary`): country; one fold-out per occupation group — engineers, architects and surveyors, technicians, supervisors, plant operators, crews — with plain checkboxes and counts, the tick on the left; posted date. One form with the search words, a "Read my CV" button (a PDF or text file read on the device; its job titles tick the occupations they belong to and unfold their groups), the code line (paste a code, or make one) and a single Search button that serves both; what the pile holds; a link to the sources. On a phone the filters are a panel the "☰ Filters" button opens and the "Done" button closes. State in the address: `#q=…&c=es,se&f=2144,3115&d=30` for a search, `#p=<code>` for the visitor's list; the filters narrow either. A notice appears when the pile is older than two days. |
| Not found | `app/404.html` | GitHub Pages serves it for any missing address. |
| Code page | `app/intake/index.html` + `app/intake/intake.js` | Seven steps (occupations by group, title words, level and years, languages, degrees, countries in order, deal-breakers) that end in the code. It opens filled in from the address: `#p=<code>` to edit a code, or `#f=…&dg=…&lg=…` with what the home page ticked and read from the CV (the "make a code" link carries them). |
| Privacy, Sources, About | `app/legal/*.html` | Plain pages. Sources lists today's sources from the pile's index. |

One stylesheet, `app/style.css`, holds the tokens (colours, radius, measure) at the top and
the components below. Dark mode follows the system (`prefers-color-scheme`). Every page opens
with the same header: the brand and the site links (`.site-nav`: Privacy, Sources, About,
Source code); there is no footer.

## The contract with the scripts

- **Ids** are used by the scripts; keep them (`#filters`, `#filters-form`, `#filters-toggle`,
  `#filters-close`, `#filters-clear`, `#countries-pick`, `#families-pick`, `#search`, `#q`,
  `#cv-file`, `#cv-status`, `#code-input`, `#make-code`, `#stale`, `#results`, `#results-title`,
  `#list`, `#debug`, `#generated`, `#countries`, `#profile-summary`, `#results-status`,
  `#edit-link`; on the code page every `#…` in the HTML). The occupation fold-outs are
  `details.filter-group[data-group]` inside `#families-pick`.
- **Class names** are the styling hooks; the scripts add elements with these classes:
  `offers`, `offer`, `offer__title`, `offer__meta`, `offer__snippet`, `offer__tags`, `tag`,
  `tag--source`, `empty`, `debug`, `chip`, `chips`, `button`, `button--primary`.
- **Chips** are real checkboxes and radios inside a `label.chip`; the input is visually
  hidden but keyboard-reachable. `data-order` on a country chip carries its rank (1, 2, 3…).
- **No inline scripts or styles** on the code page: its Content Security Policy allows only
  same-origin files. No third-party fonts, scripts or images anywhere (privacy promise).
- **No cookies, no storage.** The visitor's state lives in the URL fragment only.
- Text is inserted with `textContent`; markup in data is never rendered.

## States to design

- Home with nothing chosen, a plain search with results, a code with results, a code with
  zero results (the empty state lists how many offers fell at each stage and how to loosen
  the profile), an unreadable code, parts of the pile downloading, and the stale-pile notice.
  The CV line: idle, reading, ticked N occupations, none found, file could not be read.
- Code page: each step empty and filled; the final code box with Copy, Open my list, Share
  (only where the browser offers sharing).
- Small screens first: three in four job seekers use a phone.

## Preview locally

```
npm ci
node builder/build-pile.mjs --limit 300     # a quick pile
node builder/build-site.mjs                 # assembles site/
node ops/serve.mjs site 8787                # http://localhost:8787/
```

The pages must be opened over http (not as files) for the catalogues and the pile to load.
