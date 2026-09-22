// ➤ The Spanish site: every line a reader sees on an English page has its Spanish on the twin,
// ➤ every line the scripts say has its Spanish in the dictionary, and the twin's links reach
// ➤ the shared scripts and the other Spanish pages.
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { harness } from 'argus/server-bot/test-harness.mjs';
import { PAGES, translate, toSpanish } from '../builder/spanish.mjs';
import { t, lang } from '../app/lib/i18n.js';
import ES from '../app/lib/es.js';

const { ok, eq, done } = harness('spanish');
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const read = p => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

// ➤ What a reader sees: the text between tags and the attributes read out or shown.
function visible(html) {
  const body = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<svg[\s\S]*?<\/svg>/g, '');
  const out = new Set();
  for (const m of body.matchAll(/>([^<>]+)</g)) { const s = m[1].replace(/\s+/g, ' ').trim(); if (/[A-Za-z]{2}/.test(s)) out.add(s); }
  for (const m of body.matchAll(/\b(?:placeholder|aria-label|content|title)="([^"]+)"/g)) if (/[A-Za-z]{3}/.test(m[1]) && !/width=|no-referrer/.test(m[1])) out.add(m[1]);
  return out;
}
const NAMES = new Set(['Argus Web', 'Argus', '#p=AgAI…', 'ES', 'EN', 'English', 'Español']);

for (const page of PAGES) {
  const english = read(`app/${page}`);
  const spanish = toSpanish(english, page);
  const left = [...visible(spanish)].filter(s => visible(english).has(s) && !NAMES.has(s));
  eq(left, [], `${page}: nothing a reader sees is left in English`);
  ok(spanish.includes('<html lang="es"'), `${page}: the twin says it is Spanish`);
}
{
  const es = toSpanish(read('app/index.html'), 'index.html');
  ok(es.includes('href="../style.css"') && es.includes('src="../main.js"'), 'the Spanish first page climbs one folder to the shared style and script');
  ok(es.includes('href="legal/privacy.html"') && es.includes('href="./"'), 'and links to the Spanish privacy page and to itself');
  ok(es.includes('<html lang="es" data-root="../">'), 'and reads the data one folder up');
  const src = toSpanish(read('app/legal/sources.html'), 'legal/sources.html');
  ok(src.includes('src="../../legal/sources.js"') && src.includes('href="../"') && src.includes('data-root="../../"'), 'a Spanish page in a folder climbs two, and its home is the Spanish first page');
  ok(src.includes('class="nav__lang" href="../../legal/sources.html"'), 'its language link leads back to the English page');
}
eq(translate('<th>Title words</th><label>Title words to avoid</label>', { 'Title words': 'Palabras', 'Title words to avoid': 'Evitar' }), '<th>Palabras</th><label>Evitar</label>', 'a whole line is replaced, the longer first');
eq(translate('<p>My Title words here</p>', { 'Title words': 'Palabras' }), '<p>My Title words here</p>', 'a line inside another is left alone');

// ➤ Every line the scripts say has its Spanish.
const scripts = ['app/main.js', 'app/legal/sources.js', ...readdirSync(join(ROOT, 'app/lib')).filter(f => f.endsWith('.js')).map(f => `app/lib/${f}`)];
const said = new Set();
for (const f of scripts) {
  const code = read(f).replace(/^\s*\/\/.*$/gm, '');
  for (const m of code.matchAll(/\bt\('((?:[^'\\]|\\.)+)'/g)) said.add(m[1].replace(/\\'/g, "'"));
  for (const m of code.matchAll(/'(left out by [^']+)'/g)) said.add(m[1]);
  for (const m of code.matchAll(/new Error\('([^']+)'\)/g)) said.add(m[1]);
}
const missing = [...said].filter(s => !(s in ES.script));
eq(missing, [], `every line the scripts say has its Spanish (${said.size} lines)`);

// ➤ Under Node there is no page: English, with its blanks filled.
eq([lang, t('{n} offers, rebuilt {when} UTC.', { n: '1,234', when: 'today' })], ['en', '1,234 offers, rebuilt today UTC.'], 'the scripts speak English where no page says otherwise');

done();
