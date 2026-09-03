# Design handoff

Everything a designer needs to restyle Argus Web without breaking it.

## The pages

| Page | File | What it does |
|---|---|---|
| Home / list | `app/index.html` + `app/main.js` | Without a code: what the pile holds, a field to paste a code, a button to make one. With `#p=<code>`: the visitor's filtered list. |
| Intake | `app/intake/index.html` + `app/intake/intake.js` | Eight steps (CV, families, role words, level and years, languages, degrees, countries in order, deal-breakers) that end in the code. |
| Privacy, Sources, About | `app/legal/*.html` | Plain pages. Sources lists today's sources from the pile's index. |

One stylesheet, `app/style.css`, holds the tokens (colours, radius, measure) at the top and
the components below. Dark mode follows the system (`prefers-color-scheme`).

## The contract with the scripts

- **Ids** are used by the scripts; keep them (`#code-form`, `#code-input`, `#landing`,
  `#results`, `#list`, `#debug`, `#generated`, `#countries`, `#sources`, `#source-list`,
  `#profile-summary`, `#results-status`, `#edit-link`; on the intake every `#…` in the HTML).
- **Class names** are the styling hooks; the scripts add elements with these classes:
  `offers`, `offer`, `offer__title`, `offer__meta`, `offer__snippet`, `offer__tags`, `tag`,
  `tag--source`, `empty`, `debug`, `chip`, `chips`, `button`, `button--primary`.
- **Chips** are real checkboxes and radios inside a `label.chip`; the input is visually
  hidden but keyboard-reachable. `data-order` on a country chip carries its rank (1, 2, 3…).
- **No inline scripts or styles** on the intake page: its Content Security Policy allows only
  same-origin files. No third-party fonts, scripts or images anywhere (privacy promise).
- **No cookies, no storage.** The visitor's state lives in the URL fragment only.
- Text is inserted with `textContent`; markup in data is never rendered.

## States to design

- Home without a code, with a code and results, with a code and zero results (the empty
  state lists how many offers fell at each stage and how to loosen the profile), with an
  unreadable code, and while parts of the pile download.
- Intake: each step empty and filled; the CV read succeeded / was too short / the file
  could not be read; the final code box with Copy, Open my list, Share (only where the
  browser offers sharing).
- Small screens first: three in four job seekers use a phone.

## Preview locally

```
npm ci
node builder/build-pile.mjs --limit 300     # a quick pile
node builder/build-site.mjs                 # assembles site/
node ops/serve.mjs site 8787                # http://localhost:8787/
```

The intake page must be opened over http (not as a file) for the catalogues to load.
