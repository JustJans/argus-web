# Reading job titles against ESCO's titles, fast

Research of 23 September 2026, before the gate's title reader was rewritten.

## The problem

Every advert's title is read against ESCO's job titles to find its occupation. The gate built
one regular expression per family and language, each an alternation of that family's titles,
plus one per language of the titles outside the vertical. A title read in two or three
languages ran some 130 of them, and the function that names the occupation (added with the
specialties, PR #32) ran them all again. A build took 25 to 31 minutes on the home server,
against 13 before.

## What is known about it

- **An alternation costs time for every alternative at every position of the text**: O(M×N)
  for M keywords and a text of N characters. FlashText (Singh, 2017) reads the text once through
  a trie of the keywords, O(N) whatever their number, and keeps the rules this gate needs:
  whole words only, the longest keyword wins.
- **Aho-Corasick** (1975) adds failure links to the trie for long texts. On short texts in
  JavaScript a plain trie is as fast or faster (aho-corasick-js benchmark), and job titles are
  some forty characters.
- Measured elsewhere, a naive alternation of 10,000 words is about 1,200 times slower than
  Aho-Corasick on the JVM. V8 compiles regular expressions well, so the gap in Node is smaller,
  but it still grows with the number of alternatives.

## Decision

- One trie per language holds every family's titles and the titles outside the vertical. It
  is walked once from each place a title may start (the start of the text, or after a character
  that is not a letter or digit).
- The rule stays exactly the old one: for each list on its own, the leftmost longest titles,
  whole words, never overlapping, a space matching any run of white space. A test compares the
  two on thousands of texts made from ESCO's own titles (`test/titles.test.mjs`).
- The occupation is read from the answer the families already got, not worked out again.

## Measured

On the home server, every advert in the store of 23 September 2026 (959,796 adverts, 615,242
different titles and languages), through the whole gate (families and occupations):

| | Time | Answers that differ |
|---|---:|---:|
| One regular expression per family and language | 622.9 s | |
| One index per language | 14.3 s | 0 |

A whole build of the pile, without the translation, measured the same way:

| | Time | Peak memory | Offers |
|---|---:|---:|---:|
| Before | 1,603 s | 1,176 MB | 83,324 |
| After | 245 s | 977 MB | 83,323 |

The one offer apart is the store moving between the two builds, an hour apart.
`builder/tools/compare-gates.mjs` repeats the check for any later change to the gate.

## Sources

- Singh, "Replace or Retrieve Keywords In Documents at Scale" (FlashText), arXiv 1711.00046:
  https://arxiv.org/abs/1711.00046
- Aho and Corasick, "Efficient string matching: an aid to bibliographic search",
  Communications of the ACM 18(6), 1975.
- aho-corasick-js benchmark: https://github.com/tanishiking/aho-corasick-benchmark
- kotlin-aho-corasick measurements: https://klibs.io/project/be-hase/kotlin-aho-corasick
- V8, speeding up regular expressions: https://v8.dev/blog/speeding-up-regular-expressions
