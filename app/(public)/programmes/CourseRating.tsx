import type { CourseRating as CourseRatingValue } from '@/modules/feedback/course-ratings';

// The participant rating shown on the catalogue card, the programme page and
// the home page, so a score can never read differently on the three.
//
// Renders NOTHING when there is no rating. That is the common case early in a
// course's life and it is deliberate: too few responses to be honest about is
// not the same as a bad score, and a "no rating yet" placeholder just draws the
// eye to an absence. See MIN_RATINGS_TO_PUBLISH.
//
// The response count always travels with the score. "4.8" alone is the part
// that misleads; "4.8 from 22 participants" is a claim a reader can weigh.

const STAR_PATH =
  'M12 2l2.9 6.3 6.8.8-5 4.7 1.3 6.8L12 17.4 5.9 20.6 7.2 13.8 2.2 9.1l6.8-.8z';

export function CourseRating({
  rating,
  size = 'sm',
}: {
  rating: CourseRatingValue | null;
  size?: 'sm' | 'lg';
}) {
  if (!rating) return null;

  const participants = `${rating.responses} participant${rating.responses === 1 ? '' : 's'}`;

  return (
    <div
      className={size === 'lg' ? 'rating rating-lg' : 'rating'}
      // One spoken label for the whole control. A screen reader announcing five
      // separate star glyphs and then a number tells the user nothing.
      role="img"
      aria-label={`Rated ${rating.average} out of 5 by ${participants}`}
    >
      <span className="stars" aria-hidden>
        {[1, 2, 3, 4, 5].map((position) => {
          // Fill each star by however much of it this score earns. Rounding to
          // the nearest whole star would draw five full stars beside the number
          // 4.5 — a picture that claims more than the data does.
          const fraction = Math.min(1, Math.max(0, rating.average - (position - 1)));
          return (
            <span key={position} className="star">
              <svg viewBox="0 0 24 24">
                <path d={STAR_PATH} />
              </svg>
              <span className="fill" style={{ width: `${fraction * 100}%` }}>
                <svg viewBox="0 0 24 24">
                  <path d={STAR_PATH} />
                </svg>
              </span>
            </span>
          );
        })}
      </span>
      <span className="score" aria-hidden>
        {rating.average.toFixed(1)}
      </span>
      <span className="count" aria-hidden>
        from {participants}
      </span>
    </div>
  );
}
