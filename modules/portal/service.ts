// Student portal business rules (system review, 2026-07-22). See the
// participant_portal_auth migration header for why this is a fully custom
// session, not Supabase Auth.
import { hashPin, lastFourDigits, verifyPin } from '@/lib/portal-auth/pin';
import { AppError } from '@/lib/errors';
import * as portalRepository from '@/modules/portal/repository';
import * as paymentsRepository from '@/modules/payments/repository';
// Permitted cross-module call (system review, 2026-07-24) — see
// renameExistingCertificates's doc comment: retroactively fixing the name
// on any certificate the participant already has, when they self-correct it.
import * as certificatesService from '@/modules/certificates/service';
// Permitted cross-module call, same posture as certificatesService above —
// the payment-plan setup/read lives in payments (the Payment aggregate's
// module); portal only verifies the registration belongs to this session
// before delegating (founder-approved 2026-07-24).
import * as paymentsService from '@/modules/payments/service';
// Permitted cross-module call (2026-07-26) — the "browse other courses"
// section reuses the exact same public-batch read the registration form
// uses; courses stays unaware the portal exists.
import * as coursesService from '@/modules/courses/service';
// Permitted cross-module call (2026-07-27) — feedback owns submission +
// the auto-issue-on-submit rule; portal only verifies the registration
// belongs to this session before delegating, same posture as
// paymentsService/communicationsService above.
import * as feedbackService from '@/modules/feedback/service';
// Permitted cross-module call (Tutor Portal Phase 4, 2026-07-31) —
// live-sessions owns session_materials (tutor-shared links); portal only
// verifies the registration belongs to this session before delegating,
// same posture as every other cross-module call in this file.
import * as liveSessionsService from '@/modules/live-sessions/service';
import type { SessionMaterial } from '@/modules/live-sessions/types';
// Permitted cross-module call (2026-08-04) — assignments owns the
// submission/grade tables; portal only verifies the registration belongs to
// this session before delegating, same posture as liveSessionsService above.
import * as assignmentsService from '@/modules/assignments/service';
import type {
  AssignmentSubmission,
  StudentAssignment,
  SubmitAssignmentInput,
} from '@/modules/assignments/types';
import type { ParsedUpload } from '@/lib/uploads';
// Permitted cross-module call (2026-08-02) — an existing student can
// self-serve "Refer & Earn" from their own portal login instead of the
// public application form; portal only resolves the participant before
// delegating, same posture as every other cross-module call in this file.
import * as partnersService from '@/modules/partners/service';
import type { RedeemCommissionCreditInput } from '@/modules/partners/types';
import { sendTransactionalEmail } from '@/lib/resend/client';
import { parsePaymentStatus } from '@/lib/domain/parsers';
import type {
  PortalChangePinInput,
  PortalDashboard,
  PortalExchangeLoginTokenResult,
  PortalForgotPinInput,
  PortalLoginInput,
  PortalLoginResult,
  PortalReceiptData,
  PortalResetPinInput,
  PortalSetUpInstallmentPlanInput,
  PortalUpdateNameInput,
  StudentStatusSummary,
} from '@/modules/portal/types';
import type { FeedbackSubmissionInput, FeedbackSubmissionResult } from '@/modules/feedback/types';
import type { PaymentSubmission, PaymentSubmissionInput } from '@/modules/payments/types';

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const LOGIN_TOKEN_DURATION_MS = 5 * 60 * 1000; // 5 minutes

// Called alongside every participant upsert (single + bulk-import
// registration) so every registrant always has portal access — idempotent,
// never overwrites an existing row, so a returning participant who already
// changed their PIN keeps it.
export async function ensureParticipantAuth(
  participantId: string,
  phone: string,
): Promise<void> {
  const initialPin = lastFourDigits(phone);
  if (!initialPin) return; // malformed phone data — nothing sane to seed
  await portalRepository.insertParticipantAuthIfMissing(participantId, hashPin(initialPin));
}

// One-off backfill for participants who registered before the portal
// existed — admin-triggered (see app/api/portal/admin/backfill-pins),
// idempotent so it's safe to re-run.
export async function backfillParticipantAuth(): Promise<{
  totalParticipants: number;
  seeded: number;
}> {
  const participants = await portalRepository.selectAllActiveParticipants();
  let seeded = 0;
  for (const participant of participants) {
    const existing = await portalRepository.selectParticipantAuth(participant.id);
    if (existing) continue;
    const pin = lastFourDigits(participant.phone);
    if (!pin) continue;
    await portalRepository.insertParticipantAuthIfMissing(participant.id, hashPin(pin));
    seeded++;
  }
  return { totalParticipants: participants.length, seeded };
}

// Every failure branch returns the same generic 'invalid' status — never
// reveals whether the identifier existed (no username enumeration).
export async function login(input: PortalLoginInput): Promise<PortalLoginResult> {
  const participant = await portalRepository.selectParticipantByIdentifier(input.identifier);
  if (!participant || participant.deleted_at !== null) {
    return { status: 'invalid' };
  }

  let auth = await portalRepository.selectParticipantAuth(participant.id);
  if (!auth) {
    await ensureParticipantAuth(participant.id, participant.phone);
    auth = await portalRepository.selectParticipantAuth(participant.id);
  }
  if (!auth) {
    return { status: 'invalid' };
  }

  if (auth.locked_until && new Date(auth.locked_until) > new Date()) {
    return { status: 'locked' };
  }

  if (!verifyPin(input.pin, auth.pin_hash)) {
    const nextFailedAttempts = auth.failed_attempts + 1;
    if (nextFailedAttempts >= LOCKOUT_THRESHOLD) {
      await portalRepository.recordFailedLogin(participant.id, {
        failed_attempts: 0,
        locked_until: new Date(Date.now() + LOCKOUT_DURATION_MS).toISOString(),
      });
      return { status: 'locked' };
    }
    await portalRepository.recordFailedLogin(participant.id, {
      failed_attempts: nextFailedAttempts,
      locked_until: null,
    });
    return { status: 'invalid' };
  }

  await portalRepository.recordSuccessfulLogin(participant.id);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
  const session = await portalRepository.insertSession(participant.id, expiresAt);
  return {
    status: 'ok',
    sessionId: session.id,
    expiresAt,
    mustChangePin: auth.must_change_pin,
  };
}

export async function requirePortalSession(
  sessionId: string | undefined,
): Promise<{ participantId: string }> {
  if (!sessionId) {
    throw new AppError('UNAUTHENTICATED', 'You must be signed in.', 401);
  }
  const session = await portalRepository.selectSession(sessionId);
  if (
    !session ||
    session.revoked_at !== null ||
    new Date(session.expires_at) <= new Date()
  ) {
    throw new AppError('UNAUTHENTICATED', 'Your session has expired. Please log in again.', 401);
  }
  return { participantId: session.participant_id };
}

export async function changePin(
  sessionId: string | undefined,
  input: PortalChangePinInput,
): Promise<void> {
  const { participantId } = await requirePortalSession(sessionId);
  const auth = await portalRepository.selectParticipantAuth(participantId);
  if (!auth || !verifyPin(input.currentPin, auth.pin_hash)) {
    throw new AppError('INVALID_PIN', 'Your current PIN is incorrect.', 400);
  }
  await portalRepository.updateParticipantPin(participantId, hashPin(input.newPin));
}

export async function logout(sessionId: string | undefined): Promise<void> {
  if (!sessionId) return;
  await portalRepository.revokeSession(sessionId);
}

// Portal auto-login (founder-approved 2026-07-22): minted only by the
// Paystack webhook when a self-serve payment transitions to Paid — the only
// Paid transition with a live browser waiting on the other end. Non-fatal
// by design; callers wrap this in a try/catch (a mint failure just means
// the participant falls back to the normal PIN login).
export async function issuePortalLoginToken(registrationId: string): Promise<void> {
  const participantId = await portalRepository.selectParticipantIdForRegistration(registrationId);
  if (!participantId) return; // defensive — should never happen post-payment
  const expiresAt = new Date(Date.now() + LOGIN_TOKEN_DURATION_MS).toISOString();
  await portalRepository.insertLoginToken(participantId, registrationId, expiresAt);
}

// Exchanges the Paystack checkout reference the browser generated for a
// real portal session. The reference is the browser's proof of ownership —
// it was never handed back by the server, so a third party who only knows a
// registrationId cannot reproduce it. 'pending' means either the payment
// hasn't been confirmed yet (webhook still in flight) or never will be;
// 'invalid' means the payment is Paid but there is no live token to redeem
// (expired, already consumed, or minting failed) — the participant can
// still use the normal PIN login.
export async function exchangeLoginToken(
  reference: string,
): Promise<PortalExchangeLoginTokenResult> {
  const payment = await paymentsRepository.selectPaymentSummaryByTransactionIdSystem(reference);
  if (!payment || payment.paymentStatus !== 'Paid') {
    return { status: 'pending' };
  }
  const consumed = await portalRepository.consumeLoginToken(payment.registrationId);
  if (!consumed) {
    return { status: 'invalid' };
  }
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
  const session = await portalRepository.insertSession(consumed.participantId, expiresAt);
  return { status: 'ok', sessionId: session.id, expiresAt };
}

// Self-service name correction (founder request, 2026-07-24; made
// retroactive per founder follow-up the same day): fixes the participant
// record, then also pushes the corrected name onto any certificate already
// issued to them. Safe to do after the fact because certificate PDFs are
// regenerated on demand from recipient_name, never stored (see
// lib/certificates/pdf.ts) — so correcting that column is enough to fix
// every future download and public verification page too, no reprint or
// staff involvement needed.
export async function updateName(
  sessionId: string | undefined,
  input: PortalUpdateNameInput,
): Promise<void> {
  const { participantId } = await requirePortalSession(sessionId);
  const fullName = [input.firstName, input.middleName, input.surname]
    .filter(Boolean)
    .join(' ');
  await portalRepository.updateParticipantName(participantId, {
    first_name: input.firstName,
    middle_name: input.middleName,
    surname: input.surname,
    full_name: fullName,
  });

  // Non-blocking: the participant record is already corrected regardless of
  // whether this second step succeeds.
  try {
    const registrationIds = await portalRepository.selectRegistrationIdsForParticipant(
      participantId,
    );
    await certificatesService.renameExistingCertificates(registrationIds, fullName);
  } catch (err) {
    console.error('[portal name update — retroactive certificate rename]', err);
  }
}

export async function getPortalDashboard(sessionId: string | undefined): Promise<PortalDashboard> {
  const { participantId } = await requirePortalSession(sessionId);
  const [data, auth] = await Promise.all([
    portalRepository.selectPortalDashboardData(participantId),
    portalRepository.selectParticipantAuth(participantId),
  ]);
  if (!data.participant) {
    throw new AppError('NOT_FOUND', 'Participant not found.', 404);
  }

  // Payment plan (founder-approved 2026-07-24) — per registration, empty
  // when none has been set up. A handful of registrations per participant
  // at most, so N calls here is simpler than threading a bulk fetch through
  // selectPortalDashboardData for what's still a rare feature.
  const installmentsByRegistrationId = new Map(
    await Promise.all(
      data.registrations.map(async (row) => {
        const installments = await paymentsService
          .getInstallmentsForRegistration(row.registration.id)
          .catch(() => []);
        return [row.registration.id, installments] as const;
      }),
    ),
  );

  return {
    fullName: data.participant.full_name,
    // Fallback for participants created before first_name/surname were
    // captured separately — the edit form still needs something to seed.
    firstName: data.participant.first_name ?? data.participant.full_name,
    middleName: data.participant.middle_name,
    surname: data.participant.surname ?? '',
    email: data.participant.email,
    phone: data.participant.phone,
    mustChangePin: auth?.must_change_pin ?? false,
    registrations: data.registrations.map((row) => ({
      registrationId: row.registration.id,
      courseName: row.course?.course_name ?? '',
      courseCode: row.course?.course_code ?? '',
      cohortLabel: row.batch?.cohort_label ?? '',
      registrationStatus: row.registration.registration_status,
      startDate: row.batch?.start_date ?? '',
      startTime: row.batch?.start_time ?? '',
      endDate: row.batch?.end_date ?? '',
      facilitatorName: row.batch?.facilitator_name ?? '',
      // Zoom link is only ever shown once payment is Paid — an Unpaid or
      // Part Payment registrant must not see the shared classroom link
      // (system review, 2026-07-22). Once Paid, personal join link
      // (individually registered on Zoom) takes priority over the course's
      // shared classroom link.
      zoomLink:
        row.payment?.payment_status === 'Paid'
          ? (row.zoomRegistrant?.join_url ?? row.batch?.zoom_link ?? null)
          : null,
      resourcesLink:
        row.payment?.payment_status === 'Paid' ? (row.batch?.resources_link ?? null) : null,
      // Free event / webinar: nothing was ever owed, so the portal hides the
      // fee, balance, receipt, installment-plan and payment-proof surfaces
      // rather than showing a row of zeros the participant has to interpret.
      isFree: row.batch?.is_free ?? false,
      paymentStatus: row.payment?.payment_status ?? 'Unpaid',
      courseFee: Number(row.payment?.course_fee ?? 0),
      originalFee: Number(row.payment?.original_fee ?? row.payment?.course_fee ?? 0),
      amountPaid: Number(row.payment?.amount_paid ?? 0),
      balance: Number(row.payment?.balance ?? 0),
      attendance: row.attendance.map((a) => ({
        sessionDate: a.session_date,
        joinTime: a.join_time,
        leaveTime: a.leave_time,
        durationMinutes: a.duration_minutes,
      })),
      certificates: row.certificates.map((c) => ({
        id: c.id,
        certificateNumber: c.certificate_number,
        issuedDate: c.issued_date,
        revoked: c.revoked,
      })),
      installments: (installmentsByRegistrationId.get(row.registration.id) ?? []).map((i) => ({
        installmentNumber: i.installmentNumber,
        amountDue: i.amountDue,
        amountPaid: i.amountPaid,
        dueDate: i.dueDate,
        paymentStatus: i.paymentStatus,
      })),
      feedbackSubmitted: row.feedbackSubmitted,
    })),
  };
}

// Simple fixed-split payment plan (founder-approved 2026-07-24) — verifies
// the registration belongs to the requesting participant (never trusts a
// client-supplied registrationId blindly) using the same dashboard read
// already used to render the portal, then delegates the money logic to
// paymentsService.
export async function setUpInstallmentPlan(
  sessionId: string | undefined,
  input: PortalSetUpInstallmentPlanInput,
): Promise<void> {
  const { participantId } = await requirePortalSession(sessionId);
  const data = await portalRepository.selectPortalDashboardData(participantId);
  const match = data.registrations.find((row) => row.registration.id === input.registrationId);
  if (!match || !match.batch || !match.payment) {
    throw new AppError('NOT_FOUND', 'Registration not found.', 404);
  }

  await paymentsService.setUpTwoInstallmentPlan(input.registrationId, {
    courseFee: Number(match.payment.course_fee),
    batchStartDate: match.batch.start_date,
  });
}

// Self-service payment submission (founder-requested 2026-08-01) — same
// "never trust a client-supplied registrationId blindly" posture as
// setUpInstallmentPlan above: the registration must appear in this session's
// own dashboard data before anything is submitted.
export async function submitPaymentProof(
  sessionId: string | undefined,
  input: PaymentSubmissionInput,
  slip?: { buffer: Buffer; contentType: string; extension: string },
): Promise<PaymentSubmission> {
  const { participantId } = await requirePortalSession(sessionId);
  const data = await portalRepository.selectPortalDashboardData(participantId);
  const match = data.registrations.find((row) => row.registration.id === input.registrationId);
  if (!match) {
    throw new AppError('NOT_FOUND', 'Registration not found.', 404);
  }

  return paymentsService.submitPaymentProofSystem(input, slip);
}

export async function listMyPaymentSubmissions(
  sessionId: string | undefined,
  registrationId: string,
): Promise<PaymentSubmission[]> {
  const { participantId } = await requirePortalSession(sessionId);
  const data = await portalRepository.selectPortalDashboardData(participantId);
  const match = data.registrations.find((row) => row.registration.id === registrationId);
  if (!match) {
    throw new AppError('NOT_FOUND', 'Registration not found.', 404);
  }

  return paymentsService.listMyPaymentSubmissionsSystem(registrationId);
}

// --- Self-serve referral partner (founder-approved 2026-08-02) — an
// existing student becomes an Ambassador immediately from their own portal
// login, no separate application/approval step, unlike the public form. ---

export async function becomeAmbassadorPartner(sessionId: string | undefined) {
  const { participantId } = await requirePortalSession(sessionId);
  const data = await portalRepository.selectPortalDashboardData(participantId);
  if (!data.participant) {
    throw new AppError('NOT_FOUND', 'Participant not found.', 404);
  }
  return partnersService.ensurePartnerForParticipantSystem(
    participantId,
    data.participant.full_name,
    data.participant.phone,
    data.participant.email,
  );
}

export async function getReferralSummaryForSession(sessionId: string | undefined) {
  const { participantId } = await requirePortalSession(sessionId);
  return partnersService.getReferralSummaryForParticipant(participantId);
}

// Redeem the student's own 'payable' commission balance as course-fee
// credit — their own registration, OR a referred student's (the target
// registration doesn't have to belong to this session; only the commissions
// being spent have to belong to this partner, enforced in
// modules/payments/service.ts's redeemCommissionCreditSystem).
export async function redeemCommissionCreditForSession(
  sessionId: string | undefined,
  input: RedeemCommissionCreditInput,
) {
  const { participantId } = await requirePortalSession(sessionId);
  const partner = await partnersService.getPartnerForParticipantSystem(participantId);
  if (!partner) {
    throw new AppError('NOT_FOUND', 'You are not set up as a referral partner yet.', 404);
  }
  return paymentsService.redeemCommissionCreditSystem(partner.id, input.commissionIds, {
    registrationId: input.targetRegistrationId,
    participantEmail: input.targetParticipantEmail,
  });
}

// Receipt (2026-07-26) — same "never trust a client-supplied registrationId
// blindly" posture as setUpInstallmentPlan above: the registration must
// appear in this session's own dashboard data before anything is returned.
function buildReceiptData(
  data: Awaited<ReturnType<typeof portalRepository.selectPortalDashboardData>>,
  registrationId: string,
): PortalReceiptData {
  const match = data.registrations.find((row) => row.registration.id === registrationId);
  if (!match || !match.payment || !match.course || !match.batch || !data.participant) {
    throw new AppError('NOT_FOUND', 'Registration not found.', 404);
  }
  return {
    participantName: data.participant.full_name,
    participantEmail: data.participant.email,
    courseName: match.course.course_name,
    cohortLabel: match.batch.cohort_label,
    courseFee: Number(match.payment.course_fee),
    amountPaid: Number(match.payment.amount_paid),
    balance: Number(match.payment.balance),
    paymentMethod: match.payment.payment_method,
    transactionId: match.payment.transaction_id,
    paymentDate: match.payment.payment_date,
    registrationId,
  };
}

export async function getReceiptData(
  sessionId: string | undefined,
  registrationId: string,
): Promise<PortalReceiptData> {
  const { participantId } = await requirePortalSession(sessionId);
  const data = await portalRepository.selectPortalDashboardData(participantId);
  return buildReceiptData(data, registrationId);
}

// Staff-facing equivalent of getReceiptData (Admin Assistant tools,
// 2026-07-27) — same data assembly, but resolves participantId from the
// registrationId directly instead of a portal session, since the caller
// is already staff-authorized by the calling agent tool's own trust
// check. Reuses selectParticipantIdForRegistration (existing, otherwise
// used for portal login tokens).
export async function getReceiptDataForStaff(registrationId: string): Promise<PortalReceiptData> {
  const participantId = await portalRepository.selectParticipantIdForRegistration(registrationId);
  if (!participantId) {
    throw new AppError('NOT_FOUND', 'Registration not found.', 404);
  }
  const data = await portalRepository.selectPortalDashboardData(participantId);
  return buildReceiptData(data, registrationId);
}

// One-shot staff lookup by email or phone (Admin Assistant tools,
// 2026-07-27) — reuses the exact dashboard data the student portal itself
// shows (selectPortalDashboardData), so this is never a second,
// independently-drifting source of truth. Richer than the voice-only
// lookup_customer tool (modules/voice/service.ts), which has no
// certificate data and returns unstructured text instead of JSON.
export async function getStudentStatusForStaff(identifier: string): Promise<StudentStatusSummary> {
  const participant = await portalRepository.selectParticipantByIdentifier(identifier);
  if (!participant || participant.deleted_at !== null) {
    throw new AppError('NOT_FOUND', 'No student found with that email or phone number.', 404);
  }
  const data = await portalRepository.selectPortalDashboardData(participant.id);
  if (!data.participant) {
    throw new AppError('NOT_FOUND', 'No student found with that email or phone number.', 404);
  }

  return {
    fullName: data.participant.full_name,
    email: data.participant.email,
    phone: data.participant.phone,
    registrations: data.registrations.map(({ registration, batch, course, payment, certificates }) => ({
      registrationId: registration.id,
      courseName: course?.course_name ?? '',
      courseCode: course?.course_code ?? '',
      cohortLabel: batch?.cohort_label ?? '',
      registrationStatus: registration.registration_status,
      paymentStatus: payment ? parsePaymentStatus(payment.payment_status) : 'Unpaid',
      courseFee: payment ? Number(payment.course_fee) : 0,
      amountPaid: payment ? Number(payment.amount_paid) : 0,
      balance: payment ? Number(payment.balance) : 0,
      certificates: certificates.map((c) => ({
        certificateNumber: c.certificate_number,
        issuedDate: c.issued_date,
        revoked: c.revoked,
      })),
    })),
  };
}

// In-portal feedback (2026-07-27) — same ownership check as
// getReceiptData, then delegates straight to
// feedbackService.submitFeedback (which also owns the certificate
// auto-issue rule) so submission logic has exactly one implementation
// regardless of which surface (public link, portal, voice) it's reached
// from.
export async function submitPortalFeedback(
  sessionId: string | undefined,
  registrationId: string,
  input: FeedbackSubmissionInput,
): Promise<FeedbackSubmissionResult> {
  const { participantId } = await requirePortalSession(sessionId);
  const data = await portalRepository.selectPortalDashboardData(participantId);
  const owns = data.registrations.some((row) => row.registration.id === registrationId);
  if (!owns) {
    throw new AppError('NOT_FOUND', 'Registration not found.', 404);
  }
  return feedbackService.submitFeedback(registrationId, input);
}

// Course materials (Tutor Portal Phase 4, founder-approved 2026-07-31) —
// same ownership check as getMessageHistory/getReceiptData, then delegates
// to live-sessions for the batch this registration belongs to.
export async function getSessionMaterials(
  sessionId: string | undefined,
  registrationId: string,
): Promise<SessionMaterial[]> {
  const { participantId } = await requirePortalSession(sessionId);
  const data = await portalRepository.selectPortalDashboardData(participantId);
  const match = data.registrations.find((row) => row.registration.id === registrationId);
  if (!match || !match.batch) {
    throw new AppError('NOT_FOUND', 'Registration not found.', 404);
  }
  return liveSessionsService.getSessionMaterialsForBatchSystem(match.batch.id);
}

// A presigned URL for a file-backed material (2026-08-04). Resolves the
// material's own batch first, then requires that batch to match one this
// session is actually registered in — a material id from another cohort
// therefore reads as 404, never as a download.
export async function getMaterialDownloadUrl(
  sessionId: string | undefined,
  registrationId: string,
  materialId: string,
): Promise<string> {
  const { participantId } = await requirePortalSession(sessionId);
  const data = await portalRepository.selectPortalDashboardData(participantId);
  const match = data.registrations.find((row) => row.registration.id === registrationId);
  if (!match || !match.batch) {
    throw new AppError('NOT_FOUND', 'Registration not found.', 404);
  }
  const material = await liveSessionsService.getSessionMaterialDownloadUrlSystem(materialId);
  if (material.batchId !== match.batch.id) {
    throw new AppError('NOT_FOUND', 'Material not found.', 404);
  }
  return material.url;
}

// --- Assignments (founder-requested 2026-08-04) — see the scope note in
// modules/assignments/service.ts. Same ownership posture as every other
// cross-module call in this file: portal proves the registration belongs to
// this session, then delegates. ---

export async function getAssignments(
  sessionId: string | undefined,
  registrationId: string,
): Promise<StudentAssignment[]> {
  const { participantId } = await requirePortalSession(sessionId);
  const data = await portalRepository.selectPortalDashboardData(participantId);
  const match = data.registrations.find((row) => row.registration.id === registrationId);
  if (!match || !match.batch) {
    throw new AppError('NOT_FOUND', 'Registration not found.', 404);
  }
  return assignmentsService.getAssignmentsForRegistrationSystem(match.batch.id, registrationId);
}

export async function submitAssignment(
  sessionId: string | undefined,
  input: SubmitAssignmentInput,
  file: ParsedUpload,
): Promise<AssignmentSubmission> {
  const { participantId } = await requirePortalSession(sessionId);
  const data = await portalRepository.selectPortalDashboardData(participantId);
  const match = data.registrations.find((row) => row.registration.id === input.registrationId);
  if (!match || !match.batch) {
    throw new AppError('NOT_FOUND', 'Registration not found.', 404);
  }

  // The registration is this session's, but the assignment must also belong
  // to that registration's own batch — otherwise a learner could submit
  // against another cohort's assignment using their own registration id.
  const assignment = await assignmentsService.getAssignmentByIdSystem(input.assignmentId);
  if (assignment.batchId !== match.batch.id) {
    throw new AppError('NOT_FOUND', 'Assignment not found.', 404);
  }

  return assignmentsService.submitAssignmentSystem({
    assignmentId: input.assignmentId,
    registrationId: input.registrationId,
    participantNotes: input.participantNotes ?? null,
    file,
  });
}

// A learner may only ever download their own submission back.
export async function getMySubmissionDownloadUrl(
  sessionId: string | undefined,
  registrationId: string,
  submissionId: string,
): Promise<string> {
  const { participantId } = await requirePortalSession(sessionId);
  const data = await portalRepository.selectPortalDashboardData(participantId);
  const match = data.registrations.find((row) => row.registration.id === registrationId);
  if (!match) {
    throw new AppError('NOT_FOUND', 'Registration not found.', 404);
  }
  const submission = await assignmentsService.getSubmissionByIdSystem(submissionId);
  if (submission.registrationId !== registrationId) {
    throw new AppError('NOT_FOUND', 'Submission not found.', 404);
  }
  const target = await assignmentsService.getSubmissionDownloadUrlSystem(submissionId);
  return target.url;
}

// Browse other courses (2026-07-26) — reuses the exact same public-batch
// read the registration form uses, filtered to exclude batches this
// participant is already registered in.
export async function getOtherCourses(sessionId: string | undefined) {
  const { participantId } = await requirePortalSession(sessionId);
  const data = await portalRepository.selectPortalDashboardData(participantId);
  const registeredBatchIds = new Set(data.registrations.map((row) => row.registration.batch_id));
  const batches = await coursesService.getActiveBatchesForPublicForm();
  return batches.filter((batch) => !registeredBatchIds.has(batch.batchId));
}

const PIN_RESET_TOKEN_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL ?? 'https://reg.knowsia.com';

// Forgot-PIN (2026-07-26) — the one genuinely new security-sensitive flow.
// Always returns void regardless of whether the identifier matched anything
// — same no-enumeration posture as login's failure branches. Email only
// (not SMS): free via Resend and already the primary channel for every
// other participant communication, unlike per-send-cost SMS.
export async function requestPinReset(input: PortalForgotPinInput): Promise<void> {
  const participant = await portalRepository.selectParticipantByIdentifier(input.identifier);
  if (!participant || participant.deleted_at !== null) return;

  const expiresAt = new Date(Date.now() + PIN_RESET_TOKEN_DURATION_MS).toISOString();
  const token = await portalRepository.insertPinResetToken(participant.id, expiresAt);

  try {
    await sendTransactionalEmail({
      to: participant.email,
      subject: 'Reset your Knowsia portal PIN',
      html: `
<p>Dear ${participant.full_name},</p>
<p>We received a request to reset your student portal PIN. Click below to set a new one —
this link works once and expires in 15 minutes:</p>
<p style="margin:24px 0;"><a href="${APP_URL()}/portal/reset-pin?token=${token.id}" style="background:#4B21A8;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Reset my PIN</a></p>
<p>If you didn't request this, you can safely ignore this email — your PIN will not change.</p>`,
    });
  } catch (err) {
    console.error('[portal forgot-pin email]', err);
  }
}

// Resetting the PIN also clears any lockout — this is the only self-service
// path back into an account for someone who both forgot their PIN AND is
// currently locked out, since there is no other recovery mechanism today.
export async function resetPin(input: PortalResetPinInput): Promise<void> {
  const consumed = await portalRepository.consumePinResetToken(input.token);
  if (!consumed) {
    throw new AppError('INVALID_TOKEN', 'This reset link is invalid or has expired.', 400);
  }
  await portalRepository.updateParticipantPin(consumed.participantId, hashPin(input.newPin));
  await portalRepository.clearLockout(consumed.participantId);
}
