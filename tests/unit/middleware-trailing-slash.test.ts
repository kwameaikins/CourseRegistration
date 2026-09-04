import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { isStaffPath, trailingSlashRedirect } from '@/middleware';

function requestFor(path: string): NextRequest {
  return new NextRequest(new URL(path, 'https://knowsia.com'));
}

describe('trailingSlashRedirect', () => {
  it('308s a trailing-slash path to its canonical form, keeping host and query', () => {
    const res = trailingSlashRedirect(requestFor('/programmes/?utm=x'));
    expect(res?.status).toBe(308);
    expect(res?.headers.get('location')).toBe('https://knowsia.com/programmes?utm=x');
  });

  it('collapses repeated slashes and nested paths', () => {
    expect(trailingSlashRedirect(requestFor('/programmes/ESG1//'))?.headers.get('location')).toBe(
      'https://knowsia.com/programmes/ESG1',
    );
  });

  it('leaves the root and slash-less paths alone', () => {
    expect(trailingSlashRedirect(requestFor('/'))).toBeNull();
    expect(trailingSlashRedirect(requestFor('/programmes'))).toBeNull();
    expect(trailingSlashRedirect(requestFor('/news/article/some-slug'))).toBeNull();
  });
});

describe('isStaffPath', () => {
  it('matches the staff prefixes exactly and as parents, not as substrings', () => {
    expect(isStaffPath('/dashboard')).toBe(true);
    expect(isStaffPath('/registrations/import')).toBe(true);
    expect(isStaffPath('/courses/anything')).toBe(true);
    expect(isStaffPath('/coursesx')).toBe(false);
    expect(isStaffPath('/programmes')).toBe(false);
    expect(isStaffPath('/')).toBe(false);
  });
});
