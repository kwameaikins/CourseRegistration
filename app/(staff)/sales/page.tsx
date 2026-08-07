'use client';

import { useEffect, useState } from 'react';

import { apiFetch } from '@/components/api-client';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  appendDateRange,
  DateRangeFilter,
  EMPTY_DATE_RANGE,
  type DateRange,
} from '@/components/ui/date-range-filter';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const STAGES = ['New', 'Contacted', 'Proposal', 'Won', 'Lost'] as const;

interface OpportunityRow {
  id: string;
  leadId: string | null;
  registrationId: string | null;
  courseName: string;
  batchLabel: string;
  amount: number;
  stage: (typeof STAGES)[number];
  expectedCloseDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PipelineSummary {
  total: number;
  openValue: number;
  wonValue: number;
  byStage: Record<string, number>;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS' }).format(amount);
}

export default function SalesPipelinePage() {
  const [rows, setRows] = useState<OpportunityRow[]>([]);
  const [summary, setSummary] = useState<PipelineSummary | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState<string>('All');
  const [dateRange, setDateRange] = useState<DateRange>(EMPTY_DATE_RANGE);

  // The range goes to the server for both the list AND the summary tiles, so
  // the headline numbers always describe the same set of rows as the table
  // below them.
  function withRange(path: string): string {
    const params = appendDateRange(new URLSearchParams(), dateRange);
    const query = params.toString();
    return query ? `${path}?${query}` : path;
  }

  async function loadOpportunities() {
    try {
      const result = await apiFetch<{ opportunities: OpportunityRow[] }>(
        withRange('/api/opportunities'),
      );
      setRows(result.opportunities);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load opportunities.');
    }
  }

  async function loadSummary() {
    try {
      const result = await apiFetch<PipelineSummary>(withRange('/api/opportunities/summary'));
      setSummary(result);
    } catch {
      setSummary(null);
    }
  }

  useEffect(() => {
    void loadOpportunities();
    void loadSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange]);

  async function updateOpportunity(id: string, changes: Record<string, unknown>) {
    try {
      setSavingId(id);
      await apiFetch(`/api/opportunities/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(changes),
      });
      await loadOpportunities();
      await loadSummary();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to update opportunity.');
    } finally {
      setSavingId(null);
    }
  }

  const visibleRows = stageFilter === 'All' ? rows : rows.filter((row) => row.stage === stageFilter);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Sales Pipeline</h1>
          <p className="text-sm text-muted-foreground">
            One deal per registration, tracked from first contact to a won or lost outcome.
          </p>
        </div>
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={stageFilter}
          onChange={(event) => setStageFilter(event.target.value)}
        >
          <option value="All">All stages</option>
          {STAGES.map((stage) => (
            <option key={stage} value={stage}>
              {stage}
            </option>
          ))}
        </select>
      </div>

      <DateRangeFilter value={dateRange} onChange={setDateRange} label="Created" />

      {errorMessage && (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {errorMessage}
        </p>
      )}

      {summary && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Total opportunities</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{summary.total}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Open pipeline value</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">
              {formatCurrency(summary.openValue)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Won value</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">
              {formatCurrency(summary.wonValue)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">By stage</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {STAGES.map((stage) => (
                <div key={stage} className="flex justify-between">
                  <span>{stage}</span>
                  <span className="font-medium">{summary.byStage[stage] ?? 0}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Opportunities</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Deal</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Expected close</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="font-medium">{row.courseName}</div>
                    <div className="text-sm text-muted-foreground">{row.batchLabel}</div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-2">
                      <Badge variant="outline">{row.stage}</Badge>
                      <select
                        className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                        value={row.stage}
                        onChange={(event) => void updateOpportunity(row.id, { stage: event.target.value })}
                        disabled={savingId === row.id}
                      >
                        {STAGES.map((stage) => (
                          <option key={stage} value={stage}>
                            {stage}
                          </option>
                        ))}
                      </select>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      className="h-8 w-28"
                      value={row.amount}
                      onChange={(event) =>
                        void updateOpportunity(row.id, { amount: Number(event.target.value) })
                      }
                      disabled={savingId === row.id}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="date"
                      className="h-8 w-36"
                      value={row.expectedCloseDate ? row.expectedCloseDate.slice(0, 10) : ''}
                      onChange={(event) =>
                        void updateOpportunity(row.id, {
                          expectedCloseDate: event.target.value || null,
                        })
                      }
                      disabled={savingId === row.id}
                    />
                  </TableCell>
                  <TableCell>{new Date(row.createdAt).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
