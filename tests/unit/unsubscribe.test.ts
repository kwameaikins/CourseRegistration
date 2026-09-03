import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  unsubscribeFooterHtml,
  unsubscribeLink,
  unsubscribeToken,
  verifyUnsubscribeToken,
} from '@/lib/unsubscribe';

beforeEach(() => {
  process.env.UNSUBSCRIBE_SECRET = 'test-secret-for-unsubscribe';
});
afterEach(() => {
  delete process.env.UNSUBSCRIBE_SECRET;
});

describe('unsubscribe tokens', () => {
  it('verifies its own token and normalises case/whitespace', () => {
    const token = unsubscribeToken('Ama@Example.com ');
    expect(verifyUnsubscribeToken('ama@example.com', token)).toBe(true);
  });

  it('rejects a token minted for a different address', () => {
    const token = unsubscribeToken('ama@example.com');
    expect(verifyUnsubscribeToken('kwame@example.com', token)).toBe(false);
  });

  it('rejects tampering', () => {
    const token = unsubscribeToken('ama@example.com');
    const tampered = token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a');
    expect(verifyUnsubscribeToken('ama@example.com', tampered)).toBe(false);
    expect(verifyUnsubscribeToken('ama@example.com', '')).toBe(false);
  });

  it('builds a link whose own parameters verify', () => {
    const link = unsubscribeLink('Ama@Example.com');
    const url = new URL(link);
    expect(url.pathname).toBe('/unsubscribe');
    expect(
      verifyUnsubscribeToken(url.searchParams.get('e')!, url.searchParams.get('t')!),
    ).toBe(true);
  });

  it('footer carries the link, and never throws without a secret', () => {
    expect(unsubscribeFooterHtml('ama@example.com')).toContain('/unsubscribe?e=');
    delete process.env.UNSUBSCRIBE_SECRET;
    const previous = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      // An email without a footer beats an email that never left.
      expect(unsubscribeFooterHtml('ama@example.com')).toBe('');
    } finally {
      if (previous) process.env.SUPABASE_SERVICE_ROLE_KEY = previous;
    }
  });
});
