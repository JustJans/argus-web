// ➤ Assembles the folder GitHub Pages serves: the static app plus the pile the builder
// ➤ wrote (--data, default builder/out) under site/data.
import { cpSync, mkdirSync, rmSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const flag = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const DATA = flag('--data', join(ROOT, 'builder', 'out'));
const SITE = flag('--out', join(ROOT, 'site'));

rmSync(SITE, { recursive: true, force: true });
mkdirSync(SITE, { recursive: true });
cpSync(join(ROOT, 'app'), SITE, { recursive: true });
if (existsSync(join(DATA, 'index.json'))) cpSync(DATA, join(SITE, 'data'), { recursive: true });
else console.log('no pile at', DATA, '— the site ships without data');
console.log('site assembled at', SITE);
