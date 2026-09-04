// Maps every WordPress-era knowsia.com path to its successor (Coding Docs/20 §4).
//
// Pure functions, no I/O: build-legacy-redirects.mjs feeds it the sitemap
// inventory and writes config/legacy-redirects.json; tests/unit/legacy-url-map.test.ts
// pins the rules. Keep the rules here and nowhere else — the point of the
// generator is that the map is reproducible from the inventory, not typed.
//
// Principles the rules must respect (Doc 20 §2):
//   - closest equivalent, never the home page "for now";
//   - a destination must exist before its source is emitted — hence the
//     `options` switches for work that is not finished yet (blog import,
//     question pages, media re-hosting);
//   - one hop: destinations are final URLs, never other legacy paths.

/** @typedef {'post'|'page'|'product'|'product_cat'|'category'|'sfwd-courses'|'sfwd-lessons'|'sfwd-topic'|'sfwd-quiz'|'ld-exam'|'ld_course_category'|'ld_course_tag'|'unknown'} LegacyType */

/**
 * @typedef {object} MapOptions
 * @property {string} studyUrl        absolute origin of KnowsiaApp, e.g. https://app.knowsia.com
 * @property {boolean} blogImported   posts live at /news/article/{slug}; false → /news
 * @property {boolean} questionPagesLive  public question pages exist on studyUrl
 * @property {boolean} mediaHosted    /legacy-media/* serves the old uploads
 * @property {Record<string,string>} [courseMap]   LearnDash course slug → studyUrl path (e.g. "/courses/<id>")
 * @property {Record<string,string>} [questionMap] question slug → studyUrl path (from the M8 export)
 */

/** Trailing slash off, query and hash off, lower-cased, always leading slash. */
export function normalisePath(input) {
  let path = String(input ?? '');
  try {
    if (/^https?:\/\//i.test(path)) path = new URL(path).pathname;
  } catch {
    /* keep raw */
  }
  path = path.split('?')[0].split('#')[0];
  if (!path.startsWith('/')) path = `/${path}`;
  if (path.length > 1) path = path.replace(/\/+$/, '');
  return path.toLowerCase();
}

/** Sitemap file name → the content type it lists. */
export function typeFromSitemapName(fileName) {
  const name = String(fileName).toLowerCase();
  const table = [
    ['post-sitemap', 'post'],
    ['page-sitemap', 'page'],
    ['product_cat-sitemap', 'product_cat'],
    ['product-sitemap', 'product'],
    ['category-sitemap', 'category'],
    ['sfwd-courses-sitemap', 'sfwd-courses'],
    ['sfwd-lessons-sitemap', 'sfwd-lessons'],
    ['sfwd-topic-sitemap', 'sfwd-topic'],
    ['sfwd-quiz-sitemap', 'sfwd-quiz'],
    ['ld-exam-sitemap', 'ld-exam'],
    ['ld_course_category-sitemap', 'ld_course_category'],
    ['ld_course_tag-sitemap', 'ld_course_tag'],
  ];
  for (const [prefix, type] of table) if (name.startsWith(prefix)) return type;
  return 'unknown';
}

// Hand-mapped WordPress pages (page-sitemap.xml, 49 URLs on 2026-09-04).
// Anything not listed falls to PAGE_FALLBACK below and is reported, so an
// unmapped page is a visible decision, not a silent redirect to home.
const PAGE_MAP = {
  '/': null, // the home page maps to itself; emitted by nobody
  '/home': '/',
  '/live-programmes': '/programmes',
  '/training': '/programmes',
  '/icag-live-tuition': '/programmes',
  '/free-icag-tuition': '/programmes',
  '/webinars-and-cpds': '/programmes',
  '/register': '/register',
  '/verify': '/verify',
  '/about': '/about',
  '/contact-2': '/contact',
  // Verified 2026-09-04: the WordPress testimonials page is untouched theme
  // placeholder text ("Amanda Lee, CEO & Founder Crix", lorem ipsum). Nothing
  // to carry over; the home page has the real ones.
  '/testimonials': '/',
  '/privacy-policy': '/privacy-policy',
  // Verified 2026-09-04: "/terms-and-conditions" holds an affiliate-programme
  // template ("NBC Institute", US-resident affiliates, US law), not terms for
  // registrants. Its only real subject is the affiliate scheme, which the
  // partner programme replaces (Doc 20 §7 decision 5).
  '/terms-and-conditions': '/partners/apply',
  '/affiliate': '/partners/apply',
  '/affiliate-registration': '/partners/apply',
  '/affiliate-account': '/partner-portal',
  '/affiliate-reset-password': '/partner-portal/change-pin',
  '/become-a-tutor': '/tutor-portal',
  '/become-a-tutor/professional-tutor-application-form': '/tutor-portal',
  '/become-a-tutor/academic-tutor-application-form': '/tutor-portal',
  '/become-a-tutor/student-tutor-application-form': '/tutor-portal',
  '/instructor-dashboard': '/tutor-portal',
  '/shop': '/programmes',
  '/cart2': '/programmes',
  '/checkout2': '/programmes',
  '/payment-options': '/programmes',
  '/discounts': '/programmes',
  '/my-account-2': '/portal',
  '/qr-code': '/',
  '/jump-to': '/',
  '/excel-templates': '/news',
  '/community': '/partners/apply',
  '/community/members': '/partners/apply',
  '/community/groups': '/partners/apply',
  '/community/feed-2': '/partners/apply',
  // Live-programme marketing pages → the matching programme where one exists.
  '/esg-sustainability-reporting-training': '/programmes/ESG1',
  '/global-internal-audit-standards': '/programmes',
  '/future-ready-skills': '/programmes',
};

// Pages whose successor lives on the study platform.
const PAGE_TO_STUDY = {
  '/qb': '/questions',
  '/sq': '/questions',
  '/cs': '/questions',
  '/question-bank-pricing': '/pricing',
  '/knowsia-ai': '/',
  '/courses': '/catalogue',
  '/student-dashboard': '/login',
  '/account-access': '/login',
  '/activate': '/login',
  '/join': '/register',
};

const PAGE_FALLBACK = '/';

/**
 * Map one legacy path. Returns { destination, rule } or null when the path
 * must not be redirected (the home page, or a destination that does not
 * exist yet under the given options).
 *
 * @param {string} rawPath
 * @param {LegacyType} type
 * @param {MapOptions} options
 */
export function mapLegacyPath(rawPath, type, options) {
  const path = normalisePath(rawPath);
  const study = String(options.studyUrl ?? 'https://app.knowsia.com').replace(/\/+$/, '');
  const slug = path.split('/').filter(Boolean).pop() ?? '';

  if (path === '/') return null;

  switch (type) {
    case 'post':
      if (path === '/blog') return { destination: '/news', rule: 'blog-index' };
      return options.blogImported
        ? { destination: `/news/article/${slug}`, rule: 'post-imported' }
        : { destination: '/news', rule: 'post-not-yet-imported' };

    case 'category':
      return { destination: '/news', rule: 'blog-category' };

    case 'page': {
      if (path in PAGE_TO_STUDY) {
        const target = PAGE_TO_STUDY[path];
        if (target === '/questions' && !options.questionPagesLive) {
          return { destination: `${study}/catalogue`, rule: 'page-study-questions-pending' };
        }
        return { destination: `${study}${target}`, rule: 'page-study' };
      }
      if (path in PAGE_MAP) {
        const target = PAGE_MAP[path];
        return target ? { destination: target, rule: 'page-mapped' } : null;
      }
      return { destination: PAGE_FALLBACK, rule: 'page-UNMAPPED' };
    }

    case 'sfwd-courses': {
      if (path === '/courses') return { destination: `${study}/catalogue`, rule: 'course-index' };
      const mapped = options.courseMap?.[slug];
      return mapped
        ? { destination: `${study}${mapped}`, rule: 'course-mapped' }
        : { destination: `${study}/catalogue`, rule: 'course-unmapped' };
    }

    case 'sfwd-lessons':
    case 'sfwd-topic':
    case 'sfwd-quiz':
    case 'ld-exam':
    case 'ld_course_category':
    case 'ld_course_tag':
      return { destination: `${study}/catalogue`, rule: 'learndash-internal' };

    case 'product':
    case 'product_cat':
      return { destination: '/programmes', rule: 'commerce' };

    default:
      return { destination: PAGE_FALLBACK, rule: 'UNKNOWN-TYPE' };
  }
}

/**
 * Pattern rules that cover whole families the sitemaps never listed. Emitted
 * AFTER every explicit entry so a slug-specific redirect always wins.
 *
 * @param {MapOptions} options
 */
export function patternRules(options) {
  const study = String(options.studyUrl ?? 'https://app.knowsia.com').replace(/\/+$/, '');
  const rules = [];

  if (options.questionPagesLive) {
    // Question-bank families. Individual questions come from questionMap
    // (M8 export); these catch the taxonomies and anything the export missed.
    rules.push({ source: '/question/:slug', destination: `${study}/questions`, rule: 'pattern-question-fallback' });
    rules.push({ source: '/topic/:slug', destination: `${study}/questions`, rule: 'pattern-topic' });
    rules.push({ source: '/question-tag/:slug', destination: `${study}/questions`, rule: 'pattern-question-tag' });
    rules.push({ source: '/tag-sq/:slug', destination: `${study}/questions`, rule: 'pattern-tag-sq' });
  }

  if (options.mediaHosted) {
    rules.push({ source: '/wp-content/uploads/:path*', destination: '/legacy-media/:path*', rule: 'pattern-media' });
  }

  // LearnDash internals that the sitemaps paginate or omit.
  rules.push({ source: '/lessons/:slug', destination: `${study}/catalogue`, rule: 'pattern-lessons' });
  rules.push({ source: '/topics/:slug', destination: `${study}/catalogue`, rule: 'pattern-ld-topics' });
  rules.push({ source: '/quizzes/:slug', destination: `${study}/catalogue`, rule: 'pattern-quizzes' });
  rules.push({ source: '/course-category/:slug', destination: `${study}/catalogue`, rule: 'pattern-course-category' });
  rules.push({ source: '/zoom-meetings/:slug', destination: '/programmes', rule: 'pattern-zoom-meetings' });
  rules.push({ source: '/product/:slug', destination: '/programmes', rule: 'pattern-product' });
  rules.push({ source: '/product-category/:slug', destination: '/programmes', rule: 'pattern-product-category' });
  rules.push({ source: '/category/:slug', destination: '/news', rule: 'pattern-blog-category' });

  return rules;
}

/**
 * Explicit question-slug rules from the M8 export: slug → study path.
 * @param {MapOptions} options
 */
export function questionRules(options) {
  if (!options.questionPagesLive || !options.questionMap) return [];
  const study = String(options.studyUrl ?? 'https://app.knowsia.com').replace(/\/+$/, '');
  return Object.entries(options.questionMap).map(([slug, target]) => ({
    source: `/question/${slug}`,
    destination: `${study}${target}`,
    rule: 'question-mapped',
  }));
}

// Next.js path-to-regexp sources treat these as syntax; a WordPress slug
// containing one cannot be expressed as a literal source.
const UNSAFE_SOURCE = /[():*?+[\]{}]/;

export function isSafeSource(path) {
  return path.startsWith('/') && !UNSAFE_SOURCE.test(path) && !/\s/.test(path);
}
