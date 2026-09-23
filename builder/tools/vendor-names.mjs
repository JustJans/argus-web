// ➤ Names for the Workday boards. A Workday board is known by its address ("adobe.wd5/
// ➤ external_experienced"), and a name made from that address reads "Experienced", "Cox 1" or
// ➤ "Gsknch". Each vacancy page carries the employer's legal name in its JobPosting block, so
// ➤ one page per board is enough: it is read once, kept in builder/state/vendor-names.json,
// ➤ and lib/names.mjs keeps the brand the address carries, spelt out by that legal name
// ➤ ("bakerhughes" → Baker Hughes, "bah" → Booz Allen Hamilton), mending only broken names.
// ➤   node builder/tools/vendor-names.mjs            # read what is missing, rewrite the names
// ➤   node builder/tools/vendor-names.mjs --dry      # show what would change, write nothing
// ➤   node builder/tools/vendor-names.mjs --found    # the server's own finds (state/found)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getJson, getText } from '../http.mjs';
import { ATS } from '../adapters/boards.mjs';
import { jobPostings } from '../lib/crawl.mjs';
import { brandName } from '../lib/names.mjs';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const STATE = join(ROOT, 'builder', 'state', 'vendor-names.json');
// ➤ The lists in the repository (config/), or with --found the server's own (state/found/,
// ➤ which the server's hunter writes and never commits): the server never touches a tracked file.
const FOUND = process.argv.includes('--found');
const FILES = (FOUND ? ['state/found/hunted.yml'] : ['config/companies-found.yml', 'config/hunted.yml']).map(f => join(ROOT, 'builder', ...f.split('/')));
const LANES = 4;
const DRY = process.argv.includes('--dry');
const opts = { tries: 1, timeoutMs: 15000, gapMs: 300 };

// ➤ The employer's legal name from one of the board's vacancy pages, or '' when none answers.
export async function legalName(slug) {
  const [tenantDc, site] = slug.split('/');
  const [tenant, dc] = tenantDc.split('.');
  const req = ATS.workday.request(slug, 0);
  const list = await getJson(ATS.workday.url(slug), { ...opts, ...req, body: JSON.stringify({ limit: 3, offset: 0, appliedFacets: {}, searchText: '' }) });
  for (const p of list?.jobPostings || []) {
    if (!p.externalPath) continue;
    const url = `https://${tenant}.${dc}.myworkdayjobs.com/en-US/${site}${p.externalPath}`;
    try { const job = jobPostings(await getText(url, opts), url)[0]; if (job?.company) return job.company; } catch { /* the next vacancy */ }
  }
  return '';
}

const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {};
const save = () => { mkdirSync(dirname(STATE), { recursive: true }); writeFileSync(STATE, JSON.stringify(state, null, 1)); };

// ➤ The boards to name: every workday entry in the lists the scouts and the hunter write.
const slugs = new Set();
for (const f of FILES) if (existsSync(f)) for (const m of readFileSync(f, 'utf8').matchAll(/^\s+workday:\s*(\S+)\s*$/gm)) slugs.add(m[1]);
const missing = [...slugs].filter(s => !(s in state));
console.log(`${slugs.size} Workday boards, ${missing.length} not read yet`);
let done = 0;
await Promise.all(Array.from({ length: LANES }, async () => {
  while (missing.length) {
    const slug = missing.shift();
    try { state[slug] = await legalName(slug); } catch { state[slug] = ''; }
    if (++done % 25 === 0) { save(); console.log(`${done} read`); }
  }
}));
save();

// ➤ Rewrite each entry's name where the page gave one.
let changed = 0;
for (const f of FILES) {
  if (!existsSync(f)) continue;
  const lines = readFileSync(f, 'utf8').replace(/\r\n/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s+)workday:\s*(\S+)\s*$/);
    if (!m) continue;
    const at = lines.slice(0, i).map((l, k) => [l, k]).reverse().find(([l]) => /^\s+- name:/.test(l))?.[1];
    if (at === undefined) continue;
    // ➤ The name as YAML wrote it: bare, in single quotes, or in double quotes (JSON's).
    const written = lines[at].replace(/^\s+- name:\s*/, '');
    const old = written.startsWith('"') ? JSON.parse(written) : written.replace(/^'(.*)'$/, '$1');
    const name = brandName(old, state[m[2]] || '', m[2]);
    if (!name || name === old) continue;
    console.log(`${m[2].padEnd(48)} ${old}  →  ${name}`);
    lines[at] = lines[at].replace(/- name:.*$/, `- name: ${/^[\p{L}\p{N}&.' -]+$/u.test(name) && !/^[\d-]/.test(name) ? name : JSON.stringify(name)}`);
    changed++;
  }
  if (!DRY) writeFileSync(f, lines.join('\n'));
}
console.log(`${changed} names ${DRY ? 'would change' : 'changed'}`);
