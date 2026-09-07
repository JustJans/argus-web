// ➤ Employers to hunt that the web itself already named. Web Data Commons saw a JobPosting
// ➤ block on 71,898 hosts; the careers scout keeps the ones whose address carries the company's
// ➤ name, because that is what tells an employer's own site from a job board. The rest are not
// ➤ all boards: an employer whose careers host is named after nothing in particular
// ➤ (bewerbung.example.com) fails that test too. This writes those out for the hunter, which
// ➤ settles it the only way that is certain: by reading the site. One organisation across the
// ➤ pages and adverts of ours in Europe are still asked for, so a board is not what comes out.
// ➤ The list is committed, because the quads it comes from are 5 GB and live on one machine.
// ➤   node builder/tools/domains-wdc.mjs [--out builder/config/hunt-wdc.txt]
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadSites } from '../adapters/careers.mjs';
import { BOARD_HOSTS } from '../lib/crawl.mjs';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const flag = (name, dflt) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : dflt; };
const HOSTS = join(ROOT, 'builder', 'state', 'wdc-hosts.json');
const OUT = flag('--out', join(ROOT, 'builder', 'config', 'hunt-wdc.txt'));

// ➤ The words a job board names itself with, in its address or in the organisation it gives.
const WORK = /job|stellen|empleo|emploi|vacature|vacancy|career|karriere|recruit|resourcing|placement|personnel|staffing|interim|talent|headhunt/i;
const bare = h => String(h).toLowerCase().replace(/^www\./, '');
const hosts = JSON.parse(readFileSync(HOSTS, 'utf8'));
const known = new Set();
for (const s of loadSites()) {
  const k = s.host || s.feed || s.sitemap || s.listing || '';
  try { known.add(bare(k.startsWith('http') ? new URL(k).host : k)); } catch { /* skip */ }
}

const picked = [];
for (const [host, h] of Object.entries(hosts)) {
  const b = bare(host);
  if (!h.kept || BOARD_HOSTS.test(b) || known.has(b)) continue;
  const orgs = Object.entries(h.orgs || {}).sort((a, c) => c[1] - a[1]);
  const total = orgs.reduce((n, [, c]) => n + c, 0);
  // ➤ One organisation on most of the pages is an employer; many are a board.
  if (!orgs.length || orgs[0][1] / total < 0.8) continue;
  // ➤ A site named after work itself is a board naming itself, whatever the count says.
  const labels = b.split('.');
  const registrable = labels.length > 2 && /^(co|com|org|net|ac|gov|edu)$/.test(labels[labels.length - 2]) ? labels[labels.length - 3] : labels[labels.length - 2] || '';
  if (WORK.test(registrable) || WORK.test(orgs[0][0])) continue;
  picked.push({ host: b, name: orgs[0][0], kept: h.kept });
}
picked.sort((a, b) => b.kept - a.kept);

const clean = t => String(t || '').replace(/[,\n]/g, ' ').replace(/\s+/g, ' ').trim();
const head = `# Hosts where Web Data Commons saw one employer's vacancies (Common Crawl 2024-12) that the\n# lists do not name. Written by builder/tools/domains-wdc.mjs; read by the hunter, which decides\n# by reading the site. domain, employer\n`;
writeFileSync(OUT, head + picked.map(s => `${s.host}, ${clean(s.name)}`).join('\n') + '\n');
console.log(`${picked.length} hosts written to ${OUT}`);
console.log(picked.slice(0, 8).map(s => `  ${s.host} · ${clean(s.name)} · ${s.kept} adverts of ours`).join('\n'));
