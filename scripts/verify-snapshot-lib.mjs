// Pure helpers for verify-snapshot.mjs (R3 replay). No dependencies.
import { createHash } from 'node:crypto';

/** The first <main …>…</main> element of an HTML document, or null. */
export function extractMain(html) {
  const m = /<main\b[^>]*>[\s\S]*?<\/main>/i.exec(html);
  return m ? m[0] : null;
}

/** sha256 hex of the page's <main> element; null when the page has none. */
export function hashMain(html) {
  const main = extractMain(html);
  return main === null ? null : createHash('sha256').update(main, 'utf8').digest('hex');
}

/** Differences between two {number: sha} maps, one line each. */
export function diffSnapshots(before, after) {
  const lines = [];
  for (const number of Object.keys(before).sort()) {
    if (!(number in after)) lines.push(`${number}: missing in the new snapshot`);
    else if (before[number] !== after[number]) lines.push(`${number}: <main> differs`);
  }
  for (const number of Object.keys(after).sort()) {
    if (!(number in before)) lines.push(`${number}: not in the saved snapshot`);
  }
  return lines;
}

/** Run `fn` over `items`, at most `limit` at a time; results keep the input order. */
export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
