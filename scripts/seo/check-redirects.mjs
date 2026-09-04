#!/usr/bin/env node
// Walk every legacy URL and prove it lands on a 200 in one redirect hop.
//
//   node scripts/seo/check-redirects.mjs --host https://knowsia.com [options]
//
//   --host <origin>      origin to test against (rewrites each URL's origin)
//   --urls <file>        one URL or path per line (default: newest inventory all-urls.txt)
//   --expect <json>      config/legacy-redirects.json — also asserts destinations
//   --max-hops <n>       hops allowed before FAIL (default 1; Doc 20 §2 says one)
//   --concurrency <n>    default 6
//   --out <csv>          failures report (default scripts/seo/inventory/<date>/redirect-check.csv)
//
// Exit code 1 on any failure. Run it (a) before the flip, against a laptop
// whose hosts file points knowsia.com at Vercel, and (b) within the hour after
// the flip, against the real host. Doc 20 §5 Phase 3.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');

function parseArgs(argv) {
  const values = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      values[key] = next;
      i += 1;
    } else values[key] = 'true';
  }
  return values;
}

function newestInventoryDir() {
  const root = path.join(repoRoot, 'scripts', 'seo', 'inventory');
  const dirs = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  return path.join(root, dirs[dirs.length - 1]);
}

const args = parseArgs(process.argv.slice(2));
if (!args.host) {
  console.error('usage: node scripts/seo/check-redirects.mjs --host https://knowsia.com [--urls file] [--expect config/legacy-redirects.json]');
  process.exit(2);
}
const origin = args.host.replace(/\/+$/, '');
const inventoryDir = newestInventoryDir();
const urlsFile = args.urls ? path.resolve(repoRoot, args.urls) : path.join(inventoryDir, 'all-urls.txt');
const maxHops = Number(args['max-hops'] ?? 1);
const concurrency = Number(args.concurrency ?? 6);
const outFile = args.out ? path.resolve(repoRoot, args.out) : path.join(inventoryDir, 'redirect-check.csv');

const expected = new Map();
if (args.expect) {
  for (const e of JSON.parse(fs.readFileSync(path.resolve(repoRoot, args.expect), 'utf8'))) {
    expected.set(e.source, e.destination);
  }
}

function toPath(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  try {
    return /^https?:\/\//i.test(trimmed) ? new URL(trimmed).pathname : trimmed;
  } catch {
    return null;
  }
}

const paths = [...new Set(fs.readFileSync(urlsFile, 'utf8').split(/\r?\n/).map(toPath).filter(Boolean))];

async function walk(startPath) {
  const chain = [];
  let url = origin + startPath;
  for (let hop = 0; hop <= maxHops + 3; hop += 1) {
    let res;
    try {
      res = await fetch(url, { method: 'GET', redirect: 'manual', headers: { 'user-agent': 'knowsia-redirect-check/1.0' } });
    } catch (err) {
      return { startPath, chain, finalStatus: 'ERR', error: String(err.message ?? err) };
    }
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) return { startPath, chain, finalStatus: res.status, error: 'redirect without Location' };
      const nextUrl = new URL(location, url).toString();
      chain.push({ status: res.status, to: nextUrl });
      url = nextUrl;
      continue;
    }
    return { startPath, chain, finalStatus: res.status, finalUrl: url };
  }
  return { startPath, chain, finalStatus: 'LOOP', error: 'too many hops' };
}

function judge(result) {
  const problems = [];
  if (result.finalStatus !== 200) problems.push(`final ${result.finalStatus}${result.error ? ` (${result.error})` : ''}`);
  if (result.chain.length > maxHops) problems.push(`${result.chain.length} hops`);
  for (const hop of result.chain) if (hop.status === 302 || hop.status === 307) problems.push(`temporary ${hop.status}`);
  const want = expected.get(result.startPath);
  if (want && result.chain.length) {
    const first = new URL(result.chain[0].to);
    const wantUrl = want.startsWith('/') ? new URL(want, origin) : new URL(want);
    if (first.host !== wantUrl.host || first.pathname.replace(/\/$/, '') !== wantUrl.pathname.replace(/\/$/, '')) {
      problems.push(`expected → ${want}, got → ${result.chain[0].to}`);
    }
  }
  return problems;
}

const results = [];
let index = 0;
async function worker() {
  while (index < paths.length) {
    const p = paths[index];
    index += 1;
    const r = await walk(p);
    r.problems = judge(r);
    results.push(r);
    if (results.length % 50 === 0) console.log(`  ${results.length}/${paths.length}`);
  }
}
await Promise.all(Array.from({ length: concurrency }, worker));

const failures = results.filter((r) => r.problems.length);
const csv = [
  'path,final_status,hops,chain,problems',
  ...results.map((r) =>
    [r.startPath, r.finalStatus, r.chain.length, r.chain.map((h) => `${h.status}→${h.to}`).join(' | '), r.problems.join('; ')]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(','),
  ),
].join('\n');
fs.writeFileSync(outFile, `${csv}\n`);

console.log('');
console.log(`checked  : ${results.length} paths against ${origin}`);
console.log(`ok       : ${results.length - failures.length}`);
console.log(`failures : ${failures.length}  →  ${path.relative(repoRoot, outFile)}`);
for (const f of failures.slice(0, 40)) console.log(`  ${f.startPath}  —  ${f.problems.join('; ')}`);
if (failures.length > 40) console.log(`  … ${failures.length - 40} more in the CSV`);
process.exit(failures.length ? 1 : 0);
