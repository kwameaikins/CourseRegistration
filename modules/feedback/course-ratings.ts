import * as feedbackRepository from '@/modules/feedback/repository';

// Public star ratings per course (2026-08-17).
//
// Its own module rather than a function on feedback/service.ts, for the same
// reason content-resolver.ts is separate from courses/service.ts: the public
// catalogue needs this on every programme page render, and feedback/service.ts
// pulls in communications and certificates — neither of which a marketing page
// should load, or a test of it should have to mock.

export interface CourseRating {
  average: number;
  responses: number;
}

// WHY A MINIMUM: with two responses one irritated participant drops a course
// from 5.0 to 3.0, and the page then advertises a number that says more about
// one bad morning than about the course. Below the threshold nothing is shown,
// which is honest; a score shown WITH its response count is a claim a reader
// can weigh. The count is not decoration — publishing "4.8" without saying
// from how many is the part that misleads.
export const MIN_RATINGS_TO_PUBLISH = 5;

// Keyed by course id. A course below the threshold is ABSENT from the map
// rather than present with a null, so a caller cannot accidentally render a
// rating that was deliberately withheld.
export async function getPublishableCourseRatingsByCourseIdSystem(): Promise<
  Map<string, CourseRating>
> {
  let ratings: Awaited<ReturnType<typeof feedbackRepository.selectCourseRatingsSystem>>;
  try {
    ratings = await feedbackRepository.selectCourseRatingsSystem();
  } catch (err) {
    // A rating is an embellishment; the catalogue is the product. Same rule the
    // programmes page already applies to testimonials — the copy layer must
    // never take the page down with it.
    console.error('[course ratings]', err);
    return new Map();
  }

  const byCourse = new Map<string, number[]>();
  for (const rating of ratings) {
    const bucket = byCourse.get(rating.courseId);
    if (bucket) bucket.push(rating.overallRating);
    else byCourse.set(rating.courseId, [rating.overallRating]);
  }

  const published = new Map<string, CourseRating>();
  for (const [courseId, values] of byCourse) {
    if (values.length < MIN_RATINGS_TO_PUBLISH) continue;
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    published.set(courseId, {
      // One decimal place — the convention every review site uses, and the same
      // rounding getBatchFeedbackSummary applies on the staff screen.
      average: Math.round(mean * 10) / 10,
      responses: values.length,
    });
  }

  return published;
}
