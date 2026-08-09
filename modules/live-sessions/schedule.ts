// Deriving a cohort's session schedule from its batch (founder direction
// 2026-08-08).
//
// Until now a LiveSession could only be created one at a time through the
// staff form. That is why, across six batches, only one had any sessions at
// all and four related tables had never received a row: nobody hand-enters
// twelve sessions per cohort. The student portal's "Next Class" card reads
// live_sessions, so five of six cohorts simply never saw it.
//
// A batch already states everything a schedule needs — start_date, end_date,
// start_time, and (since 202608080056) end_time and meeting_days. Sessions
// are therefore GENERATED, and this file is the single rule that does it.
//
// Kept deliberately pure and free of Supabase so the calendar arithmetic —
// the part that is easy to get quietly wrong around month boundaries and
// day-of-week encodings — is directly testable.

// Zoom's weekly_days encoding, used verbatim throughout this codebase so
// nothing has to translate between two day-numbering schemes:
// 1 = Sunday ... 7 = Saturday.
export type MeetingDay = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface BatchSchedule {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  startTime: string; // HH:MM or HH:MM:SS
  endTime: string | null;
  meetingDays: number[] | null;
}

export interface GeneratedSession {
  // Session number within the cohort, 1-based — the natural title when a
  // tutor has not named the session.
  sessionNumber: number;
  sessionDate: string; // YYYY-MM-DD
  startsAt: string; // ISO 8601 with offset
  endsAt: string; // ISO 8601 with offset
}

// Ghana, UTC+0 year round with no DST — the same assumption BR-17 rests on
// for the reminder cron. Written as an explicit offset rather than a bare Z
// so the stored timestamp says what it means.
const GHANA_OFFSET = '+00:00';

// A cohort longer than this is almost certainly a data-entry error (a
// mistyped end_date), and generating hundreds of sessions from one would be
// worse than refusing. Also keeps generation under Zoom's ~50-occurrence
// recurrence limit, which the batch classroom meeting shares.
export const MAX_GENERATED_SESSIONS = 60;

function toIso(dateIso: string, time: string): string {
  return `${dateIso}T${time.slice(0, 5)}:00${GHANA_OFFSET}`;
}

// Whether a batch states enough to generate anything. A batch missing
// end_time or meeting_days is not broken — it simply predates the schedule
// fields, and keeps working exactly as it did.
export function canGenerateSchedule(schedule: BatchSchedule): boolean {
  return Boolean(schedule.endTime) && (schedule.meetingDays?.length ?? 0) > 0;
}

// The sessions a batch's schedule implies, in chronological order.
//
// Returns an empty array rather than throwing when the batch cannot state a
// schedule: generation is called opportunistically from batch create/update,
// and a batch without meeting days is a normal state, not a failure.
export function generateSchedule(schedule: BatchSchedule): GeneratedSession[] {
  if (!canGenerateSchedule(schedule)) return [];
  if (schedule.endDate < schedule.startDate) return [];

  const days = new Set(schedule.meetingDays);
  const sessions: GeneratedSession[] = [];
  const cursor = new Date(`${schedule.startDate}T00:00:00Z`);
  const last = new Date(`${schedule.endDate}T00:00:00Z`);

  while (cursor.getTime() <= last.getTime() && sessions.length < MAX_GENERATED_SESSIONS) {
    // getUTCDay() is 0 = Sunday; the encoding above is 1 = Sunday.
    if (days.has(cursor.getUTCDay() + 1)) {
      const sessionDate = cursor.toISOString().slice(0, 10);
      sessions.push({
        sessionNumber: sessions.length + 1,
        sessionDate,
        startsAt: toIso(sessionDate, schedule.startTime),
        endsAt: toIso(sessionDate, schedule.endTime!),
      });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return sessions;
}

// Default title for a generated session. A tutor can rename it afterwards;
// this only has to be unambiguous on a calendar.
export function defaultSessionTitle(courseName: string, sessionNumber: number): string {
  return `${courseName} — Session ${sessionNumber}`;
}
