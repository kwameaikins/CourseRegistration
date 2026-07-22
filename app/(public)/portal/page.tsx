'use client';

// Student portal dashboard (system review, 2026-07-22) — everything a
// registrant might ask staff about: registration status, payment/balance,
// class schedule + Zoom join link, attendance, and certificates, across
// every course they've registered for.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { apiFetch } from '@/components/api-client';
import { AddToLinkedInButton } from '@/components/AddToLinkedInButton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { KnowsiaHeader } from '@/components/KnowsiaHeader';
import { formatDate, formatGhs } from '@/lib/utils';

interface DashboardRegistration {
  registrationId: string;
  courseName: string;
  courseCode: string;
  cohortLabel: string;
  registrationStatus: string;
  startDate: string;
  startTime: string;
  endDate: string;
  facilitatorName: string;
  zoomLink: string | null;
  paymentStatus: string;
  courseFee: number;
  originalFee: number;
  amountPaid: number;
  balance: number;
  attendance: Array<{
    sessionDate: string;
    joinTime: string | null;
    leaveTime: string | null;
    durationMinutes: number;
  }>;
  certificates: Array<{ id: string; certificateNumber: string; issuedDate: string; revoked: boolean }>;
}

interface Dashboard {
  fullName: string;
  email: string;
  phone: string;
  mustChangePin: boolean;
  registrations: DashboardRegistration[];
}

function paymentBadge(status: string) {
  if (status === 'Paid') return <Badge className="bg-emerald-600">Paid</Badge>;
  if (status === 'Part Payment') return <Badge className="bg-amber-500">Part Payment</Badge>;
  return <Badge variant="destructive">Unpaid</Badge>;
}

export default function PortalDashboardPage() {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<Dashboard>('/api/portal/me')
      .then((data) => {
        if (data.mustChangePin) {
          router.push('/portal/change-pin');
          return;
        }
        setDashboard(data);
      })
      .catch(() => router.push('/portal/login'))
      .finally(() => setLoading(false));
  }, [router]);

  async function handleLogout() {
    await apiFetch('/api/portal/logout', { method: 'POST' }).catch(() => undefined);
    router.push('/portal/login');
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <KnowsiaHeader />
        <p className="mt-8 text-muted-foreground">Loading…</p>
      </main>
    );
  }

  if (!dashboard) return null;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex items-start justify-between">
        <KnowsiaHeader />
        <Button variant="outline" onClick={handleLogout}>
          Log out
        </Button>
      </div>

      <div className="mt-6">
        <h1 className="text-2xl font-semibold">Welcome, {dashboard.fullName}</h1>
        <p className="text-sm text-muted-foreground">
          {dashboard.email} · {dashboard.phone}
        </p>
      </div>

      <div className="mt-8 space-y-6">
        {dashboard.registrations.length === 0 && (
          <p className="text-muted-foreground">No registrations found on this account.</p>
        )}
        {dashboard.registrations.map((reg) => (
          <section key={reg.registrationId} className="rounded-lg border p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold">{reg.courseName}</h2>
                <p className="text-sm text-muted-foreground">
                  {reg.cohortLabel} · {formatDate(reg.startDate)} – {formatDate(reg.endDate)} ·
                  Facilitator: {reg.facilitatorName}
                </p>
              </div>
              <div className="flex gap-2">
                <Badge variant="secondary">{reg.registrationStatus}</Badge>
                {paymentBadge(reg.paymentStatus)}
              </div>
            </div>

            {reg.zoomLink ? (
              <a
                href={reg.zoomLink}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Join Zoom Class →
              </a>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                Your Zoom link will appear here once available.
              </p>
            )}

            <div className="mt-4 grid grid-cols-3 gap-3 rounded-md bg-muted/30 p-3 text-sm">
              <div>
                <p className="text-muted-foreground">Course Fee</p>
                {reg.originalFee > reg.courseFee ? (
                  <>
                    <p className="text-xs text-muted-foreground line-through">
                      {formatGhs(reg.originalFee)}
                    </p>
                    <p className="font-medium text-emerald-700">{formatGhs(reg.courseFee)}</p>
                  </>
                ) : (
                  <p className="font-medium">{formatGhs(reg.courseFee)}</p>
                )}
              </div>
              <div>
                <p className="text-muted-foreground">Amount Paid</p>
                <p className="font-medium">{formatGhs(reg.amountPaid)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Balance</p>
                <p className="font-medium">{formatGhs(reg.balance)}</p>
              </div>
            </div>

            {reg.attendance.length > 0 && (
              <div className="mt-4">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Attendance
                </p>
                <ul className="space-y-1 text-sm">
                  {reg.attendance.map((session, index) => (
                    <li key={index} className="text-muted-foreground">
                      {formatDate(session.sessionDate)} —{' '}
                      {session.durationMinutes > 0
                        ? `${session.durationMinutes} min attended`
                        : 'no attendance recorded'}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {reg.certificates.length > 0 && (
              <div className="mt-4">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Certificates
                </p>
                <ul className="space-y-1 text-sm">
                  {reg.certificates.map((cert) => (
                    <li key={cert.id} className="flex flex-wrap items-center gap-x-3">
                      {cert.revoked ? (
                        <span className="text-destructive">
                          {cert.certificateNumber} (revoked)
                        </span>
                      ) : (
                        <>
                          <a
                            href={`/api/certificates/download/${cert.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary underline-offset-2 hover:underline"
                          >
                            {cert.certificateNumber} — download PDF
                          </a>
                          <AddToLinkedInButton
                            certificateName={reg.courseName}
                            issuedDate={cert.issuedDate}
                            certificateNumber={cert.certificateNumber}
                          />
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        ))}
      </div>
    </main>
  );
}
