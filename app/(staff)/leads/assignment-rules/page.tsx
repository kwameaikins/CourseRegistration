'use client';

import { useEffect, useState } from 'react';

import { apiFetch } from '@/components/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface AssignmentRule {
  id: string;
  leadSource: string;
  assignedTo: string;
  isActive: boolean;
  createdAt: string;
}

interface StaffUserOption {
  id: string;
  fullName: string;
  role: string;
}

export default function LeadAssignmentRulesPage() {
  const [rules, setRules] = useState<AssignmentRule[]>([]);
  const [staffUsers, setStaffUsers] = useState<StaffUserOption[]>([]);
  const [newSource, setNewSource] = useState('');
  const [newAssignee, setNewAssignee] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function loadRules() {
    try {
      const result = await apiFetch<{ rules: AssignmentRule[] }>('/api/leads/assignment-rules');
      setRules(result.rules);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load assignment rules.');
    }
  }

  useEffect(() => {
    void loadRules();
    void (async () => {
      try {
        const result = await apiFetch<{ users: StaffUserOption[] }>('/api/staff-users');
        setStaffUsers(result.users);
      } catch {
        setStaffUsers([]);
      }
    })();
  }, []);

  function staffName(id: string): string {
    return staffUsers.find((user) => user.id === id)?.fullName ?? id;
  }

  async function createRule() {
    if (!newSource.trim() || !newAssignee) return;
    setCreating(true);
    setErrorMessage(null);
    try {
      await apiFetch('/api/leads/assignment-rules', {
        method: 'POST',
        body: JSON.stringify({ leadSource: newSource.trim(), assignedTo: newAssignee }),
      });
      setNewSource('');
      setNewAssignee('');
      await loadRules();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to create assignment rule.');
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(rule: AssignmentRule) {
    setSavingId(rule.id);
    setErrorMessage(null);
    try {
      await apiFetch(`/api/leads/assignment-rules/${rule.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !rule.isActive }),
      });
      await loadRules();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to update assignment rule.');
    } finally {
      setSavingId(null);
    }
  }

  // Explicit, staff-triggered bulk action — a new/reactivated rule never
  // used to retroactively catch existing unassigned leads matching its
  // source; this applies it on demand, with a visible result count, rather
  // than silently reassigning things in the background.
  async function applyToExisting(rule: AssignmentRule) {
    setSavingId(rule.id);
    setErrorMessage(null);
    try {
      const result = await apiFetch<{ assignedCount: number }>(
        `/api/leads/assignment-rules/${rule.id}/backfill`,
        { method: 'POST' },
      );
      window.alert(`Assigned ${result.assignedCount} existing unassigned lead(s) to ${staffName(rule.assignedTo)}.`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to apply this rule to existing leads.');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Lead Routing Rules</h1>
        <p className="text-sm text-muted-foreground">
          New leads from a matching source are automatically assigned to the staff member below —
          only one active rule per source at a time.
        </p>
      </div>

      {errorMessage && (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {errorMessage}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add a rule</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Lead source</label>
            <Input
              value={newSource}
              onChange={(event) => setNewSource(event.target.value)}
              placeholder="e.g. Website"
              className="h-9 w-48"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Assign to</label>
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={newAssignee}
              onChange={(event) => setNewAssignee(event.target.value)}
            >
              <option value="">Select staff member</option>
              {staffUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.fullName}
                </option>
              ))}
            </select>
          </div>
          <Button onClick={() => void createRule()} disabled={creating || !newSource.trim() || !newAssignee}>
            Add rule
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Existing rules</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead source</TableHead>
                <TableHead>Assigned to</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell>{rule.leadSource}</TableCell>
                  <TableCell>{staffName(rule.assignedTo)}</TableCell>
                  <TableCell>
                    <Badge variant={rule.isActive ? 'outline' : 'secondary'}>
                      {rule.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void toggleActive(rule)}
                        disabled={savingId === rule.id}
                      >
                        {rule.isActive ? 'Deactivate' : 'Activate'}
                      </Button>
                      {rule.isActive && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void applyToExisting(rule)}
                          disabled={savingId === rule.id}
                        >
                          Apply to existing unassigned leads
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {rules.length === 0 && (
            <p className="text-sm text-muted-foreground">No assignment rules yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
