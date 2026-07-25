'use client';

import { useEffect, useState } from 'react';

import { apiFetch } from '@/components/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatDate } from '@/lib/utils';
import type { LiveSession, LiveSessionStatus } from '@/modules/live-sessions/types';

type BatchOption = { id: string; cohortLabel: string; startDate: string };
type TutorOption = { id: string; fullName: string; role: string; isActive: boolean };

const EMPTY_FORM = {
  batchId: '',
  tutorStaffId: '',
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

  useEffect(() => {
    if (!canManage) return;
    void apiFetch<{ users: TutorOption[] }>('/api/users')
      .then(({ users }) => setTutors(users.filter((user) => user.isActive && user.role === 'tutor')))
      .catch((err) => setErrorMessage(err instanceof Error ? err.message : 'Failed to load tutors.'));
  }, [canManage]);

  function showStatus(message: string) {
    setStatusMessage(message);
    setErrorMessage(null);
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const created = await apiFetch<LiveSession>('/api/live-sessions', {
        method: 'POST',
        body: JSON.stringify({
          batchId: form.batchId,
          tutorStaffId: form.tutorStaffId || null,
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
                <select id="tutor" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.tutorStaffId} onChange={(event) => setForm({ ...form, tutorStaffId: event.target.value })}>
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