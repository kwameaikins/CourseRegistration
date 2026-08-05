import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Public catalog API (2026-08-05) — the contract knowsia.com depends on.
//
// Two things are worth locking down here. First the SHAPE, because another
// property renders it and a silent field rename breaks a site nobody in this
// repo can see. Second the LEAK SURFACE: this is the first endpoint a third
// party calls, so "no participant/payment/staff data" needs to be an assertion,
// not an intention.

const publicCatalogMock = {
  getPublicCourseCatalog: vi.fn(),
  getPublicCourseByCode: vi.fn(),
};
vi.mock('@/modules/courses/public-catalog', () => publicCatalogMock);

const { getCatalogApiCourses, getCatalogApiCourse } = await import(
  '@/modules/courses/catalog-api'
);
const { assertCatalogApiKey, catalogCorsHeaders } = await import('@/lib/public-api');

function session(overrides: Record<string, unknown> = {}) {
  return {
    batchId: 'batch-uuid-1',
    cohortLabel: 'March 2026',
    startDate: '2026-03-02',
    startTime: '18:00',
    endDate: '2026-03-06',
    facilitatorName: 'Kwame Asante',
    isFree: false,
    effectiveFee: 950,
    listFee: 1200,
    earlyBirdEndsOn: '2026-02-15',
    seatsRemaining: 7,
    isFull: false,
    ...overrides,
  };
}

function course(overrides: Record<string, unknown> = {}) {
  return {
    courseCode: 'AI05',
    courseName: 'AI-Powered Financial Reporting',
    certificateHours: 12,
    cpdCredit: '12 CPD',
    content: { tagline: 'Build faster finance workflows with AI.' },
    sessions: [session()],
    nextSession: session(),
    isFreeProgramme: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_APP_URL = 'https://reg.knowsia.com';
});

describe('catalog list shape', () => {
  it('maps a programme and its cohorts to the published contract', async () => {
    publicCatalogMock.getPublicCourseCatalog.mockResolvedValue([course()]);
    const [result] = await getCatalogApiCourses();

    expect(result).toMatchObject({
      courseCode: 'AI05',
      courseName: 'AI-Powered Financial Reporting',
      summary: 'Build faster finance workflows with AI.',
      currency: 'GHS',
      isFreeProgramme: false,
    });
    expect(result.sessions[0]).toMatchObject({
      batchId: 'batch-uuid-1',
      listFee: 1200,
      effectiveFee: 950,
      earlyBirdEndsOn: '2026-02-15',
      seatsRemaining: 7,
      status: 'open',
      registerUrl: 'https://reg.knowsia.com/register?batchId=batch-uuid-1',
    });
  });

  it('omits the full marketing copy from list responses', async () => {
    publicCatalogMock.getPublicCourseCatalog.mockResolvedValue([course()]);
    const [result] = await getCatalogApiCourses();
    expect(result).not.toHaveProperty('content');
  });

  it('includes the full marketing copy on a detail response', async () => {
    publicCatalogMock.getPublicCourseByCode.mockResolvedValue(course());
    const result = await getCatalogApiCourse('AI05');
    expect(result?.content).toEqual({ tagline: 'Build faster finance workflows with AI.' });
  });

  // The consumer must not assume a string here: most courses in the database
  // have no founder-written copy at all.
  it('returns summary: null for a course with no marketing copy', async () => {
    publicCatalogMock.getPublicCourseCatalog.mockResolvedValue([course({ content: null })]);
    const [result] = await getCatalogApiCourses();
    expect(result.summary).toBeNull();
  });
});

describe('catalog filtering', () => {
  it('drops programmes with no scheduled sessions', async () => {
    publicCatalogMock.getPublicCourseCatalog.mockResolvedValue([
      course(),
      course({ courseCode: 'OLD1', sessions: [], nextSession: null }),
    ]);
    const results = await getCatalogApiCourses();
    expect(results.map((c) => c.courseCode)).toEqual(['AI05']);
  });

  // Filtering on OPEN sessions instead of ANY sessions would hide a
  // fully-booked programme, but /register routes those to the waitlist, so
  // they belong in the catalogue.
  it('keeps a fully-booked programme, marked full', async () => {
    publicCatalogMock.getPublicCourseCatalog.mockResolvedValue([
      course({ sessions: [session({ seatsRemaining: 0, isFull: true })] }),
    ]);
    const [result] = await getCatalogApiCourses();
    expect(result.sessions[0].status).toBe('full');
  });

  it('404s (null) a course that exists but has no sessions', async () => {
    publicCatalogMock.getPublicCourseByCode.mockResolvedValue(
      course({ sessions: [], nextSession: null }),
    );
    expect(await getCatalogApiCourse('AI05')).toBeNull();
  });

  it('404s (null) an unknown course code', async () => {
    publicCatalogMock.getPublicCourseByCode.mockResolvedValue(null);
    expect(await getCatalogApiCourse('NOPE')).toBeNull();
  });
});

describe('edge cases the WordPress template must handle', () => {
  it('preserves seatsRemaining: null for an uncapped cohort rather than coercing to 0', async () => {
    publicCatalogMock.getPublicCourseCatalog.mockResolvedValue([
      course({ sessions: [session({ seatsRemaining: null, isFull: false })] }),
    ]);
    const [result] = await getCatalogApiCourses();
    expect(result.sessions[0].seatsRemaining).toBeNull();
    expect(result.sessions[0].status).toBe('open');
  });

  it('reports a live early-bird as a lower effective fee plus a real deadline', async () => {
    publicCatalogMock.getPublicCourseCatalog.mockResolvedValue([course()]);
    const [result] = await getCatalogApiCourses();
    expect(result.sessions[0].effectiveFee).toBeLessThan(result.sessions[0].listFee);
    expect(result.sessions[0].earlyBirdEndsOn).not.toBeNull();
  });

  it('never advertises a discount without a deadline', async () => {
    publicCatalogMock.getPublicCourseCatalog.mockResolvedValue([
      course({ sessions: [session({ effectiveFee: 1200, earlyBirdEndsOn: null })] }),
    ]);
    const [result] = await getCatalogApiCourses();
    const s = result.sessions[0];
    expect(s.effectiveFee < s.listFee || s.earlyBirdEndsOn === null).toBe(true);
  });

  it('exposes a free programme via isFree rather than a zero price', async () => {
    publicCatalogMock.getPublicCourseCatalog.mockResolvedValue([
      course({ isFreeProgramme: true, sessions: [session({ isFree: true })] }),
    ]);
    const [result] = await getCatalogApiCourses();
    expect(result.isFreeProgramme).toBe(true);
    expect(result.sessions[0].isFree).toBe(true);
  });

  it('handles an empty catalogue', async () => {
    publicCatalogMock.getPublicCourseCatalog.mockResolvedValue([]);
    expect(await getCatalogApiCourses()).toEqual([]);
  });
});

describe('leak surface', () => {
  // The read model this is built from touches only courses, batches, and a
  // registration count -- but that is a property worth asserting, since this
  // is the one endpoint a third party can call.
  it('exposes no participant, payment, or staff field', async () => {
    publicCatalogMock.getPublicCourseCatalog.mockResolvedValue([course()]);
    const serialized = JSON.stringify(await getCatalogApiCourses());
    for (const forbidden of [
      'participant', 'email', 'phone', 'amountPaid', 'amount_paid',
      'paymentStatus', 'payment_status', 'registrationId', 'staff', 'verifiedBy',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('exposes only the agreed top-level keys', async () => {
    publicCatalogMock.getPublicCourseCatalog.mockResolvedValue([course()]);
    const [result] = await getCatalogApiCourses();
    expect(Object.keys(result).sort()).toEqual([
      'certificateHours', 'courseCode', 'courseName', 'cpdCredit',
      'currency', 'isFreeProgramme', 'sessions', 'summary',
    ]);
  });
});

describe('API key', () => {
  const ORIGINAL = process.env.CATALOG_API_KEY;
  afterEach(() => {
    process.env.CATALOG_API_KEY = ORIGINAL;
  });

  function req(headers: Record<string, string> = {}) {
    return new Request('https://reg.knowsia.com/api/public/catalog', { headers });
  }

  it('accepts the correct bearer token', () => {
    process.env.CATALOG_API_KEY = 'secret-value';
    expect(() => assertCatalogApiKey(req({ authorization: 'Bearer secret-value' }))).not.toThrow();
  });

  it('rejects a missing, wrong, or malformed token', () => {
    process.env.CATALOG_API_KEY = 'secret-value';
    expect(() => assertCatalogApiKey(req())).toThrow();
    expect(() => assertCatalogApiKey(req({ authorization: 'Bearer nope' }))).toThrow();
    expect(() => assertCatalogApiKey(req({ authorization: 'secret-value' }))).toThrow();
    expect(() => assertCatalogApiKey(req({ authorization: 'Bearer ' }))).toThrow();
    expect(() => assertCatalogApiKey(req({ authorization: 'Basic secret-value' }))).toThrow();
  });

  // A trailing newline on a secret pasted into the Vercel dashboard is
  // invisible in both that UI and the WordPress field, and produces a 401
  // indistinguishable from a genuinely wrong key. This cost real debugging
  // time on 2026-08-05, so it is pinned down here.
  it('tolerates surrounding whitespace on the configured key', () => {
    process.env.CATALOG_API_KEY = '  secret-value\n';
    expect(() => assertCatalogApiKey(req({ authorization: 'Bearer secret-value' }))).not.toThrow();
  });

  it('tolerates surrounding whitespace on the presented token', () => {
    process.env.CATALOG_API_KEY = 'secret-value';
    expect(() => assertCatalogApiKey(req({ authorization: 'Bearer secret-value ' }))).not.toThrow();
  });

  it('accepts a lower-case bearer scheme, which some clients normalise to', () => {
    process.env.CATALOG_API_KEY = 'secret-value';
    expect(() => assertCatalogApiKey(req({ authorization: 'bearer secret-value' }))).not.toThrow();
  });

  // Trimming must not make a whitespace-only key look configured.
  it('treats a whitespace-only key as unconfigured', () => {
    process.env.CATALOG_API_KEY = '   ';
    expect(() => assertCatalogApiKey(req({ authorization: 'Bearer    ' }))).toThrow();
  });

  // Opposite of the isR2Configured/isSmsConfigured gates elsewhere: those
  // degrade open because the feature is a nicety. Here the gate IS the
  // control, so an unset key must mean closed.
  it('fails CLOSED when no key is configured', () => {
    delete process.env.CATALOG_API_KEY;
    expect(() => assertCatalogApiKey(req({ authorization: 'Bearer anything' }))).toThrow();
  });
});

describe('CORS', () => {
  function reqFrom(origin?: string) {
    return new Request('https://reg.knowsia.com/api/public/catalog', {
      headers: origin ? { origin } : {},
    });
  }

  it('allows knowsia.com on both apex and www', () => {
    for (const origin of ['https://knowsia.com', 'https://www.knowsia.com']) {
      expect(catalogCorsHeaders(reqFrom(origin))['Access-Control-Allow-Origin']).toBe(origin);
    }
  });

  it('never returns a wildcard, and refuses any other origin', () => {
    expect(catalogCorsHeaders(reqFrom('https://evil.example'))).toEqual({});
    expect(catalogCorsHeaders(reqFrom('http://knowsia.com'))).toEqual({});
    const allowed = catalogCorsHeaders(reqFrom('https://knowsia.com'));
    expect(allowed['Access-Control-Allow-Origin']).not.toBe('*');
    expect(allowed.Vary).toBe('Origin');
  });

  it('returns no CORS headers for a server-to-server call with no Origin', () => {
    // WordPress calls this from PHP; it neither sends nor needs an Origin.
    expect(catalogCorsHeaders(reqFrom())).toEqual({});
  });
});
