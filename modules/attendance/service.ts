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
import * as attendanceRepository from '@/modules/attendance/repository';
import * as communicationsService from '@/modules/communications/service';

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

// Staff-facing view (RLS enforces admin/management read access).
export async function getAttendanceForBatch(batchId: string) {
  const rows = await attendanceRepository.selectAttendanceForBatch(batchId);
  return rows.map((row) => ({
    registrationId: row.registration_id,
    participantName: row.participant_name,
    participantEmail: row.participant_email,
    sessionDate: row.session_date,
    joinTime: row.join_time,
    leaveTime: row.leave_time,
    durationMinutes: row.duration_minutes,
  }));
}
