// ➤ What the pages load from this site that comes out of node_modules: the search bar's
// ➤ dictionary matcher (modern-ahocorasick, MIT), its ES modules only, and the Archivo font of
// ➤ the counts and titles (@fontsource-variable/archivo, SIL Open Font License), its Latin
// ➤ file with the weight and width axes. The build copies them into the site; the tests into
// ➤ app/ (ignored by git), where the modules and the stylesheet find them.
//   node builder/vendor.mjs app
import { cpSync, mkdirSync, readdirSync, rmSync } from 'fs';
import { createRequire } from 'module';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const packageDir = name => dirname(require.resolve(`${name}/package.json`));

export function writeVendor(dir) {
  const dist = join(packageDir('modern-ahocorasick'), 'dist');
  const out = join(dir, 'vendor', 'ahocorasick');
  rmSync(out, { recursive: true, force: true });
  mkdirSync(join(out, '_private'), { recursive: true });
  cpSync(join(dist, 'index.js'), join(out, 'index.js'));
  for (const f of readdirSync(join(dist, '_private'))) if (f.endsWith('.js')) cpSync(join(dist, '_private', f), join(out, '_private', f));
  const archivo = packageDir('@fontsource-variable/archivo');
  mkdirSync(join(dir, 'fonts'), { recursive: true });
  cpSync(join(archivo, 'files', 'archivo-latin-wdth-normal.woff2'), join(dir, 'fonts', 'archivo.woff2'));
  cpSync(join(archivo, 'LICENSE'), join(dir, 'fonts', 'archivo-OFL.txt'));
  return out;
}

if (resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) console.log('vendor at', writeVendor(resolve(process.argv[2] || 'app')));
