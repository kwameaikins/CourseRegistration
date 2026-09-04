import { afterEach, describe, expect, it } from 'vitest';

import { DEFAULT_APP_URL, appHost, appUrl } from '@/lib/app-url';

const ORIGINAL = process.env.NEXT_PUBLIC_APP_URL;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = ORIGINAL;
});

describe('appUrl / appHost', () => {
  it('defaults to reg.knowsia.com until the cutover flips the env var', () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(appUrl()).toBe(DEFAULT_APP_URL);
    expect(appHost()).toBe('reg.knowsia.com');
  });

  it('follows NEXT_PUBLIC_APP_URL, trimming whitespace and trailing slashes', () => {
    process.env.NEXT_PUBLIC_APP_URL = ' https://knowsia.com/ \r\n';
    expect(appUrl()).toBe('https://knowsia.com');
    expect(appHost()).toBe('knowsia.com');
  });

  it('treats an empty value as unset', () => {
    process.env.NEXT_PUBLIC_APP_URL = '';
    expect(appUrl()).toBe(DEFAULT_APP_URL);
  });
});
