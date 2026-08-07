// Attendance rate rule (founder-approved 2026-08-06, revised same day from
// 0.4 to 0.3: "lets make it 30% rate").
//
// Shared by the Zoom sync, which records the numbers, and certificate
// eligibility, which acts on them — so the threshold can never drift between
// what a roster shows and what actually gates a certificate.
//
// Applied at READ time, never baked into the stored rows: changing this value
// re-scores every existing attendance row on the next read, with no migration
// and no backfill.

export const MIN_ATTENDANCE_RATIO = 0.3;

// Whether one attendance row counts as having attended its session.
//
// A null/0 sessionMinutes means the session length was never recorded (rows
// written before the denominator existed). Those count as attended rather than
// being retroactively failed — the rule is applied where it can be measured,
// not guessed at where it cannot.
export function meetsAttendanceThreshold(
  durationMinutes: number,
  sessionMinutes: number | null | undefined,
): boolean {
  if (!sessionMinutes || sessionMinutes <= 0) return true;
  return durationMinutes / sessionMinutes >= MIN_ATTENDANCE_RATIO;
}

export function attendanceRatePercent(
  durationMinutes: number,
  sessionMinutes: number | null | undefined,
): number | null {
  if (!sessionMinutes || sessionMinutes <= 0) return null;
  return Math.round((durationMinutes / sessionMinutes) * 100);
}
