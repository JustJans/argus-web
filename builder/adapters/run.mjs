// ➤ Runs one adapter in a process of its own and hands its adverts to the builder one JSON
// ➤ line at a time on stdout (the log goes to stderr). The heavy readers, thousands of
// ➤ company boards and careers sites, live here, so a crash of the runtime under that load
// ➤ (seen on Windows as a native fast-fail, with nothing printed) ends the reader, not the
// ➤ build: the builder keeps what arrived and starts the reader once more.
// ➤   node builder/adapters/run.mjs boards | careers
import { once } from 'events';
import { ATS, loadCompanies } from './boards.mjs';
import * as boards from './boards.mjs';
import * as careers from './careers.mjs';

const which = { boards, careers }[process.argv[2]];
if (!which) { console.error('usage: node builder/adapters/run.mjs boards|careers'); process.exit(2); }
const ctx = {
  companies: loadCompanies(), ATS,
  log: line => console.error(line),
  fail: (who, why) => console.error(`FAILED ${who}: ${why}`),
};
let n = 0;
for await (const raw of which.fetchAll(ctx)) {
  // ➤ The builder's pace is the reader's: when the pipe is full, wait for it to drain.
  if (!process.stdout.write(JSON.stringify(raw) + '\n')) await once(process.stdout, 'drain');
  n++;
}
console.error(`${process.argv[2]}: ${n} adverts handed over`);
// ➤ Exit once stdout is flushed: a read abandoned at its deadline must not keep the process alive.
process.stdout.write('\n', () => process.exit(0));
