'use client';

// Corporate portal dashboard (2026-07-26) — seats purchased/used/remaining
// per allocation, roster with payment status per employee, self-service
// "add employees" (capped at the allocation's remaining seats, enforced
// server-side), and invoice download.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { apiFetch } from '@/components/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { KnowsiaHeader } from '@/components/KnowsiaHeader';
import { formatGhs } from '@/lib/utils';

interface Employee {
  registrationId: string;
  fullName: string;
  email: string;
  phone: string;
  paymentStatus: string;
  amountPaid: number;
  courseFee: number;
}

interface Allocation {
  id: string;
  courseName: string;
  batchCohortLabel: string;
  seatsPurchased: number;
  seatsUsed: number;
  seatsRemaining: number;
  pricePerSeat: number;
  status: string;
  employees: Employee[];
}

interface Dashboard {
  companyName: string;
  billingContactName: string;
  billingEmail: string;
  mustChangePin: boolean;
  allocations: Allocation[];
}

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

export default function CompanyPortalDashboardPage() {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [expandedAllocationId, setExpandedAllocationId] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [adding, setAdding] = useState(false);

  async function load() {
    try {
      const result = await apiFetch<Dashboard>('/api/company-portal/me');
      if (result.mustChangePin) {
        router.push('/company-portal/change-pin');
        return;
      }
      setDashboard(result);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load your dashboard.');
      router.push('/company-portal/login');
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function logout() {
    await apiFetch('/api/company-portal/logout', { method: 'POST' }).catch(() => undefined);
    router.push('/company-portal/login');
  }

  async function addEmployees(allocationId: string) {
    const rows = parsePastedRows(pasteText);
    if (rows.length === 0) return;
    setAdding(true);
    setErrorMessage(null);
    try {
      await apiFetch(`/api/company-portal/allocations/${allocationId}/employees`, {
        method: 'POST',
        body: JSON.stringify({ rows }),
      });
      setPasteText('');
      await load();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to add employees.');
    } finally {
      setAdding(false);
    }
  }

  if (!dashboard) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10">
        <KnowsiaHeader />
        {errorMessage && <p className="mt-4 text-sm text-destructive">{errorMessage}</p>}
        <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-10">
      <div className="flex items-start justify-between">
        <div>
          <KnowsiaHeader />
          <h1 className="mt-4 text-2xl font-semibold">{dashboard.companyName}</h1>
          <p className="text-sm text-muted-foreground">
            {dashboard.billingContactName} · {dashboard.billingEmail}
          </p>
        </div>
        <Button variant="outline" onClick={() => void logout()}>
          Log out
        </Button>
      </div>

      {errorMessage && (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {errorMessage}
        </p>
      )}

      <div className="space-y-4">
        {dashboard.allocations.map((allocation) => (
          <div key={allocation.id} className="rounded-lg border p-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-semibold">
                  {allocation.courseName} — {allocation.batchCohortLabel}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {allocation.seatsUsed} of {allocation.seatsPurchased} seats filled ·{' '}
                  {formatGhs(allocation.pricePerSeat)} / seat ·{' '}
                  <Badge variant={allocation.status === 'active' ? 'outline' : 'secondary'}>
                    {allocation.status}
                  </Badge>
                </p>
              </div>
              <div className="flex gap-2">
                <a href={`/api/company-portal/allocations/${allocation.id}/invoice`} target="_blank" rel="noreferrer">
                  <Button size="sm" variant="outline">
                    Invoice
                  </Button>
                </a>
                {allocation.status === 'active' && allocation.seatsRemaining > 0 && (
                  <Button
                    size="sm"
                    onClick={() =>
                      setExpandedAllocationId(expandedAllocationId === allocation.id ? null : allocation.id)
                    }
                  >
                    Add employees
                  </Button>
                )}
              </div>
            </div>

            {expandedAllocationId === allocation.id && (
              <div className="mt-4 space-y-2 rounded-md border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">
                  One per line: FirstName,Surname,Gender(Male/Female),Email,Phone — up to{' '}
                  {allocation.seatsRemaining} more seat(s).
                </p>
                <textarea
                  className="h-24 w-full rounded-md border border-input bg-background p-2 font-mono text-sm"
                  placeholder="Kofi,Mensah,Male,kofi@acme.com,+233241234567"
                  value={pasteText}
                  onChange={(event) => setPasteText(event.target.value)}
                />
                <Button size="sm" onClick={() => void addEmployees(allocation.id)} disabled={adding || !pasteText.trim()}>
                  {adding ? 'Adding…' : 'Add'}
                </Button>
              </div>
            )}

            {allocation.employees.length > 0 && (
              <table className="mt-4 w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-1">Employee</th>
                    <th className="py-1">Contact</th>
                    <th className="py-1">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {allocation.employees.map((employee) => (
                    <tr key={employee.registrationId} className="border-t">
                      <td className="py-2 font-medium">{employee.fullName}</td>
                      <td className="py-2">
                        {employee.email}
                        <br />
                        <span className="text-muted-foreground">{employee.phone}</span>
                      </td>
                      <td className="py-2">
                        <Badge variant={employee.paymentStatus === 'Paid' ? 'outline' : 'secondary'}>
                          {employee.paymentStatus}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
        {dashboard.allocations.length === 0 && (
          <p className="text-sm text-muted-foreground">No seat purchases yet — contact Knowsia to get started.</p>
        )}
      </div>
    </main>
  );
}
