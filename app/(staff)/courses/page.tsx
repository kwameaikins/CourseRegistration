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
}

interface Batch {
  id: string;
  courseId: string;
  cohortLabel: string;
  courseFee: number;
  startDate: string;
  startTime: string;
  endDate: string;
  zoomLink: string | null;
  whatsappGroupLink: string | null;
  facilitatorName: string;
  welcomeEmailEnabled: boolean;
  paymentReminderEnabled: boolean;
  classReminderEnabled: boolean;
  whatsappEnabled: boolean;
  isActive: boolean;
  discountCutoffDate: string | null;
  discountedFee: number | null;
}

const EMPTY_BATCH_FORM = {
  cohortLabel: '',
  courseFee: '',
  startDate: '',
  startTime: '09:00',
  endDate: '',
  zoomLink: '',
  whatsappGroupLink: '',
  facilitatorName: '',
  discountCutoffDate: '',
  discountedFee: '',
};

export default function CourseControlPanelPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [expandedCourseId, setExpandedCourseId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [newCourse, setNewCourse] = useState({ courseCode: '', courseName: '' });
  const [showCourseForm, setShowCourseForm] = useState(false);
  const [batchForm, setBatchForm] = useState(EMPTY_BATCH_FORM);
  const [batchFormCourseId, setBatchFormCourseId] = useState<string | null>(null);
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);
  const [editBatchForm, setEditBatchForm] = useState(EMPTY_BATCH_FORM);
  const [saving, setSaving] = useState(false);

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
        body: JSON.stringify(newCourse),
      });
      setNewCourse({ courseCode: '', courseName: '' });
      setShowCourseForm(false);
      flashStatus('Course created.');
      await reload();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to create course.');
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
          courseFee: Number(batchForm.courseFee),
          startDate: batchForm.startDate,
          startTime: batchForm.startTime,
          endDate: batchForm.endDate,
          zoomLink: batchForm.zoomLink || null,
          whatsappGroupLink: batchForm.whatsappGroupLink || null,
          facilitatorName: batchForm.facilitatorName,
          discountCutoffDate: batchForm.discountCutoffDate || null,
          discountedFee: batchForm.discountedFee ? Number(batchForm.discountedFee) : null,
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
      courseFee: String(batch.courseFee),
      startDate: batch.startDate,
      startTime: batch.startTime,
      endDate: batch.endDate,
      zoomLink: batch.zoomLink ?? '',
      whatsappGroupLink: batch.whatsappGroupLink ?? '',
      facilitatorName: batch.facilitatorName,
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
          courseFee: Number(editBatchForm.courseFee),
          startDate: editBatchForm.startDate,
          startTime: editBatchForm.startTime,
          endDate: editBatchForm.endDate,
          zoomLink: editBatchForm.zoomLink || null,
          whatsappGroupLink: editBatchForm.whatsappGroupLink || null,
          facilitatorName: editBatchForm.facilitatorName,
          discountCutoffDate: editBatchForm.discountCutoffDate || null,
          discountedFee: editBatchForm.discountedFee ? Number(editBatchForm.discountedFee) : null,
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
                          required
                          type="number"
                          min="0"
                          step="0.01"
                          value={editBatchForm.courseFee}
                          onChange={(event) =>
                            setEditBatchForm({ ...editBatchForm, courseFee: event.target.value })
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
                        <Label htmlFor={`edit-zoomLink-${batch.id}`}>Zoom Link</Label>
                        <Input
                          id={`edit-zoomLink-${batch.id}`}
                          type="url"
                          placeholder="https://zoom.us/j/…"
                          value={editBatchForm.zoomLink}
                          onChange={(event) =>
                            setEditBatchForm({ ...editBatchForm, zoomLink: event.target.value })
                          }
                        />
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
                            {formatGhs(batch.courseFee)} · {batch.facilitatorName}
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
                        required
                        type="number"
                        min="0"
                        step="0.01"
                        value={batchForm.courseFee}
                        onChange={(event) =>
                          setBatchForm({ ...batchForm, courseFee: event.target.value })
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
                      <Label htmlFor="zoomLink">Zoom Link</Label>
                      <Input
                        id="zoomLink"
                        type="url"
                        placeholder="https://zoom.us/j/…"
                        value={batchForm.zoomLink}
                        onChange={(event) =>
                          setBatchForm({ ...batchForm, zoomLink: event.target.value })
                        }
                      />
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
