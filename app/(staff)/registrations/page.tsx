'use client';

// F1.03 — Registration List (Document 8, Section 4). Filters apply
// immediately on change; Notes are inline-editable for admin/marketing.
// The API shapes fields per role — this screen renders only what it gets.
import { useCallback, useEffect, useState } from 'react';

import { apiFetch } from '@/components/api-client';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDate, formatGhs } from '@/lib/utils';
import { RegistrationDetailDialog } from '@/app/(staff)/registrations/RegistrationDetailDialog';

interface RegistrationRow {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  jobTitle: string | null;
  company: string | null;
  gender: 'Male' | 'Female' | null;
  courseName: string;
  cohortLabel: string;
  leadSource: string;
  registrationStatus: string;
  paymentStatus: 'Unpaid' | 'Part Payment' | 'Paid';
  courseFee: number;
  amountPaid: number;
  balance: number;
  registeredAt: string;
  notes: string | null;
}

interface Course {
  id: string;
  courseName: string;
}

const REGISTRATION_STATUSES = ['Registered', 'Confirmed', 'Attended', 'Cancelled'];
const PAYMENT_STATUSES = ['Unpaid', 'Part Payment', 'Paid'];
const LEAD_SOURCES = ['WhatsApp', 'Facebook', 'LinkedIn', 'Referral', 'Website', 'Other'];

function paymentBadge(status: RegistrationRow['paymentStatus']) {
  if (status === 'Paid') return <Badge className="bg-emerald-600">Paid</Badge>;
  if (status === 'Part Payment') return <Badge className="bg-amber-500">Part Payment</Badge>;
  return <Badge variant="destructive">Unpaid</Badge>;
}

export default function RegistrationListPage() {
  const [rows, setRows] = useState<RegistrationRow[]>([]);
  const [total, setTotal] = useState(0);
  const [courses, setCourses] = useState<Course[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savedToast, setSavedToast] = useState(false);

  const [filters, setFilters] = useState({
    courseId: '',
    registrationStatus: '',
    paymentStatus: '',
    leadSource: '',
    dateFrom: '',
    dateTo: '',
    search: '',
  });

  const [editingNotesId, setEditingNotesId] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState('');
  const [viewingRegistrationId, setViewingRegistrationId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '200' });
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.set(key, value);
      });
      const result = await apiFetch<{
        registrations: RegistrationRow[];
        pagination: { total: number };
      }>(`/api/registrations?${params.toString()}`);
      setRows(result.registrations);
      setTotal(result.pagination.total);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load registrations.');
    }
  }, [filters]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    apiFetch<{ courses: Course[] }>('/api/courses')
      .then((result) => setCourses(result.courses))
      .catch(() => undefined);
  }, []);

  async function saveNotes(registrationId: string) {
    try {
      await apiFetch(`/api/registrations/${registrationId}`, {
        method: 'PATCH',
        body: JSON.stringify({ notes: notesDraft.trim() || null }),
      });
      setEditingNotesId(null);
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 2000);
      await reload();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save notes.');
      setEditingNotesId(null);
    }
  }

  const selectClass =
    'h-9 rounded-md border border-input bg-background px-2 text-sm';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Registrations</h1>
        <p className="text-sm text-muted-foreground">{total} total</p>
      </div>

      {errorMessage && (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {errorMessage}
        </p>
      )}
      {savedToast && (
        <p className="rounded-md bg-emerald-50 p-2 text-sm text-emerald-700">Saved</p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <select
          className={selectClass}
          value={filters.courseId}
          onChange={(event) => setFilters({ ...filters, courseId: event.target.value })}
        >
          <option value="">All courses</option>
          {courses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.courseName}
            </option>
          ))}
        </select>
        <select
          className={selectClass}
          value={filters.registrationStatus}
          onChange={(event) =>
            setFilters({ ...filters, registrationStatus: event.target.value })
          }
        >
          <option value="">All registration statuses</option>
          {REGISTRATION_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
        <select
          className={selectClass}
          value={filters.paymentStatus}
          onChange={(event) => setFilters({ ...filters, paymentStatus: event.target.value })}
        >
          <option value="">All payment statuses</option>
          {PAYMENT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
        <select
          className={selectClass}
          value={filters.leadSource}
          onChange={(event) => setFilters({ ...filters, leadSource: event.target.value })}
        >
          <option value="">All lead sources</option>
          {LEAD_SOURCES.map((source) => (
            <option key={source} value={source}>
              {source}
            </option>
          ))}
        </select>
        <Input
          type="date"
          className="h-9 w-40"
          value={filters.dateFrom}
          onChange={(event) => setFilters({ ...filters, dateFrom: event.target.value })}
        />
        <Input
          type="date"
          className="h-9 w-40"
          value={filters.dateTo}
          onChange={(event) => setFilters({ ...filters, dateTo: event.target.value })}
        />
        <Input
          placeholder="Search name / email / phone"
          className="h-9 w-56"
          value={filters.search}
          onChange={(event) => setFilters({ ...filters, search: event.target.value })}
        />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Participant</TableHead>
            <TableHead>Course / Batch</TableHead>
            <TableHead>Lead Source</TableHead>
            <TableHead>Registration</TableHead>
            <TableHead>Payment</TableHead>
            <TableHead>Balance</TableHead>
            <TableHead>Registered</TableHead>
            <TableHead>Notes</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell>
                <p className="font-medium">
                  {row.fullName}
                  {row.gender && (
                    <span className="ml-1 font-normal text-muted-foreground">
                      ({row.gender})
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {row.email} · {row.phone}
                </p>
                {(row.jobTitle || row.company) && (
                  <p className="text-xs text-muted-foreground">
                    {[row.jobTitle, row.company].filter(Boolean).join(', ')}
                  </p>
                )}
              </TableCell>
              <TableCell>
                <p>{row.courseName}</p>
                <p className="text-xs text-muted-foreground">{row.cohortLabel}</p>
              </TableCell>
              <TableCell>{row.leadSource}</TableCell>
              <TableCell>
                <Badge variant="secondary">{row.registrationStatus}</Badge>
              </TableCell>
              <TableCell>{paymentBadge(row.paymentStatus)}</TableCell>
              <TableCell>{formatGhs(row.balance)}</TableCell>
              <TableCell>{formatDate(row.registeredAt)}</TableCell>
              <TableCell className="max-w-56">
                {editingNotesId === row.id ? (
                  <Input
                    autoFocus
                    className="h-8"
                    value={notesDraft}
                    onChange={(event) => setNotesDraft(event.target.value)}
                    onBlur={() => saveNotes(row.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void saveNotes(row.id);
                      if (event.key === 'Escape') setEditingNotesId(null);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="group flex w-full items-center gap-1 text-left text-sm"
                    onClick={() => {
                      setEditingNotesId(row.id);
                      setNotesDraft(row.notes ?? '');
                    }}
                  >
                    <span className="truncate">
                      {row.notes ?? <span className="text-muted-foreground">—</span>}
                    </span>
                    <span className="invisible text-xs text-muted-foreground group-hover:visible">
                      ✎
                    </span>
                  </button>
                )}
              </TableCell>
              <TableCell>
                <button
                  type="button"
                  className="text-sm font-medium text-primary underline-offset-2 hover:underline"
                  onClick={() => setViewingRegistrationId(row.id)}
                >
                  View
                </button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {viewingRegistrationId && (
        <RegistrationDetailDialog
          registrationId={viewingRegistrationId}
          onClose={() => setViewingRegistrationId(null)}
        />
      )}

      {rows.length === 0 && <p className="text-muted-foreground">No registrations found.</p>}
    </div>
  );
}
