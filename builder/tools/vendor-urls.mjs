// ➤ One vacancy address per Workday or Oracle host, taken from the Web Data Commons files
// ➤ (builder/state/wdc/part_*.gz). The host alone is not enough to read a Workday site: the
// ➤ address carries the name of the careers site too ("acme.wd3.myworkdayjobs.com/Acme_Careers/
// ➤ job/..."), and only the addresses have it. What this finds goes to
// ➤ builder/state/wdc-vendor-urls.json, which vendor-slugs.mjs then turns into board slugs.
// ➤   node builder/tools/vendor-urls.mjs [--dir <folder>]
import { createReadStream, existsSync, readdirSync, writeFileSync } from 'fs';
import { createGunzip } from 'zlib';
import { createInterface } from 'readline';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const flag = (name, dflt) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : dflt; };
const WDC = flag('--dir', join(ROOT, 'builder', 'state', 'wdc'));
const OUT = join(ROOT, 'builder', 'state', 'wdc-vendor-urls.json');
const VENDOR = /^https?:\/\/[^/]*(?:myworkdayjobs\.com|oraclecloud\.com)\//i;
// ➤ One quad: subject, predicate, object, and the address of the page it was found on.
const QUAD = /^(<[^>]*>|_:\S+)\s+<([^>]*)>\s+(.+?)\s+<([^>]*)>\s+\.\s*$/;

if (!existsSync(WDC)) { console.log(`no ${WDC}: the Web Data Commons files are not here`); process.exit(1); }
const parts = readdirSync(WDC).filter(f => /^part_\d+\.gz$/.test(f)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
if (!parts.length) { console.log(`no part_*.gz in ${WDC}`); process.exit(1); }

const byHost = {};
let lines = 0;
for (const part of parts) {
  const rl = createInterface({ input: createReadStream(join(WDC, part)).pipe(createGunzip()), crlfDelay: Infinity });
  for await (const line of rl) {
    lines++;
    // ➤ The address of the page is the last of the four parts of a quad (its graph), not the
    // ➤ first: the vacancy itself is usually a blank node. The file writes it with spaces
    // ➤ around the full stop, so the whole quad is matched rather than its tail guessed.
    const m = QUAD.exec(line);
    if (!m) continue;
    const url = m[4];
    if (!VENDOR.test(url)) continue;
    let host; try { host = new URL(url).host.toLowerCase(); } catch { continue; }
    if (!byHost[host]) byHost[host] = url;
  }
  console.log(`${part}: ${Object.keys(byHost).length} hosts so far (${(lines / 1e6).toFixed(0)}M lines)`);
}
writeFileSync(OUT, JSON.stringify(byHost, null, 1));
console.log(`written ${OUT}: one address for each of ${Object.keys(byHost).length} vendor hosts`);
