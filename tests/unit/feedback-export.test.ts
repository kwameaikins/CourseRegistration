import { beforeEach, describe, expect, it, vi } from 'vitest';

const repositoryMock = { selectAllFeedback: vi.fn() };

vi.mock('@/modules/feedback/repository', () => repositoryMock);
vi.mock('@/modules/users/service', () => ({ requireRole: vi.fn() }));
vi.mock('@/modules/communications/service', () => ({}));
vi.mock('@/modules/certificates/service', () => ({}));
vi.mock('@/lib/resend/client', () => ({ sendTransactionalEmail: vi.fn() }));

const { exportFeedbackForLms } = await import('@/modules/feedback/service');
const route = await import('@/app/api/integration/feedback/export/route');

const KEY = 'test-service-key';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'f1111111-1111-1111-1111-111111111111',
    registration_id: 'a1111111-1111-1111-1111-111111111111',
    overall_rating: 5,
    facilitator_rating: 4,
    relevance_rating: 5,
    confidence_rating: 3,
    materials_clarity: 'Yes',
    most_valuable_text: 'Journals',
    improvement_text: null,
    recommendation: 'Maybe',
    other_course_suggestion: null,
    testimonial_choice: 'Named',
    submitted_at: '2026-10-01T10:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.KNOWSIA_APP_SERVICE_KEY = KEY;
  repositoryMock.selectAllFeedback.mockResolvedValue([row()]);
});

describe('exportFeedbackForLms', () => {
  it('maps every column to camelCase', async () => {
    const out = await exportFeedbackForLms();
    expect(out[0]).toEqual({
      id: 'f1111111-1111-1111-1111-111111111111',
      registrationId: 'a1111111-1111-1111-1111-111111111111',
      overallRating: 5,
      facilitatorRating: 4,
      relevanceRating: 5,
      confidenceRating: 3,
      materialsClarity: 'Yes',
      mostValuableText: 'Journals',
      improvementText: null,
      recommendation: 'Maybe',
      otherCourseSuggestion: null,
      testimonialChoice: 'Named',
      submittedAt: '2026-10-01T10:00:00Z',
    });
  });
});

describe('feedback export route', () => {
  it('rejects a missing key with 401', async () => {
    const res = await route.GET(new Request('http://x/api/integration/feedback/export'));
    expect(res.status).toBe(401);
    expect(repositoryMock.selectAllFeedback).not.toHaveBeenCalled();
  });

  it('rejects a wrong key with 401', async () => {
    const res = await route.GET(
      new Request('http://x/api/integration/feedback/export', {
        headers: { authorization: 'Bearer nope' },
      }),
    );
    expect(res.status).toBe(401);
  });

  it('returns rows with the key', async () => {
    const res = await route.GET(
      new Request('http://x/api/integration/feedback/export', {
        headers: { authorization: `Bearer ${KEY}` },
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data[0]).toHaveProperty('registrationId');
  });
});
