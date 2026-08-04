import { cn, formatDate, formatGhs } from '@/lib/utils';
import type { PublicCatalogCourse, PublicCatalogSession } from '@/modules/courses/public-catalog';

// The upcoming-dates block, shared by the catalogue card and the course detail
// page so a price or a seat count can never read differently on the two pages.
//
// Everything shown here is live from the database — the fee is the same
// effectiveCourseFee() the registration form and the server-side fee copy use,
// the early-bird deadline is a real cutoff date, and the seat count is a real
// capacity minus real registrations. Nothing on this component is decorative
// urgency.

function priceLabel(session: PublicCatalogSession): string {
  if (session.isFree) return 'Free';
  return formatGhs(session.effectiveFee);
}

export function CourseSessionSummary({
  course,
  className,
  showAll = false,
}: {
  course: PublicCatalogCourse;
  className?: string;
  // Catalogue cards show the next two dates to stay scannable; the detail page
  // shows every upcoming session.
  showAll?: boolean;
}) {
  if (course.sessions.length === 0) {
    return (
      <div className={cn('rounded-md border border-dashed p-4 text-sm', className)}>
        <p className="font-medium">Dates to be announced</p>
        <p className="mt-1 text-muted-foreground">
          This programme does not have a scheduled cohort open for registration yet.
        </p>
      </div>
    );
  }

  const visible = showAll ? course.sessions : course.sessions.slice(0, 2);
  const hidden = course.sessions.length - visible.length;

  return (
    <div className={cn('rounded-md border', className)}>
      <p className="border-b px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {course.sessions.length === 1 ? 'Upcoming date' : 'Upcoming dates'}
      </p>
      <ul className="divide-y">
        {visible.map((session) => (
          <li key={session.batchId} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3">
            <span className="font-medium">{formatDate(session.startDate)}</span>
            <span className="text-sm text-muted-foreground">
              {session.startTime.slice(0, 5)} · {session.cohortLabel}
            </span>

            <span className="ml-auto text-sm font-medium">
              {session.isFree ? (
                <span className="text-emerald-700">Free</span>
              ) : session.earlyBirdEndsOn ? (
                <>
                  <span className="font-normal text-muted-foreground line-through">
                    {formatGhs(session.listFee)}
                  </span>{' '}
                  <span className="text-emerald-700">{priceLabel(session)}</span>
                </>
              ) : (
                priceLabel(session)
              )}
            </span>

            <span className="w-full text-xs text-muted-foreground">
              {session.isFull ? (
                <span className="font-medium text-amber-600">
                  Fully booked — register to join the waiting list
                </span>
              ) : (
                <>
                  {session.earlyBirdEndsOn && (
                    <span className="text-emerald-700">
                      Early-bird price until {formatDate(session.earlyBirdEndsOn)}.{' '}
                    </span>
                  )}
                  {session.seatsRemaining !== null &&
                    session.seatsRemaining <= 5 &&
                    `Only ${session.seatsRemaining} place${session.seatsRemaining === 1 ? '' : 's'} left. `}
                  Facilitated by {session.facilitatorName}.
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <p className="border-t px-4 py-2 text-xs text-muted-foreground">
          + {hidden} further date{hidden === 1 ? '' : 's'} available
        </p>
      )}
    </div>
  );
}
