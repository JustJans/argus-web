// ➤ Publishes site/ to the gh-pages branch as ONE commit, replacing the previous one, so the
// ➤ branch never grows with every rebuild. Used while GitHub Actions cannot run for this
// ➤ repository; the pile.yml workflow does the same job without commits once it can.
// ➤ Usage: node builder/publish.mjs [--site site]
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const flag = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const SITE = flag('--site', join(ROOT, 'site'));
if (!existsSync(join(SITE, 'index.html'))) { console.error('no site at', SITE, '— run build-site first'); process.exit(1); }

const remote = execFileSync('git', ['-C', ROOT, 'remote', 'get-url', 'origin'], { encoding: 'utf-8' }).trim();
const name = execFileSync('git', ['-C', ROOT, 'config', 'user.name'], { encoding: 'utf-8' }).trim();
const email = execFileSync('git', ['-C', ROOT, 'config', 'user.email'], { encoding: 'utf-8' }).trim();
const work = join(tmpdir(), `argus-web-publish-${process.pid}`);
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
cpSync(SITE, work, { recursive: true });
writeFileSync(join(work, '.nojekyll'), '');   // ➤ serve every file as it is, no Jekyll pass

const git = (...a) => execFileSync('git', ['-C', work, ...a], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'inherit'] });
git('init', '-q', '-b', 'gh-pages');
git('config', 'user.name', name);
git('config', 'user.email', email);
git('add', '-A');
git('commit', '-q', '-m', `Publish the site (${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC)`);
git('push', '-q', '--force', remote, 'HEAD:gh-pages');
rmSync(work, { recursive: true, force: true });
console.log('published to gh-pages');
