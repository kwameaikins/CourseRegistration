import { describe, expect, it } from 'vitest';

import {
  buildAttribution,
  parseAttributionCookie,
  serializeAttribution,
} from '@/lib/attribution';

describe('buildAttribution', () => {
  it('captures utm parameters, referrer and landing page', () => {
    const attribution = buildAttribution(
      'https://reg.knowsia.com/programmes/FM?utm_source=facebook&utm_medium=cpc&utm_campaign=sept-intake',
      'https://facebook.com/some/ad',
      'reg.knowsia.com',
    );
    expect(attribution).toMatchObject({
      utm_source: 'facebook',
      utm_medium: 'cpc',
      utm_campaign: 'sept-intake',
      referrer: 'https://facebook.com/some/ad',
      landing_page: '/programmes/FM?utm_source=facebook&utm_medium=cpc&utm_campaign=sept-intake',
    });
    expect(attribution?.first_seen_at).toBeTruthy();
  });

  it('records an external referrer even with no utm tags', () => {
    const attribution = buildAttribution(
      'https://reg.knowsia.com/',
      'https://www.google.com/search',
      'reg.knowsia.com',
    );
    expect(attribution?.referrer).toBe('https://www.google.com/search');
  });

  it('returns null for direct, untagged traffic — nothing worth a cookie', () => {
    expect(buildAttribution('https://reg.knowsia.com/', '', 'reg.knowsia.com')).toBeNull();
  });

  it('ignores an internal referrer — navigation is not acquisition', () => {
    expect(
      buildAttribution(
        'https://reg.knowsia.com/register',
        'https://reg.knowsia.com/programmes',
        'reg.knowsia.com',
      ),
    ).toBeNull();
  });
});

describe('parseAttributionCookie', () => {
  it('round-trips through serialize', () => {
    const attribution = buildAttribution(
      'https://reg.knowsia.com/?utm_source=linkedin',
      '',
      'reg.knowsia.com',
    )!;
    const parsed = parseAttributionCookie(serializeAttribution(attribution));
    expect(parsed).toMatchObject({ utm_source: 'linkedin' });
  });

  // The cookie is visitor-controlled input crossing into a registration
  // write: anything malformed must degrade to "no attribution", never throw.
  it.each(['', 'not-json', '%7Bbroken', '{"utm_source": 12345}', '{}'])(
    'treats %j as absent',
    (value) => {
      expect(parseAttributionCookie(value)).toBeNull();
    },
  );
});
