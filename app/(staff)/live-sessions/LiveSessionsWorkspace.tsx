'use client';

import { useEffect, useState } from 'react';

import { apiFetch } from '@/components/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatDate } from '@/lib/utils';
import { UPLOAD_ACCEPT_ATTRIBUTE, UPLOAD_TYPES_HINT } from '@/lib/upload-constants';
import type { LiveSession, LiveSessionStatus } from '@/modules/live-sessions/types';

type BatchOption = { id: string; cohortLabel: string; startDate: string };
type TutorOption = { id: string; fullName: string };
// A material is either a shared link or an uploaded file (2026-08-04).
type MaterialOption = {
  id: string;
  title: string;
  kind: 'link' | 'file';
  link: string | null;
  fileName: string | null;
  fileSizeBytes: number | null;
  createdAt: string;
};
type AssignmentOption = {
  id: string;
  title: string;
  instructions: string | null;
  dueAt: string | null;
  status: 'open' | 'closed';
  submissionCount: number;
  reviewedCount: number;
};

const EMPTY_FORM = {
  batchId: '',
  tutorId: '',
  title: '',
  startsAt: '',
  endsAt: '',
  agenda: '',
  learningOutcomes: '',
};

const NEXT_STATUS: Partial<Record<LiveSessionStatus, LiveSessionStatus>> = {
  draft: 'scheduled',
  scheduled: 'ready',
  ready: 'live',
  live: 'completed',
  completed: 'archived',
  cancelled: 'archived',
  rescheduled: 'archived',
};

// Statuses from which the backend (STATUS_TRANSITIONS in
// modules/live-sessions/service.ts) allows moving to 'cancelled' /
// 'rescheduled' — both require a reason, so they get their own confirm step
// rather than the one-click "Mark X" action above.
const CANCELLABLE_STATUSES: LiveSessionStatus[] = ['draft', 'scheduled', 'ready'];
const RESCHEDULABLE_STATUSES: LiveSessionStatus[] = ['scheduled', 'ready'];

export function LiveSessionsWorkspace({
  initialLiveSessions,
  batches,
  canManage,
}: {
  initialLiveSessions: LiveSession[];
  batches: BatchOption[];
  canManage: boolean;
}) {
  const [liveSessions, setLiveSessions] = useState(initialLiveSessions);
  const [tutors, setTutors] = useState<TutorOption[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Session id currently showing the reason prompt, and which terminal
  // status it's headed for — cancel and reschedule both require a reason
  // (STATUS_TRANSITIONS in modules/live-sessions/service.ts), so they get a
  // confirm step instead of the one-click "Mark X" action.
  const [reasonPromptFor, setReasonPromptFor] = useState<{
    sessionId: string;
    status: 'cancelled' | 'rescheduled';
  } | null>(null);
  const [reasonDraft, setReasonDraft] = useState('');
  const [materialsBatchId, setMaterialsBatchId] = useState('');
  const [materials, setMaterials] = useState<MaterialOption[]>([]);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  // Staff-authored learning resources (2026-08-04) — admin only, matching
  // the service's role gate.
  const [materialTitle, setMaterialTitle] = useState('');
  const [materialMode, setMaterialMode] = useState<'file' | 'link'>('file');
  const [materialLink, setMaterialLink] = useState('');
  const [materialFile, setMaterialFile] = useState<File | null>(null);
  const [materialSaving, setMaterialSaving] = useState(false);

  // Assignments (2026-08-04)
  const [assignments, setAssignments] = useState<AssignmentOption[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [assignmentTitle, setAssignmentTitle] = useState('');
  const [assignmentInstructions, setAssignmentInstructions] = useState('');
  const [assignmentDueAt, setAssignmentDueAt] = useState('');
  const [assignmentSaving, setAssignmentSaving] = useState(false);

  useEffect(() => {
    if (!canManage) return;
    void apiFetch<{ tutors: TutorOption[] }>('/api/tutors/picker')
      .then(({ tutors }) => setTutors(tutors))
      .catch((err) => setErrorMessage(err instanceof Error ? err.message : 'Failed to load tutors.'));
  }, [canManage]);

  useEffect(() => {
    if (!materialsBatchId) {
      setMaterials([]);
      setAssignments([]);
      return;
    }
    setMaterialsLoading(true);
    apiFetch<{ materials: MaterialOption[] }>(
      `/api/live-sessions/materials?batchId=${encodeURIComponent(materialsBatchId)}`,
    )
      .then(({ materials }) => setMaterials(materials))
      .catch(() => setMaterials([]))
      .finally(() => setMaterialsLoading(false));

    setAssignmentsLoading(true);
    apiFetch<{ assignments: AssignmentOption[] }>(
      `/api/live-sessions/assignments?batchId=${encodeURIComponent(materialsBatchId)}`,
    )
      .then(({ assignments }) => setAssignments(assignments))
      .catch(() => setAssignments([]))
      .finally(() => setAssignmentsLoading(false));
  }, [materialsBatchId]);

  function showStatus(message: string) {
    setStatusMessage(message);
    setErrorMessage(null);
  }

  function reloadMaterials() {
    if (!materialsBatchId) return;
    apiFetch<{ materials: MaterialOption[] }>(
      `/api/live-sessions/materials?batchId=${encodeURIComponent(materialsBatchId)}`,
    )
      .then(({ materials }) => setMaterials(materials))
      .catch(() => setMaterials([]));
  }

  function reloadAssignments() {
    if (!materialsBatchId) return;
    apiFetch<{ assignments: AssignmentOption[] }>(
      `/api/live-sessions/assignments?batchId=${encodeURIComponent(materialsBatchId)}`,
    )
      .then(({ assignments }) => setAssignments(assignments))
      .catch(() => setAssignments([]));
  }

  // Link posts JSON, upload posts multipart — the same two transports the
  // tutor portal uses against its own endpoint.
  async function addMaterial() {
    if (!materialsBatchId || !materialTitle.trim()) return;
    setMaterialSaving(true);
    try {
      if (materialMode === 'file' && materialFile) {
        const formData = new FormData();
        formData.append('batchId', materialsBatchId);
        formData.append('title', materialTitle.trim());
        formData.append('file', materialFile);
        await apiFetch('/api/live-sessions/materials', { method: 'POST', body: formData });
      } else {
        await apiFetch('/api/live-sessions/materials', {
          method: 'POST',
          body: JSON.stringify({
            batchId: materialsBatchId,
            title: materialTitle.trim(),
            link: materialLink.trim(),
          }),
        });
      }
      setMaterialTitle('');
      setMaterialLink('');
      setMaterialFile(null);
      reloadMaterials();
      showStatus('Learning resource shared with this batch.');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to share the resource.');
    } finally {
      setMaterialSaving(false);
    }
  }

  async function openMaterial(material: MaterialOption) {
    if (material.kind === 'link') {
      window.open(material.link ?? '#', '_blank', 'noopener,noreferrer');
      return;
    }
    try {
      const { url } = await apiFetch<{ url: string }>(
        `/api/live-sessions/materials/${material.id}/download-url`,
      );
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not open that file.');
    }
  }

  async function removeMaterial(id: string) {
    try {
      await apiFetch(`/api/live-sessions/materials/${id}`, { method: 'DELETE' });
      setMaterials((current) => current.filter((item) => item.id !== id));
      showStatus('Resource removed.');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to remove the resource.');
    }
  }

  async function addAssignment() {
    if (!materialsBatchId || !assignmentTitle.trim()) return;
    setAssignmentSaving(true);
    try {
      await apiFetch('/api/live-sessions/assignments', {
        method: 'POST',
        body: JSON.stringify({
          batchId: materialsBatchId,
          title: assignmentTitle.trim(),
          instructions: assignmentInstructions.trim() || null,
          // datetime-local is timezone-naive; the browser reads it as local
          // (Ghana) time and toISOString converts to the UTC the API expects.
          dueAt: assignmentDueAt ? new Date(assignmentDueAt).toISOString() : null,
        }),
      });
      setAssignmentTitle('');
      setAssignmentInstructions('');
      setAssignmentDueAt('');
      reloadAssignments();
      showStatus('Assignment set for this batch.');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to set the assignment.');
    } finally {
      setAssignmentSaving(false);
    }
  }

  async function setAssignmentStatus(id: string, status: 'open' | 'closed') {
    try {
      await apiFetch(`/api/live-sessions/assignments/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setAssignments((current) =>
        current.map((item) => (item.id === id ? { ...item, status } : item)),
      );
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to update the assignment.');
    }
  }

  async function removeAssignment(id: string) {
    if (!window.confirm('Delete this assignment and every submission against it? This cannot be undone.')) {
      return;
    }
    try {
      await apiFetch(`/api/live-sessions/assignments/${id}`, { method: 'DELETE' });
      setAssignments((current) => current.filter((item) => item.id !== id));
      showStatus('Assignment deleted.');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to delete the assignment.');
    }
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const created = await apiFetch<LiveSession>('/api/live-sessions', {
        method: 'POST',
        body: JSON.stringify({
          batchId: form.batchId,
          tutorId: form.tutorId || null,
          title: form.title,
          startsAt: new Date(form.startsAt).toISOString(),
          endsAt: new Date(form.endsAt).toISOString(),
          agenda: form.agenda || null,
          learningOutcomes: form.learningOutcomes || null,
        }),
      });
      setLiveSessions((sessions) => [...sessions, created].sort((a, b) => a.startsAt.localeCompare(b.startsAt)));
      setForm(EMPTY_FORM);
      showStatus('Live session scheduled. Zoom is not created until the pilot integration is enabled.');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to create live session.');
    } finally {
      setSaving(false);
    }
  }

  async function advanceStatus(session: LiveSession) {
    const nextStatus = NEXT_STATUS[session.status];
    if (!nextStatus) return;
    setSaving(true);
    try {
      const updated = await apiFetch<LiveSession>(`/api/live-sessions/${session.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      setLiveSessions((sessions) => sessions.map((item) => (item.id === updated.id ? updated : item)));
      showStatus(`Session marked ${nextStatus.replace('_', ' ')}.`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to update live session.');
    } finally {
      setSaving(false);
    }
  }

  async function confirmReasonedStatusChange() {
    if (!reasonPromptFor || reasonDraft.trim().length < 3) return;
    setSaving(true);
    try {
      const updated = await apiFetch<LiveSession>(`/api/live-sessions/${reasonPromptFor.sessionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: reasonPromptFor.status, statusReason: reasonDraft.trim() }),
      });
      setLiveSessions((sessions) => sessions.map((item) => (item.id === updated.id ? updated : item)));
      showStatus(`Session marked ${reasonPromptFor.status}.`);
      setReasonPromptFor(null);
      setReasonDraft('');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to update live session.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Live Sessions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Schedule and control individual class occurrences. Existing batch Zoom classrooms remain unchanged.
        </p>
      </div>

      {statusMessage && <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">{statusMessage}</p>}
      {errorMessage && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{errorMessage}</p>}

      {canManage && (
        <Card>
          <CardHeader><CardTitle>Schedule a live session</CardTitle></CardHeader>
          <CardContent>
            <form className="grid gap-4 md:grid-cols-2" onSubmit={handleCreate}>
              <div className="space-y-2">
                <Label htmlFor="batch">Batch</Label>
                <select id="batch" required className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.batchId} onChange={(event) => setForm({ ...form, batchId: event.target.value })}>
                  <option value="">Select a batch</option>
                  {batches.map((batch) => <option key={batch.id} value={batch.id}>{batch.cohortLabel} ({formatDate(batch.startDate)})</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tutor">Tutor</Label>
                <select id="tutor" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.tutorId} onChange={(event) => setForm({ ...form, tutorId: event.target.value })}>
                  <option value="">Use batch facilitator</option>
                  {tutors.map((tutor) => <option key={tutor.id} value={tutor.id}>{tutor.fullName}</option>)}
                </select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="title">Title</Label>
                <Input id="title" required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="e.g. Module 1: Practical Foundations" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="startsAt">Starts</Label>
                <Input id="startsAt" required type="datetime-local" value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endsAt">Ends</Label>
                <Input id="endsAt" required type="datetime-local" value={form.endsAt} onChange={(event) => setForm({ ...form, endsAt: event.target.value })} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="agenda">Agenda</Label>
                <textarea id="agenda" className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.agenda} onChange={(event) => setForm({ ...form, agenda: event.target.value })} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="outcomes">Learning outcomes</Label>
                <textarea id="outcomes" className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.learningOutcomes} onChange={(event) => setForm({ ...form, learningOutcomes: event.target.value })} />
              </div>
              <div className="md:col-span-2"><Button disabled={saving} type="submit">Schedule session</Button></div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Learning resources</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="materialsBatch">Batch</Label>
            <select
              id="materialsBatch"
              className="flex h-10 w-full max-w-md rounded-md border border-input bg-background px-3 text-sm"
              value={materialsBatchId}
              onChange={(event) => setMaterialsBatchId(event.target.value)}
            >
              <option value="">Select a batch…</option>
              {batches.map((batch) => (
                <option key={batch.id} value={batch.id}>
                  {batch.cohortLabel} ({formatDate(batch.startDate)})
                </option>
              ))}
            </select>
          </div>

          {canManage && materialsBatchId && (
            <div className="grid gap-3 rounded-md border p-3 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="materialTitle">Title</Label>
                <Input
                  id="materialTitle"
                  value={materialTitle}
                  onChange={(event) => setMaterialTitle(event.target.value)}
                  placeholder="e.g. Slides — Session 3"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="materialMode">Share as</Label>
                <select
                  id="materialMode"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={materialMode}
                  onChange={(event) => setMaterialMode(event.target.value as 'file' | 'link')}
                >
                  <option value="file">Upload a file</option>
                  <option value="link">Link to somewhere else</option>
                </select>
              </div>
              {materialMode === 'file' ? (
                <div className="space-y-2">
                  <Label htmlFor="materialFile">File</Label>
                  <Input
                    id="materialFile"
                    type="file"
                    accept={UPLOAD_ACCEPT_ATTRIBUTE}
                    onChange={(event) => setMaterialFile(event.target.files?.[0] ?? null)}
                  />
                  <p className="text-xs text-muted-foreground">{UPLOAD_TYPES_HINT}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="materialLink">Link</Label>
                  <Input
                    id="materialLink"
                    value={materialLink}
                    onChange={(event) => setMaterialLink(event.target.value)}
                    placeholder="https://drive.google.com/…"
                  />
                </div>
              )}
              <div className="md:col-span-2">
                <Button
                  disabled={
                    materialSaving ||
                    !materialTitle.trim() ||
                    (materialMode === 'file' ? !materialFile : !materialLink.trim())
                  }
                  onClick={() => void addMaterial()}
                >
                  {materialSaving ? 'Sharing…' : 'Share resource'}
                </Button>
              </div>
            </div>
          )}

          {materialsLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : materials.length === 0 ? (
            materialsBatchId && (
              <p className="text-sm text-muted-foreground">Nothing shared yet for this batch.</p>
            )
          ) : (
            <ul className="space-y-1 text-sm">
              {materials.map((material) => (
                <li key={material.id} className="flex items-center justify-between border-b pb-1 last:border-b-0">
                  <button
                    type="button"
                    className="text-primary underline"
                    onClick={() => void openMaterial(material)}
                  >
                    {material.title}
                  </button>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    {material.kind === 'file' ? 'File' : 'Link'}
                    <span>{formatDate(material.createdAt)}</span>
                    {canManage && (
                      <button
                        type="button"
                        className="underline"
                        onClick={() => void removeMaterial(material.id)}
                      >
                        Remove
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Assignments</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {!materialsBatchId ? (
            <p className="text-sm text-muted-foreground">
              Select a batch above to see its assignments.
            </p>
          ) : (
            <>
              {canManage && (
                <div className="grid gap-3 rounded-md border p-3 md:grid-cols-2">
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="assignmentTitle">Title</Label>
                    <Input
                      id="assignmentTitle"
                      value={assignmentTitle}
                      onChange={(event) => setAssignmentTitle(event.target.value)}
                      placeholder="e.g. Case study — risk register"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="assignmentInstructions">Instructions</Label>
                    <textarea
                      id="assignmentInstructions"
                      className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={assignmentInstructions}
                      onChange={(event) => setAssignmentInstructions(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="assignmentDueAt">Due (optional)</Label>
                    <Input
                      id="assignmentDueAt"
                      type="datetime-local"
                      value={assignmentDueAt}
                      onChange={(event) => setAssignmentDueAt(event.target.value)}
                    />
                  </div>
                  <div className="flex items-end md:col-span-2">
                    <Button
                      disabled={assignmentSaving || !assignmentTitle.trim()}
                      onClick={() => void addAssignment()}
                    >
                      {assignmentSaving ? 'Setting…' : 'Set assignment'}
                    </Button>
                  </div>
                </div>
              )}

              {assignmentsLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : assignments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No assignments set for this batch.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {assignments.map((assignment) => (
                    <li key={assignment.id} className="rounded-md border p-3">
                      <p className="font-medium">{assignment.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {assignment.status === 'closed' ? 'Closed' : 'Open'}
                        {assignment.dueAt && <> · Due {formatDate(assignment.dueAt)}</>}
                        {' · '}
                        {assignment.reviewedCount} of {assignment.submissionCount} marked
                      </p>
                      {assignment.instructions && (
                        <p className="mt-1 whitespace-pre-wrap text-sm">{assignment.instructions}</p>
                      )}
                      {/* Marking itself is a tutor responsibility (Document 14
                          §6) and happens in the tutor portal — staff see
                          progress here, not individual learners' work. */}
                      {canManage && (
                        <div className="mt-2 flex gap-2">
                          <Button
                            variant="outline"
                            onClick={() =>
                              void setAssignmentStatus(
                                assignment.id,
                                assignment.status === 'closed' ? 'open' : 'closed',
                              )
                            }
                          >
                            {assignment.status === 'closed' ? 'Reopen' : 'Close'}
                          </Button>
                          <Button variant="destructive" onClick={() => void removeAssignment(assignment.id)}>
                            Delete
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Session control centre</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {liveSessions.length === 0 && <p className="text-sm text-muted-foreground">No live sessions have been scheduled.</p>}
          {liveSessions.map((session) => {
            const batch = batches.find((item) => item.id === session.batchId);
            const nextStatus = NEXT_STATUS[session.status];
            const canCancel = CANCELLABLE_STATUSES.includes(session.status);
            const canReschedule = RESCHEDULABLE_STATUSES.includes(session.status);
            const promptingThisSession = reasonPromptFor?.sessionId === session.id;
            return (
              <div key={session.id} className="rounded-md border p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-medium">{session.title}</p>
                    <p className="text-sm text-muted-foreground">{batch?.cohortLabel ?? 'Assigned batch'} · {new Date(session.startsAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Accra' })} GMT</p>
                    <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">{session.status.replace('_', ' ')}</p>
                  </div>
                  {canManage && (
                    <div className="flex flex-wrap gap-2">
                      {nextStatus && (
                        <Button variant="outline" disabled={saving} onClick={() => void advanceStatus(session)}>
                          Mark {nextStatus.replace('_', ' ')}
                        </Button>
                      )}
                      {canReschedule && (
                        <Button
                          variant="outline"
                          disabled={saving}
                          onClick={() => {
                            setReasonPromptFor({ sessionId: session.id, status: 'rescheduled' });
                            setReasonDraft('');
                          }}
                        >
                          Reschedule
                        </Button>
                      )}
                      {canCancel && (
                        <Button
                          variant="destructive"
                          disabled={saving}
                          onClick={() => {
                            setReasonPromptFor({ sessionId: session.id, status: 'cancelled' });
                            setReasonDraft('');
                          }}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                {promptingThisSession && (
                  <div className="mt-3 space-y-2 border-t pt-3">
                    <Label htmlFor={`reason-${session.id}`}>
                      Reason for marking this session {reasonPromptFor!.status} (required, recorded)
                    </Label>
                    <Input
                      id={`reason-${session.id}`}
                      autoFocus
                      value={reasonDraft}
                      onChange={(event) => setReasonDraft(event.target.value)}
                      placeholder="e.g. Facilitator unavailable, moved to next week"
                    />
                    <div className="flex gap-2">
                      <Button
                        variant={reasonPromptFor!.status === 'cancelled' ? 'destructive' : 'default'}
                        disabled={reasonDraft.trim().length < 3 || saving}
                        onClick={() => void confirmReasonedStatusChange()}
                      >
                        Confirm {reasonPromptFor!.status}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setReasonPromptFor(null);
                          setReasonDraft('');
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}