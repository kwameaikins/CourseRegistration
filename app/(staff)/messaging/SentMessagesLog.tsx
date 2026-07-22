'use client';

// Admin review of every email/WhatsApp/SMS sent to registrants — a merged,
// reverse-chronological feed across the three message logs (system review,
// 2026-07-22).
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
import { formatDate } from '@/lib/utils';

interface LogRow {
  channel: 'email' | 'whatsapp' | 'sms';
  messageType: string;
  sentAt: string;
  success: boolean;
  errorMessage: string | null;
  registrationId: string;
  participantName: string;
  participantEmail: string;
  courseName: string;
  cohortLabel: string;
}

const CHANNEL_LABELS: Record<LogRow['channel'], string> = {
  email: 'Email',
  whatsapp: 'WhatsApp',
  sms: 'SMS',
};

const selectClass = 'h-9 rounded-md border border-input bg-background px-2 text-sm';

export function SentMessagesLog() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [channel, setChannel] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (channel) params.set('channel', channel);
      if (status) params.set('status', status);
      if (search) params.set('search', search);
      const result = await apiFetch<{
        rows: LogRow[];
        pagination: { total: number };
      }>(`/api/messaging/log?${params.toString()}`);
      setRows(result.rows);
      setTotal(result.pagination.total);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load sent messages.');
    } finally {
      setLoading(false);
    }
  }, [page, limit, channel, status, search]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    setPage(1);
  }, [channel, status, search]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Every email, WhatsApp, and SMS the system has sent to a registrant, most recent first.
      </p>

      {errorMessage && (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {errorMessage}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <select className={selectClass} value={channel} onChange={(e) => setChannel(e.target.value)}>
          <option value="">All channels</option>
          <option value="email">Email</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="sms">SMS</option>
        </select>
        <select className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="success">Sent</option>
          <option value="failed">Failed</option>
        </select>
        <Input
          placeholder="Search name / email"
          className="h-9 w-64"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <p className="text-sm text-muted-foreground">{total} total</p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Sent</TableHead>
            <TableHead>Channel</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Recipient</TableHead>
            <TableHead>Course / Cohort</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={`${row.channel}-${row.registrationId}-${row.messageType}-${index}`}>
              <TableCell className="whitespace-nowrap">{formatDate(row.sentAt)}</TableCell>
              <TableCell>{CHANNEL_LABELS[row.channel]}</TableCell>
              <TableCell>{row.messageType}</TableCell>
              <TableCell>
                <p className="font-medium">{row.participantName}</p>
                <p className="text-xs text-muted-foreground">{row.participantEmail}</p>
              </TableCell>
              <TableCell>
                <p>{row.courseName}</p>
                <p className="text-xs text-muted-foreground">{row.cohortLabel}</p>
              </TableCell>
              <TableCell>
                {row.success ? (
                  <Badge className="bg-emerald-600">Sent</Badge>
                ) : (
                  <span title={row.errorMessage ?? undefined}>
                    <Badge variant="destructive">Failed</Badge>
                  </span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {!loading && rows.length === 0 && (
        <p className="text-muted-foreground">No messages found.</p>
      )}

      {total > limit && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="text-sm underline disabled:opacity-50 disabled:no-underline"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <button
            type="button"
            className="text-sm underline disabled:opacity-50 disabled:no-underline"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
