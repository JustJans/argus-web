// ➤ The content-addressed asset folders: page links rewritten into v/<hash>/, a hash that
// ➤ follows the assets and ignores the pages, and the pruning that keeps the last versions.
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { harness } from 'argus/server-bot/test-harness.mjs';
import { filesUnder, hashTree, rewriteAssetLinks, recordVersion } from '../builder/fingerprint.mjs';

const { ok, eq, done } = harness('fingerprint');
const shipped = new Set(['style.css', 'main.js', 'legal/notes.js', 'lib/codec.js', 'vendor/pdf.min.js']);
const isAsset = p => shipped.has(p);
const V = 'abc123def0';

eq(rewriteAssetLinks('<link rel="stylesheet" href="style.css"><script type="module" src="main.js"></script>', 'index.html', V, isAsset),
  `<link rel="stylesheet" href="v/${V}/style.css"><script type="module" src="v/${V}/main.js"></script>`, 'the first page points into the version folder');
eq(rewriteAssetLinks('<link href="../style.css"><script src="notes.js"></script>', 'legal/about.html', V, isAsset),
  `<link href="../v/${V}/style.css"><script src="../v/${V}/legal/notes.js"></script>`, 'a page in a folder climbs out to the version folder');
eq(rewriteAssetLinks('<link href="/argus-web/style.css">', '404.html', V, isAsset),
  `<link href="/argus-web/v/${V}/style.css">`, 'an absolute address keeps its prefix (the 404 page is served from any depth)');
const untouched = '<a href="legal/">go</a> <a href="../#p=x">back</a> <link rel="icon" href="favicon.svg"> <a href="https://x.org/a.js">ext</a> <script src="vendor/missing.js"></script>';
eq(rewriteAssetLinks(untouched, 'index.html', V, isAsset), untouched, 'page links, icons, outside addresses and files the build does not ship stay as they are');

{
  const dir = join(tmpdir(), `argus-web-fp-${process.pid}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, 'lib'), { recursive: true });
  writeFileSync(join(dir, 'main.js'), 'a'); writeFileSync(join(dir, 'lib', 'x.js'), 'b'); writeFileSync(join(dir, 'index.html'), '<p>');
  eq(filesUnder(dir), ['index.html', 'lib/x.js', 'main.js'], 'files are listed with forward slashes, sorted');
  const assetsOnly = f => !f.endsWith('.html');
  const h1 = hashTree(dir, assetsOnly);
  eq(h1.length, 10, 'ten characters of hash');
  writeFileSync(join(dir, 'index.html'), '<p>changed');
  eq(hashTree(dir, assetsOnly), h1, 'a page change leaves the asset hash alone');
  writeFileSync(join(dir, 'lib', 'x.js'), 'c');
  ok(hashTree(dir, assetsOnly) !== h1, 'an asset change changes it');
  const vDir = join(dir, 'v');
  for (const v of ['v1', 'v2', 'v3', 'v4']) { mkdirSync(join(vDir, v), { recursive: true }); recordVersion(vDir, v, 3); }
  eq(JSON.parse(readFileSync(join(vDir, 'versions.json'), 'utf8')), ['v2', 'v3', 'v4'], 'the manifest keeps the newest three, oldest first');
  ok(!existsSync(join(vDir, 'v1')) && existsSync(join(vDir, 'v2')), 'the oldest folder is gone, the kept ones stay');
  mkdirSync(join(vDir, 'stray'));
  eq(recordVersion(vDir, 'v4', 3), ['v2', 'v3', 'v4'], 'publishing the same version again changes nothing');
  ok(!existsSync(join(vDir, 'stray')), 'a folder the manifest does not know is removed');
  rmSync(dir, { recursive: true, force: true });
}
done();
