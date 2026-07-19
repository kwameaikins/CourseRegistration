'use client';

// Zoom attendance view (founder-approved 2026-07-19, "Option 2"): per-Batch
// attendance synced nightly from Zoom participant reports. Admin + Management.
import { useCallback, useEffect, useState } from 'react';

import { apiFetch } from '@/components/api-client';
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

export default function AttendancePage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [batches, setBatches] = useState<BatchOption[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
