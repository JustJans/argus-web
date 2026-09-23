# Browsing the offers of one country from the front page

Research of 23 September 2026, before the countries of the front page's "Today" table became
links.

## How sites do it

- **A value with its count, and a click narrows to it.** Faceted navigation gives one filter per
  aspect of the content (Nielsen Norman Group, "Filters vs. Facets"). Baymard's research on
  filters recommends the number of matching items next to each value ("Blue (34)"), so a
  visitor knows what a click will bring before making it. The table already shows the counts.
- **A link, not a script on a click.** A real address (`#p=…`) can be opened in a new tab,
  shared and bookmarked, and the Back button returns to the front page.

## Decisions

- Each country's name and count open the list of that country's offers: a profile with that
  country alone, the same one the Country filter would make. The row of offers with no fixed
  country opens remote work anywhere (the "Remote" work mode).
- The table looks exactly as before: no underline or link colour, at the owner's request. Only
  the pointer changes over it, and a keyboard's focus shows its outline (WCAG 2.4.7).
- The count is clickable too, but it is hidden from screen readers and from the Tab key: they
  meet one link per country, named by the country.

## Sources

- Nielsen Norman Group, "Filters vs. Facets: Definitions": https://www.nngroup.com/articles/filters-vs-facets/
- Baymard Institute, ecommerce filter UI: https://baymard.com/learn/ecommerce-filter-ui
- WCAG 2.2, Focus Visible (2.4.7): https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html
