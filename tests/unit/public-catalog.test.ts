import { beforeEach, describe, expect, it, vi } from 'vitest';

// Public course catalogue (founder-requested 2026-08-03). The copy itself is
// static prose and not worth asserting; what matters is that the commercial
// facts a visitor sees — price, early-bird deadline, seats, free-vs-paid — are
// derived the same way the registration form derives them. A marketing page
// that advertises a price the form then contradicts is the failure this covers.

const coursesRepositoryMock = {
  selectPublicCourseCatalogSystem: vi.fn(),
  countRegistrationsByBatchIdsSystem: vi.fn(),
};

vi.mock('@/modules/courses/repository', () => coursesRepositoryMock);

const { getPublicCourseCatalog, getPublicCourseByCode } = await import(
  '@/modules/courses/public-catalog'
);

const FUTURE = '2099-09-01';

function courseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'course-1',
    course_code: 'AI05',
    course_name: 'AI-Powered Financial Reporting',
    certificate_hours: 20,
    cpd_credit: '20 CPD',
    ...overrides,
  };
}

function batchRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'batch-1',
    cohort_label: 'SEP-2099',
    start_date: FUTURE,
    start_time: '09:00:00',
    end_date: FUTURE,
    course_fee: 1200,
    is_free: false,
    capacity: null,
    discount_cutoff_date: null,
    discounted_fee: null,
    facilitator_name: 'Mr. Asante',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  coursesRepositoryMock.countRegistrationsByBatchIdsSystem.mockResolvedValue(new Map());
});

describe('getPublicCourseCatalog — pricing shown to visitors', () => {
  it('shows the list fee and no early-bird deadline when no discount is configured', async () => {
    coursesRepositoryMock.selectPublicCourseCatalogSystem.mockResolvedValue([
      { course: courseRow(), batches: [batchRow()] },
    ]);

    const [course] = await getPublicCourseCatalog();

    expect(course.sessions[0].effectiveFee).toBe(1200);
    expect(course.sessions[0].listFee).toBe(1200);
    expect(course.sessions[0].earlyBirdEndsOn).toBeNull();
  });

  it('shows the early-bird price and its real deadline while the cutoff holds', async () => {
    coursesRepositoryMock.selectPublicCourseCatalogSystem.mockResolvedValue([
      {
        course: courseRow(),
        batches: [batchRow({ discount_cutoff_date: '2099-08-01', discounted_fee: 900 })],
      },
    ]);

    const [course] = await getPublicCourseCatalog();

    expect(course.sessions[0].effectiveFee).toBe(900);
    expect(course.sessions[0].listFee).toBe(1200);
    expect(course.sessions[0].earlyBirdEndsOn).toBe('2099-08-01');
  });

  it('drops the early-bird deadline once the cutoff has passed', async () => {
    coursesRepositoryMock.selectPublicCourseCatalogSystem.mockResolvedValue([
      {
        course: courseRow(),
        batches: [batchRow({ discount_cutoff_date: '2020-01-01', discounted_fee: 900 })],
      },
    ]);

    const [course] = await getPublicCourseCatalog();

    expect(course.sessions[0].effectiveFee).toBe(1200);
    expect(course.sessions[0].earlyBirdEndsOn).toBeNull();
  });
});

describe('getPublicCourseCatalog — seats and availability', () => {
  it('reports remaining seats against real registrations', async () => {
    coursesRepositoryMock.selectPublicCourseCatalogSystem.mockResolvedValue([
      { course: courseRow(), batches: [batchRow({ capacity: 30 })] },
    ]);
    coursesRepositoryMock.countRegistrationsByBatchIdsSystem.mockResolvedValue(
      new Map([['batch-1', 27]]),
    );

    const [course] = await getPublicCourseCatalog();

    expect(course.sessions[0].seatsRemaining).toBe(3);
    expect(course.sessions[0].isFull).toBe(false);
  });

  it('marks a batch full and never reports negative seats on an overbooked cohort', async () => {
    coursesRepositoryMock.selectPublicCourseCatalogSystem.mockResolvedValue([
      { course: courseRow(), batches: [batchRow({ capacity: 30 })] },
    ]);
    coursesRepositoryMock.countRegistrationsByBatchIdsSystem.mockResolvedValue(
      new Map([['batch-1', 34]]),
    );

    const [course] = await getPublicCourseCatalog();

    expect(course.sessions[0].seatsRemaining).toBe(0);
    expect(course.sessions[0].isFull).toBe(true);
  });

  it('treats unlimited capacity as never full', async () => {
    coursesRepositoryMock.selectPublicCourseCatalogSystem.mockResolvedValue([
      { course: courseRow(), batches: [batchRow({ capacity: null })] },
    ]);

    const [course] = await getPublicCourseCatalog();

    expect(course.sessions[0].seatsRemaining).toBeNull();
    expect(course.sessions[0].isFull).toBe(false);
  });

  it('points the primary CTA at the first cohort that still has room', async () => {
    coursesRepositoryMock.selectPublicCourseCatalogSystem.mockResolvedValue([
      {
        course: courseRow(),
        batches: [
          batchRow({ id: 'batch-full', capacity: 10 }),
          batchRow({ id: 'batch-open', capacity: 10, start_date: '2099-10-01' }),
        ],
      },
    ]);
    coursesRepositoryMock.countRegistrationsByBatchIdsSystem.mockResolvedValue(
      new Map([['batch-full', 10]]),
    );

    const [course] = await getPublicCourseCatalog();

    expect(course.nextSession?.batchId).toBe('batch-open');
  });

  it('still offers the soonest cohort when every cohort is full, so the waitlist stays reachable', async () => {
    coursesRepositoryMock.selectPublicCourseCatalogSystem.mockResolvedValue([
      { course: courseRow(), batches: [batchRow({ id: 'batch-full', capacity: 10 })] },
    ]);
    coursesRepositoryMock.countRegistrationsByBatchIdsSystem.mockResolvedValue(
      new Map([['batch-full', 10]]),
    );

    const [course] = await getPublicCourseCatalog();

    expect(course.nextSession?.batchId).toBe('batch-full');
    expect(course.nextSession?.isFull).toBe(true);
  });
});

describe('getPublicCourseCatalog — free programmes', () => {
  it('flags a programme as free only when every upcoming session is free', async () => {
    coursesRepositoryMock.selectPublicCourseCatalogSystem.mockResolvedValue([
      {
        course: courseRow({ course_code: 'ESG2' }),
        batches: [
          batchRow({ id: 'b1', is_free: true, course_fee: 0 }),
          batchRow({ id: 'b2', is_free: true, course_fee: 0 }),
        ],
      },
    ]);

    const [course] = await getPublicCourseCatalog();

    expect(course.isFreeProgramme).toBe(true);
  });

  it('does not flag a programme as free when a paid cohort is also on offer', async () => {
    coursesRepositoryMock.selectPublicCourseCatalogSystem.mockResolvedValue([
      {
        course: courseRow(),
        batches: [
          batchRow({ id: 'b1', is_free: true, course_fee: 0 }),
          batchRow({ id: 'b2', is_free: false, course_fee: 1200 }),
        ],
      },
    ]);

    const [course] = await getPublicCourseCatalog();

    expect(course.isFreeProgramme).toBe(false);
  });

  it('does not call a programme with no scheduled dates free', async () => {
    coursesRepositoryMock.selectPublicCourseCatalogSystem.mockResolvedValue([
      { course: courseRow(), batches: [] },
    ]);

    const [course] = await getPublicCourseCatalog();

    expect(course.isFreeProgramme).toBe(false);
    expect(course.nextSession).toBeNull();
  });
});

describe('getPublicCourseCatalog — copy matching and ordering', () => {
  it('attaches founder copy by course_code', async () => {
    coursesRepositoryMock.selectPublicCourseCatalogSystem.mockResolvedValue([
      { course: courseRow({ course_code: 'AI05' }), batches: [] },
    ]);

    const [course] = await getPublicCourseCatalog();

    expect(course.content).not.toBeNull();
    expect(course.content?.outcomes.length).toBeGreaterThan(0);
  });

  // The deliberate failure mode: an unmatched code degrades the card, it never
  // removes a live programme from the public site.
  it('still lists a course whose code has no copy written for it', async () => {
    coursesRepositoryMock.selectPublicCourseCatalogSystem.mockResolvedValue([
      {
        course: courseRow({ id: 'course-9', course_code: 'UNKNOWN9', course_name: 'New Course' }),
        batches: [batchRow()],
      },
    ]);

    const catalog = await getPublicCourseCatalog();

    expect(catalog).toHaveLength(1);
    expect(catalog[0].content).toBeNull();
    expect(catalog[0].courseName).toBe('New Course');
    expect(catalog[0].sessions).toHaveLength(1);
  });

  // CLAUDE.md's Open Decisions records AI05 and AI02 as near-duplicate courses
  // awaiting a canonical pick, and the founder's brief says AI02 while the
  // live catalogue has used AI05. Both are registered so the page renders
  // whichever the database actually holds.
  it('resolves the AI programme under both AI02 and AI05 while the duplicate is unresolved', async () => {
    coursesRepositoryMock.selectPublicCourseCatalogSystem.mockResolvedValue([
      { course: courseRow({ course_code: 'AI02' }), batches: [] },
    ]);
    const [viaAi02] = await getPublicCourseCatalog();

    coursesRepositoryMock.selectPublicCourseCatalogSystem.mockResolvedValue([
      { course: courseRow({ course_code: 'AI05' }), batches: [] },
    ]);
    const [viaAi05] = await getPublicCourseCatalog();

    expect(viaAi02.content).not.toBeNull();
    expect(viaAi05.content).not.toBeNull();
    expect(viaAi02.content?.tagline).toBe(viaAi05.content?.tagline);
    expect(viaAi02.content?.curriculum).toHaveLength(5);
  });

  it('carries the full brief through for a course that has one', async () => {
    coursesRepositoryMock.selectPublicCourseCatalogSystem.mockResolvedValue([
      { course: courseRow({ course_code: 'ESG1' }), batches: [] },
    ]);

    const [course] = await getPublicCourseCatalog();

    expect(course.content?.curriculum.length).toBeGreaterThan(0);
    expect(course.content?.primaryAudience.length).toBeGreaterThan(0);
    expect(course.content?.prerequisites.length).toBeGreaterThan(0);
    expect(course.content?.includes.length).toBeGreaterThan(0);
    expect(course.content?.faq.length).toBeGreaterThan(0);
    expect(course.content?.facilitator.name).toBeTruthy();
  });

  it('orders courses with copy ahead of those without', async () => {
    coursesRepositoryMock.selectPublicCourseCatalogSystem.mockResolvedValue([
      { course: courseRow({ id: 'c9', course_code: 'ZZZ9', course_name: 'Aardvark Course' }), batches: [] },
      { course: courseRow({ id: 'c1', course_code: 'AI05' }), batches: [] },
    ]);

    const catalog = await getPublicCourseCatalog();

    expect(catalog.map((course) => course.courseCode)).toEqual(['AI05', 'ZZZ9']);
  });
});

describe('getPublicCourseByCode', () => {
  beforeEach(() => {
    coursesRepositoryMock.selectPublicCourseCatalogSystem.mockResolvedValue([
      { course: courseRow(), batches: [batchRow()] },
    ]);
  });

  it('resolves a lower-case URL segment to the canonical course code', async () => {
    const course = await getPublicCourseByCode('ai05');
    expect(course?.courseCode).toBe('AI05');
  });

  it('returns null for an unknown code so the page can 404', async () => {
    expect(await getPublicCourseByCode('NOPE')).toBeNull();
  });
});
