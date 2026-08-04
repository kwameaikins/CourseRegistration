// Public course catalogue (founder-requested 2026-08-03) — the read behind
// /courses and /courses/[courseCode].
//
// Merges two sources that deliberately live apart: the founder's marketing
// copy (public-content.ts, version-controlled prose) and the live commercial
// facts (dates, fees, seats) that only the database knows. Nothing here is
// cached — the price and the seat count on a marketing page have to be the
// same ones the registration form will honour, and a stale "3 seats left" is
// worse than a slower page.
import { effectiveCourseFee } from '@/lib/utils';
import * as coursesRepository from '@/modules/courses/repository';
import {
  COURSE_PUBLIC_CONTENT,
  contentForCourseCode,
  type CoursePublicContent,
} from '@/modules/courses/public-content';

export interface PublicCatalogSession {
  batchId: string;
  cohortLabel: string;
  startDate: string;
  startTime: string;
  endDate: string;
  facilitatorName: string;
  isFree: boolean;
  // The fee a visitor would actually pay today — early-bird price while the
  // cutoff holds, list price after. Same helper the registration form and the
  // server-side fee copy use, so all three can never disagree.
  effectiveFee: number;
  listFee: number;
  // Set only while an early-registration discount is genuinely live, so the
  // page can show a real deadline instead of manufactured urgency.
  earlyBirdEndsOn: string | null;
  seatsRemaining: number | null;
  isFull: boolean;
}

export interface PublicCatalogCourse {
  courseCode: string;
  courseName: string;
  certificateHours: number;
  cpdCredit: string;
  content: CoursePublicContent | null;
  sessions: PublicCatalogSession[];
  nextSession: PublicCatalogSession | null;
  // True when every upcoming session is free — drives "Register for the free
  // webinar" wording and suppresses price copy on the card.
  isFreeProgramme: boolean;
}

// Courses the founder wrote copy for lead the page, in the order that copy
// declares; anything else follows alphabetically. Without this the catalogue
// would order by course_name and bury the flagship programme behind whatever
// happens to start with 'A'.
function contentRank(courseCode: string): number {
  const order = Object.keys(COURSE_PUBLIC_CONTENT);
  const index = order.indexOf(courseCode);
  return index === -1 ? order.length : index;
}

export async function getPublicCourseCatalog(): Promise<PublicCatalogCourse[]> {
  const rows = await coursesRepository.selectPublicCourseCatalogSystem();
  const registrationCounts = await coursesRepository.countRegistrationsByBatchIdsSystem(
    rows.flatMap((row) => row.batches.map((batch) => batch.id)),
  );
  const todayIso = new Date().toISOString().slice(0, 10);

  const courses = rows.map((row) => {
    const sessions: PublicCatalogSession[] = row.batches.map((batch) => {
      const listFee = Number(batch.course_fee);
      const discountedFee = batch.discounted_fee === null ? null : Number(batch.discounted_fee);
      const effectiveFee = effectiveCourseFee(
        {
          courseFee: listFee,
          discountCutoffDate: batch.discount_cutoff_date,
          discountedFee,
        },
        todayIso,
      );
      const registered = registrationCounts.get(batch.id) ?? 0;
      const seatsRemaining =
        batch.capacity === null ? null : Math.max(batch.capacity - registered, 0);

      return {
        batchId: batch.id,
        cohortLabel: batch.cohort_label,
        startDate: batch.start_date,
        startTime: batch.start_time,
        endDate: batch.end_date,
        facilitatorName: batch.facilitator_name,
        isFree: batch.is_free,
        effectiveFee,
        listFee,
        earlyBirdEndsOn: effectiveFee < listFee ? batch.discount_cutoff_date : null,
        seatsRemaining,
        isFull: seatsRemaining !== null && seatsRemaining <= 0,
      };
    });

    return {
      courseCode: row.course.course_code,
      courseName: row.course.course_name,
      certificateHours: row.course.certificate_hours,
      cpdCredit: row.course.cpd_credit,
      content: contentForCourseCode(row.course.course_code),
      sessions,
      // Prefer a session someone can still join; fall back to the soonest so a
      // fully-booked programme still shows a date and a waitlist route.
      nextSession: sessions.find((session) => !session.isFull) ?? sessions[0] ?? null,
      isFreeProgramme: sessions.length > 0 && sessions.every((session) => session.isFree),
    };
  });

  return courses.sort((a, b) => {
    const rankDiff = contentRank(a.courseCode) - contentRank(b.courseCode);
    if (rankDiff !== 0) return rankDiff;
    return a.courseName.localeCompare(b.courseName);
  });
}

export async function getPublicCourseByCode(
  courseCode: string,
): Promise<PublicCatalogCourse | null> {
  const catalog = await getPublicCourseCatalog();
  // Course codes are compared case-insensitively so a URL typed in lower case
  // (/courses/ai05) resolves the same as the canonical upper-case code.
  const wanted = courseCode.trim().toUpperCase();
  return catalog.find((course) => course.courseCode.toUpperCase() === wanted) ?? null;
}
