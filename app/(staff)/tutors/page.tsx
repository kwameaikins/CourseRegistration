'use client';

import { useEffect, useState } from 'react';

import { apiFetch } from '@/components/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface TutorRow {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  batchCount: number;
}

interface TutorActivityRow {
  id: string;
  tutorName: string;
  actionType: string;
  createdAt: string;
}

const emptyForm = { fullName: '', email: '', phone: '' };

const ACTION_LABELS: Record<string, string> = {
  pin_changed: 'Changed their PIN',
  contact_updated: 'Updated their contact details',
  attendance_exception_raised: 'Flagged an attendance issue',
  material_added: 'Added a material link',
  material_removed: 'Removed a material link',
};

export default function TutorsPage() {
  const [tutors, setTutors] = useState<TutorRow[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [activity, setActivity] = useState<TutorActivityRow[]>([]);

  async function loadTutors() {
    try {
      const result = await apiFetch<{ tutors: TutorRow[] }>('/api/tutors');
      setTutors(result.tutors);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load tutors.');
    }
  }

  useEffect(() => {
    void loadTutors();
    apiFetch<{ activity: TutorActivityRow[] }>('/api/tutors/activity')
      .then((result) => setActivity(result.activity))
      .catch(() => setActivity([]));
  }, []);

  async function createTutor() {
    setCreating(true);
    setErrorMessage(null);
    try {
      await apiFetch('/api/tutors', {
        method: 'POST',
        body: JSON.stringify({
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
        }),
      });
      setForm(emptyForm);
      await loadTutors();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to add tutor.');
    } finally {
      setCreating(false);
    }
  }

  function startEditing(tutor: TutorRow) {
    setEditingId(tutor.id);
    setEditForm({ fullName: tutor.fullName, email: tutor.email, phone: tutor.phone });
  }

  async function saveEdit(id: string) {
    setSaving(true);
    setErrorMessage(null);
    try {
      await apiFetch(`/api/tutors/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          fullName: editForm.fullName.trim(),
          email: editForm.email.trim(),
          phone: editForm.phone.trim(),
        }),
      });
      setEditingId(null);
      await loadTutors();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to update tutor.');
    } finally {
      setSaving(false);
    }
  }

  const canSubmit = form.fullName.trim().length >= 2 && form.email.trim() && form.phone.trim();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Tutors</h1>
        <p className="text-sm text-muted-foreground">
          External facilitators who teach Knowsia courses — not staff accounts. Each tutor gets
          their own portal (reg.knowsia.com/tutor-portal) with their teaching schedule, roster,
          attendance, and certificate-eligibility views, PIN-protected.
        </p>
      </div>

      {errorMessage && (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {errorMessage}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add a tutor</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Input
            placeholder="Full name"
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
          />
          <Input
            placeholder="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <Input
            placeholder="Phone"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <div className="md:col-span-3">
            <Button onClick={() => void createTutor()} disabled={creating || !canSubmit}>
              {creating ? 'Adding…' : 'Add tutor'}
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              Their portal PIN starts as the last 4 digits of the phone number entered here.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tutors</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Batches</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tutors.map((tutor) =>
                editingId === tutor.id ? (
                  <TableRow key={tutor.id}>
                    <TableCell>
                      <Input
                        className="h-9"
                        value={editForm.fullName}
                        onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-9"
                        type="email"
                        value={editForm.email}
                        onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-9"
                        value={editForm.phone}
                        onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                      />
                    </TableCell>
                    <TableCell>{tutor.batchCount}</TableCell>
                    <TableCell className="space-x-2">
                      <Button size="sm" disabled={saving} onClick={() => void saveEdit(tutor.id)}>
                        {saving ? 'Saving…' : 'Save'}
                      </Button>
                      <Button size="sm" variant="outline" disabled={saving} onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                    </TableCell>
                  </TableRow>
                ) : (
                  <TableRow key={tutor.id}>
                    <TableCell className="font-medium">{tutor.fullName}</TableCell>
                    <TableCell>{tutor.email}</TableCell>
                    <TableCell>{tutor.phone}</TableCell>
                    <TableCell>{tutor.batchCount}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => startEditing(tutor)}>
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ),
              )}
            </TableBody>
          </Table>
          {tutors.length === 0 && (
            <p className="py-4 text-sm text-muted-foreground">No tutors added yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent tutor activity</CardTitle>
        </CardHeader>
        <CardContent>
          {activity.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">No tutor-portal activity yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {activity.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between border-b pb-2 last:border-b-0">
                  <span>
                    <strong>{entry.tutorName}</strong> — {ACTION_LABELS[entry.actionType] ?? entry.actionType}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(entry.createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
