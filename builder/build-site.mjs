// ➤ Assembles the folder GitHub Pages serves: the static app, the catalogues the app reads,
// ➤ the pile the builder wrote (--data, default builder/out) under data/, and the title
// ➤ engine copied from Argus as one browser module. The explain report stays out: it is a
// ➤ working file, not a page.
import { cpSync, mkdirSync, rmSync, existsSync, readdirSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeEngine } from './engine-bundle.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const flag = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const DATA = flag('--data', join(ROOT, 'builder', 'out'));
const SITE = flag('--out', join(ROOT, 'site'));

rmSync(SITE, { recursive: true, force: true });
mkdirSync(SITE, { recursive: true });
cpSync(join(ROOT, 'app'), SITE, { recursive: true });

// ➤ The catalogues, as the app fetches them.
mkdirSync(join(SITE, 'catalogues'), { recursive: true });
for (const f of readdirSync(join(ROOT, 'catalogues'))) if (f.endsWith('.json')) cpSync(join(ROOT, 'catalogues', f), join(SITE, 'catalogues', f));

// ➤ Argus's title engine, as one browser module.
writeEngine(join(SITE, 'lib'));

// ➤ The PDF reader the intake page loads when a PDF is chosen: pdf.js, served from this
// ➤ site under a .js name so every host sends it as a script.
const require = createRequire(import.meta.url);
const pdfDir = join(dirname(require.resolve('pdfjs-dist/package.json')), 'build');
mkdirSync(join(SITE, 'vendor'), { recursive: true });
cpSync(join(pdfDir, 'pdf.min.mjs'), join(SITE, 'vendor', 'pdf.min.js'));
cpSync(join(pdfDir, 'pdf.worker.min.mjs'), join(SITE, 'vendor', 'pdf.worker.min.js'));

// ➤ The pile.
if (existsSync(join(DATA, 'index.json'))) {
  cpSync(DATA, join(SITE, 'data'), { recursive: true, filter: src => !src.endsWith('explain.txt') });
} else console.log('no pile at', DATA, '— the site ships without data');
console.log('site assembled at', SITE);
