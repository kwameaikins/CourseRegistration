import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const ORIGINAL_ENV = process.env.NEXT_PUBLIC_LINKEDIN_ORG_ID;

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_LINKEDIN_ORG_ID;
});

afterEach(() => {
  if (ORIGINAL_ENV === undefined) delete process.env.NEXT_PUBLIC_LINKEDIN_ORG_ID;
  else process.env.NEXT_PUBLIC_LINKEDIN_ORG_ID = ORIGINAL_ENV;
});

describe('buildLinkedInAddToProfileUrl', () => {
  it('omits organizationId when the env var is unset', async () => {
    const { buildLinkedInAddToProfileUrl } = await import('@/lib/linkedin');
    const url = buildLinkedInAddToProfileUrl({
      certificateName: 'ICAG Level 1 Prep',
      issuedDateIso: '2026-08-06',
      certUrl: 'https://reg.knowsia.com/verify/KNS-ICAG-L1-2026-0001',
      certificateNumber: 'KNS-ICAG-L1-2026-0001',
    });
    const params = new URL(url).searchParams;
    expect(params.has('organizationId')).toBe(false);
    expect(params.get('name')).toBe('ICAG Level 1 Prep');
    expect(params.get('certId')).toBe('KNS-ICAG-L1-2026-0001');
    expect(params.get('certUrl')).toBe('https://reg.knowsia.com/verify/KNS-ICAG-L1-2026-0001');
    expect(params.get('startTask')).toBe('CERTIFICATION_NAME');
  });

  it('includes organizationId when the env var is set', async () => {
    process.env.NEXT_PUBLIC_LINKEDIN_ORG_ID = '12345678';
    const { buildLinkedInAddToProfileUrl } = await import('@/lib/linkedin');
    const url = buildLinkedInAddToProfileUrl({
      certificateName: 'ICAG Level 1 Prep',
      issuedDateIso: '2026-08-06',
      certUrl: 'https://reg.knowsia.com/verify/KNS-ICAG-L1-2026-0001',
      certificateNumber: 'KNS-ICAG-L1-2026-0001',
    });
    const params = new URL(url).searchParams;
    expect(params.get('organizationId')).toBe('12345678');
  });

  it('derives issueYear/issueMonth from the ISO date, without zero-padding the month', async () => {
    const { buildLinkedInAddToProfileUrl } = await import('@/lib/linkedin');
    const url = buildLinkedInAddToProfileUrl({
      certificateName: 'AI-Powered Financial Reporting',
      issuedDateIso: '2026-01-05',
      certUrl: 'https://reg.knowsia.com/verify/KNS-AI05-2026-0002',
      certificateNumber: 'KNS-AI05-2026-0002',
    });
    const params = new URL(url).searchParams;
    expect(params.get('issueYear')).toBe('2026');
    expect(params.get('issueMonth')).toBe('1');
  });
});
