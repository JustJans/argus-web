// ➤ robots.txt as RFC 9309 has it, read once a pass per host: what an answer, no file and
// ➤ silence each mean. The network is a stand-in: each host answers what the test says.
import { harness } from 'argus/server-bot/test-harness.mjs';
import { robotsOf } from '../builder/robots.mjs';

const { eq, done } = harness('robots');
const answers = {
  'https://open.example/robots.txt': () => new Response('User-agent: *\nDisallow: /private/\n', { status: 200 }),
  'https://none.example/robots.txt': () => new Response('Not Found', { status: 404 }),
  'https://down.example/robots.txt': () => new Response('Unavailable', { status: 503 }),
};
const asked = [];
globalThis.fetch = async url => { asked.push(url); return (answers[url] || (() => new Response('', { status: 404 })))(); };

const robots = robotsOf({ gapMs: 0, timeoutMs: 2000 });
eq([await robots.may('https://open.example/jobs/1'), await robots.may('https://open.example/private/x')], [true, false], 'a robots.txt that answers is obeyed');
eq(asked.filter(u => u === 'https://open.example/robots.txt').length, 1, 'and read once for the whole pass');
eq(await robots.may('https://none.example/anything'), true, 'no robots.txt (a 4xx): everything may be read');
eq(await robots.may('https://down.example/jobs/1'), false, 'a robots.txt that does not answer (a 5xx): nothing may be read');
let silent = '';
try { await robots.rules('https://down.example/'); } catch (e) { silent = e.message; }
eq(/did not answer/.test(silent), true, "and asking for that host's rules says so, so the site waits for its next pass");

done();
