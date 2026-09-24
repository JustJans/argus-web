// ➤ The libraries the pages load from this site, copied out of node_modules: the search bar's
// ➤ dictionary matcher (modern-ahocorasick, MIT), its ES modules only. The build copies them
// ➤ into the site; the tests into app/ (ignored by git), where the modules import them from.
//   node builder/vendor.mjs app
import { cpSync, mkdirSync, readdirSync, rmSync } from 'fs';
import { createRequire } from 'module';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);

export function writeVendor(dir) {
  const dist = join(dirname(require.resolve('modern-ahocorasick/package.json')), 'dist');
  const out = join(dir, 'vendor', 'ahocorasick');
  rmSync(out, { recursive: true, force: true });
  mkdirSync(join(out, '_private'), { recursive: true });
  cpSync(join(dist, 'index.js'), join(out, 'index.js'));
  for (const f of readdirSync(join(dist, '_private'))) if (f.endsWith('.js')) cpSync(join(dist, '_private', f), join(out, '_private', f));
  return out;
}

if (resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) console.log('vendor at', writeVendor(resolve(process.argv[2] || 'app')));
