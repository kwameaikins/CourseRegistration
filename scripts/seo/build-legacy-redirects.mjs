#!/usr/bin/env node
// Generate config/legacy-redirects.json from the WordPress sitemap inventory.
//
//   node scripts/seo/build-legacy-redirects.mjs [options]
//
//   --inventory <dir>     scripts/seo/inventory/<date> (default: newest)
//   --study-url <origin>  KnowsiaApp origin (default https://app.knowsia.com)
//   --blog-imported       posts have been imported into /news/article/{slug}
//   --question-pages-live public question pages exist on the study platform
//   --media-hosted        /legacy-media/* serves the old wp-content/uploads
//   --courses <json>      { "<learndash slug>": "/courses/<id>" }
//   --questions <json>    { "<question slug>": "/questions/<id>" }   (M8 export)
//   --out <file>          default config/legacy-redirects.json
//
// The map is reproducible: same inventory + same flags = same file. Commit the
// output; the report it prints is the review checklist (Doc 20 §4). Every
// "UNMAPPED" line in that report is a decision someone still has to make.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  isSafeSource,
  mapLegacyPath,
  normalisePath,
  patternRules,
  questionRules,
  typeFromSitemapName,
} from './legacy-url-map.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');

function parseArgs(argv) {
  const args = { flags: new Set(), values: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      args.values[key] = next;
      i += 1;
    } else {
      args.flags.add(key);
    }
  }
  return args;
}

function newestInventoryDir() {
  const root = path.join(repoRoot, 'scripts', 'seo', 'inventory');
  const dirs = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  if (dirs.length === 0) throw new Error(`no inventory directories under ${root}`);
  return path.join(root, dirs[dirs.length - 1]);
}

function readJsonMap(file) {
  if (!file) return undefined;
  return JSON.parse(fs.readFileSync(path.resolve(repoRoot, file), 'utf8'));
}

function locsFromSitemap(xml) {
  // <loc> at the URL level only; image:loc is a different tag.
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
}

const args = parseArgs(process.argv.slice(2));
const inventoryDir = args.values.inventory
  ? path.resolve(repoRoot, args.values.inventory)
  : newestInventoryDir();
const options = {
  studyUrl: args.values['study-url'] ?? 'https://app.knowsia.com',
  blogImported: args.flags.has('blog-imported'),
  questionPagesLive: args.flags.has('question-pages-live'),
  mediaHosted: args.flags.has('media-hosted'),
  courseMap: readJsonMap(args.values.courses),
  questionMap: readJsonMap(args.values.questions),
};
const outFile = path.resolve(repoRoot, args.values.out ?? 'config/legacy-redirects.json');

const entries = new Map(); // source → { destination, rule }
const report = new Map(); // rule → count
const skipped = [];

function add(source, destination, rule, { pattern = false } = {}) {
  // Inventory paths must be literal; pattern rules are authored with
  // path-to-regexp syntax on purpose (":slug", ":path*") and skip the check.
  if (!pattern && !isSafeSource(source)) {
    skipped.push(`${source} (unsafe characters for a Next.js source)`);
    return;
  }
  if (source === destination) return;
  if (entries.has(source)) return; // first writer wins: explicit before pattern
  entries.set(source, { destination, rule });
  report.set(rule, (report.get(rule) ?? 0) + 1);
}

const sitemapFiles = fs
  .readdirSync(inventoryDir)
  .filter((name) => /-sitemap\d*\.xml$/i.test(name))
  .sort();

for (const file of sitemapFiles) {
  const type = typeFromSitemapName(file);
  const xml = fs.readFileSync(path.join(inventoryDir, file), 'utf8');
  for (const loc of locsFromSitemap(xml)) {
    let hostOk = false;
    try {
      hostOk = /(^|\.)knowsia\.com$/i.test(new URL(loc).hostname);
    } catch {
      hostOk = false;
    }
    if (!hostOk) {
      skipped.push(`${loc} (not a knowsia.com URL)`);
      continue;
    }
    const source = normalisePath(loc);
    const mapped = mapLegacyPath(source, type, options);
    if (!mapped) continue;
    add(source, mapped.destination, mapped.rule);
  }
}

for (const rule of questionRules(options)) add(rule.source, rule.destination, rule.rule);
for (const rule of patternRules(options)) add(rule.source, rule.destination, rule.rule, { pattern: true });

const output = [...entries.entries()]
  .map(([source, { destination, rule }]) => ({ source, destination, rule }))
  .sort((a, b) => a.source.localeCompare(b.source));

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, `${JSON.stringify(output, null, 2)}\n`);

const unmapped = output.filter((e) => /UNMAPPED|UNKNOWN/.test(e.rule));
console.log(`inventory : ${path.relative(repoRoot, inventoryDir)}`);
console.log(`sitemaps  : ${sitemapFiles.length}`);
console.log(`options   : ${JSON.stringify({ ...options, courseMap: options.courseMap ? Object.keys(options.courseMap).length : 0, questionMap: options.questionMap ? Object.keys(options.questionMap).length : 0 })}`);
console.log(`redirects : ${output.length}  →  ${path.relative(repoRoot, outFile)}`);
console.log('');
console.log('by rule:');
for (const [rule, count] of [...report.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(count).padStart(5)}  ${rule}`);
}
if (unmapped.length) {
  console.log('');
  console.log(`DECISIONS NEEDED (${unmapped.length}) — these currently go to the home page:`);
  for (const e of unmapped) console.log(`  ${e.source}`);
}
if (skipped.length) {
  console.log('');
  console.log(`skipped (${skipped.length}):`);
  for (const s of skipped) console.log(`  ${s}`);
}
if (output.length > 2000) {
  console.log('');
  console.log('WARNING: Vercel caps redirects at 2,048 per deployment. Move the long tail to middleware.');
}
