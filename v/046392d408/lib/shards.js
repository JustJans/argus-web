// ➤ Which parts of the pile a profile needs, and fetching them: one file per family and
// ➤ country the visitor named (plus the remote and the country-unknown parts), merged by
// ➤ advert id because an advert with two families appears in two files.
export function shardFiles(index, profile) {
  const families = profile.families.length ? profile.families : Object.keys(index.families || {});
  const wanted = new Set([...profile.countries, 'zz', ...(profile.remote ? ['xx'] : [])]);
  const files = [];
  for (const fam of families) {
    const countries = index.families?.[fam]?.countries || {};
    for (const [cc, entry] of Object.entries(countries)) {
      if (profile.countries.length && !wanted.has(cc)) continue;
      files.push(...(entry.files || []));
    }
  }
  return [...new Set(files)];
}

// ➤ fetchFn(url) → parsed JSON; `base` is the data folder. Answers {offers, failed}.
export async function loadShards(files, base, fetchFn, onProgress = () => {}) {
  const byId = new Map();
  const failed = [];
  let done = 0;
  const one = async file => {
    try {
      const j = await fetchFn(`${base}/${file}`);
      for (const o of j.offers || []) {
        const prev = byId.get(o.id);
        if (prev) { prev.f = [...new Set([...(prev.f || []), ...(o.f || [])])]; } else byId.set(o.id, o);
      }
    } catch (e) { failed.push(file); }
    onProgress(++done, files.length);
  };
  // ➤ Four at a time: enough to be quick, few enough for a phone.
  const queue = [...files];
  await Promise.all(Array.from({ length: 4 }, async () => { while (queue.length) await one(queue.shift()); }));
  return { offers: [...byId.values()], failed };
}
