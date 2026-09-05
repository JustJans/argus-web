// ➤ Argus's text helpers and title filters are pure ES modules; joined into one file with
// ➤ the internal import removed, they run in the browser untouched. Written to site/lib by
// ➤ build-site.mjs and to app/lib before the tests, so the app's modules import the same
// ➤ engine in both places. Usage: node builder/engine-bundle.mjs <dir>
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

export function writeEngine(dir) {
  const require = createRequire(import.meta.url);
  const argusDir = dirname(require.resolve('argus/package.json'));
  const text = readFileSync(join(argusDir, 'server-bot', 'text.mjs'), 'utf-8');
  const filters = readFileSync(join(argusDir, 'server-bot', 'filters.mjs'), 'utf-8').replace(/^import .* from '\.\/text\.mjs';\s*$/m, '');
  const version = JSON.parse(readFileSync(join(argusDir, 'package.json'), 'utf-8')).version;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'engine.js'), `// Argus engine ${version}: text.mjs + filters.mjs, copied by builder/engine-bundle.mjs. Do not edit here.\n${text}\n${filters}`);
  return join(dir, 'engine.js');
}

if (process.argv[1] && /engine-bundle\.mjs$/.test(process.argv[1])) {
  const dir = process.argv[2] || join(dirname(dirname(fileURLToPath(import.meta.url))), 'app', 'lib');
  console.log('engine written to', writeEngine(dir));
}
