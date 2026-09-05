# Design handoff

Everything a designer needs to restyle Argus Web without breaking it.

## The pages

| Page | File | What it does |
|---|---|---|
| Home / list | `app/index.html` + `app/main.js` | One page. The filters on the left are the visitor's whole profile, each a fold-out (`details`/`summary`): Country (ticks with counts, Spain first, in the order ticked; "Remote is fine too"); Occupations, which holds one fold-out per ISCO group — Engineers, Architects/planners/surveyors, Technicians, Supervisors, Plant operators, Ship and aircraft crews — with ticks and counts; Posted; Level (radios and a years cap); Languages; Degrees (ticks and the highest degree); Title words; Deal-breakers (ticks and words to avoid). Country and Posted open by default; a fold-out with something set stays open. The card on the right has the search words, a "Read my CV" button (a PDF or text file read on the device: its job titles, degree lines and language lines tick the filters), the code line (the filters packed into a short code, appearing as they change; paste another and Search loads it; Copy) and one Search button. Below: what the pile holds today and a link to the sources. On a phone the filters are a panel the "☰ Filters" button opens and the "Done" button closes. State in the address: `#p=<code>&q=<words>`. A notice appears when the pile is older than two days. |
| Not found | `app/404.html` | GitHub Pages serves it for any missing address. |
| Privacy, Sources, About | `app/legal/*.html` | Plain pages. Sources lists today's sources from the pile's index. |

One stylesheet, `app/style.css`, holds the tokens (colours, radius, measure) at the top and
the components below. Dark mode follows the system (`prefers-color-scheme`). Every page opens
with the same header: the brand and the site links (`.site-nav`: Privacy, Sources, About,
Source code); there is no footer.

## The contract with the scripts

- **Ids** are used by the scripts; keep them (`#filters`, `#filters-form`, `#filters-toggle`,
  `#filters-close`, `#filters-clear`, `#countries-pick`, `#remote`, `#families-pick`,
  `#levels-pick`, `#max-years`, `#languages-pick`, `#degrees-pick`, `#highest`, `#roles`,
  `#vetoes-pick`, `#no-words`, `#search`, `#q`, `#cv-file`, `#cv-status`, `#code-input`,
  `#copy-code`, `#stale`, `#results`, `#results-status`, `#list`, `#debug`, `#generated`,
  `#countries`). The fold-outs are `details.filter-group[data-group]`; the occupation groups
  inside `#families-pick` carry `data-group="families:<group id>"`.
- **Class names** are the styling hooks; the scripts add elements with these classes:
  `check-row`, `check-row__count`, `filter-group`, `offers`, `offer`, `offer__title`,
  `offer__original`, `offer__meta`, `offer__snippet`, `offer__tags`, `tag`, `tag--source`,
  `empty`, `debug`, `button`, `button--primary`.
- **Ticks** are real checkboxes and radios inside a `label.check-row`, the input on the left.
- **No third-party fonts, scripts or images** anywhere (privacy promise). pdf.js is served
  from this site and loaded only when a PDF is chosen.
- **No cookies, no storage.** The visitor's state lives in the URL fragment only.
- Text is inserted with `textContent`; markup in data is never rendered.

## States to design

- Home with nothing chosen, a search with results, filters with results, filters with zero
  results (the empty state lists how many offers fell at each stage and how to loosen them),
  an unreadable code pasted, parts of the pile downloading, and the stale-pile notice.
- The CV line: idle, reading, what was ticked, nothing found, file could not be read.
- The code line: empty (placeholder), showing the current code, "Copied".
- Small screens first: three in four job seekers use a phone. The filters panel scrolls; the
  fold-outs keep it short.

## Preview locally

```
npm ci
node builder/build-pile.mjs --limit 300     # a quick pile
node builder/build-site.mjs                 # assembles site/
node ops/serve.mjs site 8787                # http://localhost:8787/
```

The pages must be opened over http (not as files) for the catalogues and the pile to load.
