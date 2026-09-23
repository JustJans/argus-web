// ➤ One-off repair. Until September 2026 a vacancy page that did not answer (a timeout, a
// ➤ server error, "too many requests") was kept as a page without a JobPosting and never read
// ➤ again. On sites that do publish the block, about one such page in eleven has it when read
// ➤ now (docs/research/faster-runs.md). This marks those pages as having failed once, so the
// ➤ crawler's next passes read them again, newest first and within each site's page budget.
// ➤ Barren sites are left alone: read again, their pages still had no block.
// ➤ Run it while the crawler is not writing:
// ➤   flock builder/state/crawl.lock node builder/tools/reread-empty-pages.mjs [--dry]
import { eachSource, saveSource } from '../store.mjs';

const DRY = process.argv.includes('--dry');
let sites = 0, marked = 0;
for (const data of eachSource(['careers'])) {
  const pages = Object.values(data.pages || {});
  if (!pages.some(p => p.job)) continue;
  // ➤ A page followed from a list is read again only while the list names it, so only the
  // ➤ pages the sitemap lists are marked.
  const empty = pages.filter(p => !p.job && !p.failed && !p.from);
  if (!empty.length) continue;
  for (const p of empty) p.failed = 1;
  sites++; marked += empty.length;
  if (!DRY) saveSource(data);
}
console.log(`${DRY ? 'would mark' : 'marked'} ${marked} pages without a JobPosting on ${sites} sites that publish it, to be read again`);
