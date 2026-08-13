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
// Assignments (2026-08-04) — modules/assignments owns the grade write, which
// Document 14 §3 explicitly forbids modules/live-sessions from doing.
import * as assignmentsService from '@/modules/assignments/service';
// A category='tutor' partner (Knowsia Growth Partner Programme, 2026-08-02)
// authenticates through this exact tutor_auth/tutor_sessions login, not a
// separate partner_auth row — see modules/partners/service.ts's
// loginToPartnerPortal, which rejects tutor-category partners outright.
import * as partnersService from '@/modules/partners/service';
// Commission-credit redemption (2026-08-02) — payments owns the fee
// mutation; see modules/payments/service.ts's redeemCommissionCreditSystem.
import * as paymentsService from '@/modules/payments/service';
import type { ParsedUpload } from '@/lib/uploads';
import type { RedeemCommissionCreditInput } from '@/modules/partners/types';
import type {
  Assignment,
  AssignmentWithStats,
  CreateAssignmentInput,
  ReviewSubmissionInput,
  UpdateAssignmentInput,
} from '@/modules/assignments/types';
import type {
  AddTutorSessionMaterialInput,
  CreateTutorInput,
  FlagAttendanceExceptionInput,
  Tutor,
  TutorActivityEntry,
  TutorAssignmentSubmissionEntry,
  UploadTutorSessionMaterialInput,
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

// Read-only summary for the tutor portal's Referrals panel — null if this
// tutor has no linked partners row yet — auto-provisions one (+ a referral
// code) on first view instead, since every tutor automatically has
// affiliate capability through their existing account (the doc's own
// stated intent, 2026-08-02 follow-up).
export async function getReferralSummaryForSession(sessionId: string | undefined) {
  const { tutorId } = await requireTutorPortalSession(sessionId);
  const tutor = await tutorsRepository.selectTutorByIdSystem(tutorId);
  if (!tutor) return null;
  await partnersService.ensurePartnerForTutorSystem(tutorId, tutor.full_name, tutor.phone, tutor.email);
  return partnersService.getReferralSummaryForTutor(tutorId);
}

// Redeem the tutor's own 'payable' commission balance as course-fee credit
// (their own registration, or a referred student's) — see
// modules/payments/service.ts's redeemCommissionCreditSystem, which owns
// the actual fee mutation.
export async function redeemCommissionCreditForSession(
  sessionId: string | undefined,
  input: RedeemCommissionCreditInput,
) {
  const { tutorId } = await requireTutorPortalSession(sessionId);
  const partner = await partnersService.getPartnerForTutorSystem(tutorId);
  if (!partner) {
    throw new AppError('NOT_FOUND', 'You are not set up as a referral partner yet.', 404);
  }
  return paymentsService.redeemCommissionCreditSystem(partner.id, input.commissionIds, {
    registrationId: input.targetRegistrationId,
    participantEmail: input.targetParticipantEmail,
  });
}

// Admin-only, one-off (idempotent, safe to re-run) — provisions a partner
// record + referral code for every existing tutor who hasn't got one yet,
// same as the lazy per-visit auto-provision in getReferralSummaryForSession
// above, just run once for the whole existing roster instead of waiting for
// each tutor to open their Referrals panel (2026-08-02).
export async function backfillTutorPartners(): Promise<{
  totalTutors: number;
  provisioned: number;
}> {
  await usersService.requireRole(['admin']);
  const tutors = await tutorsRepository.selectTutors();
  let provisioned = 0;
  for (const tutor of tutors) {
    const existing = await partnersService.getPartnerForTutorSystem(tutor.id);
    if (existing) continue;
    await partnersService.ensurePartnerForTutorSystem(tutor.id, tutor.full_name, tutor.phone, tutor.email);
    provisioned++;
  }
  return { totalTutors: tutors.length, provisioned };
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
  const courseById = new Map(courses.map((row) => [row.id, row]));

  const batches: TutorPortalBatch[] = batchRows.map((row) => ({
    batchId: row.id,
    courseName: courseById.get(row.course_id)?.course_name ?? '',
    cohortLabel: row.cohort_label,
    startDate: row.start_date,
    endDate: row.end_date,
    // Falls back to the Course's classroom meeting, exactly as the student
    // portal does (2026-08-11). createBatch copies the course's zoom_link
    // onto the batch once at creation and never back-fills it, so a batch
    // created before its course had a meeting left the TUTOR with no link
    // either — and the tutor is who starts the class. Same null batch link
    // that hid the AI02 AUG-2026 cohort's Join button from its students.
    zoomLink: row.zoom_link ?? courseById.get(row.course_id)?.zoom_link ?? null,
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

// Visibility only — issuance stays admin-only.
//
// Every field is projected EXPLICITLY rather than returning
// getBatchIssueContextSystem's candidates verbatim (2026-08-13). The old
// pass-through made this payload whatever modules/certificates happened to
// return, so an amount added there for the staff Certificates screen would
// have reached tutors silently — BR-33 permits the settled/unsettled boolean
// but never a figure, and a spread cannot enforce that. Adding a field here is
// now a deliberate act. Pinned by tests/unit/tutor-payment-isolation.test.ts.
export async function getCertificateEligibilityForBatch(
  sessionId: string | undefined,
  batchId: string,
): Promise<TutorPortalCertificateCandidate[]> {
  await requireOwnBatch(sessionId, batchId);
  const context = await certificatesService.getBatchIssueContextSystem(batchId);
  return (context?.candidates ?? []).map((candidate) => ({
    registrationId: candidate.registrationId,
    participantName: candidate.participantName,
    participantEmail: candidate.participantEmail,
    // Status, not a figure — founder decision on the 2026-08-13 review. It is
    // what makes an eligibility verdict legible on a paid Batch.
    paid: candidate.paid,
    feedbackSubmitted: candidate.feedbackSubmitted,
    attendancePercent: candidate.attendancePercent,
    alreadyIssued: candidate.alreadyIssued,
    eligible: candidate.eligible,
  }));
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

// --- Learning resource file uploads (founder-requested 2026-08-04) —
// completes what Document 14 §6 always specified ("Tutor ... upload
// materials"); the earlier link-only shape existed because no file storage
// was available before Cloudflare R2 landed on 2026-08-02. ---

export async function uploadMaterialForBatch(
  sessionId: string | undefined,
  input: UploadTutorSessionMaterialInput,
  file: ParsedUpload,
): Promise<SessionMaterial> {
  const tutorId = await requireOwnBatch(sessionId, input.batchId);
  const material = await liveSessionsService.uploadSessionMaterialFile({
    batchId: input.batchId,
    liveSessionId: input.liveSessionId ?? null,
    uploadedByTutorId: tutorId,
    title: input.title,
    file,
  });
  await logTutorAction(tutorId, 'material_uploaded', input.batchId, {
    title: input.title,
    fileName: file.fileName,
  });
  return material;
}

// Resolves the presigned URL only after confirming the material's own batch
// belongs to this tutor — never trusts the caller's batch claim, same as
// every other tutor-portal read.
export async function getMaterialDownloadUrl(
  sessionId: string | undefined,
  materialId: string,
): Promise<string> {
  const { tutorId } = await requireTutorPortalSession(sessionId);
  // Authorize BEFORE anything is signed (2026-08-13). This used to mint the
  // presigned URL first and then decide whether the caller was allowed it —
  // safe only because the throw came before the return.
  const batchId = await liveSessionsService.getSessionMaterialBatchIdSystem(materialId);
  const batch = await tutorsRepository.selectBatchForTutorSystem(batchId, tutorId);
  if (!batch) throw new AppError('NOT_FOUND', 'Material not found.', 404);
  const material = await liveSessionsService.getSessionMaterialDownloadUrlSystem(materialId);
  return material.url;
}

// --- Assignments (founder-requested 2026-08-04) — see the scope note in
// modules/assignments/service.ts. A tutor may only ever act on assignments
// belonging to their own batches. ---

// Every assignment-id-keyed action funnels through here: resolve the
// assignment, then prove its batch is this tutor's.
async function requireOwnAssignment(
  sessionId: string | undefined,
  assignmentId: string,
): Promise<{ tutorId: string; assignment: Assignment }> {
  const { tutorId } = await requireTutorPortalSession(sessionId);
  const assignment = await assignmentsService.getAssignmentByIdSystem(assignmentId);
  const batch = await tutorsRepository.selectBatchForTutorSystem(assignment.batchId, tutorId);
  if (!batch) throw new AppError('NOT_FOUND', 'Assignment not found.', 404);
  return { tutorId, assignment };
}

export async function getAssignmentsForBatch(
  sessionId: string | undefined,
  batchId: string,
): Promise<AssignmentWithStats[]> {
  await requireOwnBatch(sessionId, batchId);
  return assignmentsService.getAssignmentsForBatchSystem(batchId);
}

export async function createAssignmentForBatch(
  sessionId: string | undefined,
  input: CreateAssignmentInput,
): Promise<Assignment> {
  const tutorId = await requireOwnBatch(sessionId, input.batchId);
  const assignment = await assignmentsService.createAssignmentSystem(input, { tutorId });
  await logTutorAction(tutorId, 'assignment_created', input.batchId, { title: input.title });
  return assignment;
}

export async function updateAssignmentForTutor(
  sessionId: string | undefined,
  assignmentId: string,
  input: UpdateAssignmentInput,
): Promise<Assignment> {
  const { tutorId, assignment } = await requireOwnAssignment(sessionId, assignmentId);
  const updated = await assignmentsService.updateAssignmentSystem(assignmentId, input);
  await logTutorAction(tutorId, 'assignment_updated', assignment.batchId, { assignmentId });
  return updated;
}

export async function deleteAssignmentForTutor(
  sessionId: string | undefined,
  assignmentId: string,
): Promise<void> {
  const { tutorId, assignment } = await requireOwnAssignment(sessionId, assignmentId);
  await assignmentsService.deleteAssignmentSystem(assignmentId);
  await logTutorAction(tutorId, 'assignment_deleted', assignment.batchId, {
    assignmentId,
    title: assignment.title,
  });
}

// Merges the submissions (keyed by registrationId) against this batch's
// roster to attach learner names. Name/email only — BR-33 still holds, no
// payment field is ever joined in.
export async function getSubmissionsForAssignment(
  sessionId: string | undefined,
  assignmentId: string,
): Promise<TutorAssignmentSubmissionEntry[]> {
  const { assignment } = await requireOwnAssignment(sessionId, assignmentId);
  const [submissions, roster] = await Promise.all([
    assignmentsService.getSubmissionsForAssignmentSystem(assignmentId),
    tutorsRepository.selectRosterForBatchSystem(assignment.batchId),
  ]);
  const participantByRegistration = new Map(
    roster.map(({ registration, participant }) => [
      registration.id,
      { name: participant?.full_name ?? '[unavailable]', email: participant?.email ?? '' },
    ]),
  );
  return submissions.map((submission) => {
    const participant = participantByRegistration.get(submission.registrationId);
    return {
      submissionId: submission.id,
      registrationId: submission.registrationId,
      participantName: participant?.name ?? '[unavailable]',
      participantEmail: participant?.email ?? '',
      fileName: submission.fileName,
      fileSizeBytes: submission.fileSizeBytes,
      participantNotes: submission.participantNotes,
      submittedAt: submission.submittedAt,
      status: submission.status,
      grade: submission.grade,
      feedback: submission.feedback,
      reviewedAt: submission.reviewedAt,
    };
  });
}

export async function reviewSubmissionForTutor(
  sessionId: string | undefined,
  submissionId: string,
  input: ReviewSubmissionInput,
): Promise<void> {
  // Resolve the submission's assignment first, then prove that assignment's
  // batch is this tutor's — a submission id alone says nothing about who owns it.
  const submission = await assignmentsService.getSubmissionByIdSystem(submissionId);
  const { tutorId, assignment } = await requireOwnAssignment(sessionId, submission.assignmentId);
  await assignmentsService.reviewSubmissionSystem(submissionId, input, { tutorId });
  await logTutorAction(tutorId, 'assignment_submission_reviewed', assignment.batchId, {
    submissionId,
    grade: input.grade ?? null,
  });
}

export async function getSubmissionDownloadUrlForTutor(
  sessionId: string | undefined,
  submissionId: string,
): Promise<string> {
  const submission = await assignmentsService.getSubmissionByIdSystem(submissionId);
  await requireOwnAssignment(sessionId, submission.assignmentId);
  const target = await assignmentsService.getSubmissionDownloadUrlSystem(submissionId);
  return target.url;
}
