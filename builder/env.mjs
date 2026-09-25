// ➤ The keys this project needs (Azure's translator for the titles, the intermediaries' partner
// ➤ programmes for their adverts): builder/.env, one KEY=VALUE per line, never in git
// ➤ (builder/.env.example lists them). The environment itself wins when it already has a key.
// ➤ Imported for its effect by whatever needs a key: the crawler and the pile builder.
import { existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const file = join(dirname(fileURLToPath(import.meta.url)), '.env');
if (existsSync(file)) {
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
