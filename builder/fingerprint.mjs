// ➤ Cache-safe addresses for the site's scripts and styles, the way bundlers fingerprint
// ➤ their output: every build's assets live under v/<hash of their contents>/ and the pages
// ➤ point there. GitHub Pages serves everything with a ten-minute cache and a browser reload
// ➤ revalidates only the page, so without this a fresh page could run yesterday's script.
// ➤ The pages keep their addresses; the last few versions stay published so a page still
// ➤ cached somewhere finds the assets it was built with.
import { createHash } from 'crypto';
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs';
import { join, posix } from 'path';

// ➤ Every file under dir, as forward-slash paths relative to dir, sorted.
export function filesUnder(dir, rel = '') {
  const out = [];
  for (const name of readdirSync(join(dir, rel)).sort()) {
    const r = rel ? `${rel}/${name}` : name;
    if (statSync(join(dir, r)).isDirectory()) out.push(...filesUnder(dir, r));
    else out.push(r);
  }
  return out;
}

// ➤ Ten hex characters of SHA-256 over the paths and contents of the files that pass `keep`.
export function hashTree(dir, keep = () => true) {
  const h = createHash('sha256');
  for (const f of filesUnder(dir)) {
    if (!keep(f)) continue;
    h.update(f).update('\0').update(readFileSync(join(dir, f))).update('\0');
  }
  return h.digest('hex').slice(0, 10);
}

const ASSET = /\.(css|m?js)$/i;

// ➤ Points a page's stylesheet and script addresses into v/<version>/. `pageRel` is the page's
// ➤ path inside the app (index.html, intake/index.html); `isAsset` says whether an app path is
// ➤ a file the build ships. Relative addresses stay relative; an absolute one keeps its prefix
// ➤ (the 404 page needs /argus-web/… because Pages serves it from any depth).
export function rewriteAssetLinks(html, pageRel, version, isAsset) {
  const pageDir = posix.dirname(pageRel);
  return html.replace(/\b(href|src)="([^"]+)"/g, (m, attr, url) => {
    if (!ASSET.test(url) || /^(?:[a-z]+:|\/\/)/i.test(url)) return m;
    if (url.startsWith('/')) {
      const parts = url.slice(1).split('/');
      for (let i = 0; i < parts.length; i++) {
        const asset = parts.slice(i).join('/');
        if (isAsset(asset)) return `${attr}="/${parts.slice(0, i).join('/')}${i ? '/' : ''}v/${version}/${asset}"`;
      }
      return m;
    }
    const asset = posix.normalize(posix.join(pageDir, url));
    return isAsset(asset) ? `${attr}="${posix.relative(pageDir, `v/${version}/${asset}`)}"` : m;
  });
}

// ➤ Appends this build's version to v/versions.json and deletes every folder in v/ that is not
// ➤ among the newest `keep` versions. Returns the versions still published, oldest first.
export function recordVersion(vDir, version, keep = 3) {
  const file = join(vDir, 'versions.json');
  let list = [];
  try { list = JSON.parse(readFileSync(file, 'utf8')); } catch { list = []; }
  list = [...list.filter(v => v !== version), version].slice(-keep);
  for (const name of readdirSync(vDir)) {
    if (name === 'versions.json' || list.includes(name)) continue;
    rmSync(join(vDir, name), { recursive: true, force: true });
  }
  list = list.filter(v => existsSync(join(vDir, v)));
  writeFileSync(file, JSON.stringify(list));
  return list;
}
