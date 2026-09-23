// ➤ The one-pass title index (app/lib/titles.js) must find exactly what one regular expression
// ➤ per list finds, the rule the gate and the CV reader were built on. Checked on texts made
// ➤ from ESCO's own titles with every kind of edge (punctuation, runs of spaces, titles at both
// ➤ ends, overlapping and nested titles, symbols inside a title), from a fixed seed.
import { readFileSync } from 'fs';
import { harness } from 'argus/server-bot/test-harness.mjs';
import { fold } from 'argus/server-bot/text.mjs';
import { titleRules } from '../app/lib/titles.js';

const { eq, ok, done } = harness('titles');
const T = titleRules(fold);
const isco = JSON.parse(readFileSync(new URL('../catalogues/codes/isco.json', import.meta.url), 'utf8'));

// ── Hand-made cases ─────────────────────────────────────────────────────
const both = (lists, text) => {
  const found = T.find(T.index(lists), text);
  return Object.keys(lists).map(id => [T.matches(T.alternation(lists[id]), text), found.get(id) || []]);
};
const same = (lists, text, label) => { const r = both(lists, text); eq(r.map(x => x[1]), r.map(x => x[0]), label); };
same({ a: ['naval architect', 'architect'], b: ['architect'] }, 'senior naval architect', 'the longest title of each list; each list on its own');
same({ a: ['project engineer'], b: ['engineer manager'] }, 'project engineer manager', 'overlapping titles of two lists are both found');
same({ a: ['engineer', 'test'] }, 'test engineer test', 'one list: left to right, never overlapping');
same({ a: ['c++ developer', 'developer'] }, 'senior c++ developer (m/w/d)', 'symbols inside a title');
same({ a: ['r&d engineer'] }, 'r&d engineer', 'an ampersand');
same({ a: ['site engineer'] }, 'site   engineer\tlead', 'a space in a title is any run of white space');
same({ a: ['engineer'] }, 'engineering manager', 'whole words only');
same({ a: ['engineer'] }, 'engineer', 'the whole text');
same({ a: ['engineer'] }, '', 'no text');
same({ a: ['2d designer'] }, 'x2d designer 2d designer', 'digits count as word characters');
same({ a: ['aa', 'aa aa'] }, 'aa aa aa', 'the longest at each place, then on from its end');
same({ a: ['ab'] }, 'ab-ab', 'a separator is needed between two');
same({ a: ['c++'] }, 'c++c++ c++', 'a title ending in a symbol');
same({ a: ['Ingénieur Méthodes'] }, fold('Ingénieur méthodes H/F'), 'titles are cleaned as the rule cleans them');
ok(T.find(T.index({}), 'anything').size === 0, 'an empty index finds nothing');

// ── Generated texts from ESCO's titles ──────────────────────────────────
let seed = 20260923;
const rand = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
const pick = a => a[rand(a.length)];
const units = Object.values(isco.units || {});
const lists = {};
for (let i = 0; i < 12; i++) lists[`L${i}`] = [...new Set(units.flatMap(u => u.labels?.[pick(['en', 'es', 'de', 'fr'])] || []).filter(() => rand(40) === 0))].slice(0, 300);
const pool = Object.values(lists).flat();
const glue = [' ', ' - ', ', ', ' / ', '  ', '\t', '(', ') ', ' & ', '-', '', ' senior ', ' (m/w/d) ', ' | ', '+'];
const index = T.index(lists);
const alternations = Object.fromEntries(Object.entries(lists).map(([id, l]) => [id, T.alternation(l)]));
let texts = 0, differ = 0, matched = 0, first = '';
for (let n = 0; n < 4000; n++) {
  const parts = Array.from({ length: 1 + rand(4) }, () => T.clean(pick(pool)));
  let text = parts.map(p => pick(glue) + p).join(pick(glue)) + pick(glue);
  if (rand(5) === 0) text = text.slice(rand(4));
  const found = T.find(index, text);
  for (const id of Object.keys(lists)) {
    const want = T.matches(alternations[id], text), got = found.get(id) || [];
    matched += want.length;
    if (JSON.stringify(want) !== JSON.stringify(got)) { differ++; first ||= `${JSON.stringify(text)} ${id}: ${JSON.stringify(got)} for ${JSON.stringify(want)}`; }
  }
  texts++;
}
ok(matched > 5000, `the generated texts hold titles to find (${matched} found)`);
eq(differ, 0, `${texts} generated texts, ${Object.keys(lists).length} lists of ESCO titles: the index finds what the regular expressions find${first ? ` (first difference: ${first})` : ''}`);

done();
