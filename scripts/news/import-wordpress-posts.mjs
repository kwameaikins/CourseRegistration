// Import the knowsia.com WordPress blog into News (founder, 2026-09-29: "the
// 103 posts get their own pages in the Registration app's News section").
//
// Each post becomes ONE published_articles row with content_type 'Blog', at
// its ORIGINAL slug — so the WordPress URL knowsia.com/<slug>/ forwards to
// /news/article/<slug> in one hop (build-legacy-redirects --blog-imported) and
// keeps what it has earned in search. The post's own words, unrewritten, are
// in sections.body as Markdown; the article page renders it. Nothing is
// generated.
//
// Input: the export pass's files, with images already moved off the old
// server to the Knowsia CDN (KnowsiaApp scripts/host_blog_images.py):
//   E:\WordPress Exports\_blog\hosted\<slug>.md   (JSON-valued front matter)
//
// Idempotent: upsert on slug. A slug already held by a news-pipeline article
// is REPORTED and left alone, never overwritten.
//
//   vercel env run -e production -- node scripts/news/import-wordpress-posts.mjs            # dry run
//   vercel env run -e production -- node scripts/news/import-wordpress-posts.mjs --apply
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const DIR = process.env.BLOG_DIR || 'E:\\WordPress Exports\\_blog\\hosted';
const APPLY = process.argv.includes('--apply');

// WordPress's categories → the News section's seven. The WordPress name is
// kept as a subcategory, so nothing about the post's filing is lost.
const CATEGORY = {
  'Excel Automation for Accountants': 'Technology & AI',
  'Excel for Business Professionals': 'Technology & AI',
  'Exams Preparation': 'Careers, Education & CPD',
  'Exams Preparations': 'Careers, Education & CPD',
  General: 'Careers, Education & CPD',
  Free: 'Careers, Education & CPD',
};
const ENTITIES = { '&amp;': '&', '&#8217;': '’', '&#8216;': '‘', '&#8220;': '“', '&#8221;': '”', '&#8211;': '–', '&#8212;': '—', '&nbsp;': ' ' };
const decode = (t) => (t || '').replace(/&amp;|&#82\d\d;|&nbsp;/g, (m) => ENTITIES[m] ?? m);

function parse(file) {
  const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`no front matter: ${file}`);
  const fm = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(': ');
    if (i > 0) {
      const raw = line.slice(i + 2);
      try { fm[line.slice(0, i)] = JSON.parse(raw); } catch { fm[line.slice(0, i)] = raw; }
    }
  }
  return { fm, body: m[2].trim() };
}

function plain(md) {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#*_>`|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function summaryOf(fm, body) {
  const given = decode(fm.excerpt || fm.seo_description || '').trim();
  if (given) return given;
  const firstPara = body.split(/\n\s*\n/).map(plain).find((p) => p.length > 60) || plain(body);
  if (firstPara.length <= 300) return firstPara;
  const cut = firstPara.slice(0, 300);
  const end = cut.lastIndexOf('. ');
  return end > 120 ? cut.slice(0, end + 1) : `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}

const files = readdirSync(DIR).filter((f) => f.endsWith('.md'));
const posts = files.map((f) => parse(path.join(DIR, f)));
const slugs = new Set(posts.map((p) => p.fm.slug));
// A link from one post to another points at the new page, not at WordPress.
const internal = /https?:\/\/(?:www\.)?knowsia\.com\/([a-z0-9-]+)\/?(?=[)\s"#?]|$)/gi;

const rows = posts.map(({ fm, body }) => {
  const cats = [...new Set(fm.categories.map(decode))];
  const category = CATEGORY[cats.find((c) => CATEGORY[c])] || 'Careers, Education & CPD';
  const md = body.replace(internal, (whole, slug) => (slugs.has(slug) ? `/news/article/${slug}` : whole));
  return {
    slug: fm.slug,
    headline: decode(fm.title),
    summary: summaryOf(fm, md),
    sections: { body: md },
    category,
    subcategories: cats.map((c) => (c === 'Exams Preparations' ? 'Exams Preparation' : c)),
    content_type: 'Blog',
    transparency_labels: [],
    source_urls: [],
    seo_title: decode(fm.seo_title) || null,
    seo_description: decode(fm.seo_description) || null,
    image_url: fm.featured_image || null,
    published_at: `${fm.published.replace(' ', 'T')}Z`,
    updated_at: `${(fm.modified || fm.published).replace(' ', 'T')}Z`,
  };
});

const leftOnOldServer = rows.filter((r) => /knowsia\.com\/wp-content\//.test(r.sections.body + (r.image_url || ''))).length;
console.log(`posts: ${rows.length} | categories:`, Object.fromEntries(
  Object.entries(rows.reduce((a, r) => ({ ...a, [r.category]: (a[r.category] || 0) + 1 }), {})),
));
console.log(`still linking an image on the old server: ${leftOnOldServer}`);

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL.trim(), process.env.SUPABASE_SERVICE_ROLE_KEY.trim(), {
  auth: { persistSession: false },
});
const { data: existing, error } = await db
  .from('published_articles')
  .select('slug, content_type')
  .in('slug', rows.map((r) => r.slug));
if (error) throw error;
const taken = new Set(existing.filter((e) => e.content_type !== 'Blog').map((e) => e.slug));
const toWrite = rows.filter((r) => !taken.has(r.slug));
console.log(`already a news story at the same slug (left alone): ${taken.size}${taken.size ? ' → ' + [...taken].join(', ') : ''}`);
console.log(`to write: ${toWrite.length} (${existing.length - taken.size} already imported, will be refreshed)`);
if (!APPLY) {
  console.log('(dry run — pass --apply)');
  process.exit(0);
}
for (let i = 0; i < toWrite.length; i += 20) {
  const { error: upErr } = await db.from('published_articles').upsert(toWrite.slice(i, i + 20), { onConflict: 'slug' });
  if (upErr) throw upErr;
}
console.log(`written: ${toWrite.length}`);
