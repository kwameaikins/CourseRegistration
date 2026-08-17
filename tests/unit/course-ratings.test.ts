import { beforeEach, describe, expect, it, vi } from 'vitest';

// Public star ratings per course. The rules that matter are the ones that stop
// the page making a claim the data does not support: too few responses, and
// never publishing a score without the count beside it (enforced in the
// component, pinned here by always returning both).

const feedbackRepositoryMock = { selectCourseRatingsSystem: vi.fn() };
vi.mock('@/modules/feedback/repository', () => feedbackRepositoryMock);

const { getPublishableCourseRatingsByCourseIdSystem, MIN_RATINGS_TO_PUBLISH } = await import(
  '@/modules/feedback/course-ratings'
);

function ratings(courseId: string, values: number[]) {
  return values.map((overallRating) => ({ courseId, overallRating }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getPublishableCourseRatingsByCourseIdSystem', () => {
  it('averages a course to one decimal place', async () => {
    feedbackRepositoryMock.selectCourseRatingsSystem.mockResolvedValue(
      ratings('course-1', [5, 4, 5, 4, 5]),
    );

    const published = await getPublishableCourseRatingsByCourseIdSystem();

    expect(published.get('course-1')).toEqual({ average: 4.6, responses: 5 });
  });

  // With two responses one irritated participant drops a course from 5.0 to
  // 3.0, and the page then advertises a number that says more about one bad
  // morning than about the course.
  it('withholds a rating from a course with too few responses', async () => {
    feedbackRepositoryMock.selectCourseRatingsSystem.mockResolvedValue(
      ratings('course-1', Array(MIN_RATINGS_TO_PUBLISH - 1).fill(5)),
    );

    const published = await getPublishableCourseRatingsByCourseIdSystem();

    // Absent, not present-with-null, so a caller cannot render a rating that
    // was deliberately withheld.
    expect(published.has('course-1')).toBe(false);
  });

  it('publishes as soon as the threshold is reached', async () => {
    feedbackRepositoryMock.selectCourseRatingsSystem.mockResolvedValue(
      ratings('course-1', Array(MIN_RATINGS_TO_PUBLISH).fill(5)),
    );

    const published = await getPublishableCourseRatingsByCourseIdSystem();

    expect(published.get('course-1')).toEqual({
      average: 5,
      responses: MIN_RATINGS_TO_PUBLISH,
    });
  });

  it('keeps courses apart, and judges each on its own count', async () => {
    feedbackRepositoryMock.selectCourseRatingsSystem.mockResolvedValue([
      ...ratings('busy', [5, 5, 4, 4, 3]),
      ...ratings('quiet', [5, 5]),
    ]);

    const published = await getPublishableCourseRatingsByCourseIdSystem();

    expect(published.get('busy')).toEqual({ average: 4.2, responses: 5 });
    expect(published.has('quiet')).toBe(false);
  });

  it('reports a poor course honestly rather than hiding it', async () => {
    feedbackRepositoryMock.selectCourseRatingsSystem.mockResolvedValue(
      ratings('course-1', [2, 1, 2, 3, 2]),
    );

    const published = await getPublishableCourseRatingsByCourseIdSystem();

    expect(published.get('course-1')).toEqual({ average: 2, responses: 5 });
  });

  // A rating is an embellishment; the catalogue is the product.
  it('returns no ratings rather than breaking the catalogue when the read fails', async () => {
    feedbackRepositoryMock.selectCourseRatingsSystem.mockRejectedValue(
      new Error('relation "feedback" does not exist'),
    );

    const published = await getPublishableCourseRatingsByCourseIdSystem();

    expect(published.size).toBe(0);
  });
});
