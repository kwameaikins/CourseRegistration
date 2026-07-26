'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { apiFetch } from '@/components/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface Company {
  id: string;
  name: string;
  billingContactName: string;
  billingEmail: string;
  billingPhone: string;
  billingAddress: string | null;
  tin: string | null;
}

interface Allocation {
  id: string;
  batchId: string;
  seatsPurchased: number;
  pricePerSeat: number;
  status: string;
}

interface CourseOption {
  id: string;
  courseName: string;
}

interface BatchOption {
  id: string;
  courseId: string;
  cohortLabel: string;
  startDate: string;
  capacity: number | null;
}

export default function CompanyDetailPage() {
  const params = useParams<{ id: string }>();
  const companyId = params.id;

  const [company, setCompany] = useState<Company | null>(null);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [batches, setBatches] = useState<BatchOption[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [seatsPurchased, setSeatsPurchased] = useState('');
  const [pricePerSeat, setPricePerSeat] = useState('');
  const [notes, setNotes] = useState('');

  async function loadAll() {
    try {
      const [companyResult, allocationsResult, coursesResult, batchesResult] = await Promise.all([
        apiFetch<Company>(`/api/corporate/companies/${companyId}`),
        apiFetch<{ allocations: Allocation[] }>(`/api/corporate/companies/${companyId}/allocations`),
        apiFetch<{ courses: CourseOption[] }>('/api/courses'),
        apiFetch<{ batches: BatchOption[] }>('/api/batches'),
      ]);
      setCompany(companyResult);
      setAllocations(allocationsResult.allocations);
      setCourses(coursesResult.courses);
      setBatches(batchesResult.batches);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load company.');
    }
  }

  useEffect(() => {
    if (companyId) void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  function courseNameFor(courseId: string): string {
    return courses.find((c) => c.id === courseId)?.courseName ?? 'Unknown course';
  }
  function batchLabelFor(batchId: string): string {
    const batch = batches.find((b) => b.id === batchId);
    if (!batch) return batchId;
    return `${courseNameFor(batch.courseId)} — ${batch.cohortLabel} (starts ${batch.startDate})`;
  }

  async function createAllocation() {
    setCreating(true);
    setErrorMessage(null);
    try {
      await apiFetch('/api/corporate/allocations', {
        method: 'POST',
        body: JSON.stringify({
          companyId,
          batchId: selectedBatchId,
          seatsPurchased: Number(seatsPurchased),
          pricePerSeat: Number(pricePerSeat),
          notes: notes.trim() || undefined,
        }),
      });
      setSelectedBatchId('');
      setSeatsPurchased('');
      setPricePerSeat('');
      setNotes('');
      await loadAll();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to create seat allocation.');
    } finally {
      setCreating(false);
    }
  }

  const canSubmit = selectedBatchId && Number(seatsPurchased) > 0 && Number(pricePerSeat) >= 0;

  if (!company) {
    return (
      <div className="space-y-4">
        {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/corporate" className="text-sm text-muted-foreground hover:underline">
          ← Corporate Clients
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{company.name}</h1>
        <p className="text-sm text-muted-foreground">
          {company.billingContactName} · {company.billingEmail} · {company.billingPhone}
          {company.tin ? ` · TIN ${company.tin}` : ''}
        </p>
      </div>

      {errorMessage && (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {errorMessage}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sell seats in a batch</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm md:col-span-2"
            value={selectedBatchId}
            onChange={(e) => setSelectedBatchId(e.target.value)}
          >
            <option value="">Select a batch…</option>
            {batches.map((batch) => (
              <option key={batch.id} value={batch.id}>
                {batchLabelFor(batch.id)}
              </option>
            ))}
          </select>
          <Input type="number" min="1" placeholder="Seats purchased" value={seatsPurchased} onChange={(e) => setSeatsPurchased(e.target.value)} />
          <Input type="number" min="0" step="0.01" placeholder="Price per seat (GHS)" value={pricePerSeat} onChange={(e) => setPricePerSeat(e.target.value)} />
          <Input className="md:col-span-3" placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <Button onClick={() => void createAllocation()} disabled={creating || !canSubmit}>
            {creating ? 'Selling…' : 'Sell seats'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Seat allocations</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Batch</TableHead>
                <TableHead>Seats</TableHead>
                <TableHead>Price/seat</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allocations.map((allocation) => (
                <TableRow key={allocation.id}>
                  <TableCell>{batchLabelFor(allocation.batchId)}</TableCell>
                  <TableCell>{allocation.seatsPurchased}</TableCell>
                  <TableCell>GHS {allocation.pricePerSeat.toFixed(2)}</TableCell>
                  <TableCell>
                    <Badge variant={allocation.status === 'active' ? 'outline' : 'secondary'}>
                      {allocation.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Link href={`/corporate/allocations/${allocation.id}`} className="text-sm font-medium text-primary hover:underline">
                      Manage →
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {allocations.length === 0 && (
            <p className="py-4 text-sm text-muted-foreground">No seat purchases yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
