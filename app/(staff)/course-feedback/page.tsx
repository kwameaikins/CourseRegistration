'use client';

// Post-course feedback review (founder-approved 2026-07-19): per-Batch
// response rate, average ratings, testimonials, and course interests.
// Admin + Management.
import { useCallback, useEffect, useState } from 'react';

import { apiFetch } from '@/components/api-client';
import { Label } from '@/components/ui/label';

interface BatchOption {
  id: string;
  courseId: string;
  cohortLabel: string;
  startDate: string;
}

interface Course {
  id: string;
  courseName: string;
}

interface FeedbackRow {
  registrationId: string;
  participantName: string | null;
  overallRating: number;
  facilitatorRating: number;
  recommendRating: number;
  improvementText: string | null;
  testimonialConsent: boolean;
  interestedCourses: string | null;
  submittedAt: string;
}

interface Summary {
  responses: number;
  paidRegistrations: number;
  averageOverall: number | null;
  averageFacilitator: number | null;
  averageRecommend: number | null;
  rows: FeedbackRow[];
}

export default function CourseFeedbackPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [batches, setBatches] = useState<BatchOption[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
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

  const loadSummary = useCallback(async (batchId: string) => {
    setSelectedBatchId(batchId);
    setSummary(null);
    if (!batchId) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const data = await apiFetch<Summary>(
        `/api/feedback-summary?batchId=${encodeURIComponent(batchId)}`,
      );
      setSummary(data);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load feedback.');
    } finally {
      setLoading(false);
    }
  }, []);

  const courseNameById = new Map(courses.map((course) => [course.id, course.courseName]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Course Feedback</h1>
        <p className="text-sm text-muted-foreground">
          Feedback requests go out automatically the morning after a batch ends. Responses
          appear here.
        </p>
      </div>

      <div className="max-w-md space-y-2">
        <Label htmlFor="batch">Batch</Label>
        <select
          id="batch"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          value={selectedBatchId}
          onChange={(event) => loadSummary(event.target.value)}
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
      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {summary && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[
              [
                'Response rate',
                summary.paidRegistrations > 0
                  ? `${summary.responses}/${summary.paidRegistrations} (${Math.round((summary.responses / summary.paidRegistrations) * 100)}%)`
                  : `${summary.responses}`,
              ],
              ['Avg overall', summary.averageOverall?.toFixed(1) ?? '—'],
              ['Avg facilitator', summary.averageFacilitator?.toFixed(1) ?? '—'],
              ['Avg recommend', summary.averageRecommend?.toFixed(1) ?? '—'],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {label}
                </p>
                <p className="mt-1 text-2xl font-bold">{value}</p>
              </div>
            ))}
          </div>

          {summary.rows.length > 0 ? (
            <div className="space-y-3">
              {summary.rows.map((row) => (
                <div key={row.registrationId} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">
                      {row.participantName ?? 'Anonymous'}
                      {row.testimonialConsent && (
                        <span className="ml-2 rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">
                          Testimonial OK
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Overall {row.overallRating}/5 · Facilitator {row.facilitatorRating}/5 ·
                      Recommend {row.recommendRating}/5
                    </p>
                  </div>
                  {row.improvementText && (
                    <p className="mt-2 text-sm">{row.improvementText}</p>
                  )}
                  {row.interestedCourses && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Interested in: {row.interestedCourses}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No responses yet for this batch.</p>
          )}
        </>
      )}
    </div>
  );
}
