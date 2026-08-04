import { formatDate, formatGhs } from '@/lib/utils';
import type { PublicCatalogCourse, PublicCatalogSession } from '@/modules/courses/public-catalog';

// The upcoming-dates block, shared by the catalogue card and the programme
// detail page so a price or a seat count can never read differently on the
// two pages.
//
// Everything here is live from the database — the fee is the same
// effectiveCourseFee() the registration form uses, the early-bird deadline is
// a real cutoff date, and the seat count is real capacity minus real
// registrations. None of the urgency on this component is decorative, which
// is the only honest way to use it.

function SessionRow({ session }: { session: PublicCatalogSession }) {
  return (
    <div className="facts-row">
      <span className="when">{formatDate(session.startDate)}</span>
      <span className="meta">
        {session.startTime.slice(0, 5)} · {session.cohortLabel}
      </span>

      <span className="price">
        {session.isFree ? (
          <span style={{ color: 'var(--success)' }}>Free</span>
        ) : session.earlyBirdEndsOn ? (
          <>
            <span className="was">{formatGhs(session.listFee)}</span>
            {formatGhs(session.effectiveFee)}
          </>
        ) : (
          formatGhs(session.effectiveFee)
        )}
      </span>

      <span className="note">
        {session.isFull ? (
          <span className="hot">Fully booked — register to join the waiting list.</span>
        ) : (
          <>
            {session.earlyBirdEndsOn && (
              <span className="ok">
                Early-bird price until {formatDate(session.earlyBirdEndsOn)}.{' '}
              </span>
            )}
            {session.seatsRemaining !== null && session.seatsRemaining <= 5 && (
              <span className="hot">
                Only {session.seatsRemaining} place{session.seatsRemaining === 1 ? '' : 's'} left.{' '}
              </span>
            )}
            Facilitated by {session.facilitatorName}.
          </>
        )}
      </span>
    </div>
  );
}

export function CourseSessionSummary({
  course,
  showAll = false,
}: {
  course: PublicCatalogCourse;
  // Catalogue cards show the next two dates to stay scannable; the detail
  // page shows every upcoming session.
  showAll?: boolean;
}) {
  if (course.sessions.length === 0) {
    // Reachable only from the detail page — the catalogue filters these out
    // entirely (founder decision 2026-08-04: never advertise a programme with
    // no cohort open).
    return (
      <div className="facts">
        <p className="facts-empty">
          No cohort is currently open for registration on this programme.
        </p>
      </div>
    );
  }

  const visible = showAll ? course.sessions : course.sessions.slice(0, 2);
  const hidden = course.sessions.length - visible.length;

  return (
    <div className="facts">
      <p className="facts-head">
        {course.sessions.length === 1 ? 'Upcoming date' : 'Upcoming dates'}
      </p>
      {visible.map((session) => (
        <SessionRow key={session.batchId} session={session} />
      ))}
      {hidden > 0 && (
        <p className="facts-more">
          + {hidden} further date{hidden === 1 ? '' : 's'} available
        </p>
      )}
    </div>
  );
}
