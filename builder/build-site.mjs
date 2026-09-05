// ➤ Assembles the folder GitHub Pages serves: the pages at their fixed addresses; the scripts,
// ➤ styles, Argus's title engine and the PDF reader under v/<hash of their contents>/ (see
// ➤ fingerprint.mjs); the catalogues the app reads; and the pile the builder wrote (--data,
// ➤ default builder/out) under data/. The explain report stays out: it is a working file.
import { cpSync, mkdirSync, rmSync, existsSync, readdirSync, readFileSync, writeFileSync, renameSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeEngine } from './engine-bundle.mjs';
import { filesUnder, hashTree, rewriteAssetLinks, recordVersion } from './fingerprint.mjs';
import { familyTerms } from './gate.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const flag = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const DATA = flag('--data', join(ROOT, 'builder', 'out'));
const SITE = flag('--out', join(ROOT, 'site'));
const KEEP_VERSIONS = 3;

// ➤ Start clean, except v/: the previous builds' assets stay for pages still cached somewhere.
mkdirSync(SITE, { recursive: true });
for (const name of readdirSync(SITE)) if (name !== 'v') rmSync(join(SITE, name), { recursive: true, force: true });

// ➤ The app is staged whole; then the pages come out to their fixed addresses and everything
// ➤ else moves to v/<version>/, where version is the hash of those assets.
const stage = join(SITE, '.stage');
cpSync(join(ROOT, 'app'), stage, { recursive: true });
writeEngine(join(stage, 'lib'));
// ➤ The PDF reader the first page loads when a PDF is chosen: pdf.js, under a .js name so
// ➤ every host sends it as a script.
const require = createRequire(import.meta.url);
const pdfDir = join(dirname(require.resolve('pdfjs-dist/package.json')), 'build');
mkdirSync(join(stage, 'vendor'), { recursive: true });
cpSync(join(pdfDir, 'pdf.min.mjs'), join(stage, 'vendor', 'pdf.min.js'));
cpSync(join(pdfDir, 'pdf.worker.min.mjs'), join(stage, 'vendor', 'pdf.worker.min.js'));

const isPage = f => f.endsWith('.html');
const files = filesUnder(stage);
const isAsset = p => files.includes(p) && !isPage(p);
const version = hashTree(stage, f => !isPage(f));
for (const page of files.filter(isPage)) {
  const out = join(SITE, page);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, rewriteAssetLinks(readFileSync(join(stage, page), 'utf8'), page, version, isAsset));
  rmSync(join(stage, page));
}
const vDir = join(SITE, 'v');
mkdirSync(vDir, { recursive: true });
rmSync(join(vDir, version), { recursive: true, force: true });
renameSync(stage, join(vDir, version));
const kept = recordVersion(vDir, version, KEEP_VERSIONS);

// ➤ The catalogues, as the app fetches them.
mkdirSync(join(SITE, 'catalogues'), { recursive: true });
for (const f of readdirSync(join(ROOT, 'catalogues'))) if (f.endsWith('.json')) cpSync(join(ROOT, 'catalogues', f), join(SITE, 'catalogues', f));
// ➤ The job titles the first page reads a CV with: ESCO's per family and language (from
// ➤ codes/isco.json) plus the catalogue's extra terms, built by the gate's own rule. Fetched
// ➤ only when a CV is read.
const catalogue = JSON.parse(readFileSync(join(ROOT, 'catalogues', 'families.json'), 'utf8'));
const iscoTable = JSON.parse(readFileSync(join(ROOT, 'catalogues', 'codes', 'isco.json'), 'utf8'));
writeFileSync(join(SITE, 'catalogues', 'family-terms.json'), JSON.stringify(familyTerms(catalogue, { isco: iscoTable })));

// ➤ The pile.
if (existsSync(join(DATA, 'index.json'))) {
  cpSync(DATA, join(SITE, 'data'), { recursive: true, filter: src => !src.endsWith('explain.txt') });
} else console.log('no pile at', DATA, '— the site ships without data');
console.log(`site assembled at ${SITE} (assets in v/${version}; ${kept.length} of the last ${KEEP_VERSIONS} versions kept)`);
