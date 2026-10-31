// R3 replay: prove every public /verify/<number> page renders the same <main> after the switch.
//
//   KNOWSIA_APP_SERVICE_KEY=… node scripts/verify-snapshot.mjs --base https://reg.knowsia.com --out before.json
//   KNOWSIA_APP_SERVICE_KEY=… node scripts/verify-snapshot.mjs --base https://reg.knowsia.com --compare before.json
//
// Numbers come from GET <base>/api/integration/certificates/export. The page is hashed on its
// <main> element only: Next.js chunk hashes change every deploy, so the whole document never
// matches. Read-only; at most 5 pages in flight. Exit 1 on any difference.
import { readFileSync, writeFileSync } from 'node:fs';
import { badEntries, diffSnapshots, hashMain, mapLimit } from './verify-snapshot-lib.mjs';

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

const base = (arg('--base') || '').trim().replace(/\/+$/, '');
const out = arg('--out');
const compare = arg('--compare');
const key = (process.env.KNOWSIA_APP_SERVICE_KEY || '').trim();

if (!base || !key || (!out && !compare)) {
  console.error('Usage: KNOWSIA_APP_SERVICE_KEY=… node scripts/verify-snapshot.mjs --base <url> (--out <file> | --compare <file>)');
  process.exit(2);
}

async function numbers() {
  const res = await fetch(`${base}/api/integration/certificates/export`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`export answered ${res.status}`);
  const { data } = await res.json();
  return data.map((r) => r.certificateNumber);
}

async function snapshot() {
  const list = await numbers();
  const shas = await mapLimit(list, 5, async (number) => {
    try {
      const res = await fetch(`${base}/verify/${encodeURIComponent(number)}`);
      const html = await res.text();
      return res.ok ? hashMain(html) : `http-${res.status}`;
    } catch (e) {
      console.error(`fetch failed for ${number}: ${e instanceof Error ? e.message : e}`);
      return `error-${e instanceof Error ? e.message : 'fetch'}`;
    }
  });
  return Object.fromEntries(list.map((n, i) => [n, shas[i]]));
}

const current = await snapshot();
if (out) {
  const bad = badEntries(current);
  if (bad.length) {
    console.error(`Refusing to write ${out}: ${bad.length} pages have no usable <main>:`);
    for (const l of bad) console.error('BAD', l);
    process.exit(1);
  }
  writeFileSync(out, JSON.stringify(current, null, 2));
  console.log(`${Object.keys(current).length} pages hashed -> ${out}`);
}
if (compare) {
  const saved = JSON.parse(readFileSync(compare, 'utf8'));
  const lines = diffSnapshots(saved, current);
  console.log(`${Object.keys(current).length} pages compared against ${Object.keys(saved).length} saved`);
  for (const l of lines) console.log('DIFF', l);
  console.log(lines.length ? `FAIL (${lines.length} differences)` : 'PASS');
  process.exit(lines.length ? 1 : 0);
}
