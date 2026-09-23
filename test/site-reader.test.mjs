// ➤ One pass over an employer's site: which vacancy pages it reads, what it does with a page
// ➤ that does not answer, and when a site is barren. The network is a stand-in: each test
// ➤ site answers from a table, and each vacancy page lives on its own host, so the polite gap
// ➤ between two calls to one host does not slow the suite.
import { harness } from 'argus/server-bot/test-harness.mjs';
import { readSite, isBarren } from '../builder/adapters/careers.mjs';

const { eq, done } = harness('site reader');

const POSTING = title => `<script type="application/ld+json">${JSON.stringify({ '@type': 'JobPosting', title, hiringOrganization: { name: 'Acme' }, jobLocation: { address: { addressLocality: 'Bilbao', addressCountry: 'ES' } } })}</script>`;
const answers = new Map();   // ➤ URL → [status, body]
const asked = [];
globalThis.fetch = async url => {
  asked.push(String(url));
  const [status, body] = answers.get(String(url)) || [404, ''];
  return new Response(body, { status });
};

// ➤ A test site: its sitemap lists `pages` (URL → [status, body]), newest first.
let sites = 0;
function site(pages) {
  const host = `site${++sites}.example`;
  const list = Object.keys(pages).map((u, i) => `<url><loc>${u}</loc><lastmod>2026-09-${String(28 - Math.min(i, 27)).padStart(2, '0')}</lastmod></url>`).join('');
  answers.set(`https://${host}/robots.txt`, [200, 'User-agent: *\nAllow: /']);
  answers.set(`https://${host}/sitemap.xml`, [200, `<urlset>${list}</urlset>`]);
  for (const [u, a] of Object.entries(pages)) answers.set(u, a);
  return { host, sitemap: `https://${host}/sitemap.xml` };
}
let pageNo = 0;
const page = () => `https://p${++pageNo}.example/jobs/${pageNo}`;
const pagesOf = (n, answer) => Object.fromEntries(Array.from({ length: n }, () => [page(), answer]));
const read = async (s, store, budget) => { asked.length = 0; const r = await readSite(s, store, budget); return { ...r, pagesAsked: asked.filter(u => /\/jobs\//.test(u)).length }; };

// A site that never publishes the block becomes barren, and then reads only a few pages a pass.
const empty = [200, '<html><body>A page about us</body></html>'];
const barrenPages = pagesOf(60, empty);
const barrenStore = {};
let r = await read(site(barrenPages), barrenStore);
eq([r.pagesAsked, r.adverts.length, r.barren], [60, 0, true], 'sixty pages read, none with a JobPosting: the site is barren');
const more = { ...pagesOf(30, empty), ...barrenPages };
r = await read(site(more), barrenStore);
eq([r.pagesAsked, r.backlog, r.barren], [10, 20, true], 'a barren site reads ten of its thirty new pages, newest first');
const found = page();
r = await read(site({ [found]: [200, POSTING('Site Engineer')], ...more }), barrenStore);
eq([r.adverts.map(a => a.title), r.barren], [['Site Engineer'], false], 'a probe that finds a JobPosting ends the barren spell');
eq([isBarren({}), isBarren(Object.fromEntries(Array.from({ length: 49 }, (_, i) => [i, { job: null }])))], [false, false], 'fewer than fifty pages say nothing yet');

// A page that does not answer is tried again in the next passes, then given up.
const failing = page(), healing = page(), fine = page();
const flaky = { [failing]: [503, ''], [healing]: [503, ''], [fine]: [200, POSTING('Electrical Engineer')] };
const flakyStore = {};
r = await read(site(flaky), flakyStore);
eq([r.pagesAsked, r.adverts.length, r.backlog, flakyStore.pages[failing].failed], [3, 1, 2, 1], 'two pages that did not answer are kept as failed and count as not read yet');
flaky[healing] = [200, POSTING('Process Engineer')];
r = await read(site(flaky), flakyStore);
eq([r.pagesAsked, r.adverts.map(a => a.title).sort(), flakyStore.pages[healing].failed], [2, ['Electrical Engineer', 'Process Engineer'], undefined], 'the next pass tries them again, and one that answers is read');
r = await read(site(flaky), flakyStore);
eq([r.pagesAsked, flakyStore.pages[failing].failed, r.backlog], [1, 3, 0], 'a page that never answers is tried three passes in all');
r = await read(site(flaky), flakyStore);
eq(r.pagesAsked, 0, 'and then it is given up');
eq(isBarren(Object.fromEntries(Array.from({ length: 60 }, (_, i) => [i, { job: null, failed: 1 }]))), false, 'pages that did not answer do not make a site barren');

// A host that says "too many requests", or stops answering, is left until the next pass.
const busy = pagesOf(5, [429, '']);
const busyStore = {};
r = await read(site(busy), busyStore);
eq([r.pagesAsked, Object.keys(busyStore.pages).length, r.backlog], [1, 0, 5], '"too many requests" ends the reading, and the page is not kept as read');
const down = pagesOf(8, [500, '']);
r = await read(site(down), {});
eq([r.pagesAsked, r.backlog], [5, 8], 'five pages that do not answer end the reading of the site for this pass');
const goneStore = {};
r = await read(site(pagesOf(7, [404, ''])), goneStore);
eq([r.pagesAsked, r.backlog, Object.values(goneStore.pages).filter(p => p.failed).length], [7, 0, 0], 'a page that is not there is an answer: read, not failed, and not tried again');

// A pass that runs out of time keeps what it read; the rest waits for the next pass.
const lateStore = {};
r = await readSite(site(pagesOf(4, [200, POSTING('Test Engineer')])), lateStore, {}, () => {}, Date.now() - 1);
eq([r.fetched, r.backlog, r.adverts.length], [0, 4, 0], 'a pass whose time is up reads no page and leaves them all for the next one');

// A run that has spent its page budget leaves the site for the next run.
r = await read(site(pagesOf(3, empty)), {}, { left: 0 });
eq([r.pagesAsked, r.postponed], [0, true], 'no page budget left: the site is postponed, not read');
r = await read(site(pagesOf(3, empty)), {}, { left: 2 });
eq([r.pagesAsked, r.postponed], [2, false], 'a budget that covers part of the site reads that part');

done();
