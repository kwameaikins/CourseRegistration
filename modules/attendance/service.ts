// Zoom attendance business rules (founder-approved 2026-07-19, "Option 2").
//
// Two entry points:
//   ensureZoomRegistration — called when a payment reaches Paid; registers
//     the Participant with the Batch's registration-required Zoom meeting,
//     stores the personal join link, and sends the zoom_link email.
//   runAttendanceSync — daily cron; pulls Zoom participant reports for
//     in-progress Batches and upserts attendance rows, matched by the
//     registered email (participants join via personal links, so the report
//     carries the exact email we registered).
import {
  addMeetingRegistrant,
  getPastMeetingParticipants,
  isZoomConfigured,
} from '@/lib/zoom/client';
import { AppError } from '@/lib/errors';
import * as attendanceRepository from '@/modules/attendance/repository';
import * as communicationsService from '@/modules/communications/service';
import * as usersService from '@/modules/users/service';

export type ZoomRegistrationOutcome =
  | 'registered'
  | 'already_registered'
  | 'skipped_not_configured'
  | 'skipped_no_meeting'
  | 'skipped_gated'
  | 'failed';

export interface AttendanceSyncSummary {
  date: string;
  batchesEvaluated: number;
  rowsUpserted: number;
  unmatchedParticipants: number;
  errors: string[];
}

export async function ensureZoomRegistration(
  registrationId: string,
): Promise<ZoomRegistrationOutcome> {
  if (!isZoomConfigured()) return 'skipped_not_configured';

  const context = await attendanceRepository.selectZoomContext(registrationId);
  if (!context || context.participantDeleted || !context.batchIsActive) {
    return 'skipped_gated';
  }
  if (!context.batchZoomMeetingId) return 'skipped_no_meeting';

  const existing = await attendanceRepository.selectZoomRegistrant(registrationId);
  if (existing) return 'already_registered';

  const { registrantId, joinUrl } = await addMeetingRegistrant({
    meetingId: context.batchZoomMeetingId,
    email: context.participantEmail,
    firstName: context.participantFirstName,
    lastName: context.participantSurname,
  });

  const inserted = await attendanceRepository.insertZoomRegistrant({
    registration_id: registrationId,
    zoom_registrant_id: registrantId,
    join_url: joinUrl,
  });
  if (inserted === 'duplicate') return 'already_registered';

  // Personal join link email (email type zoom_link; the engine substitutes
  // the personal link for {{zoom_link}} when a registrant row exists).
  // Email failure never fails the registration — the link is recoverable.
  try {
    await communicationsService.sendEmailOnce(registrationId, 'zoom_link');
  } catch (err) {
    console.error('[zoom_link email]', err);
  }

  return 'registered';
}

// Batch transfer support (system review, 2026-07-24), called from
// registrations/service.ts's transferRegistration — same cross-module
// posture as registrations calling portal's ensureParticipantAuth.
// ensureZoomRegistration on its own would short-circuit to
// 'already_registered' (a zoom_registrants row for this registration_id
// already exists, pointed at the OLD Batch's meeting) — clearing it first
// lets the fresh call register against whatever Batch the registration now
// points at.
export async function reregisterForZoomAfterTransfer(
  registrationId: string,
): Promise<ZoomRegistrationOutcome> {
  await attendanceRepository.deleteZoomRegistrantByRegistration(registrationId);
  return ensureZoomRegistration(registrationId);
}

export async function runAttendanceSync(now = new Date()): Promise<AttendanceSyncSummary> {
  const dateIso = now.toISOString().slice(0, 10);
  const summary: AttendanceSyncSummary = {
    date: dateIso,
    batchesEvaluated: 0,
    rowsUpserted: 0,
    unmatchedParticipants: 0,
    errors: [],
  };
  if (!isZoomConfigured()) return summary;

  const batches = await attendanceRepository.selectBatchesForAttendanceSync(dateIso);
  for (const batch of batches) {
    summary.batchesEvaluated += 1;
    try {
      const [participants, emailMap] = await Promise.all([
        getPastMeetingParticipants(batch.zoom_meeting_id),
        attendanceRepository.selectRegistrationEmailMap(batch.id),
      ]);

      // One participant can appear several times (drop and rejoin) —
      // aggregate per registration per session date.
      const aggregated = new Map<
        string,
        {
          registrationId: string;
          sessionDate: string;
          joinTime: string;
          leaveTime: string;
          durationSeconds: number;
        }
      >();
      for (const record of participants) {
        const registrationId = emailMap.get(record.email);
        if (!registrationId) {
          summary.unmatchedParticipants += 1;
          continue;
        }
        const sessionDate = record.joinTime.slice(0, 10) || dateIso;
        const key = `${registrationId}:${sessionDate}`;
        const entry = aggregated.get(key);
        if (entry) {
          entry.durationSeconds += record.durationSeconds;
          if (record.joinTime < entry.joinTime) entry.joinTime = record.joinTime;
          if (record.leaveTime > entry.leaveTime) entry.leaveTime = record.leaveTime;
        } else {
          aggregated.set(key, {
            registrationId,
            sessionDate,
            joinTime: record.joinTime,
            leaveTime: record.leaveTime,
            durationSeconds: record.durationSeconds,
          });
        }
      }

      for (const entry of aggregated.values()) {
        await attendanceRepository.upsertAttendance({
          registration_id: entry.registrationId,
          session_date: entry.sessionDate,
          join_time: entry.joinTime || null,
          leave_time: entry.leaveTime || null,
          duration_minutes: Math.round(entry.durationSeconds / 60),
        });
        summary.rowsUpserted += 1;
      }
    } catch (err) {
      summary.errors.push(`${batch.id}: ${String(err)}`);
    }
  }
  return summary;
}

function toAttendanceEntry(row: {
  registration_id: string;
  participant_name: string;
  participant_email: string;
  session_date: string;
  join_time: string | null;
  leave_time: string | null;
  duration_minutes: number;
}) {
  return {
    registrationId: row.registration_id,
    participantName: row.participant_name,
    participantEmail: row.participant_email,
    sessionDate: row.session_date,
    joinTime: row.join_time,
    leaveTime: row.leave_time,
    durationMinutes: row.duration_minutes,
  };
}

// Staff-facing view (RLS enforces admin/management read access).
export async function getAttendanceForBatch(batchId: string) {
  const rows = await attendanceRepository.selectAttendanceForBatch(batchId);
  return rows.map(toAttendanceEntry);
}

// Tutor-portal view — see selectAttendanceForBatchSystem's comment: a
// tutor-portal session carries no Supabase Auth session, so the RLS-gated
// read above returns nothing for these callers. Called only by
// modules/tutors, which has already verified batch ownership.
export async function getAttendanceForBatchSystem(batchId: string) {
  const rows = await attendanceRepository.selectAttendanceForBatchSystem(batchId);
  return rows.map(toAttendanceEntry);
}

// --- Attendance Exceptions (Tutor Portal Phase 4, founder-approved 2026-07-31) ---
//
// A tutor never writes to `attendance` directly (BR-34). A raised exception
// always starts 'pending'; only an admin's review can change attendance
// data, and only for 'correction_request' — 'no_show_flag' is advisory
// only (visible to staff, never mutates attendance).

const EXCEPTION_STAFF_ROLES = ['admin', 'management'] as const;

export interface RaiseAttendanceExceptionInput {
  registrationId: string;
  batchId: string;
  sessionDate: string;
  exceptionType: 'no_show_flag' | 'correction_request';
  reason: string;
  requestedPresent?: boolean;
  raisedByTutorId: string;
}

// Called only by modules/tutors, after it has verified the batch (and the
// registration's membership in that batch's roster) belongs to the calling
// tutor's own session.
export async function raiseAttendanceException(input: RaiseAttendanceExceptionInput) {
  if (input.exceptionType === 'correction_request' && input.requestedPresent === undefined) {
    throw new AppError(
      'VALIDATION_ERROR',
      'A correction request must say whether the participant should be marked present or absent.',
      400,
    );
  }
  const row = await attendanceRepository.insertAttendanceExceptionSystem({
    registration_id: input.registrationId,
    batch_id: input.batchId,
    session_date: input.sessionDate,
    exception_type: input.exceptionType,
    raised_by_tutor_id: input.raisedByTutorId,
    requested_present: input.requestedPresent ?? null,
    reason: input.reason,
  });
  return row;
}

export interface AttendanceExceptionView {
  id: string;
  registrationId: string;
  batchId: string;
  sessionDate: string;
  exceptionType: 'no_show_flag' | 'correction_request';
  requestedPresent: boolean | null;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
  participantName: string;
  participantEmail: string;
}

export async function listAttendanceExceptions(filters?: {
  status?: 'pending' | 'approved' | 'rejected';
}): Promise<AttendanceExceptionView[]> {
  await usersService.requireRole([...EXCEPTION_STAFF_ROLES]);
  const rows = await attendanceRepository.selectAttendanceExceptions(filters);
  const infoByRegistration = await attendanceRepository.selectParticipantInfoForRegistrations(
    rows.map((row) => row.registration_id),
  );
  return rows.map((row) => ({
    id: row.id,
    registrationId: row.registration_id,
    batchId: row.batch_id,
    sessionDate: row.session_date,
    exceptionType: row.exception_type as 'no_show_flag' | 'correction_request',
    requestedPresent: row.requested_present,
    reason: row.reason,
    status: row.status as 'pending' | 'approved' | 'rejected',
    reviewedAt: row.reviewed_at,
    reviewNote: row.review_note,
    createdAt: row.created_at,
    participantName: infoByRegistration.get(row.registration_id)?.name ?? '',
    participantEmail: infoByRegistration.get(row.registration_id)?.email ?? '',
  }));
}

export async function reviewAttendanceException(
  exceptionId: string,
  decision: 'approved' | 'rejected',
  reviewNote?: string,
): Promise<void> {
  const staffUser = await usersService.requireRole([...EXCEPTION_STAFF_ROLES]);
  const existing = await attendanceRepository.selectAttendanceExceptionById(exceptionId);
  if (!existing) {
    throw new AppError('NOT_FOUND', 'Attendance exception not found.', 404);
  }
  if (existing.status !== 'pending') {
    throw new AppError('VALIDATION_ERROR', 'This exception has already been reviewed.', 409);
  }

  if (decision === 'approved' && existing.exception_type === 'correction_request') {
    await attendanceRepository.applyManualAttendanceCorrection({
      registration_id: existing.registration_id,
      session_date: existing.session_date,
      present: existing.requested_present ?? false,
    });
  }

  await attendanceRepository.updateAttendanceExceptionById(exceptionId, {
    status: decision,
    reviewed_by: staffUser.id,
    reviewed_at: new Date().toISOString(),
    review_note: reviewNote ?? null,
  });
}
