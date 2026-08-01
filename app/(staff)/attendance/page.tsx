'use client';

// Zoom attendance view (founder-approved 2026-07-19, "Option 2"): per-Batch
// attendance synced nightly from Zoom participant reports. Admin + Management.
import { useCallback, useEffect, useState } from 'react';

import { apiFetch } from '@/components/api-client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

interface BatchOption {
  id: string;
  courseId: string;
  cohortLabel: string;
  startDate: string;
  zoomMeetingId: string | null;
}

interface Course {
  id: string;
  courseName: string;
}

interface AttendanceRow {
  registrationId: string;
  participantName: string;
  participantEmail: string;
  sessionDate: string;
  joinTime: string | null;
  leaveTime: string | null;
  durationMinutes: number;
}

interface AttendanceException {
  id: string;
  batchId: string;
  sessionDate: string;
  exceptionType: 'no_show_flag' | 'correction_request';
  requestedPresent: boolean | null;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  participantName: string;
  participantEmail: string;
}

export default function AttendancePage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [batches, setBatches] = useState<BatchOption[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [exceptions, setExceptions] = useState<AttendanceException[]>([]);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  async function loadExceptions() {
    try {
      const result = await apiFetch<{ exceptions: AttendanceException[] }>(
        '/api/attendance/exceptions?status=pending',
      );
      setExceptions(result.exceptions);
    } catch {
      setExceptions([]);
    }
  }

  async function reviewException(id: string, decision: 'approved' | 'rejected') {
    setReviewingId(id);
    try {
      await apiFetch(`/api/attendance/exceptions/${id}/review`, {
        method: 'POST',
        body: JSON.stringify({ decision }),
      });
      await loadExceptions();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to review exception.');
    } finally {
      setReviewingId(null);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const [coursesData, batchesData] = await Promise.all([
          apiFetch<{ courses: Course[] }>('/api/courses'),
          apiFetch<{ batches: BatchOption[] }>('/api/batches'),
        ]);
        setCourses(coursesData.courses);
        setBatches(batchesData.batches);
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Failed to load batches.');
      }
    })();
    void loadExceptions();
  }, []);

  const loadAttendance = useCallback(async (batchId: string) => {
    setSelectedBatchId(batchId);
    setRows([]);
    if (!batchId) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const data = await apiFetch<{ attendance: AttendanceRow[] }>(
        `/api/attendance?batchId=${encodeURIComponent(batchId)}`,
      );
      setRows(data.attendance);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load attendance.');
    } finally {
      setLoading(false);
    }
  }, []);

  const courseNameById = new Map(courses.map((course) => [course.id, course.courseName]));
  const selectedBatch = batches.find((batch) => batch.id === selectedBatchId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Attendance</h1>
        <p className="text-sm text-muted-foreground">
          Zoom attendance is synced automatically every evening for batches with a Zoom
          Meeting ID configured.
        </p>
      </div>

      {exceptions.length > 0 && (
        <div className="space-y-3 rounded-lg border p-4">
          <h2 className="text-lg font-semibold">Pending attendance exceptions</h2>
          <p className="text-sm text-muted-foreground">
            No-show flags and correction requests raised by tutors. Approving a correction
            updates the attendance record; approving a no-show flag is advisory only.
          </p>
          <div className="space-y-2">
            {exceptions.map((exception) => (
              <div key={exception.id} className="rounded-md border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <strong>{exception.participantName}</strong>
                  <span className="text-xs text-muted-foreground">{exception.sessionDate}</span>
                </div>
                <p className="mt-1">
                  {exception.exceptionType === 'no_show_flag'
                    ? 'No-show flag'
                    : `Correction request — mark ${exception.requestedPresent ? 'present' : 'absent'}`}
                  : {exception.reason}
                </p>
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    disabled={reviewingId === exception.id}
                    onClick={() => void reviewException(exception.id, 'approved')}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={reviewingId === exception.id}
                    onClick={() => void reviewException(exception.id, 'rejected')}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="max-w-md space-y-2">
        <Label htmlFor="batch">Batch</Label>
        <select
          id="batch"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          value={selectedBatchId}
          onChange={(event) => loadAttendance(event.target.value)}
        >
          <option value="">Select a batch…</option>
          {batches.map((batch) => (
            <option key={batch.id} value={batch.id}>
              {courseNameById.get(batch.courseId) ?? 'Course'} — {batch.cohortLabel} (
              {batch.startDate})
            </option>
          ))}
        </select>
      </div>

      {errorMessage && (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      )}

      {selectedBatch && !selectedBatch.zoomMeetingId && (
        <p className="text-sm text-amber-600">
          This batch has no Zoom Meeting ID configured — attendance is not tracked for it.
          Set the meeting ID on the Courses screen.
        </p>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Participant</th>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Session Date</th>
                <th className="px-4 py-2 font-medium">Joined</th>
                <th className="px-4 py-2 font-medium">Left</th>
                <th className="px-4 py-2 font-medium">Minutes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.registrationId}-${row.sessionDate}`} className="border-t">
                  <td className="px-4 py-2">{row.participantName}</td>
                  <td className="px-4 py-2">{row.participantEmail}</td>
                  <td className="px-4 py-2">{row.sessionDate}</td>
                  <td className="px-4 py-2">
                    {row.joinTime ? new Date(row.joinTime).toLocaleTimeString() : '—'}
                  </td>
                  <td className="px-4 py-2">
                    {row.leaveTime ? new Date(row.leaveTime).toLocaleTimeString() : '—'}
                  </td>
                  <td className="px-4 py-2">{row.durationMinutes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : selectedBatchId ? (
        <p className="text-sm text-muted-foreground">
          No attendance recorded for this batch yet.
        </p>
      ) : null}
    </div>
  );
}
