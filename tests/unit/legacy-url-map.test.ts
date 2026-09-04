import { describe, expect, it } from 'vitest';

import {
  isSafeSource,
  mapLegacyPath,
  normalisePath,
  patternRules,
  questionRules,
  typeFromSitemapName,
  type MapOptions,
} from '@/scripts/seo/legacy-url-map.mjs';

const BASE: MapOptions = {
  studyUrl: 'https://app.knowsia.com',
  blogImported: false,
  questionPagesLive: false,
  mediaHosted: false,
};

describe('normalisePath', () => {
  it('strips origin, query, hash and the trailing slash WordPress always adds', () => {
    expect(normalisePath('https://knowsia.com/about/?utm=x#top')).toBe('/about');
    expect(normalisePath('/Blog/')).toBe('/blog');
    expect(normalisePath('https://knowsia.com/')).toBe('/');
  });
});

describe('typeFromSitemapName', () => {
  it('recognises every Rank Math sitemap in the inventory', () => {
    expect(typeFromSitemapName('post-sitemap.xml')).toBe('post');
    expect(typeFromSitemapName('product-sitemap.xml')).toBe('product');
    expect(typeFromSitemapName('product_cat-sitemap.xml')).toBe('product_cat');
    expect(typeFromSitemapName('sfwd-lessons-sitemap2.xml')).toBe('sfwd-lessons');
    expect(typeFromSitemapName('ld_course_tag-sitemap.xml')).toBe('ld_course_tag');
    expect(typeFromSitemapName('mystery.xml')).toBe('unknown');
  });
});

describe('mapLegacyPath', () => {
  it('never redirects the home page', () => {
    expect(mapLegacyPath('https://knowsia.com/', 'page', BASE)).toBeNull();
  });

  it('sends blog posts to /news until they are imported, then to their own article', () => {
    expect(mapLegacyPath('/study-habits-matter-for-ca-success/', 'post', BASE)).toEqual({
      destination: '/news',
      rule: 'post-not-yet-imported',
    });
    expect(mapLegacyPath('/study-habits-matter-for-ca-success/', 'post', { ...BASE, blogImported: true })).toEqual({
      destination: '/news/article/study-habits-matter-for-ca-success',
      rule: 'post-imported',
    });
    expect(mapLegacyPath('/blog/', 'post', BASE)?.destination).toBe('/news');
  });

  it('maps known pages to their successor, not to the home page', () => {
    expect(mapLegacyPath('/live-programmes/', 'page', BASE)?.destination).toBe('/programmes');
    expect(mapLegacyPath('/affiliate/', 'page', BASE)?.destination).toBe('/partners/apply');
    expect(mapLegacyPath('/contact-2/', 'page', BASE)?.destination).toBe('/contact');
    expect(mapLegacyPath('/esg-sustainability-reporting-training/', 'page', BASE)?.destination).toBe('/programmes/ESG1');
    // Placeholder / template pages verified on 2026-09-04 go to the nearest real thing, not to a page that would have to be invented.
    expect(mapLegacyPath('/testimonials/', 'page', BASE)?.destination).toBe('/');
    expect(mapLegacyPath('/terms-and-conditions/', 'page', BASE)?.destination).toBe('/partners/apply');
  });

  it('flags an unmapped page loudly instead of silently sending it home', () => {
    expect(mapLegacyPath('/some-page-nobody-listed/', 'page', BASE)).toEqual({
      destination: '/',
      rule: 'page-UNMAPPED',
    });
  });

  it('routes question-bank pages to the study platform only once its public pages exist', () => {
    expect(mapLegacyPath('/qb/', 'page', BASE)).toEqual({
      destination: 'https://app.knowsia.com/catalogue',
      rule: 'page-study-questions-pending',
    });
    expect(mapLegacyPath('/qb/', 'page', { ...BASE, questionPagesLive: true })).toEqual({
      destination: 'https://app.knowsia.com/questions',
      rule: 'page-study',
    });
    expect(mapLegacyPath('/question-bank-pricing/', 'page', BASE)?.destination).toBe('https://app.knowsia.com/pricing');
  });

  it('maps LearnDash courses individually when a course map is supplied, else to the catalogue', () => {
    expect(mapLegacyPath('/courses/2-1-financial-reporting/', 'sfwd-courses', BASE)).toEqual({
      destination: 'https://app.knowsia.com/catalogue',
      rule: 'course-unmapped',
    });
    expect(
      mapLegacyPath('/courses/2-1-financial-reporting/', 'sfwd-courses', {
        ...BASE,
        courseMap: { '2-1-financial-reporting': '/courses/abc-123' },
      }),
    ).toEqual({ destination: 'https://app.knowsia.com/courses/abc-123', rule: 'course-mapped' });
    expect(mapLegacyPath('/courses/', 'sfwd-courses', BASE)?.rule).toBe('course-index');
  });

  it('sends LearnDash internals to the catalogue and commerce to /programmes', () => {
    expect(mapLegacyPath('/lessons/lesson-231/', 'sfwd-lessons', BASE)?.destination).toBe('https://app.knowsia.com/catalogue');
    expect(mapLegacyPath('/quizzes/quiz-29/', 'sfwd-quiz', BASE)?.destination).toBe('https://app.knowsia.com/catalogue');
    expect(mapLegacyPath('/product/x/', 'product', BASE)?.destination).toBe('/programmes');
    expect(mapLegacyPath('/category/icag/', 'category', BASE)?.destination).toBe('/news');
  });

  it('respects a custom study origin without a trailing slash problem', () => {
    expect(mapLegacyPath('/courses/', 'sfwd-courses', { ...BASE, studyUrl: 'https://study.example.com/' })?.destination).toBe(
      'https://study.example.com/catalogue',
    );
  });
});

describe('patternRules / questionRules', () => {
  it('holds back the question-bank patterns until the pages exist, and media until it is hosted', () => {
    const before = patternRules(BASE).map((r) => r.source);
    expect(before).not.toContain('/question/:slug');
    expect(before).not.toContain('/wp-content/uploads/:path*');
    expect(before).toContain('/lessons/:slug');

    const after = patternRules({ ...BASE, questionPagesLive: true, mediaHosted: true }).map((r) => r.source);
    expect(after).toContain('/question/:slug');
    expect(after).toContain('/topic/:slug');
    expect(after).toContain('/wp-content/uploads/:path*');
  });

  it('emits explicit question redirects from the M8 export', () => {
    expect(questionRules(BASE)).toEqual([]);
    expect(
      questionRules({
        ...BASE,
        questionPagesLive: true,
        questionMap: { 'at-nov-2016-l3-q5d-international-taxation': '/questions/q-1' },
      }),
    ).toEqual([
      {
        source: '/question/at-nov-2016-l3-q5d-international-taxation',
        destination: 'https://app.knowsia.com/questions/q-1',
        rule: 'question-mapped',
      },
    ]);
  });
});

describe('isSafeSource', () => {
  it('refuses paths that path-to-regexp would misread', () => {
    expect(isSafeSource('/about')).toBe(true);
    expect(isSafeSource('/weird(page)')).toBe(false);
    expect(isSafeSource('/has space')).toBe(false);
    expect(isSafeSource('relative')).toBe(false);
  });
});
