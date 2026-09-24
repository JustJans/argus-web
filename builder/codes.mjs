// ➤ The classification tables the gate reads, from catalogues/codes: ESCO's job titles per ISCO-08
// ➤ unit group (isco.json), JobTech's SSYK→ISCO-08 correspondence (ssyk-isco.json) and the titles
// ➤ of the official coding indexes (titles.json). One loader, so every tool reads the same gate.
import { readFileSync } from 'fs';
import { join } from 'path';

export function readCodes(root) {
  const read = name => JSON.parse(readFileSync(join(root, 'catalogues', 'codes', name), 'utf8'));
  return { isco: read('isco.json'), ssyk: read('ssyk-isco.json'), titles: read('titles.json') };
}
