// Public catalog API contract (2026-08-05) — the JSON shape knowsia.com
// (WordPress) consumes.
//
// Deliberately a SEPARATE layer from public-catalog.ts rather than serving
// that type directly. public-catalog.ts is the read model behind the portal's
// own pages and is free to change whenever those pages change; this file is a
// published contract another property depends on. Keeping them apart means a
// page tweak cannot silently break knowsia.com, and the mapping below is the
// one place to look when it must change on purpose.
//
// Everything here is already public — it is exactly what /programmes renders
// to anonymous visitors. No participant, registration, payment, or staff data
// is reachable through this shape, by construction: it is built only from
// PublicCatalogCourse, which itself reads courses, batches, and a registration
// COUNT.
import {
  getPublicCourseByCode,
  getPublicCourseCatalog,
  type PublicCatalogCourse,
  type PublicCatalogSession,
} from '@/modules/courses/public-catalog';
import type { CoursePublicContent } from '@/modules/courses/public-content';

// Fees are GHS throughout this business; stated explicitly so the consumer
// never has to infer it or hardcode a symbol.
const CURRENCY = 'GHS';

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'https://reg.knowsia.com';
}

export interface CatalogApiSession {
  batchId: string;
  cohortLabel: string;
  startDate: string;
  startTime: string;
  endDate: string;
  facilitatorName: string;
  isFree: boolean;
  listFee: number;
  effectiveFee: number;
  earlyBirdEndsOn: string | null;
  /** null means UNCAPPED, not zero. Render nothing, not "0 seats left". */
  seatsRemaining: number | null;
  isFull: boolean;
  /** 'full' still routes to the waitlist via /register — label it "Join waitlist". */
  status: 'open' | 'full';
  /**
   * Built here, not by the consumer. Registration is per-BATCH, and only this
   * app knows that /register takes ?batchId=. WordPress should link to this
   * verbatim rather than constructing URLs itself.
   */
  registerUrl: string;
}

export interface CatalogApiCourse {
  courseCode: string;
  courseName: string;
  /**
   * The programme's one-sentence promise (content.tagline).
   * NULL for any course with no founder-written marketing copy — the
   * consumer must handle that rather than assuming a string.
   */
  summary: string | null;
  /**
   * Absolute URL of the programme poster, or null when there is none.
   *
   * Absolute for exactly the reason registerUrl is: the consumer renders on a
   * different origin, and a relative '/programmes/erm1.webp' would resolve
   * against knowsia.com and 404. Built here so no consumer has to know where
   * this app hosts its images.
   *
   * The artwork is 3:4 portrait with the course title inside it. Consumers
   * showing this next to courseName should crop to the top ~37% (a 2:1 band of
   * icon and colour) so the title is not rendered twice.
   */
  heroImage: string | null;
  certificateHours: number;
  cpdCredit: string;
  currency: string;
  isFreeProgramme: boolean;
  /**
   * Averaged participant rating, or NULL when too few people have rated the
   * programme to publish one honestly (see MIN_RATINGS_TO_PUBLISH). Null is a
   * real state, not missing data — render nothing, never a zero or "no reviews".
   *
   * `responses` is not optional decoration. A consumer showing `average` must
   * show it too: "4.8" alone invites the reader to imagine hundreds.
   *
   * Google's structured-data policy only permits `aggregateRating` markup for a
   * rating that is VISIBLE on the same page. Emit the JSON-LD only where the
   * stars are actually rendered.
   */
  rating: { average: number; responses: number } | null;
  sessions: CatalogApiSession[];
}

/** Detail responses add the full marketing copy; list responses omit it to keep the payload small. */
export interface CatalogApiCourseDetail extends CatalogApiCourse {
  content: CoursePublicContent | null;
}

function toSession(session: PublicCatalogSession): CatalogApiSession {
  return {
    batchId: session.batchId,
    cohortLabel: session.cohortLabel,
    startDate: session.startDate,
    startTime: session.startTime,
    endDate: session.endDate,
    facilitatorName: session.facilitatorName,
    isFree: session.isFree,
    listFee: session.listFee,
    effectiveFee: session.effectiveFee,
    earlyBirdEndsOn: session.earlyBirdEndsOn,
    seatsRemaining: session.seatsRemaining,
    isFull: session.isFull,
    status: session.isFull ? 'full' : 'open',
    registerUrl: `${appUrl()}/register?batchId=${encodeURIComponent(session.batchId)}`,
  };
}

function toCourse(course: PublicCatalogCourse): CatalogApiCourse {
  return {
    courseCode: course.courseCode,
    courseName: course.courseName,
    summary: course.content?.tagline ?? null,
    heroImage: course.content?.heroImage ? `${appUrl()}${course.content.heroImage}` : null,
    certificateHours: course.certificateHours,
    cpdCredit: course.cpdCredit,
    currency: CURRENCY,
    isFreeProgramme: course.isFreeProgramme,
    rating: course.rating,
    sessions: course.sessions.map(toSession),
  };
}

/**
 * Every programme with at least one scheduled session.
 *
 * Same filter the portal's own /programmes page applies (founder decision
 * 2026-08-04): a programme with no cohort at all is clutter nobody can act
 * on. Note this filters on HAVING sessions, not on having OPEN ones — a
 * fully-booked programme still belongs in the catalogue, because /register
 * routes it to the waitlist.
 */
export async function getCatalogApiCourses(): Promise<CatalogApiCourse[]> {
  const catalog = await getPublicCourseCatalog();
  return catalog.filter((course) => course.sessions.length > 0).map(toCourse);
}

export async function getCatalogApiCourse(
  courseCode: string,
): Promise<CatalogApiCourseDetail | null> {
  const course = await getPublicCourseByCode(courseCode);
  if (!course || course.sessions.length === 0) return null;
  return { ...toCourse(course), content: course.content };
}
