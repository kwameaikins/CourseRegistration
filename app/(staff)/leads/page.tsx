'use client';

import { useEffect, useState } from 'react';

import { apiFetch } from '@/components/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LeadDetailDialog } from '@/app/(staff)/leads/LeadDetailDialog';

interface LeadRow {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  company: string | null;
  jobTitle: string | null;
  leadSource: string;
  status: string;
  score: number;
  assignedTo: string | null;
  createdAt: string;
}

interface StaffUserOption {
  id: string;
  fullName: string;
  role: string;
}

interface PipelineSummary {
  total: number;
  byStatus: Record<string, number>;
  averageScore: number;
  unassigned: number;
}

export default function LeadsPage() {
  const [rows, setRows] = useState<LeadRow[]>([]);
  const [staffUsers, setStaffUsers] = useState<StaffUserOption[]>([]);
  const [summary, setSummary] = useState<PipelineSummary | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [viewingLeadId, setViewingLeadId] = useState<string | null>(null);

  async function loadLeads() {
    try {
      const result = await apiFetch<{ leads: LeadRow[] }>('/api/leads');
      setRows(result.leads);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load leads.');
    }
  }

  async function loadSummary() {
    try {
      const result = await apiFetch<PipelineSummary>('/api/leads/summary');
      setSummary(result);
    } catch {
      setSummary(null);
    }
  }

  useEffect(() => {
    void loadLeads();
    void loadSummary();
    void (async () => {
      try {
        const result = await apiFetch<{ users: StaffUserOption[] }>('/api/staff-users');
        setStaffUsers(result.users);
      } catch {
        setStaffUsers([]);
      }
    })();
  }, []);

  async function updateLeadStatus(id: string, status: string) {
    try {
      setSavingId(id);
      await apiFetch(`/api/leads/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await loadLeads();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to update lead.');
    } finally {
      setSavingId(null);
    }
  }

  async function updateLeadField(id: string, changes: Record<string, unknown>) {
    try {
      setSavingId(id);
      await apiFetch(`/api/leads/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(changes),
      });
      await loadLeads();
      await loadSummary();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to update lead.');
    } finally {
      setSavingId(null);
    }
  }

  async function addFollowUpNote(id: string, note: string) {
    try {
      await updateLeadField(id, { notes: note });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save follow-up note.');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Leads</h1>
          <p className="text-sm text-muted-foreground">
            A first step toward the Revenue OS lead pipeline.
          </p>
        </div>
      </div>

      {errorMessage && (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {errorMessage}
        </p>
      )}

      {summary && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Total leads</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{summary.total}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Average score</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{summary.averageScore}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Unassigned</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{summary.unassigned}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">By status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {Object.entries(summary.byStatus).map(([status, count]) => (
                <div key={status} className="flex justify-between">
                  <span>{status}</span>
                  <span className="font-medium">{count}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recent leads</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="font-medium">{row.fullName}</div>
                    <div className="text-sm text-muted-foreground">{row.email}</div>
                  </TableCell>
                  <TableCell>{row.leadSource}</TableCell>
                  <TableCell>
                    <div className="space-y-2">
                      <Badge variant="outline">{row.status}</Badge>
                      <select
                        className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                        value={row.status}
                        onChange={(event) => void updateLeadStatus(row.id, event.target.value)}
                        disabled={savingId === row.id}
                      >
                        <option value="New">New</option>
                        <option value="Qualified">Qualified</option>
                        <option value="Follow-up">Follow-up</option>
                        <option value="Enrolled">Enrolled</option>
                      </select>
                      <select
                        className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                        value={row.assignedTo ?? ''}
                        onChange={(event) => void updateLeadField(row.id, { assignedTo: event.target.value || null })}
                        disabled={savingId === row.id}
                      >
                        <option value="">Unassigned</option>
                        {staffUsers.map((user) => (
                          <option key={user.id} value={user.id}>
                            {user.fullName}
                          </option>
                        ))}
                      </select>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        className="h-8 w-20"
                        value={row.score}
                        onChange={(event) =>
                          void updateLeadField(row.id, { score: Number(event.target.value) })
                        }
                      />
                    </div>
                  </TableCell>
                  <TableCell>{row.score}</TableCell>
                  <TableCell>
                    <div className="space-y-2">
                      <div>{new Date(row.createdAt).toLocaleDateString()}</div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setViewingLeadId(row.id)}>
                          View
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const note = window.prompt('Add a follow-up note', 'Follow up this week');
                            if (note) void addFollowUpNote(row.id, note);
                          }}
                        >
                          Follow-up
                        </Button>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <LeadDetailDialog leadId={viewingLeadId} onClose={() => setViewingLeadId(null)} />
    </div>
  );
}
