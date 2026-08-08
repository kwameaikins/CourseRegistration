'use client';

// F1.02 — Course Control Panel (Document 8, Section 6). Admin only
// (middleware + RLS enforce this; the nav link is hidden for other roles).
import { useCallback, useEffect, useState } from 'react';

import { apiFetch } from '@/components/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate, formatGhs } from '@/lib/utils';

interface Course {
  id: string;
  courseCode: string;
  courseName: string;
  certificateHours: number;
  certificateDescription: string;
  cpdCredit: string;
  // Persistent "classroom" Zoom meeting, auto-created once per Course —
  // every Batch inherits this at creation time.
  zoomLink: string | null;
  zoomMeetingId: string | null;
}

const EMPTY_COURSE_FORM = {
  courseCode: '',
  courseName: '',
  certificateHours: '',
  certificateDescription: '',
  cpdCredit: 'TBD',
  zoomLink: '',
  zoomMeetingId: '',
};

interface Batch {
  id: string;
  courseId: string;
  cohortLabel: string;
  // Waitlist feature (founder-approved 2026-07-24) — null means unlimited.
  capacity: number | null;
  courseFee: number;
  // Free event / webinar (2026-08-03) — requires courseFee 0 and no
  // early-registration discount (DB constraint free_batch_has_no_fee).
  isFree: boolean;
  startDate: string;
  startTime: string;
  endDate: string;
  // Null on batches created before the class schedule existed (2026-08-08).
  // meetingDays uses Zoom's encoding: 1 = Sunday ... 7 = Saturday.
  endTime: string | null;
  meetingDays: number[] | null;
  whatsappGroupLink: string | null;
  resourcesLink: string | null;
  facilitatorName: string;
  facilitatorTutorId: string | null;
  welcomeEmailEnabled: boolean;
  paymentReminderEnabled: boolean;
  classReminderEnabled: boolean;
  whatsappEnabled: boolean;
  smsEnabled: boolean;
  isActive: boolean;
  discountCutoffDate: string | null;
  discountedFee: number | null;
}

interface WaitlistEntry {
  id: string;
  status: 'Waiting' | 'Offered' | 'Converted' | 'Cancelled';
  fullName: string;
  email: string;
  phone: string;
  createdAt: string;
}

// Zoom's weekly_days encoding, used verbatim end to end so nothing has to
// translate between two day-numbering schemes: 1 = Sunday ... 7 = Saturday.
const WEEKDAYS = [
  { value: 1, label: 'Sun' },
  { value: 2, label: 'Mon' },
  { value: 3, label: 'Tue' },
  { value: 4, label: 'Wed' },
  { value: 5, label: 'Thu' },
  { value: 6, label: 'Fri' },
  { value: 7, label: 'Sat' },
];

const EMPTY_BATCH_FORM = {
  cohortLabel: '',
  capacity: '',
  courseFee: '',
  isFree: false,
  startDate: '',
  startTime: '09:00',
  endDate: '',
  endTime: '',
  meetingDays: [] as number[],
  whatsappGroupLink: '',
  resourcesLink: '',
  facilitatorName: '',
  facilitatorTutorId: '',
  discountCutoffDate: '',
  discountedFee: '',
};

export default function CourseControlPanelPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [expandedCourseId, setExpandedCourseId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [newCourse, setNewCourse] = useState(EMPTY_COURSE_FORM);
  const [showCourseForm, setShowCourseForm] = useState(false);
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [editCourseForm, setEditCourseForm] = useState(EMPTY_COURSE_FORM);
  const [batchForm, setBatchForm] = useState(EMPTY_BATCH_FORM);
  const [batchFormCourseId, setBatchFormCourseId] = useState<string | null>(null);
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);
  const [editBatchForm, setEditBatchForm] = useState(EMPTY_BATCH_FORM);
  const [saving, setSaving] = useState(false);
  const [expandedWaitlistBatchId, setExpandedWaitlistBatchId] = useState<string | null>(null);
  const [waitlistByBatch, setWaitlistByBatch] = useState<Record<string, WaitlistEntry[]>>({});
  const [loadingWaitlist, setLoadingWaitlist] = useState(false);
  const [tutors, setTutors] = useState<Array<{ id: string; fullName: string }>>([]);

  const reload = useCallback(async () => {
    try {
      const [coursesResult, batchesResult] = await Promise.all([
        apiFetch<{ courses: Course[] }>('/api/courses'),
        apiFetch<{ batches: Batch[] }>('/api/batches'),
      ]);
      setCourses(coursesResult.courses);
      setBatches(batchesResult.batches);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load courses.');
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    void apiFetch<{ tutors: Array<{ id: string; fullName: string }> }>('/api/tutors/picker')
      .then(({ tutors: rows }) => setTutors(rows))
      .catch(() => setTutors([]));
  }, []);

  function flashStatus(message: string) {
    setStatusMessage(message);
    setErrorMessage(null);
    setTimeout(() => setStatusMessage(null), 4000);
  }

  async function handleCreateCourse(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/api/courses', {
        method: 'POST',
        body: JSON.stringify({
          courseCode: newCourse.courseCode,
          courseName: newCourse.courseName,
          certificateHours: Number(newCourse.certificateHours || 0),
          certificateDescription: newCourse.certificateDescription,
          cpdCredit: newCourse.cpdCredit || 'TBD',
        }),
      });
      setNewCourse(EMPTY_COURSE_FORM);
      setShowCourseForm(false);
      flashStatus('Course created (default email templates seeded).');
      await reload();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to create course.');
    } finally {
      setSaving(false);
    }
  }

  function startCourseEdit(course: Course) {
    setEditingCourseId(course.id);
    setEditCourseForm({
      courseCode: course.courseCode,
      courseName: course.courseName,
      certificateHours: course.certificateHours ? String(course.certificateHours) : '',
      certificateDescription: course.certificateDescription ?? '',
      cpdCredit: course.cpdCredit || 'TBD',
      zoomLink: course.zoomLink ?? '',
      zoomMeetingId: course.zoomMeetingId ?? '',
    });
  }

  async function handleUpdateCourse(event: React.FormEvent, courseId: string) {
    event.preventDefault();
    setSaving(true);
    try {
      await apiFetch(`/api/courses/${courseId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          courseName: editCourseForm.courseName,
          certificateHours: Number(editCourseForm.certificateHours || 0),
          certificateDescription: editCourseForm.certificateDescription,
          cpdCredit: editCourseForm.cpdCredit || 'TBD',
          zoomLink: editCourseForm.zoomLink || null,
          zoomMeetingId: editCourseForm.zoomMeetingId || null,
        }),
      });
      setEditingCourseId(null);
      flashStatus('Course updated.');
      await reload();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to update course.');
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateBatch(event: React.FormEvent, courseId: string) {
    event.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/api/batches', {
        method: 'POST',
        body: JSON.stringify({
          courseId,
          cohortLabel: batchForm.cohortLabel,
          capacity: batchForm.capacity ? Number(batchForm.capacity) : null,
          // A free event carries no fee and no early-bird discount — send the
          // zeroed values explicitly rather than whatever was typed before the
          // toggle was flipped, which the DB constraint would reject.
          courseFee: batchForm.isFree ? 0 : Number(batchForm.courseFee),
          isFree: batchForm.isFree,
          startDate: batchForm.startDate,
          startTime: batchForm.startTime,
          endDate: batchForm.endDate,
          // Sent only as a complete pair — the server rejects half a
          // schedule rather than silently building no join window.
          endTime: batchForm.endTime || null,
          meetingDays: batchForm.meetingDays.length > 0 ? batchForm.meetingDays : null,
          whatsappGroupLink: batchForm.whatsappGroupLink || null,
          resourcesLink: batchForm.resourcesLink || null,
          facilitatorName: batchForm.facilitatorName,
          facilitatorTutorId: batchForm.facilitatorTutorId || null,
          discountCutoffDate: batchForm.isFree ? null : batchForm.discountCutoffDate || null,
          discountedFee:
            batchForm.isFree || !batchForm.discountedFee
              ? null
              : Number(batchForm.discountedFee),
        }),
      });
      setBatchForm(EMPTY_BATCH_FORM);
      setBatchFormCourseId(null);
      flashStatus('Batch created.');
      await reload();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to create batch.');
    } finally {
      setSaving(false);
    }
  }

  async function handleBatchToggle(batch: Batch, field: keyof Batch, value: boolean) {
    try {
      await apiFetch(`/api/batches/${batch.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ [field]: value }),
      });
      flashStatus('Batch updated.');
      await reload();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to update batch.');
    }
  }

  function startEditBatch(batch: Batch) {
    setEditingBatchId(batch.id);
    setEditBatchForm({
      cohortLabel: batch.cohortLabel,
      capacity: batch.capacity !== null ? String(batch.capacity) : '',
      courseFee: String(batch.courseFee),
      isFree: batch.isFree,
      startDate: batch.startDate,
      startTime: batch.startTime,
      endDate: batch.endDate,
      // Carried through unchanged and deliberately not editable here. The
      // Zoom room is built from this schedule at batch CREATION only, so
      // letting staff edit it afterwards would leave the recorded schedule
      // and the actual join window disagreeing with no warning.
      endTime: batch.endTime ?? '',
      meetingDays: batch.meetingDays ?? [],
      whatsappGroupLink: batch.whatsappGroupLink ?? '',
      resourcesLink: batch.resourcesLink ?? '',
      facilitatorName: batch.facilitatorName,
      facilitatorTutorId: batch.facilitatorTutorId ?? '',
      discountCutoffDate: batch.discountCutoffDate ?? '',
      discountedFee: batch.discountedFee !== null ? String(batch.discountedFee) : '',
    });
  }

  async function handleUpdateBatch(event: React.FormEvent, batchId: string) {
    event.preventDefault();
    setSaving(true);
    try {
      await apiFetch(`/api/batches/${batchId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          cohortLabel: editBatchForm.cohortLabel,
          capacity: editBatchForm.capacity ? Number(editBatchForm.capacity) : null,
          courseFee: editBatchForm.isFree ? 0 : Number(editBatchForm.courseFee),
          isFree: editBatchForm.isFree,
          startDate: editBatchForm.startDate,
          startTime: editBatchForm.startTime,
          endDate: editBatchForm.endDate,
          whatsappGroupLink: editBatchForm.whatsappGroupLink || null,
          resourcesLink: editBatchForm.resourcesLink || null,
          facilitatorName: editBatchForm.facilitatorName,
          facilitatorTutorId: editBatchForm.facilitatorTutorId || null,
          discountCutoffDate: editBatchForm.isFree
            ? null
            : editBatchForm.discountCutoffDate || null,
          discountedFee:
            editBatchForm.isFree || !editBatchForm.discountedFee
              ? null
              : Number(editBatchForm.discountedFee),
        }),
      });
      setEditingBatchId(null);
      flashStatus('Batch updated.');
      await reload();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to update batch.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleWaitlist(batchId: string) {
    if (expandedWaitlistBatchId === batchId) {
      setExpandedWaitlistBatchId(null);
      return;
    }
    setExpandedWaitlistBatchId(batchId);
    if (waitlistByBatch[batchId]) return; // already loaded once this session
    setLoadingWaitlist(true);
    try {
      const result = await apiFetch<{ entries: WaitlistEntry[] }>(
        `/api/waitlist?batchId=${batchId}`,
      );
      setWaitlistByBatch((current) => ({ ...current, [batchId]: result.entries }));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load waitlist.');
    } finally {
      setLoadingWaitlist(false);
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Course Control Panel</h1>
        <Button onClick={() => setShowCourseForm((visible) => !visible)}>
          + Add Course
        </Button>
      </div>

      {statusMessage && (
        <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">
          {statusMessage}
        </p>
      )}
      {errorMessage && (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {errorMessage}
        </p>
      )}

      {showCourseForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New Course</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateCourse} className="flex flex-wrap items-end gap-4">
              <div className="space-y-2">
                <Label htmlFor="courseCode">Course Code</Label>
                <Input
                  id="courseCode"
                  required
                  placeholder="ICAG-L1"
                  value={newCourse.courseCode}
                  onChange={(event) =>
                    setNewCourse({ ...newCourse, courseCode: event.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="courseName">Course Name</Label>
                <Input
                  id="courseName"
                  required
                  className="w-72"
                  placeholder="ICAG Level 1 Prep"
                  value={newCourse.courseName}
                  onChange={(event) =>
                    setNewCourse({ ...newCourse, courseName: event.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="certificateHours">Certificate Hours</Label>
                <Input
                  id="certificateHours"
                  type="number"
                  min={0}
                  className="w-28"
                  placeholder="20"
                  value={newCourse.certificateHours}
                  onChange={(event) =>
                    setNewCourse({ ...newCourse, certificateHours: event.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cpdCredit">CPD Credit</Label>
                <Input
                  id="cpdCredit"
                  className="w-28"
                  value={newCourse.cpdCredit}
                  onChange={(event) =>
                    setNewCourse({ ...newCourse, cpdCredit: event.target.value })
                  }
                />
              </div>
              <div className="w-full space-y-2">
                <Label htmlFor="certificateDescription">
                  Certificate Description (appears on the certificate)
                </Label>
                <textarea
                  id="certificateDescription"
                  className="min-h-16 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  placeholder="covering the practical use of …"
                  value={newCourse.certificateDescription}
                  onChange={(event) =>
                    setNewCourse({ ...newCourse, certificateDescription: event.target.value })
                  }
                />
              </div>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Create Course'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {courses.map((course) => {
        const courseBatches = batches.filter((batch) => batch.courseId === course.id);
        const expanded = expandedCourseId === course.id;
        return (
          <Card key={course.id}>
            <CardHeader
              className="cursor-pointer"
              onClick={() => setExpandedCourseId(expanded ? null : course.id)}
            >
              <CardTitle className="flex items-center justify-between text-base">
                <span>
                  {course.courseName}{' '}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    {course.courseCode}
                  </span>
                </span>
                <span className="text-sm font-normal text-muted-foreground">
                  {courseBatches.length} batch{courseBatches.length === 1 ? '' : 'es'}{' '}
                  {expanded ? '▲' : '▼'}
                </span>
              </CardTitle>
            </CardHeader>
            {expanded && (
              <CardContent className="space-y-4">
                {editingCourseId === course.id ? (
                  <form
                    onSubmit={(event) => handleUpdateCourse(event, course.id)}
                    className="grid grid-cols-2 gap-4 rounded-lg border bg-muted/30 p-4"
                  >
                    <div className="space-y-2">
                      <Label htmlFor={`edit-courseName-${course.id}`}>Course Name</Label>
                      <Input
                        id={`edit-courseName-${course.id}`}
                        required
                        value={editCourseForm.courseName}
                        onChange={(event) =>
                          setEditCourseForm({ ...editCourseForm, courseName: event.target.value })
                        }
                      />
                    </div>
                    <div className="flex gap-4">
                      <div className="space-y-2">
                        <Label htmlFor={`edit-certHours-${course.id}`}>Certificate Hours</Label>
                        <Input
                          id={`edit-certHours-${course.id}`}
                          type="number"
                          min={0}
                          value={editCourseForm.certificateHours}
                          onChange={(event) =>
                            setEditCourseForm({
                              ...editCourseForm,
                              certificateHours: event.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`edit-cpd-${course.id}`}>CPD Credit</Label>
                        <Input
                          id={`edit-cpd-${course.id}`}
                          value={editCourseForm.cpdCredit}
                          onChange={(event) =>
                            setEditCourseForm({ ...editCourseForm, cpdCredit: event.target.value })
                          }
                        />
                      </div>
                    </div>
                    <div className="col-span-2 space-y-2">
                      <Label htmlFor={`edit-certDesc-${course.id}`}>Certificate Description</Label>
                      <textarea
                        id={`edit-certDesc-${course.id}`}
                        className="min-h-16 w-full rounded-md border bg-background px-3 py-2 text-sm"
                        value={editCourseForm.certificateDescription}
                        onChange={(event) =>
                          setEditCourseForm({
                            ...editCourseForm,
                            certificateDescription: event.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`edit-zoomLink-${course.id}`}>
                        Zoom Link{' '}
                        <span className="text-muted-foreground">
                          (auto-created; edit only to fix/replace it)
                        </span>
                      </Label>
                      <Input
                        id={`edit-zoomLink-${course.id}`}
                        type="url"
                        placeholder="https://zoom.us/j/…"
                        value={editCourseForm.zoomLink}
                        onChange={(event) =>
                          setEditCourseForm({ ...editCourseForm, zoomLink: event.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`edit-zoomMeetingId-${course.id}`}>
                        Zoom Meeting ID (attendance)
                      </Label>
                      <Input
                        id={`edit-zoomMeetingId-${course.id}`}
                        placeholder="829 1234 5678"
                        value={editCourseForm.zoomMeetingId}
                        onChange={(event) =>
                          setEditCourseForm({
                            ...editCourseForm,
                            zoomMeetingId: event.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="col-span-2 flex gap-2">
                      <Button type="submit" disabled={saving}>
                        {saving ? 'Saving…' : 'Save Course'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setEditingCourseId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-2 text-sm">
                    <span className="text-muted-foreground">
                      Certificate: {course.certificateHours || '—'} hours · CPD{' '}
                      {course.cpdCredit || 'TBD'}
                      {course.certificateDescription ? '' : ' · no description set'}
                      {' · Zoom: '}
                      {course.zoomLink ? (
                        <a
                          href={course.zoomLink}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary underline-offset-2 hover:underline"
                        >
                          classroom link
                        </a>
                      ) : (
                        'not set up'
                      )}
                    </span>
                    <Button variant="outline" onClick={() => startCourseEdit(course)}>
                      Edit course
                    </Button>
                  </div>
                )}
                {courseBatches.map((batch) =>
                  editingBatchId === batch.id ? (
                    <form
                      key={batch.id}
                      onSubmit={(event) => handleUpdateBatch(event, batch.id)}
                      className="grid grid-cols-2 gap-4 rounded-lg border p-4"
                    >
                      <div className="space-y-2">
                        <Label htmlFor={`edit-cohortLabel-${batch.id}`}>Batch Label</Label>
                        <Input
                          id={`edit-cohortLabel-${batch.id}`}
                          required
                          value={editBatchForm.cohortLabel}
                          onChange={(event) =>
                            setEditBatchForm({ ...editBatchForm, cohortLabel: event.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`edit-courseFee-${batch.id}`}>Course Fee (GHS)</Label>
                        <Input
                          id={`edit-courseFee-${batch.id}`}
                          required={!editBatchForm.isFree}
                          disabled={editBatchForm.isFree}
                          type="number"
                          min="0"
                          step="0.01"
                          value={editBatchForm.isFree ? '0' : editBatchForm.courseFee}
                          onChange={(event) =>
                            setEditBatchForm({ ...editBatchForm, courseFee: event.target.value })
                          }
                        />
                      </div>
                      <div className="col-span-2 flex items-start gap-3 rounded-md border p-3">
                        <input
                          id={`edit-isFree-${batch.id}`}
                          type="checkbox"
                          className="mt-1 h-4 w-4 shrink-0"
                          checked={editBatchForm.isFree}
                          onChange={(event) =>
                            setEditBatchForm({ ...editBatchForm, isFree: event.target.checked })
                          }
                        />
                        <Label htmlFor={`edit-isFree-${batch.id}`} className="font-normal">
                          Free event / webinar
                          <span className="mt-1 block text-xs text-muted-foreground">
                            Clears the fee and any early-bird discount. Existing
                            registrations on this batch keep the fee they were given.
                          </span>
                        </Label>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`edit-capacity-${batch.id}`}>
                          Capacity <span className="text-muted-foreground">(optional — blank = unlimited)</span>
                        </Label>
                        <Input
                          id={`edit-capacity-${batch.id}`}
                          type="number"
                          min="1"
                          step="1"
                          placeholder="e.g. 30"
                          value={editBatchForm.capacity}
                          onChange={(event) =>
                            setEditBatchForm({ ...editBatchForm, capacity: event.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`edit-startDate-${batch.id}`}>Start Date</Label>
                        <Input
                          id={`edit-startDate-${batch.id}`}
                          required
                          type="date"
                          value={editBatchForm.startDate}
                          onChange={(event) =>
                            setEditBatchForm({ ...editBatchForm, startDate: event.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`edit-endDate-${batch.id}`}>End Date</Label>
                        <Input
                          id={`edit-endDate-${batch.id}`}
                          required
                          type="date"
                          value={editBatchForm.endDate}
                          onChange={(event) =>
                            setEditBatchForm({ ...editBatchForm, endDate: event.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`edit-startTime-${batch.id}`}>Start Time</Label>
                        <Input
                          id={`edit-startTime-${batch.id}`}
                          required
                          type="time"
                          value={editBatchForm.startTime}
                          onChange={(event) =>
                            setEditBatchForm({ ...editBatchForm, startTime: event.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`edit-facilitatorName-${batch.id}`}>
                          Facilitator Name
                        </Label>
                        <Input
                          id={`edit-facilitatorName-${batch.id}`}
                          required
                          value={editBatchForm.facilitatorName}
                          onChange={(event) =>
                            setEditBatchForm({
                              ...editBatchForm,
                              facilitatorName: event.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`edit-facilitatorTutorId-${batch.id}`}>Tutor</Label>
                        <select
                          id={`edit-facilitatorTutorId-${batch.id}`}
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                          value={editBatchForm.facilitatorTutorId}
                          onChange={(event) => {
                            const tutorId = event.target.value;
                            const tutor = tutors.find((row) => row.id === tutorId);
                            setEditBatchForm({
                              ...editBatchForm,
                              facilitatorTutorId: tutorId,
                              ...(tutor && { facilitatorName: tutor.fullName }),
                            });
                          }}
                        >
                          <option value="">— unassigned —</option>
                          {tutors.map((tutor) => (
                            <option key={tutor.id} value={tutor.id}>{tutor.fullName}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`edit-whatsappGroupLink-${batch.id}`}>
                          WhatsApp Group Link
                        </Label>
                        <Input
                          id={`edit-whatsappGroupLink-${batch.id}`}
                          type="url"
                          placeholder="https://chat.whatsapp.com/…"
                          value={editBatchForm.whatsappGroupLink}
                          onChange={(event) =>
                            setEditBatchForm({
                              ...editBatchForm,
                              whatsappGroupLink: event.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`edit-resourcesLink-${batch.id}`}>
                          Resources Link <span className="text-muted-foreground">(optional)</span>
                        </Label>
                        <Input
                          id={`edit-resourcesLink-${batch.id}`}
                          type="url"
                          placeholder="https://drive.google.com/…"
                          value={editBatchForm.resourcesLink}
                          onChange={(event) =>
                            setEditBatchForm({
                              ...editBatchForm,
                              resourcesLink: event.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`edit-discountCutoffDate-${batch.id}`}>
                          Discount Cutoff Date{' '}
                          <span className="text-muted-foreground">(optional)</span>
                        </Label>
                        <Input
                          id={`edit-discountCutoffDate-${batch.id}`}
                          type="date"
                          value={editBatchForm.discountCutoffDate}
                          onChange={(event) =>
                            setEditBatchForm({
                              ...editBatchForm,
                              discountCutoffDate: event.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`edit-discountedFee-${batch.id}`}>
                          Discounted Fee (GHS){' '}
                          <span className="text-muted-foreground">(optional)</span>
                        </Label>
                        <Input
                          id={`edit-discountedFee-${batch.id}`}
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="Early-bird price"
                          value={editBatchForm.discountedFee}
                          onChange={(event) =>
                            setEditBatchForm({
                              ...editBatchForm,
                              discountedFee: event.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="col-span-2 flex gap-3">
                        <Button type="submit" disabled={saving}>
                          {saving ? 'Saving…' : 'Save Changes'}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setEditingBatchId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <div key={batch.id} className="rounded-lg border p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-medium">{batch.cohortLabel}</p>
                          <p className="text-sm text-muted-foreground">
                            {formatDate(batch.startDate)} – {formatDate(batch.endDate)} ·{' '}
                            {batch.isFree ? 'Free event' : formatGhs(batch.courseFee)} ·{' '}
                            {batch.facilitatorName}
                          </p>
                          {batch.discountCutoffDate && batch.discountedFee !== null && (
                            <p className="text-sm text-emerald-700">
                              Early bird {formatGhs(batch.discountedFee)} through{' '}
                              {formatDate(batch.discountCutoffDate)}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <Button
                            type="button"
                            variant="outline"
                            className="h-8 px-3"
                            onClick={() => startEditBatch(batch)}
                          >
                            Edit
                          </Button>
                          <div className="flex items-center gap-2">
                            <Label htmlFor={`active-${batch.id}`} className="text-sm">
                              Active
                            </Label>
                            <Switch
                              id={`active-${batch.id}`}
                              checked={batch.isActive}
                              onCheckedChange={(checked) =>
                                handleBatchToggle(batch, 'isActive', checked)
                              }
                            />
                          </div>
                        </div>
                      </div>
                      {!batch.isActive && (
                        <p className="mt-2 text-sm text-amber-600">
                          This batch is inactive — all automated emails for it are stopped.
                        </p>
                      )}
                      <div className="mt-3 border-t pt-3">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Automation Settings
                        </p>
                        <div className="flex flex-wrap gap-6">
                          {(
                            [
                              ['welcomeEmailEnabled', 'Welcome email'],
                              ['paymentReminderEnabled', 'Payment reminders'],
                              ['classReminderEnabled', 'Class reminders'],
                              ['whatsappEnabled', 'WhatsApp messages'],
                              ['smsEnabled', 'SMS messages'],
                            ] as const
                          ).map(([field, label]) => (
                            <div key={field} className="flex items-center gap-2">
                              <Switch
                                id={`${field}-${batch.id}`}
                                checked={batch[field]}
                                onCheckedChange={(checked) =>
                                  handleBatchToggle(batch, field, checked)
                                }
                              />
                              <Label htmlFor={`${field}-${batch.id}`} className="text-sm">
                                {label}
                              </Label>
                            </div>
                          ))}
                        </div>
                      </div>
                      {batch.capacity !== null && (
                        <div className="mt-3 border-t pt-3">
                          <div className="flex items-center justify-between">
                            <p className="text-sm text-muted-foreground">
                              Capacity: {batch.capacity}
                            </p>
                            <button
                              type="button"
                              className="text-sm font-medium text-primary underline-offset-2 hover:underline"
                              onClick={() => void toggleWaitlist(batch.id)}
                            >
                              {expandedWaitlistBatchId === batch.id ? 'Hide waitlist' : 'View waitlist'}
                            </button>
                          </div>
                          {expandedWaitlistBatchId === batch.id && (
                            <div className="mt-2 space-y-1">
                              {loadingWaitlist && !waitlistByBatch[batch.id] ? (
                                <p className="text-sm text-muted-foreground">Loading…</p>
                              ) : (waitlistByBatch[batch.id]?.length ?? 0) === 0 ? (
                                <p className="text-sm text-muted-foreground">No one on the waitlist.</p>
                              ) : (
                                waitlistByBatch[batch.id]!.map((entry) => (
                                  <p key={entry.id} className="text-sm">
                                    {entry.fullName} · {entry.email} ·{' '}
                                    <span className="text-muted-foreground">{entry.status}</span>
                                  </p>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ),
                )}

                {batchFormCourseId === course.id ? (
                  <form
                    onSubmit={(event) => handleCreateBatch(event, course.id)}
                    className="grid grid-cols-2 gap-4 rounded-lg border p-4"
                  >
                    <div className="space-y-2">
                      <Label htmlFor="cohortLabel">Batch Label</Label>
                      <Input
                        id="cohortLabel"
                        required
                        placeholder="JUL-2026"
                        value={batchForm.cohortLabel}
                        onChange={(event) =>
                          setBatchForm({ ...batchForm, cohortLabel: event.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="courseFee">Course Fee (GHS)</Label>
                      <Input
                        id="courseFee"
                        required={!batchForm.isFree}
                        disabled={batchForm.isFree}
                        type="number"
                        min="0"
                        step="0.01"
                        value={batchForm.isFree ? '0' : batchForm.courseFee}
                        onChange={(event) =>
                          setBatchForm({ ...batchForm, courseFee: event.target.value })
                        }
                      />
                    </div>
                    <div className="col-span-2 flex items-start gap-3 rounded-md border p-3">
                      <input
                        id="isFree"
                        type="checkbox"
                        className="mt-1 h-4 w-4 shrink-0"
                        checked={batchForm.isFree}
                        onChange={(event) =>
                          setBatchForm({ ...batchForm, isFree: event.target.checked })
                        }
                      />
                      <Label htmlFor="isFree" className="font-normal">
                        Free event / webinar
                        <span className="mt-1 block text-xs text-muted-foreground">
                          No fee is charged and no early-bird discount applies. Registrants
                          are confirmed on sign-up and receive their joining link straight
                          away — they are never asked to pay and never chased for a balance.
                        </span>
                      </Label>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="capacity">
                        Capacity <span className="text-muted-foreground">(optional — blank = unlimited)</span>
                      </Label>
                      <Input
                        id="capacity"
                        type="number"
                        min="1"
                        step="1"
                        placeholder="e.g. 30"
                        value={batchForm.capacity}
                        onChange={(event) =>
                          setBatchForm({ ...batchForm, capacity: event.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="startDate">Start Date</Label>
                      <Input
                        id="startDate"
                        required
                        type="date"
                        value={batchForm.startDate}
                        onChange={(event) =>
                          setBatchForm({ ...batchForm, startDate: event.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="endDate">End Date</Label>
                      <Input
                        id="endDate"
                        required
                        type="date"
                        value={batchForm.endDate}
                        onChange={(event) =>
                          setBatchForm({ ...batchForm, endDate: event.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="startTime">Start Time</Label>
                      <Input
                        id="startTime"
                        required
                        type="time"
                        value={batchForm.startTime}
                        onChange={(event) =>
                          setBatchForm({ ...batchForm, startTime: event.target.value })
                        }
                      />
                    </div>
                    {/* Class schedule (2026-08-08). Filling BOTH of these
                        gives the cohort its own Zoom room that only opens 15
                        minutes before each session. Leaving both blank keeps
                        the old behaviour: the Course's shared room, joinable
                        at any time. */}
                    <div className="space-y-2">
                      <Label htmlFor="endTime">End Time</Label>
                      <Input
                        id="endTime"
                        type="time"
                        value={batchForm.endTime}
                        onChange={(event) =>
                          setBatchForm({ ...batchForm, endTime: event.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Days this cohort meets</Label>
                      <div className="flex flex-wrap gap-3">
                        {WEEKDAYS.map((day) => (
                          <label
                            key={day.value}
                            className="flex items-center gap-1.5 text-sm font-normal"
                          >
                            <input
                              type="checkbox"
                              className="h-4 w-4"
                              checked={batchForm.meetingDays.includes(day.value)}
                              onChange={(event) =>
                                setBatchForm({
                                  ...batchForm,
                                  meetingDays: event.target.checked
                                    ? [...batchForm.meetingDays, day.value].sort((a, b) => a - b)
                                    : batchForm.meetingDays.filter((d) => d !== day.value),
                                })
                              }
                            />
                            {day.label}
                          </label>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Set an End Time and at least one day to give this cohort its own Zoom
                        room, open from 15 minutes before each session and closed the rest of
                        the time (Ghana time). Leave both blank to keep using the course&apos;s
                        shared room, which is joinable at any hour.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="facilitatorName">Facilitator Name</Label>
                      <Input
                        id="facilitatorName"
                        required
                        value={batchForm.facilitatorName}
                        onChange={(event) =>
                          setBatchForm({ ...batchForm, facilitatorName: event.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="facilitatorTutorId">Tutor</Label>
                      <select
                        id="facilitatorTutorId"
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                        value={batchForm.facilitatorTutorId}
                        onChange={(event) => {
                          const tutorId = event.target.value;
                          const tutor = tutors.find((row) => row.id === tutorId);
                          setBatchForm({
                            ...batchForm,
                            facilitatorTutorId: tutorId,
                            ...(tutor && { facilitatorName: tutor.fullName }),
                          });
                        }}
                      >
                        <option value="">— unassigned —</option>
                        {tutors.map((tutor) => (
                          <option key={tutor.id} value={tutor.id}>{tutor.fullName}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="whatsappGroupLink">WhatsApp Group Link</Label>
                      <Input
                        id="whatsappGroupLink"
                        type="url"
                        placeholder="https://chat.whatsapp.com/…"
                        value={batchForm.whatsappGroupLink}
                        onChange={(event) =>
                          setBatchForm({
                            ...batchForm,
                            whatsappGroupLink: event.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="resourcesLink">
                        Resources Link <span className="text-muted-foreground">(optional)</span>
                      </Label>
                      <Input
                        id="resourcesLink"
                        type="url"
                        placeholder="https://drive.google.com/…"
                        value={batchForm.resourcesLink}
                        onChange={(event) =>
                          setBatchForm({
                            ...batchForm,
                            resourcesLink: event.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="discountCutoffDate">
                        Discount Cutoff Date <span className="text-muted-foreground">(optional)</span>
                      </Label>
                      <Input
                        id="discountCutoffDate"
                        type="date"
                        value={batchForm.discountCutoffDate}
                        onChange={(event) =>
                          setBatchForm({ ...batchForm, discountCutoffDate: event.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="discountedFee">
                        Discounted Fee (GHS) <span className="text-muted-foreground">(optional)</span>
                      </Label>
                      <Input
                        id="discountedFee"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Early-bird price"
                        value={batchForm.discountedFee}
                        onChange={(event) =>
                          setBatchForm({ ...batchForm, discountedFee: event.target.value })
                        }
                      />
                    </div>
                    <div className="col-span-2 flex gap-3">
                      <Button type="submit" disabled={saving}>
                        {saving ? 'Saving…' : 'Create Batch'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setBatchFormCourseId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                ) : (
                  <Button variant="outline" onClick={() => setBatchFormCourseId(course.id)}>
                    + Add Batch
                  </Button>
                )}
              </CardContent>
            )}
          </Card>
        );
      })}

      {courses.length === 0 && !showCourseForm && (
        <p className="text-muted-foreground">
          No courses yet. Use “Add Course” to create the first one.
        </p>
      )}
    </div>
  );
}
