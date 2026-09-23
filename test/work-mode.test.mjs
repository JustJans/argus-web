// ➤ Work mode: the reader (builder/work-mode.mjs) and every source's own field as it arrives
// ➤ (shapes seen on 23 September 2026), down to the letter the records carry.
import { readFileSync } from 'fs';
import { harness } from 'argus/server-bot/test-harness.mjs';
import { modeWord, mostFlexible, tagMode, placeMode, workModeOf } from '../builder/work-mode.mjs';
import { ATS } from '../builder/adapters/boards.mjs';
import { jobPostings } from '../builder/lib/crawl.mjs';
import { toRaw as jobtechRaw } from '../builder/adapters/jobtech.mjs';
import { compileCountries, placeOf, toRecord } from '../builder/normalise.mjs';

const { eq, done } = harness('work mode');

// ── The words ───────────────────────────────────────────────────────────
eq(['On Site', 'on-site', 'OnSite', 'onsite', 'ORA_ON_SITE', '#LI-Onsite'].map(modeWord), Array(6).fill('onsite'), 'on site, however a source writes it');
eq(['Hybrid', 'ORA_HYBRID', '#LI-Hybrid', 'Hybridarbete'].map(modeWord), Array(4).fill('hybrid'), 'hybrid');
eq(['Remote', 'ORA_REMOTE', '#LI-Remote', 'Distansarbete'].map(modeWord), Array(4).fill('remote'), 'remote');
eq(['Arbete på plats', 'unspecified', 'temporary', '', null].map(modeWord), ['', '', '', '', ''], "JobTech's default and anything else say nothing");
eq([mostFlexible(['onsite', 'hybrid']), mostFlexible(['hybrid', 'remote', 'onsite']), mostFlexible([false, 'onsite']), mostFlexible([])], ['hybrid', 'remote', 'onsite', ''], 'several modes offered: the most flexible');
eq([tagMode('We build ships. #LI-Hybrid #LI-JS1'), tagMode('#li-remote'), tagMode('#LI-On-site'), tagMode('#LI-DNI'), tagMode('')], ['hybrid', 'remote', 'onsite', '', ''], "LinkedIn's tags, in any case; other LinkedIn tags say nothing");
eq(['Remote - Germany', 'Berlin (Hybrid)', 'Télétravail', 'Werk van thuis', 'Zdalnie', 'Home Office', 'Madrid, Spain'].map(placeMode), ['remote', 'hybrid', 'remote', 'remote', 'remote', 'remote', ''], "a location that names remote work, Indeed's words, accents or not");
eq([workModeOf({ mode: 'hybrid', description: '#LI-Remote', location: 'Remote' }), workModeOf({ description: 'x #LI-Remote' }), workModeOf({ location: 'Berlin (Hybrid)' }), workModeOf({})], ['h', 'r', 'h', ''], "the source's field first, then a tag or the location; nothing said is nothing");
eq([workModeOf({ modeTag: 'onsite', location: 'remote' }), workModeOf({ modeTag: 'hybrid', location: 'Berlin (Hybrid)' }), workModeOf({ modeTag: 'remote', location: 'Madrid, Spain' }), workModeOf({ mode: 'onsite', location: 'Remote' })], ['', 'h', 'r', 'o'], "a tag and a location that disagree say nothing for sure (a template's #LI-Onsite on a remote job); agreeing, or alone, they decide; the source's field overrules both");

// ── The mode describes an advert; it does not bring one in ──────────────
// ➤ Which remote adverts with no country join the pile stays the place reader's rule: "Remoto"
// ➤ names a remote job, often in Latin America, and does not make it European.
const cc = compileCountries(JSON.parse(readFileSync(new URL('../catalogues/countries.json', import.meta.url), 'utf8')).countries);
eq([placeMode('Remoto'), placeOf('Remoto', cc).cc, placeOf('Remote', cc).cc], ['remote', '', 'xx'], 'the mode is read, the placement is as it was');
eq(placeOf('Remote - Germany', cc).cc, 'de', 'a remote job in a named country stays in that country');

// ── Each source's own field ─────────────────────────────────────────────
const lever = ATS.lever.parse([{ id: 'a', text: 'PLC Engineer', categories: { location: 'Madrid' }, hostedUrl: 'https://jobs.lever.co/x/a', createdAt: 1756720000000, descriptionPlain: 'Intro.', lists: [], workplaceType: 'hybrid' }], 'x', 'Acme');
eq([lever[0].mode, lever[0].remote], ['hybrid', false], 'Lever: workplaceType');
const ashby = ATS.ashby.parse({ jobs: [{ id: 'z', title: 'Hardware Engineer', location: 'Berlin', jobUrl: 'https://jobs.ashbyhq.com/x/z', publishedAt: '2026-09-02T00:00:00Z', descriptionPlain: 'Plain.', isRemote: true, workplaceType: 'Hybrid' }] }, 'x', 'Acme');
eq([ashby[0].mode, ashby[0].remote], ['hybrid', false], 'Ashby: workplaceType, not isRemote (true for hybrid jobs too)');
const recruitee = ATS.recruitee.parse({ offers: [{ id: 5, title: 'Engineer', city: 'Delft', careers_url: 'https://x.recruitee.com/o/c', description: '<p>B</p>', remote: false, hybrid: true, on_site: true }, { id: 6, title: 'Engineer', city: 'Delft', careers_url: 'https://x.recruitee.com/o/d', description: '<p>B</p>', remote: false, hybrid: false, on_site: true }] });
eq(recruitee.map(r => r.mode), ['hybrid', 'onsite'], 'Recruitee: its three flags, the most flexible one ticked');
const sr = ATS.smartrecruiters.parse({ content: [{ id: '99', name: 'Engineer', location: { city: 'Bilbao', country: 'es', remote: false, hybrid: true }, company: { identifier: 'Acme1' }, releasedDate: '2026-09-01T00:00:00Z' }, { id: '98', name: 'Engineer', location: { city: 'Bilbao', country: 'es', remote: false, hybrid: false }, company: { identifier: 'Acme1' }, releasedDate: '2026-09-01T00:00:00Z' }] }, 'acme1', 'Acme');
eq(sr.map(r => r.mode), ['hybrid', ''], 'SmartRecruiters: hybrid or remote when flagged; neither flag says nothing');
const tt = ATS.teamtailor.parse(`<rss><channel><title>Acme</title>${['hybrid', 'fully', 'onsite', 'none'].map((s, i) => `<item><title>Engineer ${i}</title><link>https://acme.teamtailor.com/jobs/${i}</link><guid>${i}</guid><description>x</description><tt:remoteStatus>${s}</tt:remoteStatus></item>`).join('')}</channel></rss>`, 'acme');
eq(tt.map(r => [r.mode, r.remote]), [['hybrid', false], ['remote', true], ['onsite', false], ['', false]], 'Teamtailor: hybrid is not remote, fully is, none says nothing');
const wk = ATS.workable.parse({ name: 'Acme', jobs: [{ shortcode: 'A1', title: 'Engineer', telecommuting: true }, { shortcode: 'A2', title: 'Engineer', telecommuting: false }] }, 'acme');
eq(wk.map(r => r.mode), ['remote', ''], 'Workable: telecommuting, else nothing');
const wd = ATS.workday.parse({ jobPostings: [{ title: 'Test Engineer', externalPath: '/job/x/1', locationsText: 'Bristol', remoteType: 'Hybrid' }, { title: 'Test Engineer', externalPath: '/job/x/2', locationsText: 'Bristol', remoteType: '#LI-Onsite' }, { title: 'Test Engineer', externalPath: '/job/x/3', locationsText: 'Bristol' }] }, 'acme.wd3/External');
eq(wd.map(r => r.mode), ['hybrid', 'onsite', ''], "Workday: remoteType in the employer's own words");
const ora = ATS.oracle.parse({ items: [{ requisitionList: [{ Id: '1', Title: 'Engineer', PrimaryLocation: 'Madrid, Spain', WorkplaceTypeCode: 'ORA_HYBRID' }, { Id: '2', Title: 'Engineer', PrimaryLocation: 'Madrid, Spain', WorkplaceTypeCode: 'ORA_REMOTE' }] }] }, 'x.oraclecloud.com/CX_1');
eq(ora.map(r => [r.mode, r.remote]), [['hybrid', false], ['remote', true]], 'Oracle: WorkplaceTypeCode');
const gh = ATS.greenhouse.parse({ jobs: [{ id: 1, title: 'Engineer', location: { name: 'Rotterdam' }, absolute_url: 'https://boards.greenhouse.io/x/jobs/1', updated_at: '2026-09-01T10:00:00Z', content: `&lt;p&gt;Ships.${' Long text.'.repeat(500)} #LI-Hybrid&lt;/p&gt;` }] }, 'x', 'Acme');
eq([gh[0].mode, gh[0].modeTag, workModeOf(gh[0]), gh[0].description.includes('#LI-Hybrid')], ['', 'hybrid', 'h', false], "a tag at the end of a long advert is read before the text is cut, apart from the source's own field");
eq(jobtechRaw({ id: 1, headline: 'Ingenjör', workplace_model: { label: 'Hybridarbete' } }).mode, 'hybrid', 'JobTech: hybrid and remote are read');
eq(jobtechRaw({ id: 2, headline: 'Ingenjör', workplace_model: { label: 'Arbete på plats' } }).mode, '', 'but not its default "on site"');
const page = html => workModeOf(jobPostings(`<script type="application/ld+json">${html}</script>`, 'https://x.example/1')[0]);
eq([page('{"@type":"JobPosting","title":"A","jobLocationType":"TELECOMMUTE"}'), page('{"@type":"JobPosting","title":"A","jobLocationType":["TELECOMMUTE"]}'), page('{"@type":"JobPosting","title":"A","description":"<p>Nice #LI-Hybrid</p>"}'), page('{"@type":"JobPosting","title":"A"}')], ['r', 'r', 'h', ''], "employers' pages: TELECOMMUTE is fully remote, else a tag, else nothing");

// ── Into the record ─────────────────────────────────────────────────────
const rec = toRecord({ title: 'Mechanical Engineer', company: 'Acme', location: 'Delft, Netherlands', url: 'https://x.example/9', description: 'x', mode: 'hybrid', pay: { min: 3500, max: 4500, currency: 'EUR', period: 'month' } }, ['2144'], cc);
eq([rec.w, rec.p, rec.pa], ['h', [3500, 4500, 'EUR', 'm'], 54000], 'the record carries the letter, the pay as given and its year in euros');
const bare = toRecord({ title: 'Mechanical Engineer', company: 'Acme', location: 'Delft, Netherlands', url: 'https://x.example/10', description: 'x' }, ['2144'], cc);
eq(['w' in bare, 'p' in bare, 'pa' in bare], [false, false, false], 'and nothing when nothing is stated');
const remoteNowhere = toRecord({ title: 'Engineer', url: 'https://x.example/11', description: '', mode: 'remote' }, ['2144'], cc);
eq([remoteNowhere.cc, remoteNowhere.w], ['', 'r'], 'a remote advert with no country is described as remote, and placed by the place reader alone');

done();
