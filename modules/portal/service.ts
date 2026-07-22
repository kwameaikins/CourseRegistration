// Student portal business rules (system review, 2026-07-22). See the
// participant_portal_auth migration header for why this is a fully custom
// session, not Supabase Auth.
import { hashPin, lastFourDigits, verifyPin } from '@/lib/portal-auth/pin';
import { AppError } from '@/lib/errors';
import * as portalRepository from '@/modules/portal/repository';
import * as paymentsRepository from '@/modules/payments/repository';
import type {
  PortalChangePinInput,
  PortalDashboard,
  PortalExchangeLoginTokenResult,
  PortalLoginInput,
  PortalLoginResult,
} from '@/modules/portal/types';

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

  const auth = await portalRepository.selectParticipantAuth(participant.id);
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

export async function getPortalDashboard(sessionId: string | undefined): Promise<PortalDashboard> {
  const { participantId } = await requirePortalSession(sessionId);
  const [data, auth] = await Promise.all([
    portalRepository.selectPortalDashboardData(participantId),
    portalRepository.selectParticipantAuth(participantId),
  ]);
  if (!data.participant) {
    throw new AppError('NOT_FOUND', 'Participant not found.', 404);
  }

  return {
    fullName: data.participant.full_name,
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
    })),
  };
}
