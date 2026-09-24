// ➤ The stylesheet the site serves is what its source compiles to: app/style.css is Tailwind's
// ➤ output of styles/site.css over the pages and scripts (npm run css), kept in the repository so
// ➤ the server needs no compiler. A class added to a page without compiling again would ship
// ➤ unstyled. And the language menu the build writes into every page, in both languages.
import { existsSync, readFileSync, rmSync } from 'fs';
import { execFileSync } from 'child_process';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { harness } from 'argus/server-bot/test-harness.mjs';
import { languageMenu, MARK } from '../builder/language-menu.mjs';
import { toEnglish, spanishHref } from '../builder/spanish.mjs';

const { ok, eq, done } = harness('style');
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const lf = s => s.replace(/\r\n/g, '\n');

const cli = join(ROOT, 'node_modules', '@tailwindcss', 'cli', 'dist', 'index.mjs');
if (existsSync(cli)) {
  const out = join(tmpdir(), `argus-web-style-${process.pid}.css`);
  execFileSync(process.execPath, [cli, '-i', 'styles/site.css', '-o', out, '--minify'], { cwd: ROOT, stdio: 'ignore' });
  ok(lf(readFileSync(out, 'utf8')) === lf(readFileSync(join(ROOT, 'app', 'style.css'), 'utf8')), 'app/style.css is up to date with styles/site.css (npm run css)');
  rmSync(out, { force: true });
} else ok(true, 'no Tailwind compiler here (a production install): the compiled stylesheet is not checked');

const css = readFileSync(join(ROOT, 'app', 'style.css'), 'utf8');
ok(!/@import\s+url|https?:\/\/(?!tailwindcss\.com)/.test(css), 'the stylesheet fetches nothing from anywhere (the privacy promise)');

// ➤ The menu: the current language marked and not linked, the other one linked and labelled.
const en = languageMenu('en', 'es/');
ok(/<span aria-current="true"[^>]*>.*English<\/span>/.test(en) && /class="nav__lang[^"]*" href="es\/" hreflang="es" lang="es"/.test(en), 'the English menu marks English and links to Spanish');
const es = languageMenu('es', '../');
ok(/aria-label="Idioma"/.test(es) && /href="\.\.\/" hreflang="en"/.test(es) && />ES</.test(es), 'the Spanish one is labelled in Spanish and links back to English');
eq([spanishHref('index.html'), spanishHref('legal/privacy.html'), spanishHref('404.html')], ['es/', '../es/legal/privacy.html', '/argus-web/es/'], 'each page links to its own Spanish twin');
ok(!toEnglish(readFileSync(join(ROOT, 'app', 'index.html'), 'utf8'), 'index.html').includes(MARK), 'the published page carries the menu, not the mark');

done();
