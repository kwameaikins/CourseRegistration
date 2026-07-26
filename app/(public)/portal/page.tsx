'use client';

// Student portal dashboard (system review, 2026-07-22) — everything a
// registrant might ask staff about: registration status, payment/balance,
// class schedule + Zoom join link, attendance, and certificates, across
// every course they've registered for.
//
// Pay Now (fix, 2026-07-24): previously the only way to pay was the
// one-time "Pay now" button shown right after registering — if the
// participant left before paying, that link was gone for good; revisiting
// /register just produced a "you're already registered" dead end. The
// portal is durable (the participant already has an account from
// registration, log in any time with email/phone + PIN), so it is the
// right place to offer payment for as long as a balance remains.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { apiFetch } from '@/components/api-client';
import { AddToLinkedInButton } from '@/components/AddToLinkedInButton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { KnowsiaHeader } from '@/components/KnowsiaHeader';
import { PaystackCheckout } from '@/components/PaystackCheckout';
import { formatDate, formatGhs } from '@/lib/utils';

const PAYMENT_POLL_INTERVAL_MS = 3000;
const PAYMENT_POLL_TIMEOUT_MS = 60000;

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
  // Payment plan (founder-approved 2026-07-24) — empty when none set up.
  installments: Array<{
    installmentNumber: number;
    amountDue: number;
    amountPaid: number;
    dueDate: string;
    paymentStatus: 'Pending' | 'Paid';
  }>;
}

interface NextClass {
  title: string;
  startsAt: string;
  endsAt: string;
  // Null until the join window opens (15 minutes before start, per
  // Document 14 Section 5) — never a dead/premature link.
  joinUrl: string | null;
}

interface MessageHistoryEntry {
  channel: 'email' | 'whatsapp' | 'sms';
  messageType: string;
  sentAt: string;
  success: boolean;
}

interface OtherCourse {
  batchId: string;
  courseName: string;
  cohortLabel: string;
  startDate: string;
  courseFee: number;
  seatsRemaining: number | null;
  isFull: boolean;
  discountCutoffDate: string | null;
  discountedFee: number | null;
}

interface Dashboard {
  fullName: string;
  firstName: string;
  middleName: string | null;
  surname: string;
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
  const [nextClass, setNextClass] = useState<NextClass | null>(null);
  // Which registration currently has the Paystack widget open — only one
  // at a time, since only one iframe can be open.
  const [payingRegistrationId, setPayingRegistrationId] = useState<string | null>(null);
  // Which registration is waiting on webhook confirmation after checkout.
  const [confirmingRegistrationId, setConfirmingRegistrationId] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Self-service name correction (founder request, 2026-07-24) — see
  // /api/portal/update-name. Certificates are only ever as correct as
  // whatever full_name says at issuance time, so this is how a participant
  // fixes a typo, a legal-name change, etc. before that happens.
  const [editingName, setEditingName] = useState(false);
  const [nameForm, setNameForm] = useState({ firstName: '', middleName: '', surname: '' });
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  // Simple fixed-split payment plan (founder-approved 2026-07-24) — see
  // /api/portal/set-installment-plan.
  const [confirmingPlanRegistrationId, setConfirmingPlanRegistrationId] = useState<string | null>(
    null,
  );
  const [planSaving, setPlanSaving] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  // Message history (2026-07-26) — fetched on demand per registration
  // rather than up front, since most visits won't need it.
  const [messagesByRegistration, setMessagesByRegistration] = useState<
    Record<string, MessageHistoryEntry[] | 'loading'>
  >({});

  const [otherCourses, setOtherCourses] = useState<OtherCourse[]>([]);

  const loadDashboard = useCallback(() => {
    return apiFetch<Dashboard>('/api/portal/me')
      .then((data) => {
        if (data.mustChangePin) {
          router.push('/portal/change-pin');
          return;
        }
        setDashboard(data);
        void apiFetch<{ nextClass: NextClass | null }>('/api/portal/next-class').then((result) => setNextClass(result.nextClass)).catch(() => setNextClass(null));
        void apiFetch<OtherCourse[]>('/api/portal/other-courses').then(setOtherCourses).catch(() => setOtherCourses([]));
      })
      .catch(() => router.push('/portal/login'));
  }, [router]);

  async function toggleMessages(registrationId: string) {
    if (messagesByRegistration[registrationId]) {
      setMessagesByRegistration((current) => {
        const next = { ...current };
        delete next[registrationId];
        return next;
      });
      return;
    }
    setMessagesByRegistration((current) => ({ ...current, [registrationId]: 'loading' }));
    const messages = await apiFetch<MessageHistoryEntry[]>(
      `/api/portal/messages/${registrationId}`,
    ).catch(() => []);
    setMessagesByRegistration((current) => ({ ...current, [registrationId]: messages }));
  }

  useEffect(() => {
    loadDashboard().finally(() => setLoading(false));
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [loadDashboard]);

  async function handleLogout() {
    await apiFetch('/api/portal/logout', { method: 'POST' }).catch(() => undefined);
    router.push('/portal/login');
  }

  function handleStartEditingName() {
    if (!dashboard) return;
    setNameForm({
      firstName: dashboard.firstName,
      middleName: dashboard.middleName ?? '',
      surname: dashboard.surname,
    });
    setNameError(null);
    setEditingName(true);
  }

  async function handleSaveName(event: React.FormEvent) {
    event.preventDefault();
    setNameSaving(true);
    setNameError(null);
    try {
      await apiFetch('/api/portal/update-name', {
        method: 'POST',
        body: JSON.stringify(nameForm),
      });
      await loadDashboard();
      setEditingName(false);
    } catch (err) {
      setNameError(err instanceof Error ? err.message : 'Could not save your name.');
    } finally {
      setNameSaving(false);
    }
  }

  async function handleSetUpPlan(registrationId: string) {
    setPlanSaving(true);
    setPlanError(null);
    try {
      await apiFetch('/api/portal/set-installment-plan', {
        method: 'POST',
        body: JSON.stringify({ registrationId }),
      });
      await loadDashboard();
      setConfirmingPlanRegistrationId(null);
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : 'Could not set up a payment plan.');
    } finally {
      setPlanSaving(false);
    }
  }

  // Same non-authoritative polling posture as the registration page's
  // auto-login: the webhook is the source of truth, this just refreshes the
  // screen once it lands instead of making the participant reload manually.
  function handlePaymentCompleted(registrationId: string) {
    setPayingRegistrationId(null);
    setConfirmingRegistrationId(registrationId);
    const previousStatus = dashboard?.registrations.find(
      (reg) => reg.registrationId === registrationId,
    )?.paymentStatus;
    const startedAt = Date.now();
    pollTimerRef.current = setInterval(async () => {
      if (Date.now() - startedAt > PAYMENT_POLL_TIMEOUT_MS) {
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        setConfirmingRegistrationId(null);
        return;
      }
      const updated = await apiFetch<Dashboard>('/api/portal/me').catch(() => null);
      if (!updated) return; // transient network error — next tick tries again
      setDashboard(updated);
      const updatedRegistration = updated.registrations.find(
        (reg) => reg.registrationId === registrationId,
      );
      if (updatedRegistration && updatedRegistration.paymentStatus !== previousStatus) {
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        setConfirmingRegistrationId(null);
      }
    }, PAYMENT_POLL_INTERVAL_MS);
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <KnowsiaHeader />
        <Button variant="outline" className="h-11" onClick={handleLogout}>
          Log out
        </Button>
      </div>

      <div className="mt-6">
        {editingName ? (
          <form onSubmit={handleSaveName} className="max-w-md space-y-3 rounded-lg border p-4">
            <p className="text-sm font-medium">
              Confirm your name as it should appear on your certificate
            </p>
            {nameError && (
              <p role="alert" className="text-sm text-destructive">
                {nameError}
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="editFirstName">First Name</Label>
              <Input
                id="editFirstName"
                required
                className="h-11"
                value={nameForm.firstName}
                onChange={(event) =>
                  setNameForm((form) => ({ ...form, firstName: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editMiddleName">
                Middle Name <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="editMiddleName"
                className="h-11"
                value={nameForm.middleName}
                onChange={(event) =>
                  setNameForm((form) => ({ ...form, middleName: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editSurname">Surname</Label>
              <Input
                id="editSurname"
                required
                className="h-11"
                value={nameForm.surname}
                onChange={(event) =>
                  setNameForm((form) => ({ ...form, surname: event.target.value }))
                }
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" className="h-11" disabled={nameSaving}>
                {nameSaving ? 'Saving…' : 'Save name'}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11"
                disabled={nameSaving}
                onClick={() => setEditingName(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <>
            <h1 className="text-2xl font-semibold">
              Welcome, {dashboard.fullName}{' '}
              <button
                type="button"
                onClick={handleStartEditingName}
                className="text-sm font-medium text-primary underline-offset-2 hover:underline"
              >
                Not your name / edit
              </button>
            </h1>
            <p className="text-sm text-muted-foreground">
              {dashboard.email} · {dashboard.phone}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              This is the name that appears on your certificate. If you spot a mistake, you
              can fix it here anytime — including on a certificate you already have, since
              it updates automatically.
            </p>
          </>
        )}
      </div>

      <div className="mt-8 space-y-6">
        {nextClass && (
          <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-5">
            <p className="text-sm font-medium text-emerald-800">Next Class</p>
            <h2 className="mt-1 text-lg font-semibold">{nextClass.title}</h2>
            <p className="mt-1 text-sm text-emerald-800">
              {new Date(nextClass.startsAt).toLocaleString('en-GB', {
                dateStyle: 'medium',
                timeStyle: 'short',
                timeZone: 'Africa/Accra',
              })}{' '}
              GMT
            </p>
            {nextClass.joinUrl ? (
              <Button asChild className="mt-4">
                <a href={nextClass.joinUrl} target="_blank" rel="noreferrer">
                  Join Class
                </a>
              </Button>
            ) : (
              <p className="mt-4 text-sm text-emerald-800">
                Join opens 15 minutes before start.
              </p>
            )}
          </section>
        )}
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
                className="mt-4 inline-flex min-h-11 items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
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

            {reg.amountPaid > 0 && (
              <a
                href={`/api/portal/receipt/${reg.registrationId}`}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-sm font-medium text-primary underline-offset-2 hover:underline"
              >
                Download receipt
              </a>
            )}

            {reg.balance > 0 && (
              <div className="mt-4 space-y-3 border-t pt-4">
                {confirmingRegistrationId === reg.registrationId ? (
                  <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">
                    Payment received — confirming now, this will update automatically.
                  </p>
                ) : payingRegistrationId === reg.registrationId ? (
                  <PaystackCheckout
                    registrationId={reg.registrationId}
                    participantEmail={dashboard.email}
                    amountGhs={reg.balance}
                    onCompleted={() => handlePaymentCompleted(reg.registrationId)}
                  />
                ) : (
                  <Button
                    className="h-11 w-full"
                    onClick={() => setPayingRegistrationId(reg.registrationId)}
                  >
                    Pay {formatGhs(reg.balance)} now — Card or Mobile Money
                  </Button>
                )}

                {reg.installments.length > 0 ? (
                  <div className="rounded-md bg-muted/30 p-3 text-sm">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Payment plan
                    </p>
                    {reg.installments.map((installment) => (
                      <p key={installment.installmentNumber}>
                        Installment {installment.installmentNumber}:{' '}
                        {formatGhs(installment.amountDue)} —{' '}
                        {installment.paymentStatus === 'Paid' ? (
                          <span className="text-emerald-700">Paid</span>
                        ) : (
                          <>Due {formatDate(installment.dueDate)}</>
                        )}
                      </p>
                    ))}
                  </div>
                ) : (
                  reg.paymentStatus === 'Unpaid' &&
                  (confirmingPlanRegistrationId === reg.registrationId ? (
                    <div className="space-y-2 rounded-md border p-3 text-sm">
                      <p>
                        Split {formatGhs(reg.balance)} into two installments — 50% now, 50%
                        closer to the course start date. Available once, before you make any
                        payment.
                      </p>
                      {planError && <p className="text-destructive">{planError}</p>}
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          disabled={planSaving}
                          onClick={() => void handleSetUpPlan(reg.registrationId)}
                        >
                          {planSaving ? 'Setting up…' : 'Confirm payment plan'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={planSaving}
                          onClick={() => setConfirmingPlanRegistrationId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="text-sm font-medium text-primary underline-offset-2 hover:underline"
                      onClick={() => {
                        setConfirmingPlanRegistrationId(reg.registrationId);
                        setPlanError(null);
                      }}
                    >
                      Prefer to split this into two payments? Set up a payment plan
                    </button>
                  ))
                )}
              </div>
            )}

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

            <div className="mt-4">
              <button
                type="button"
                onClick={() => void toggleMessages(reg.registrationId)}
                className="text-xs font-semibold uppercase tracking-wide text-primary underline-offset-2 hover:underline"
              >
                {messagesByRegistration[reg.registrationId] ? 'Hide' : 'View'} message history
              </button>
              {messagesByRegistration[reg.registrationId] === 'loading' && (
                <p className="mt-1 text-sm text-muted-foreground">Loading…</p>
              )}
              {Array.isArray(messagesByRegistration[reg.registrationId]) && (
                <ul className="mt-1 space-y-1 text-sm">
                  {(messagesByRegistration[reg.registrationId] as MessageHistoryEntry[]).length === 0 ? (
                    <li className="text-muted-foreground">No messages sent yet.</li>
                  ) : (
                    (messagesByRegistration[reg.registrationId] as MessageHistoryEntry[]).map(
                      (message, index) => (
                        <li key={index} className="text-muted-foreground">
                          {new Date(message.sentAt).toLocaleString('en-GB', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}{' '}
                          — {message.channel.toUpperCase()}: {message.messageType}
                          {!message.success && ' (failed to deliver)'}
                        </li>
                      ),
                    )
                  )}
                </ul>
              )}
            </div>

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

        {otherCourses.length > 0 && (
          <section className="rounded-lg border p-5">
            <h2 className="text-lg font-semibold">Explore other courses</h2>
            <ul className="mt-3 space-y-3">
              {otherCourses.map((course) => (
                <li
                  key={course.batchId}
                  className="flex flex-wrap items-center justify-between gap-2 border-b pb-3 last:border-b-0 last:pb-0"
                >
                  <div>
                    <p className="font-medium">{course.courseName}</p>
                    <p className="text-sm text-muted-foreground">
                      {course.cohortLabel} · Starts {formatDate(course.startDate)} ·{' '}
                      {course.discountedFee !== null ? (
                        <>
                          <span className="line-through">{formatGhs(course.courseFee)}</span>{' '}
                          <span className="text-emerald-700">{formatGhs(course.discountedFee)}</span>
                        </>
                      ) : (
                        formatGhs(course.courseFee)
                      )}
                    </p>
                  </div>
                  {course.isFull ? (
                    <Badge variant="secondary">Full — join waitlist</Badge>
                  ) : (
                    <Button asChild size="sm">
                      <a href={`/register?batchId=${course.batchId}`}>Register</a>
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <footer className="mt-10 border-t pt-6 text-center text-sm text-muted-foreground">
        Need help? Email{' '}
        <a href="mailto:info.knowsia@gmail.com" className="text-primary underline-offset-2 hover:underline">
          info.knowsia@gmail.com
        </a>
      </footer>
    </main>
  );
}
