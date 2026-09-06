# Design handoff

The site follows the "Industry" design system from the Claude Design project *Rediseño Argus
Web* (2026-09-05): steel blue (#5980a6) on a light technical ground (#f2f2f3), condensed
headings over a plain body face, square corners, hairline borders, and "+" registration marks
at the corners of the framed objects (the search plate, the stale notice, the About cards).
`app/style.css` is the one stylesheet: the tokens sit in `:root` at the top; everything reads
from them. One light theme, on purpose. No font is fetched: the headings ask for Barlow
Condensed and the body for Barlow, and use them only where the visitor has them installed;
system fonts otherwise. This keeps the privacy promise (no third-party requests).

## The pages

| Page | File | What it does |
|---|---|---|
| Home / list | `app/index.html` + `app/main.js` | Nav (brand, Privacy, Sources, About, GitHub mark). Hero: the brand large, the slogan "No account. No middlemen. No nonsense.", the count of offers today; once there are results the hero shrinks to one line (`body.has-results`): slogan left, "3,153 offers · Spain 81 · Sweden 3,072 · rebuilt 4 h ago" right, and How it works and Today make room. Left, the filters as fold-outs (`details.filter-group`, chevron turns when open, a 6px accent mark on the summary when something inside is set, the head reads "Filters · n" and holds Clear): Country (ticks with counts, Spain first, in the order ticked; "Remote is fine too"); Occupations, one fold-out per ISCO group inside; Posted; Level and a years cap; Languages; Degrees and the highest one; Title words; Deal-breakers and words to avoid. Right, the search plate (`.plate.blueprint`): words and the Search button; "Read my CV" (a PDF or text file read on the device, ticking occupations, degrees and languages; the status line carries `data-state` idle/reading/ticked/none/error); the code line (the filters packed, appearing as they change; paste another and Search loads it; Copy turns into "Copied"). Below: How it works (three numbered steps), Today (table and a note). State in the address: `#p=<code>&q=<words>`, or `#all=1` for the whole pile. |
| Not found | `app/404.html` | The big 404, a line, a primary button back to the list. |
| Privacy, Sources, About | `app/legal/*.html` | Title, subtitle, rule. About: three framed steps (your device → your code → the source) and two paragraphs. Sources: today's sources as a table from the pile's index. Privacy: three statements and the fine print. |

Phones (≤ 760px): one column; the filters become a full-screen panel with a sticky head
(Filters · n, Clear, Done) opened by the Filters button in the search plate; the nav keeps
the brand and About only, as the design shows; rows grow to 44px.

## The contract with the scripts

- **Ids** are used by the scripts; keep them: `#filters`, `#filters-form`, `#filters-count`,
  `#filters-toggle`, `#filters-toggle-label`, `#filters-close`, `#filters-clear`,
  `#countries-pick`, `#remote`, `#families-pick`, `#levels-pick`, `#max-years`,
  `#languages-pick`, `#degrees-pick`, `#highest`, `#roles`, `#vetoes-pick`, `#no-words`,
  `#search`, `#q`, `#cv-file`, `#cv-status`, `#code-input`, `#copy-code`, `#copy-label`,
  `#stale`, `#stale-text`, `#results`, `#results-status`, `#progress`, `#skeleton`, `#list`,
  `#debug`, `#hero-count`, `#hero-stats`, `#generated`, `#countries`. On the Sources page:
  `#generated`, `#source-rows`.
- **Data hooks**: `details.filter-group[data-group]` (the occupation groups inside
  `#families-pick` carry `data-group="families:<group id>"`), `.is-active` on a fold-out with
  something set, `#cv-status[data-state]`, `body.has-results`, `body.filters-open`,
  `.filters.is-open`, `.btn.is-done` on Copy after copying.
- **Classes the scripts add**: `check-row`, `check-row__count`, `filter-group`, `chev`,
  `offers`, `offer`, `offer__title`, `offer__date`, `offer__original`, `offer__meta`,
  `offer__snippet`, `offer__tags`, `tag`, `tag-outline` (the source), `tag-neutral`, `more`,
  `btn`, `btn-secondary`, `empty`, `empty__n`, `debug`.
- **Ticks** are real checkboxes and radios inside a `label.check-row`, the input on the left.
- **No third-party fonts, scripts or images** anywhere (privacy promise). pdf.js is served
  from this site and loaded only when a PDF is chosen. Icons are inline SVG (Lucide shapes,
  stroke 1.5).
- **No cookies, no storage.** The visitor's state lives in the URL fragment only.
- Text is inserted with `textContent`; markup in data is never rendered.

## States

- Home with nothing chosen; a search with results; filters with results; zero results (the
  empty state lists how many offers fell at each stage, numbers in the condensed face); an
  unreadable code pasted (message under Results); downloading (2px progress bar and three
  skeleton bars); the stale-pile notice (framed, accent).
- The CV line: idle, reading (spinner), ticked (accent), nothing found, file could not be read.
- The code line: empty (placeholder), showing the current code, Copied (accent border).

## Preview locally

```
npm ci
node builder/build-pile.mjs --limit 300     # a quick pile
node builder/build-site.mjs                 # assembles site/
node ops/serve.mjs site 8787                # http://localhost:8787/
```

The pages must be opened over http (not as files) for the catalogues and the pile to load.
