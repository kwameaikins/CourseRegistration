// Time-boxed course access for an unsettled balance (founder-approved
// 2026-08-08). See 202608080053_access_grants.sql for why this is a separate
// concept rather than a discount or a fabricated payment.
//
// Dependency direction is deliberately one-way: payments/service.ts imports
// THIS module (to auto-grant on a part payment); this module never imports
// payments. It reads the little payment context it needs through its own
// repository instead. Everything else it calls — users, communications,
// attendance — is already downstream of payments, so no cycle exists.
import { AppError } from '@/lib/errors';
import { denyMeetingRegistrant, isZoomConfigured } from '@/lib/zoom/client';
import * as accessGrantsRepository from '@/modules/access-grants/repository';
import * as usersService from '@/modules/users/service';
// Imported from the engine rather than modules/communications/service on
// purpose: that barrel also re-exports reminder-scheduler, which imports
// payments/service, which imports this module. Reaching for the engine
// directly keeps this module out of that import cycle entirely.
import { sendEmailOnce } from '@/modules/communications/email-engine';
import * as attendanceService from '@/modules/attendance/service';
import * as attendanceRepository from '@/modules/attendance/repository';
import { insertStaffActionAuditLog } from '@/modules/agent-tools/repository';
import {
  ACCESS_EXPIRY_WARNING_LEAD_DAYS,
  DEFAULT_ACCESS_GRANT_DAYS,
  FINANCE_MAX_CUMULATIVE_ACCESS_DAYS,
  AUTO_GRANT_MIN_PAID_FRACTION,
  type AccessGrant,
  type AccessGrantReason,
  type AccessSweepSummary,
  type AccessState,
  type GrantAccessInput,
} from '@/modules/access-grants/types';
import type { AccessGrantRow } from '@/modules/access-grants/repository';

const DAY_MS = 24 * 60 * 60 * 1000;

// Ghana is UTC+0 year-round, so the UTC date IS the local date — the same
// assumption BR-17 already rests on for the reminder cron.
export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function addDaysIso(fromIso: string, days: number): string {
  return new Date(new Date(`${fromIso}T00:00:00Z`).getTime() + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

export function daysBetweenIso(fromIso: string, toIso: string): number {
  return Math.round(
    (new Date(`${toIso}T00:00:00Z`).getTime() - new Date(`${fromIso}T00:00:00Z`).getTime()) /
      DAY_MS,
  );
}

// The gate itself, extracted as a pure function so it is directly unit-
// testable — the same reasoning as isWithinJoinWindow in
// modules/live-sessions/portal-access.ts. expires_on is the INCLUSIVE last
// day, and ISO dates compare correctly as strings.
export function isGrantActiveOn(expiresOn: string, onIso: string): boolean {
  return expiresOn >= onIso;
}

// Resolves one registration's access from the two things that can produce it.
// A settled balance wins and never expires; otherwise the latest live grant
// decides. Deliberately takes plain data so callers can batch their queries.
export function resolveAccessState(
  isSettled: boolean,
  liveGrants: Array<{ expiresOn: string; reason: AccessGrantReason }>,
  onIso: string,
): AccessState {
  if (isSettled) return { hasAccess: true, until: null, reason: null };

  const active = liveGrants
    .filter((grant) => isGrantActiveOn(grant.expiresOn, onIso))
    .sort((a, b) => (a.expiresOn < b.expiresOn ? 1 : -1))[0];
  if (!active) return { hasAccess: false, until: null, reason: null };
  return { hasAccess: true, until: active.expiresOn, reason: active.reason };
}

function toAccessGrant(row: AccessGrantRow, grantedByName: string | null): AccessGrant {
  return {
    id: row.id,
    registrationId: row.registration_id,
    reason: row.reason as AccessGrantReason,
    expiresOn: row.expires_on,
    note: row.note,
    grantedByName,
    grantedAt: row.granted_at,
    revokedAt: row.revoked_at,
  };
}

// --- Access evaluation (called by the gates) ---

// Batched: one grants query and one payments query for the whole set, so the
// portal dashboard's per-registration rendering costs nothing extra.
export async function getAccessStatesSystem(
  registrationIds: string[],
  now: Date = new Date(),
): Promise<Map<string, AccessState>> {
  const states = new Map<string, AccessState>();
  if (registrationIds.length === 0) return states;

  const onIso = todayIso(now);
  const [grants, settledIds] = await Promise.all([
    accessGrantsRepository.selectLiveGrantsForRegistrationsSystem(registrationIds),
    accessGrantsRepository.selectSettledRegistrationIdsSystem(registrationIds),
  ]);

  const grantsByRegistration = new Map<
    string,
    Array<{ expiresOn: string; reason: AccessGrantReason }>
  >();
  for (const grant of grants) {
    const list = grantsByRegistration.get(grant.registration_id) ?? [];
    list.push({ expiresOn: grant.expires_on, reason: grant.reason as AccessGrantReason });
    grantsByRegistration.set(grant.registration_id, list);
  }

  for (const registrationId of registrationIds) {
    states.set(
      registrationId,
      resolveAccessState(
        settledIds.has(registrationId),
        grantsByRegistration.get(registrationId) ?? [],
        onIso,
      ),
    );
  }
  return states;
}

export async function getAccessStateSystem(
  registrationId: string,
  now: Date = new Date(),
): Promise<AccessState> {
  const states = await getAccessStatesSystem([registrationId], now);
  return states.get(registrationId) ?? { hasAccess: false, until: null, reason: null };
}

// --- Granting ---

// The joining details a newly-admitted student needs. Deliberately NOT
// payments' runSettledEnrollmentSideEffects: that also marks the sales
// opportunity Won and the lead Enrolled, and a grant is not a win — the money
// has not arrived and may never. Commission accrual and the payment receipt
// are likewise absent, for the same reason.
//
// Every step is independently non-blocking: the grant row has already
// committed by the time this runs, and one channel failing must not sink the
// others.
async function runGrantedAccessSideEffects(
  registrationId: string,
  expiresOn: string,
): Promise<void> {
  // Zoom FIRST, deliberately. selectRegistrationEmailContext resolves
  // {{zoom_link}} to the personal join URL when a zoom_registrants row
  // exists and falls back to the batch's shared link otherwise — so
  // registering before sending is what puts the student's own link in the
  // email rather than a generic one. (runSettledEnrollmentSideEffects in
  // payments has the opposite order for historical reasons; its
  // payment_confirmation template is followed by a separate zoom_link send.)
  //
  // Idempotent: the zoom_registrants unique constraint short-circuits a
  // repeat call, so an extension landing here again is harmless.
  try {
    await attendanceService.ensureZoomRegistration(registrationId);
  } catch (err) {
    console.error('[access grant zoom registration]', err);
  }
  try {
    await sendEmailOnce(registrationId, 'access_granted', {
      access_expires_on: expiresOn,
    });
  } catch (err) {
    console.error('[access_granted email]', err);
  }
  // Same WhatsApp group invite a settled registration gets — the group is
  // where class logistics happen, and holding it back would defeat the point
  // of letting them in at all.
  try {
    await sendEmailOnce(registrationId, 'whatsapp_invite');
  } catch (err) {
    console.error('[access grant whatsapp_invite email]', err);
  }
}

async function insertGrantAndOpenAccess(params: {
  registrationId: string;
  reason: AccessGrantReason;
  expiresOn: string;
  note: string;
  grantedBy: string | null;
}): Promise<AccessGrantRow> {
  const row = await accessGrantsRepository.insertGrantSystem({
    registration_id: params.registrationId,
    reason: params.reason,
    expires_on: params.expiresOn,
    note: params.note,
    granted_by: params.grantedBy,
  });

  // Confirms the seat so the tutor roster, headcount and class reminders see
  // them. Non-blocking: the grant itself is what the access gates read, and
  // this column is only the roster-side convenience (see the repository's
  // note on why the two are separate).
  try {
    await accessGrantsRepository.confirmRegistrationSystem(params.registrationId);
  } catch (err) {
    console.error('[access grant registration confirm]', err);
  }

  await runGrantedAccessSideEffects(params.registrationId, params.expiresOn);
  return row;
}

// Shared eligibility check. A grant only makes sense against a real,
// unsettled, fee-bearing registration.
async function requireGrantableRegistration(registrationId: string): Promise<void> {
  const context = await accessGrantsRepository.selectPaymentContextSystem(registrationId);
  if (!context) {
    throw new AppError('NOT_FOUND', 'No payment record exists for this registration.', 404);
  }
  if (context.batchIsFree) {
    throw new AppError(
      'VALIDATION_ERROR',
      'This is a free event — everyone registered already has access.',
      400,
    );
  }
  if (context.paymentStatus === 'Paid') {
    throw new AppError(
      'VALIDATION_ERROR',
      'This balance is already settled — access does not need granting.',
      400,
    );
  }
}

export async function grantAccessAsStaff(
  registrationId: string,
  input: GrantAccessInput,
  now: Date = new Date(),
): Promise<AccessGrant> {
  const staffUser = await usersService.requireRole(['finance', 'admin']);
  await requireGrantableRegistration(registrationId);

  const today = todayIso(now);
  const expiresOn =
    input.expiresOn ?? addDaysIso(today, input.days ?? DEFAULT_ACCESS_GRANT_DAYS);
  if (expiresOn < today) {
    throw new AppError('VALIDATION_ERROR', 'The access end date is already in the past.', 400);
  }

  // Ceiling on finance's authority, measured as total span from the FIRST
  // live grant rather than per-grant — otherwise repeated short extensions
  // quietly add up to open-ended credit, which is an admin decision.
  const liveGrants = await accessGrantsRepository.selectLiveGrantsForRegistrationsSystem([
    registrationId,
  ]);
  if (staffUser.role !== 'admin') {
    const anchorIso = liveGrants.length
      ? liveGrants
          .map((grant) => grant.granted_at.slice(0, 10))
          .sort()[0]
      : today;
    const totalDays = daysBetweenIso(anchorIso, expiresOn);
    if (totalDays > FINANCE_MAX_CUMULATIVE_ACCESS_DAYS) {
      throw new AppError(
        'FORBIDDEN',
        `That would put this registration on ${totalDays} days of access. Finance can grant up to ${FINANCE_MAX_CUMULATIVE_ACCESS_DAYS} days in total — ask an admin to extend further.`,
        403,
      );
    }
  }

  const row = await insertGrantAndOpenAccess({
    registrationId,
    reason: input.reason,
    expiresOn,
    note: input.note,
    grantedBy: staffUser.id,
  });

  try {
    await insertStaffActionAuditLog({
      actor_staff_id: staffUser.id,
      action_type: liveGrants.length ? 'extend_course_access' : 'grant_course_access',
      target_registration_id: registrationId,
      reason: input.note,
      details: { reason: input.reason, expiresOn, previousGrants: liveGrants.length },
    });
  } catch (err) {
    console.error('[access grant audit log]', err);
  }

  return toAccessGrant(row, staffUser.fullName);
}

export async function revokeAccessAsStaff(
  registrationId: string,
  note: string,
): Promise<{ revoked: number }> {
  const staffUser = await usersService.requireRole(['finance', 'admin']);
  const revoked = await accessGrantsRepository.revokeLiveGrantsSystem(
    registrationId,
    staffUser.id,
  );
  if (revoked === 0) {
    throw new AppError('NOT_FOUND', 'This registration has no access grant to revoke.', 404);
  }

  await withdrawAccessSystem(registrationId);

  try {
    await insertStaffActionAuditLog({
      actor_staff_id: staffUser.id,
      action_type: 'revoke_course_access',
      target_registration_id: registrationId,
      reason: note,
      details: { revokedGrants: revoked },
    });
  } catch (err) {
    console.error('[access revoke audit log]', err);
  }

  return { revoked };
}

export async function listGrantsForRegistration(
  registrationId: string,
): Promise<AccessGrant[]> {
  await usersService.requireRole(['finance', 'admin']);
  const rows = await accessGrantsRepository.selectGrantHistoryForRegistration(registrationId);
  const staffIds = [
    ...new Set(rows.map((row) => row.granted_by).filter((id): id is string => id !== null)),
  ];
  const namesById = await accessGrantsRepository.selectStaffNamesByIds(staffIds);
  return rows.map((row) =>
    toAccessGrant(row, row.granted_by ? (namesById.get(row.granted_by) ?? null) : null),
  );
}

// --- Automatic grant on a part payment ---

// Called from payments/service.ts whenever amount_paid moves and the balance
// is still open. Grants access once the student has put down at least
// AUTO_GRANT_MIN_PAID_FRACTION of the fee, and never a second time — a
// top-up that is still short of full payment must not silently extend the
// window, or someone could keep their access alive indefinitely by paying a
// few cedis every few days. Extending is a staff decision.
//
// Returns the grant it created, or null when nothing was warranted.
export async function autoGrantOnPartPaymentSystem(
  registrationId: string,
  now: Date = new Date(),
): Promise<AccessGrant | null> {
  const context = await accessGrantsRepository.selectPaymentContextSystem(registrationId);
  if (!context) return null;
  if (context.batchIsFree) return null;
  if (context.paymentStatus === 'Paid') return null;
  if (context.courseFee <= 0) return null;
  if (context.amountPaid / context.courseFee < AUTO_GRANT_MIN_PAID_FRACTION) return null;

  // Any grant already on file — live or revoked — means this registration has
  // had its automatic one. Deliberately checks HISTORY, not just live grants,
  // so a staff revocation is not undone by the next part payment.
  const history = await accessGrantsRepository.selectGrantHistoryForRegistrationSystem(
    registrationId,
  );
  if (history.length > 0) return null;

  const expiresOn = addDaysIso(todayIso(now), DEFAULT_ACCESS_GRANT_DAYS);
  const row = await insertGrantAndOpenAccess({
    registrationId,
    reason: 'part_payment',
    expiresOn,
    note: `Automatic: ${context.amountPaid.toFixed(2)} of ${context.courseFee.toFixed(2)} received, ${context.balance.toFixed(2)} outstanding.`,
    grantedBy: null,
  });
  return toAccessGrant(row, null);
}

// --- Expiry ---

// Closes out one registration's access: walks the seat back and kills the
// personal Zoom join link. The link is the part that genuinely matters — it
// lives in the student's inbox and keeps working long after the portal stops
// showing it, so "access expired" would otherwise mean nothing more than the
// portal being polite about it.
async function withdrawAccessSystem(registrationId: string): Promise<{ zoomRevoked: boolean }> {
  const settled = await accessGrantsRepository.selectSettledRegistrationIdsSystem([
    registrationId,
  ]);
  // Paid since the grant was made — they keep everything, on their own merit.
  if (settled.has(registrationId)) return { zoomRevoked: false };

  await accessGrantsRepository.unconfirmRegistrationSystem(registrationId);

  let zoomRevoked = false;
  if (isZoomConfigured()) {
    const registrant =
      await accessGrantsRepository.selectZoomRegistrantForRevocationSystem(registrationId);
    if (registrant) {
      await denyMeetingRegistrant({
        meetingId: registrant.meeting_id,
        registrantId: registrant.zoom_registrant_id,
        email: registrant.email,
      });
      // Drop the local row too, so a later grant re-registers cleanly.
      // addMeetingRegistrant keys on email and re-approves the same
      // registrant, so the student gets their link back on the same terms.
      await attendanceRepository.deleteZoomRegistrantByRegistration(registrationId);
      zoomRevoked = true;
    }
  }
  return { zoomRevoked };
}

// Daily sweep, run from the same cron as the reminder jobs.
//
// Note what this does NOT do: it is not what enforces expiry. The gates
// re-derive access from expires_on at read time, so a night when this fails
// to run costs a stale roster entry and a live Zoom link, not a portal that
// hands out classroom links to people whose access ran out.
export async function runAccessSweep(now: Date = new Date()): Promise<AccessSweepSummary> {
  const summary: AccessSweepSummary = {
    expiredEvaluated: 0,
    accessWithdrawn: 0,
    zoomRevoked: 0,
    warningsSent: 0,
    expiryNoticesSent: 0,
    errors: [],
  };

  const today = todayIso(now);
  const warnThrough = addDaysIso(today, ACCESS_EXPIRY_WARNING_LEAD_DAYS);
  const grants = await accessGrantsRepository.selectUnrevokedGrantsSystem();

  // Effective expiry per registration is the LATEST live grant — an extension
  // is a new row, so an older, already-lapsed row must not trigger a sweep.
  const effectiveExpiry = new Map<string, string>();
  for (const grant of grants) {
    const current = effectiveExpiry.get(grant.registration_id);
    if (!current || grant.expires_on > current) {
      effectiveExpiry.set(grant.registration_id, grant.expires_on);
    }
  }

  for (const [registrationId, expiresOn] of effectiveExpiry) {
    try {
      if (isGrantActiveOn(expiresOn, today)) {
        // Still live — warn if the end is in sight. Ranged rather than an
        // exact date match so a missed run still warns the next night.
        if (expiresOn <= warnThrough) {
          const outcome = await sendEmailOnce(registrationId, 'access_expiring', {
            access_expires_on: expiresOn,
          });
          if (outcome === 'sent') summary.warningsSent += 1;
        }
        continue;
      }

      summary.expiredEvaluated += 1;
      const { zoomRevoked } = await withdrawAccessSystem(registrationId);
      if (zoomRevoked) summary.zoomRevoked += 1;

      // Close the lapsed rows so tomorrow's sweep skips them. granted_by null
      // on the revoke: the system did this, not a person.
      await accessGrantsRepository.revokeLiveGrantsSystem(registrationId, null);
      summary.accessWithdrawn += 1;

      const outcome = await sendEmailOnce(registrationId, 'access_expired', {
        access_expires_on: expiresOn,
      });
      if (outcome === 'sent') summary.expiryNoticesSent += 1;
    } catch (err) {
      summary.errors.push(`${registrationId}: ${String(err)}`);
    }
  }

  return summary;
}
