import { describe, expect, it } from 'vitest';

import { getSafeOAuthNext } from '@/lib/auth/oauth';

describe('OAuth callback redirects', () => {
  it('accepts local application paths', () => {
    expect(getSafeOAuthNext('/dashboard')).toBe('/dashboard');
    expect(getSafeOAuthNext('/registrations?page=2')).toBe('/registrations?page=2');
  });

  it('rejects external and protocol-relative redirects', () => {
    expect(getSafeOAuthNext(null)).toBe('/');
    expect(getSafeOAuthNext('https://attacker.example')).toBe('/');
    expect(getSafeOAuthNext('//attacker.example')).toBe('/');
    expect(getSafeOAuthNext('/\\attacker.example')).toBe('/');
  });
});
