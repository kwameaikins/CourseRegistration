import { describe, expect, it } from 'vitest';

import { buildHostRedirects, buildMovedPageRedirects, sanitizeHost, toNextRedirects } from '@/config/host-redirects.mjs';

describe('sanitizeHost', () => {
  it('accepts a bare host and lower-cases it', () => {
    expect(sanitizeHost('Knowsia.com')).toBe('knowsia.com');
  });

  it('strips whitespace, a scheme and a path — the Windows-pipe CR incident', () => {
    expect(sanitizeHost('https://knowsia.com/\r\n')).toBe('knowsia.com');
    expect(sanitizeHost(' knowsia.com \n')).toBe('knowsia.com');
  });

  it('rejects anything that is not a host so a bad value degrades to "unset"', () => {
    expect(sanitizeHost('')).toBeNull();
    expect(sanitizeHost(undefined)).toBeNull();
    expect(sanitizeHost('not a host')).toBeNull();
    expect(sanitizeHost('localhost')).toBeNull();
  });
});

describe('buildHostRedirects', () => {
  it('pre-cutover: only the temporary emergency knowsia.com → reg rule', () => {
    const rules = buildHostRedirects({ canonicalHost: null });
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({
      source: '/:path*',
      destination: 'https://reg.knowsia.com/:path*',
      permanent: false,
    });
    expect(rules[0].has[0]).toEqual({ type: 'host', value: '(www\\.)?knowsia\\.com' });
  });

  it('post-cutover: www and reg 308 to the canonical host, path preserved, no emergency rule', () => {
    const rules = buildHostRedirects({ canonicalHost: 'knowsia.com' });
    expect(rules.map((r) => r.has[0].value)).toEqual([
      'www\\.knowsia\\.com',
      'reg\\.knowsia\\.com',
    ]);
    for (const rule of rules) {
      expect(rule).toMatchObject({ source: '/:path((?!api/).*)', destination: 'https://knowsia.com/:path', permanent: true });
    }
    expect(rules.some((r) => r.destination.includes('reg.knowsia.com/'))).toBe(false);
  });

  it('accepts extra legacy hosts and never redirects the canonical host to itself', () => {
    const rules = buildHostRedirects({
      canonicalHost: 'knowsia.com',
      extraLegacyHosts: ['legacy.knowsia.com', 'knowsia.com', 'www.knowsia.com'],
    });
    expect(rules.map((r) => r.has[0].value)).toEqual([
      'www\\.knowsia\\.com',
      'reg\\.knowsia\\.com',
      'legacy\\.knowsia\\.com',
    ]);
  });
});

describe('buildMovedPageRedirects — pages the study app now owns', () => {
  // 2026-11-02: /about and /contact were ported to the study app, which owns
  // knowsia.com. Old links to them on reg 308 there; the machine paths and
  // every other reg page are untouched.
  it('moves the ported pages off reg, path and query preserved', () => {
    const rules = buildMovedPageRedirects();
    expect(rules).toEqual([
      { source: '/about', destination: 'https://knowsia.com/about', permanent: true },
      { source: '/contact', destination: 'https://knowsia.com/contact', permanent: true },
    ]);
  });

  it("never touches reg's API doors", () => {
    const rules = buildMovedPageRedirects();
    expect(rules.every((r) => !r.source.startsWith('/api'))).toBe(true);
  });
});

describe('toNextRedirects', () => {
  it('turns generated entries into permanent Next.js redirects and drops junk', () => {
    const out = toNextRedirects([
      { source: '/about', destination: '/about-us' },
      { source: '/same', destination: '/same' },
      { source: 'no-leading-slash', destination: '/x' },
      { source: '/broken' },
      null,
    ]);
    expect(out).toEqual([{ source: '/about', destination: '/about-us', permanent: true }]);
  });
});
