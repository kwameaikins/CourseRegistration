'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { apiFetch } from '@/components/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface AllocationDetail {
  id: string;
  companyId: string;
  companyName: string;
  courseName: string;
  batchCohortLabel: string;
  seatsPurchased: number;
  seatsUsed: number;
  seatsRemaining: number;
  pricePerSeat: number;
  amountInvoiced: number;
  amountSettled: number;
  status: string;
  employees: Array<{
    registrationId: string;
    fullName: string;
    email: string;
    phone: string;
    paymentStatus: string;
    amountPaid: number;
    courseFee: number;
  }>;
}

interface AddEmployeesRowResult {
  index: number;
  email: string;
  status: string;
  message?: string;
}

// Paste format, one employee per line: FirstName,Surname,Gender,Email,Phone
// Gender must be Male or Female; JobTitle/Company are optional trailing fields.
function parsePastedRows(text: string) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [firstName, surname, gender, email, phone, jobTitle, company] = line
        .split(',')
        .map((cell) => cell.trim());
      return {
        firstName: firstName ?? '',
        middleName: null,
        surname: surname ?? '',
        gender: gender === 'Female' ? 'Female' : 'Male',
        email: email ?? '',
        phone: phone ?? '',
        jobTitle: jobTitle || null,
        company: company || null,
        amountPaid: 0,
      };
    });
}

export default function AllocationDetailPage() {
  const params = useParams<{ id: string }>();
  const allocationId = params.id;

  const [allocation, setAllocation] = useState<AllocationDetail | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [adding, setAdding] = useState(false);
  const [addResults, setAddResults] = useState<AddEmployeesRowResult[] | null>(null);
  const [cancelling, setCancelling] = useState(false);

  async function load() {
    try {
      const result = await apiFetch<AllocationDetail>(`/api/corporate/allocations/${allocationId}`);
      setAllocation(result);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load allocation.');
    }
  }

  useEffect(() => {
    if (allocationId) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allocationId]);

  async function addEmployees() {
    const rows = parsePastedRows(pasteText);
    if (rows.length === 0) return;
    setAdding(true);
    setErrorMessage(null);
    setAddResults(null);
    try {
      const result = await apiFetch<{ results: AddEmployeesRowResult[] }>(
        `/api/corporate/allocations/${allocationId}/employees`,
        { method: 'POST', body: JSON.stringify({ rows }) },
      );
      setAddResults(result.results);
      setPasteText('');
      await load();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to add employees.');
    } finally {
      setAdding(false);
    }
  }

  async function cancelAllocation() {
    const reason = window.prompt('Reason for cancelling this seat allocation?');
    if (!reason || reason.trim().length < 3) return;
    setCancelling(true);
    setErrorMessage(null);
    try {
      await apiFetch(`/api/corporate/allocations/${allocationId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'cancelled', reason: reason.trim() }),
      });
      await load();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to cancel allocation.');
    } finally {
      setCancelling(false);
    }
  }

  if (!allocation) {
    return (
      <div className="space-y-4">
        {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Link href={`/corporate/${allocation.companyId}`} className="text-sm text-muted-foreground hover:underline">
            ← {allocation.companyName}
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">
            {allocation.courseName} — {allocation.batchCohortLabel}
          </h1>
          <p className="text-sm text-muted-foreground">
            {allocation.seatsUsed} of {allocation.seatsPurchased} seats filled ·{' '}
            <Badge variant={allocation.status === 'active' ? 'outline' : 'secondary'}>{allocation.status}</Badge>
          </p>
        </div>
        <div className="flex gap-2">
          <a href={`/api/corporate/allocations/${allocation.id}/invoice`} target="_blank" rel="noreferrer">
            <Button variant="outline">Download invoice</Button>
          </a>
          {allocation.status === 'active' && (
            <Button variant="destructive" onClick={() => void cancelAllocation()} disabled={cancelling}>
              Cancel allocation
            </Button>
          )}
        </div>
      </div>

      {errorMessage && (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {errorMessage}
        </p>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Seats remaining</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{allocation.seatsRemaining}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Price / seat</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">GHS {allocation.pricePerSeat.toFixed(2)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Invoiced</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">GHS {allocation.amountInvoiced.toFixed(2)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Settled</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">GHS {allocation.amountSettled.toFixed(2)}</CardContent>
        </Card>
      </div>

      {allocation.status === 'active' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add employees</CardTitle>
            <p className="text-sm text-muted-foreground">
              One per line: FirstName,Surname,Gender(Male/Female),Email,Phone,JobTitle,Company
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <textarea
              className="h-32 w-full rounded-md border border-input bg-background p-3 font-mono text-sm"
              placeholder="Kofi,Mensah,Male,kofi@acme.com,+233241234567,Analyst,Acme Ltd"
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
            />
            <Button onClick={() => void addEmployees()} disabled={adding || !pasteText.trim()}>
              {adding ? 'Adding…' : 'Add employees'}
            </Button>
            {addResults && (
              <ul className="space-y-1 text-sm">
                {addResults.map((result) => (
                  <li key={result.index} className={result.status === 'created' ? 'text-green-700' : 'text-amber-700'}>
                    {result.email}: {result.status}
                    {result.message ? ` — ${result.message}` : ''}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Roster</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Payment status</TableHead>
                <TableHead>Paid / Fee</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allocation.employees.map((employee) => (
                <TableRow key={employee.registrationId}>
                  <TableCell className="font-medium">{employee.fullName}</TableCell>
                  <TableCell>
                    <div>{employee.email}</div>
                    <div className="text-sm text-muted-foreground">{employee.phone}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={employee.paymentStatus === 'Paid' ? 'outline' : 'secondary'}>
                      {employee.paymentStatus}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    GHS {employee.amountPaid.toFixed(2)} / {employee.courseFee.toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {allocation.employees.length === 0 && (
            <p className="py-4 text-sm text-muted-foreground">No employees added yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
