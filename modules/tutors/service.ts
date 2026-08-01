// Tutor business rules (founder-approved 2026-07-27): tutors are external
// parties, not Knowsia staff. This module owns both the staff-facing
// management screen (create/list/edit tutors) AND the tutor portal's
// auth/dashboard data — same one-module-per-domain precedent as
// modules/corporate. See Coding Docs/16_Tutor_Operations.md.
import { hashPin, lastFourDigits, verifyPin } from '@/lib/portal-auth/pin';
import { AppError } from '@/lib/errors';
import * as tutorsRepository from '@/modules/tutors/repository';
import * as usersService from '@/modules/users/service';
// Permitted cross-module calls (read-only) — the tutor portal is just a
// differently-authorized caller of the exact same reads these modules
// already expose to their staff-facing consumers.
import * as attendanceService from '@/modules/attendance/service';
import * as certificatesService from '@/modules/certificates/service';
import * as liveSessionsService from '@/modules/live-sessions/service';
import type {
  AddTutorSessionMaterialInput,
  CreateTutorInput,
  FlagAttendanceExceptionInput,
  Tutor,
  TutorActivityEntry,
  TutorPortalAttendanceEntry,
  TutorPortalBatch,
  TutorPortalCertificateCandidate,
  TutorPortalChangePinInput,
  TutorPortalDashboard,
  TutorPortalLiveSession,
  TutorPortalLoginInput,
  TutorPortalLoginResult,
  TutorPortalRosterEntry,
  UpdateTutorContactInput,
  UpdateTutorInput,
} from '@/modules/tutors/types';
import type { SessionMaterial } from '@/modules/live-sessions/types';
import type { Database, Json } from '@/lib/supabase/database.types';

type TutorRow = Database['public']['Tables']['tutors']['Row'];

function toTutor(row: TutorRow): Tutor {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const STAFF_ROLES_MANAGE = ['admin', 'management'] as const;

// --- Tutor action audit log (Tutor Portal Phase 4, founder-approved
// 2026-07-31) — closes the gap where PIN changes and contact edits were
// completely unlogged. A write failure here must never fail the caller's
// actual action, same "best-effort, never block" posture as the tutor_auth
// provisioning in createTutor.
async function logTutorAction(
  tutorId: string,
  actionType: string,
  targetBatchId: string | null,
  details?: Json,
): Promise<void> {
  try {
    await tutorsRepository.insertTutorActionAuditLogSystem({
      tutor_id: tutorId,
      action_type: actionType,
      target_batch_id: targetBatchId,
      details,
    });
  } catch (err) {
    console.error('[tutors logTutorAction]', err);
  }
}

// --- Staff-facing CRUD (/tutors screen) ---

export async function listTutorsWithBatchCounts(): Promise<Array<Tutor & { batchCount: number }>> {
  await usersService.requireRole([...STAFF_ROLES_MANAGE]);
  const [tutorRows, links] = await Promise.all([
    tutorsRepository.selectTutors(),
    tutorsRepository.selectAllBatchFacilitatorLinksSystem(),
  ]);
  const countByTutor = new Map<string, number>();
  for (const link of links) {
    if (!link.facilitator_tutor_id) continue;
    countByTutor.set(link.facilitator_tutor_id, (countByTutor.get(link.facilitator_tutor_id) ?? 0) + 1);
  }
  return tutorRows.map((row) => ({ ...toTutor(row), batchCount: countByTutor.get(row.id) ?? 0 }));
}

// Read-only list for populating the tutor picker on the Courses/Live
// Sessions screens — both are already admin/management-only
// (lib/auth/roles.ts's ROLE_ROUTES), matching the tutors table's own RLS
// read policy exactly, so this never hits an RLS-empty-result surprise.
export async function listTutorsForPicker(): Promise<Tutor[]> {
  await usersService.requireRole([...STAFF_ROLES_MANAGE]);
  const rows = await tutorsRepository.selectTutors();
  return rows.map(toTutor);
}

export async function createTutor(input: CreateTutorInput): Promise<Tutor> {
  await usersService.requireRole([...STAFF_ROLES_MANAGE]);
  const row = await tutorsRepository.insertTutor(input);

  // Every tutor gets portal access from the moment they're created — same
  // "always seed, never overwrite" posture as ensureParticipantAuth/
  // createCompany. A seeding failure must not fail tutor creation.
  try {
    const initialPin = lastFourDigits(input.phone);
    if (initialPin) {
      await tutorsRepository.insertTutorAuthIfMissing(row.id, hashPin(initialPin));
    }
  } catch (err) {
    console.error('[tutors createTutor portal auth provision]', err);
  }

  return toTutor(row);
}

export async function updateTutor(id: string, input: UpdateTutorInput): Promise<Tutor> {
  await usersService.requireRole([...STAFF_ROLES_MANAGE]);
  const row = await tutorsRepository.updateTutorById(id, {
    ...(input.fullName !== undefined && { full_name: input.fullName }),
    ...(input.email !== undefined && { email: input.email }),
    ...(input.phone !== undefined && { phone: input.phone }),
  });
  return toTutor(row);
}

// --- Tutor portal auth (mirrors modules/corporate/service.ts's
// loginToCompanyPortal/requireCompanyPortalSession/changeCompanyPin
// exactly, scoped to tutor_id instead of company_id). Every failure branch
// returns the same generic 'invalid' status — no enumeration. ---

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export async function loginToTutorPortal(input: TutorPortalLoginInput): Promise<TutorPortalLoginResult> {
  const tutor = await tutorsRepository.selectTutorByEmailSystem(input.email.trim().toLowerCase());
  if (!tutor) return { status: 'invalid' };

  let auth = await tutorsRepository.selectTutorAuth(tutor.id);
  if (!auth) {
    const initialPin = lastFourDigits(tutor.phone);
    if (initialPin) {
      await tutorsRepository.insertTutorAuthIfMissing(tutor.id, hashPin(initialPin));
      auth = await tutorsRepository.selectTutorAuth(tutor.id);
    }
  }
  if (!auth) return { status: 'invalid' };

  if (auth.locked_until && new Date(auth.locked_until) > new Date()) {
    return { status: 'locked' };
  }

  if (!verifyPin(input.pin, auth.pin_hash)) {
    const nextFailedAttempts = auth.failed_attempts + 1;
    if (nextFailedAttempts >= LOCKOUT_THRESHOLD) {
      await tutorsRepository.recordFailedTutorLogin(tutor.id, {
        failed_attempts: 0,
        locked_until: new Date(Date.now() + LOCKOUT_DURATION_MS).toISOString(),
      });
      return { status: 'locked' };
    }
    await tutorsRepository.recordFailedTutorLogin(tutor.id, {
      failed_attempts: nextFailedAttempts,
      locked_until: null,
    });
    return { status: 'invalid' };
  }

  await tutorsRepository.recordSuccessfulTutorLogin(tutor.id);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
  const session = await tutorsRepository.insertTutorSession(tutor.id, expiresAt);
  return { status: 'ok', sessionId: session.id, expiresAt, mustChangePin: auth.must_change_pin };
}

export async function requireTutorPortalSession(
  sessionId: string | undefined,
): Promise<{ tutorId: string }> {
  if (!sessionId) {
    throw new AppError('UNAUTHENTICATED', 'You must be signed in.', 401);
  }
  const session = await tutorsRepository.selectTutorSession(sessionId);
  if (!session || session.revoked_at !== null || new Date(session.expires_at) <= new Date()) {
    throw new AppError('UNAUTHENTICATED', 'Your session has expired. Please log in again.', 401);
  }
  return { tutorId: session.tutor_id };
}

export async function changeTutorPin(
  sessionId: string | undefined,
  input: TutorPortalChangePinInput,
): Promise<void> {
  const { tutorId } = await requireTutorPortalSession(sessionId);
  const auth = await tutorsRepository.selectTutorAuth(tutorId);
  if (!auth || !verifyPin(input.currentPin, auth.pin_hash)) {
    throw new AppError('INVALID_PIN', 'Your current PIN is incorrect.', 400);
  }
  await tutorsRepository.updateTutorPin(tutorId, hashPin(input.newPin));
  await logTutorAction(tutorId, 'pin_changed', null);
}

export async function logoutOfTutorPortal(sessionId: string | undefined): Promise<void> {
  if (!sessionId) return;
  await tutorsRepository.revokeTutorSession(sessionId);
}

export async function updateTutorContact(
  sessionId: string | undefined,
  input: UpdateTutorContactInput,
): Promise<void> {
  const { tutorId } = await requireTutorPortalSession(sessionId);
  await tutorsRepository.updateTutorContactSystem(tutorId, {
    full_name: input.fullName,
    phone: input.phone,
  });
  await logTutorAction(tutorId, 'contact_updated', null, {
    fullName: input.fullName,
    phone: input.phone,
  });
}

// --- Staff-facing tutor activity (Tutor Portal Phase 4) ---

export async function listTutorActivity(): Promise<TutorActivityEntry[]> {
  await usersService.requireRole([...STAFF_ROLES_MANAGE]);
  const rows = await tutorsRepository.selectRecentTutorActionAuditLogSystem();
  const names = await tutorsRepository.selectTutorNamesByIdsSystem([
    ...new Set(rows.map((row) => row.tutor_id)),
  ]);
  const nameById = new Map(names.map((row) => [row.id, row.full_name]));
  return rows.map((row) => ({
    id: row.id,
    tutorId: row.tutor_id,
    tutorName: nameById.get(row.tutor_id) ?? '[unknown]',
    actionType: row.action_type,
    targetBatchId: row.target_batch_id,
    details: row.details,
    createdAt: row.created_at,
  }));
}

// --- Tutor portal dashboard data ---

export async function getTutorPortalDashboard(
  sessionId: string | undefined,
): Promise<TutorPortalDashboard> {
  const { tutorId } = await requireTutorPortalSession(sessionId);
  const [tutor, auth, batchRows] = await Promise.all([
    tutorsRepository.selectTutorByIdSystem(tutorId),
    tutorsRepository.selectTutorAuth(tutorId),
    tutorsRepository.selectBatchesForTutorSystem(tutorId),
  ]);
  if (!tutor) throw new AppError('NOT_FOUND', 'Tutor not found.', 404);

  const courseIds = [...new Set(batchRows.map((row) => row.course_id))];
  const [courses, registeredCounts] = await Promise.all([
    tutorsRepository.selectCoursesByIdsSystem(courseIds),
    tutorsRepository.selectRegisteredCountsForBatchesSystem(batchRows.map((row) => row.id)),
  ]);
  const courseNameById = new Map(courses.map((row) => [row.id, row.course_name]));

  const batches: TutorPortalBatch[] = batchRows.map((row) => ({
    batchId: row.id,
    courseName: courseNameById.get(row.course_id) ?? '',
    cohortLabel: row.cohort_label,
    startDate: row.start_date,
    endDate: row.end_date,
    zoomLink: row.zoom_link,
    registeredCount: registeredCounts.get(row.id) ?? 0,
  }));

  const liveSessionRows = await tutorsRepository.selectLiveSessionsForTutorSystem(
    tutorId,
    batchRows.map((row) => row.id),
  );
  const liveSessions: TutorPortalLiveSession[] = liveSessionRows.map((row) => ({
    id: row.id,
    batchId: row.batch_id,
    title: row.title,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
  }));

  return {
    fullName: tutor.full_name,
    email: tutor.email,
    phone: tutor.phone,
    mustChangePin: auth?.must_change_pin ?? false,
    batches,
    liveSessions,
  };
}

async function requireOwnBatch(sessionId: string | undefined, batchId: string): Promise<string> {
  const { tutorId } = await requireTutorPortalSession(sessionId);
  const batch = await tutorsRepository.selectBatchForTutorSystem(batchId, tutorId);
  if (!batch) throw new AppError('NOT_FOUND', 'Batch not found.', 404);
  return tutorId;
}

// Never trusts a client-supplied batchId — verifies it belongs to this
// tutor's own session first. Name/email/phone only, no payment fields ever
// selected (see selectRosterForBatchSystem's comment).
export async function getRosterForBatch(
  sessionId: string | undefined,
  batchId: string,
): Promise<TutorPortalRosterEntry[]> {
  await requireOwnBatch(sessionId, batchId);
  const rows = await tutorsRepository.selectRosterForBatchSystem(batchId);
  return rows.map(({ registration, participant }) => ({
    registrationId: registration.id,
    fullName: participant?.full_name ?? '[unavailable]',
    email: participant?.email ?? '',
    phone: participant?.phone ?? '',
    registrationStatus: registration.registration_status,
    registeredAt: registration.registered_at,
  }));
}

// Read-only in V1 — attendance stays exclusively cron/Zoom-sync-owned
// (Coding Docs/16_Tutor_Operations.md); this is the same shape
// modules/attendance/service.ts's getAttendanceForBatch already returns to
// staff, just re-scoped through the tutor's own session instead of RLS.
// Uses the ...System variant (not getAttendanceForBatch): a tutor-portal
// session carries no Supabase Auth session, so the RLS-gated staff read
// would silently return zero rows for these callers.
export async function getAttendanceForBatch(
  sessionId: string | undefined,
  batchId: string,
): Promise<TutorPortalAttendanceEntry[]> {
  await requireOwnBatch(sessionId, batchId);
  return attendanceService.getAttendanceForBatchSystem(batchId);
}

// Visibility only — issuance stays admin-only. Same shape
// modules/certificates/service.ts's getBatchIssueContext already returns
// to staff.
export async function getCertificateEligibilityForBatch(
  sessionId: string | undefined,
  batchId: string,
): Promise<TutorPortalCertificateCandidate[]> {
  await requireOwnBatch(sessionId, batchId);
  const context = await certificatesService.getBatchIssueContext(batchId);
  return context?.candidates ?? [];
}

// --- Attendance Exceptions (Tutor Portal Phase 4, founder-approved
// 2026-07-31) — a tutor never writes to `attendance` directly (BR-34); this
// raises a pending request that only an admin's review can act on. ---

export async function flagAttendanceException(
  sessionId: string | undefined,
  input: FlagAttendanceExceptionInput,
): Promise<void> {
  const tutorId = await requireOwnBatch(sessionId, input.batchId);
  const belongs = await tutorsRepository.selectRegistrationBelongsToBatchSystem(
    input.registrationId,
    input.batchId,
  );
  if (!belongs) {
    throw new AppError('NOT_FOUND', 'That participant is not on this batch’s roster.', 404);
  }
  await attendanceService.raiseAttendanceException({
    registrationId: input.registrationId,
    batchId: input.batchId,
    sessionDate: input.sessionDate,
    exceptionType: input.exceptionType,
    reason: input.reason,
    requestedPresent: input.requestedPresent,
    raisedByTutorId: tutorId,
  });
  await logTutorAction(tutorId, 'attendance_exception_raised', input.batchId, {
    exceptionType: input.exceptionType,
    sessionDate: input.sessionDate,
  });
}

// --- Session Materials (Tutor Portal Phase 4, founder-approved
// 2026-07-31) — link-based, not a file upload. ---

export async function getMaterialsForBatch(
  sessionId: string | undefined,
  batchId: string,
): Promise<SessionMaterial[]> {
  await requireOwnBatch(sessionId, batchId);
  return liveSessionsService.getSessionMaterialsForBatchSystem(batchId);
}

export async function addMaterialForBatch(
  sessionId: string | undefined,
  input: AddTutorSessionMaterialInput,
): Promise<SessionMaterial> {
  const tutorId = await requireOwnBatch(sessionId, input.batchId);
  const material = await liveSessionsService.addSessionMaterial({
    batchId: input.batchId,
    liveSessionId: input.liveSessionId ?? null,
    uploadedByTutorId: tutorId,
    title: input.title,
    link: input.link,
  });
  await logTutorAction(tutorId, 'material_added', input.batchId, { title: input.title });
  return material;
}

export async function removeMaterial(
  sessionId: string | undefined,
  materialId: string,
  batchId: string,
): Promise<void> {
  const tutorId = await requireOwnBatch(sessionId, batchId);
  await liveSessionsService.removeSessionMaterial(materialId, tutorId);
  await logTutorAction(tutorId, 'material_removed', batchId, { materialId });
}
