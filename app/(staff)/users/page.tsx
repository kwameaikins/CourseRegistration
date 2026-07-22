'use client';

// US-A05 — Staff User Management + Participant Data Deletion (DPA-02).
// Admin only (middleware + RLS enforced).
import { useCallback, useEffect, useState } from 'react';

import { apiFetch } from '@/components/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface StaffUser {
  id: string;
  fullName: string;
  email: string;
  role: string;
  isActive: boolean;
}

interface ParticipantRow {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  deleted_at: string | null;
}

const ROLES = ['admin', 'finance', 'marketing', 'tutor', 'management'] as const;

export default function StaffUserManagementPage() {
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newUser, setNewUser] = useState({ fullName: '', email: '', role: 'finance' });
  const [saving, setSaving] = useState(false);

  const [deactivationTarget, setDeactivationTarget] = useState<StaffUser | null>(null);
  const [deletionTarget, setDeletionTarget] = useState<ParticipantRow | null>(null);
  const [deletionReason, setDeletionReason] = useState('');
  const [hardDeleteTarget, setHardDeleteTarget] = useState<ParticipantRow | null>(null);
  const [immediateDeleteTarget, setImmediateDeleteTarget] = useState<ParticipantRow | null>(null);
  const [immediateDeleteReason, setImmediateDeleteReason] = useState('');
  const [immediateDeleting, setImmediateDeleting] = useState(false);

  const reload = useCallback(async () => {
    try {
      const result = await apiFetch<{ users: StaffUser[] }>('/api/users');
      setUsers(result.users);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load staff users.');
    }
    try {
      const result = await apiFetch<{ participants: ParticipantRow[] }>(
        '/api/participants',
      );
      setParticipants(result.participants);
    } catch {
      // Participant list is secondary on this screen — staff management
      // stays usable even if it fails to load.
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

  async function handleAddUser(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/api/users', { method: 'POST', body: JSON.stringify(newUser) });
      setNewUser({ fullName: '', email: '', role: 'finance' });
      setShowAddForm(false);
      flashStatus('Staff account created — an invitation email has been sent.');
      await reload();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to create account.');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(user: StaffUser, nextActive: boolean) {
    if (!nextActive) {
      // Deactivation has an immediate, security-relevant effect on another
      // person's access — confirmation required (Document 8, Section 8).
      setDeactivationTarget(user);
      return;
    }
    await applyActiveChange(user, true);
  }

  async function applyActiveChange(user: StaffUser, isActive: boolean) {
    try {
      await apiFetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive }),
      });
      flashStatus(isActive ? `${user.fullName} reactivated.` : `${user.fullName} deactivated.`);
      await reload();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to update account.');
    } finally {
      setDeactivationTarget(null);
    }
  }

  async function handleSoftDelete() {
    if (!deletionTarget) return;
    try {
      await apiFetch(`/api/participants/${deletionTarget.id}/delete`, {
        method: 'POST',
        body: JSON.stringify({ reason: deletionReason }),
      });
      flashStatus('Participant data anonymised (soft delete).');
      setDeletionTarget(null);
      setDeletionReason('');
      await reload();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Deletion failed.');
      setDeletionTarget(null);
    }
  }

  async function handleHardDelete() {
    if (!hardDeleteTarget) return;
    try {
      await apiFetch(`/api/participants/${hardDeleteTarget.id}/hard-delete`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      flashStatus('Participant permanently deleted.');
      setHardDeleteTarget(null);
      await reload();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Hard delete failed.');
      setHardDeleteTarget(null);
    }
  }

  async function handleImmediateDelete() {
    if (!immediateDeleteTarget) return;
    setImmediateDeleting(true);
    try {
      await apiFetch(`/api/participants/${immediateDeleteTarget.id}/delete-immediately`, {
        method: 'POST',
        body: JSON.stringify({ reason: immediateDeleteReason.trim() }),
      });
      flashStatus('Participant and all their registrations permanently deleted.');
      setImmediateDeleteTarget(null);
      setImmediateDeleteReason('');
      await reload();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Delete failed.');
    } finally {
      setImmediateDeleting(false);
    }
  }

  return (
    <div className="max-w-5xl space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Staff Users</h1>
        <Button onClick={() => setShowAddForm((visible) => !visible)}>+ Add Staff</Button>
      </div>

      {statusMessage && (
        <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">{statusMessage}</p>
      )}
      {errorMessage && (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {errorMessage}
        </p>
      )}

      {showAddForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New Staff Account</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddUser} className="flex flex-wrap items-end gap-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  required
                  value={newUser.fullName}
                  onChange={(event) =>
                    setNewUser({ ...newUser, fullName: event.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={newUser.email}
                  onChange={(event) => setNewUser({ ...newUser, email: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <select
                  id="role"
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={newUser.role}
                  onChange={(event) => setNewUser({ ...newUser, role: event.target.value })}
                >
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="submit" disabled={saving}>
                {saving ? 'Sending invitation…' : 'Create & Invite'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Active</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell className="font-medium">{user.fullName}</TableCell>
              <TableCell>{user.email}</TableCell>
              <TableCell>
                <Badge variant="secondary">{user.role}</Badge>
              </TableCell>
              <TableCell>
                <Switch
                  checked={user.isActive}
                  onCheckedChange={(checked) => handleToggleActive(user, checked)}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Participant Data Deletion (Ghana DPA)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            Step 1 anonymises the Participant immediately (soft delete). Step 2 —
            permanent removal — becomes available 30 days after the soft delete and only
            for Participants without financial records.
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {participants.map((participant) => (
                <TableRow key={participant.id}>
                  <TableCell>{participant.full_name}</TableCell>
                  <TableCell>{participant.email}</TableCell>
                  <TableCell>
                    {participant.deleted_at ? (
                      <Badge variant="outline">
                        Anonymised {new Date(participant.deleted_at).toLocaleDateString()}
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Active</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {participant.deleted_at ? (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setHardDeleteTarget(participant)}
                      >
                        Hard delete
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDeletionTarget(participant)}
                      >
                        Erasure request…
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Delete Test / Mistaken Data</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            Permanently and immediately removes a Participant and every one of their
            Registrations and Payments — for a wrongly-entered person or test data, not a
            data-subject erasure request. Unlike Participant Data Deletion above, there is
            no 30-day wait and financial records are not preserved.
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {participants.map((participant) => (
                <TableRow key={participant.id}>
                  <TableCell>{participant.full_name}</TableCell>
                  <TableCell>{participant.email}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setImmediateDeleteTarget(participant)}
                    >
                      Delete immediately
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog
        open={deactivationTarget !== null}
        onOpenChange={(open) => !open && setDeactivationTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate {deactivationTarget?.fullName}?</DialogTitle>
            <DialogDescription>They will lose access immediately.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeactivationTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                deactivationTarget && applyActiveChange(deactivationTarget, false)
              }
            >
              Deactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deletionTarget !== null}
        onOpenChange={(open) => !open && setDeletionTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Anonymise {deletionTarget?.full_name}?</DialogTitle>
            <DialogDescription>
              Their name, email, and phone will be overwritten immediately and they will
              receive no further emails. Financial records are preserved in anonymised
              form. This fulfils a data-subject erasure request under the Ghana DPA.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="deletionReason">Reason (recorded)</Label>
            <Input
              id="deletionReason"
              placeholder="Data subject erasure request received 2026-07-17"
              value={deletionReason}
              onChange={(event) => setDeletionReason(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletionTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deletionReason.trim().length < 3}
              onClick={handleSoftDelete}
            >
              Anonymise now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={hardDeleteTarget !== null}
        onOpenChange={(open) => !open && setHardDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Permanently delete this Participant?</DialogTitle>
            <DialogDescription>
              This removes the anonymised record entirely. It is only permitted 30+ days
              after the soft delete, and is refused if financial records exist. This
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHardDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleHardDelete}>
              Permanently delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={immediateDeleteTarget !== null}
        onOpenChange={(open) => !open && setImmediateDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Permanently delete {immediateDeleteTarget?.full_name}?
            </DialogTitle>
            <DialogDescription>
              This removes the Participant and every one of their Registrations and
              Payments entirely, right now. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="immediateDeleteReason">Reason (required, recorded)</Label>
            <Input
              id="immediateDeleteReason"
              placeholder="e.g. Test participant created during staging setup"
              value={immediateDeleteReason}
              onChange={(event) => setImmediateDeleteReason(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImmediateDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={immediateDeleteReason.trim().length < 3 || immediateDeleting}
              onClick={handleImmediateDelete}
            >
              {immediateDeleting ? 'Deleting…' : 'Permanently delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
