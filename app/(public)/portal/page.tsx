'use client';

// Student portal dashboard (system review, 2026-07-22; redesigned
// 2026-07-26 into a section-based app shell — Overview, My Courses,
// Payments & Receipts, Certificates, Messages, Explore Courses, Account —
// so the growing feature set doesn't collapse into one long scroll).
// Everything a registrant might ask staff about: registration status,
// payment/balance, class schedule + Zoom join link, attendance, messages,
// certificates, and self-service payment, across every course they've
// registered for.
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
import Link from 'next/link';
import Image from 'next/image';

import { apiFetch } from '@/components/api-client';
import { AddToLinkedInButton } from '@/components/AddToLinkedInButton';
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

type PanelId = 'overview' | 'courses' | 'payments' | 'certificates' | 'messages' | 'explore' | 'account';

const NAV_ITEMS: Array<{ id: PanelId; label: string; icon: string }> = [
  { id: 'overview', label: 'Overview', icon: 'i-grid' },
  { id: 'courses', label: 'My Courses', icon: 'i-book' },
  { id: 'payments', label: 'Payments & Receipts', icon: 'i-card' },
  { id: 'certificates', label: 'Certificates', icon: 'i-award' },
  { id: 'messages', label: 'Messages', icon: 'i-chat' },
  { id: 'explore', label: 'Explore Courses', icon: 'i-compass' },
  { id: 'account', label: 'Account', icon: 'i-user' },
];

function paymentPill(status: string) {
  if (status === 'Paid') return <span className="pill pill-success">Paid</span>;
  if (status === 'Part Payment') return <span className="pill pill-warning">Part payment</span>;
  return <span className="pill pill-danger">Unpaid</span>;
}

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase();
}

export default function PortalDashboardPage() {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [nextClass, setNextClass] = useState<NextClass | null>(null);
  const [activePanel, setActivePanel] = useState<PanelId>('overview');

  const [payingRegistrationId, setPayingRegistrationId] = useState<string | null>(null);
  const [confirmingRegistrationId, setConfirmingRegistrationId] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [editingName, setEditingName] = useState(false);
  const [nameForm, setNameForm] = useState({ firstName: '', middleName: '', surname: '' });
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  const [confirmingPlanRegistrationId, setConfirmingPlanRegistrationId] = useState<string | null>(
    null,
  );
  const [planSaving, setPlanSaving] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  const [messagesByRegistration, setMessagesByRegistration] = useState<
    Record<string, MessageHistoryEntry[] | 'loading'>
  >({});
  const [openAttendance, setOpenAttendance] = useState<Record<string, boolean>>({});

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

  const fetchMessages = useCallback((registrationId: string) => {
    setMessagesByRegistration((current) => ({ ...current, [registrationId]: 'loading' }));
    apiFetch<MessageHistoryEntry[]>(`/api/portal/messages/${registrationId}`)
      .then((messages) => setMessagesByRegistration((current) => ({ ...current, [registrationId]: messages })))
      .catch(() => setMessagesByRegistration((current) => ({ ...current, [registrationId]: [] })));
  }, []);

  useEffect(() => {
    loadDashboard().finally(() => setLoading(false));
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [loadDashboard]);

  // Messages are fetched lazily per registration, all at once the first
  // time the Messages section is opened rather than up front.
  useEffect(() => {
    if (activePanel !== 'messages' || !dashboard) return;
    dashboard.registrations.forEach((reg) => {
      if (!messagesByRegistration[reg.registrationId]) fetchMessages(reg.registrationId);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePanel, dashboard]);

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
      if (!updated) return;
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
      <main className="portal-loading">
        <p>Loading…</p>
      </main>
    );
  }

  if (!dashboard) return null;

  const totalBalance = dashboard.registrations.reduce((sum, r) => sum + r.balance, 0);
  const allCertificates = dashboard.registrations.flatMap((r) =>
    r.certificates.map((c) => ({ ...c, courseName: r.courseName })),
  );
  const certificatesEarned = allCertificates.filter((c) => !c.revoked).length;
  const registrationsWithoutCertificate = dashboard.registrations.filter(
    (r) => !r.certificates.some((c) => !c.revoked),
  );

  return (
    <div className="portal-app">
      <style>{PORTAL_STYLES}</style>
      <PortalIcons />

      <div className="app">
        <aside className="rail" aria-label="Portal navigation">
          <div className="rail-brand">
            <Image src="/knowsia-icon.png" alt="Knowsia" width={34} height={34} className="mark" priority />
            <div>
              <span className="name">Knowsia</span>
              <span className="tag">Student Portal</span>
            </div>
          </div>

          <div className="identity">
            <div className="avatar">{initials(dashboard.fullName)}</div>
            <div className="who">
              <strong>{dashboard.fullName}</strong>
              <span>{dashboard.phone}</span>
            </div>
          </div>

          <ul className="rail-nav" role="tablist">
            {NAV_ITEMS.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  role="tab"
                  aria-current={activePanel === item.id ? 'page' : undefined}
                  onClick={() => setActivePanel(item.id)}
                >
                  <svg className="icon"><use href={`#${item.icon}`} /></svg>
                  {item.label}
                  {item.id === 'certificates' && certificatesEarned > 0 && (
                    <span className="badge">{certificatesEarned}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>

          <div className="rail-foot">
            <div className="support">
              Need help?
              <br />
              <a href="mailto:info.knowsia@gmail.com">info.knowsia@gmail.com</a>
            </div>
            <button className="logout" type="button" onClick={handleLogout}>
              <svg className="icon"><use href="#i-logout" /></svg>Log out
            </button>
          </div>
        </aside>

        <div className="topbar">
          <div className="row1">
            <div className="brand">
              <Image src="/knowsia-icon.png" alt="Knowsia" width={26} height={26} className="mark" priority />
              Knowsia
            </div>
            <button className="logout" type="button" onClick={handleLogout}>
              <svg className="icon" style={{ width: 14, height: 14 }}><use href="#i-logout" /></svg>Log out
            </button>
          </div>
          <nav className="topbar-nav" role="tablist" aria-label="Portal sections">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-current={activePanel === item.id ? 'page' : undefined}
                onClick={() => setActivePanel(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        <main className="main">
          <div className="content">

            {activePanel === 'overview' && (
              <section className="panel active" role="tabpanel">
                <p className="eyebrow">Overview</p>
                {editingName ? (
                  <NameEditForm
                    nameForm={nameForm}
                    setNameForm={setNameForm}
                    nameError={nameError}
                    nameSaving={nameSaving}
                    onSubmit={handleSaveName}
                    onCancel={() => setEditingName(false)}
                  />
                ) : (
                  <>
                    <h2 className="panel-title">
                      Welcome back, {dashboard.firstName}
                    </h2>
                    <p className="panel-sub">
                      {dashboard.email} · {dashboard.phone} ·{' '}
                      <button type="button" className="link-btn" onClick={handleStartEditingName}>
                        Not your name? Edit
                      </button>
                    </p>
                  </>
                )}

                {nextClass && (
                  <div className="hero-banner">
                    <div>
                      <div className="label">Next class</div>
                      <h2>{nextClass.title}</h2>
                      <div className="when">
                        {new Date(nextClass.startsAt).toLocaleString('en-GB', {
                          dateStyle: 'full',
                          timeStyle: 'short',
                          timeZone: 'Africa/Accra',
                        })}{' '}
                        GMT
                      </div>
                    </div>
                    {nextClass.joinUrl ? (
                      <a className="btn btn-onaccent" href={nextClass.joinUrl} target="_blank" rel="noreferrer">
                        <svg className="icon"><use href="#i-play" /></svg>Join Class
                      </a>
                    ) : (
                      <span className="btn btn-onaccent" aria-disabled>
                        <svg className="icon"><use href="#i-play" /></svg>Opens 15 min before start
                      </span>
                    )}
                  </div>
                )}

                <div className="stat-grid">
                  <div className="stat-tile">
                    <div className="icon-wrap"><svg className="icon"><use href="#i-book" /></svg></div>
                    <span className="num tnum">{dashboard.registrations.length}</span>
                    <span className="lbl">Enrolled courses</span>
                  </div>
                  <div className="stat-tile">
                    <div className="icon-wrap"><svg className="icon"><use href="#i-award" /></svg></div>
                    <span className="num tnum">{certificatesEarned}</span>
                    <span className="lbl">Certificate{certificatesEarned === 1 ? '' : 's'} earned</span>
                  </div>
                  <div className={`stat-tile${totalBalance > 0 ? ' warn' : ''}`}>
                    <div className="icon-wrap"><svg className="icon"><use href="#i-card" /></svg></div>
                    <span className="num tnum">{formatGhs(totalBalance)}</span>
                    <span className="lbl">Balance due</span>
                  </div>
                </div>

                {dashboard.registrations.length === 0 ? (
                  <p className="empty-note">No registrations found on this account.</p>
                ) : (
                  <>
                    <div className="section-heading">
                      <h3>Your courses</h3>
                      <button type="button" className="link-btn" onClick={() => setActivePanel('courses')}>
                        View all →
                      </button>
                    </div>
                    {dashboard.registrations.map((reg) => (
                      <div key={reg.registrationId} className="mini-course-row">
                        <div>
                          <div className="name">{reg.courseName}</div>
                          <div className="meta">
                            {reg.cohortLabel} ·{' '}
                            {reg.balance > 0
                              ? `Balance ${formatGhs(reg.balance)}`
                              : `Starts ${formatDate(reg.startDate)}`}
                          </div>
                        </div>
                        {paymentPill(reg.paymentStatus)}
                      </div>
                    ))}
                  </>
                )}
              </section>
            )}

            {activePanel === 'courses' && (
              <section className="panel active" role="tabpanel">
                <p className="eyebrow">My Courses</p>
                <h2 className="panel-title">
                  {dashboard.registrations.length} registration{dashboard.registrations.length === 1 ? '' : 's'}
                </h2>
                <p className="panel-sub">
                  Schedule, payment, attendance, and messages for each course all live here.
                </p>

                {dashboard.registrations.length === 0 && (
                  <p className="empty-note">No registrations found on this account.</p>
                )}

                {dashboard.registrations.map((reg) => {
                  const activeCert = reg.certificates.find((c) => !c.revoked);
                  const messages = messagesByRegistration[reg.registrationId];
                  return (
                    <article key={reg.registrationId} className="course-card">
                      <div className="head">
                        <div>
                          <h4>{reg.courseName}</h4>
                          <div className="meta">
                            {reg.cohortLabel} · {formatDate(reg.startDate)} – {formatDate(reg.endDate)} · Facilitator: {reg.facilitatorName}
                          </div>
                        </div>
                        <div className="badges">
                          <span className="pill pill-neutral">{reg.registrationStatus}</span>
                          {paymentPill(reg.paymentStatus)}
                        </div>
                      </div>

                      {reg.zoomLink ? (
                        <a className="btn btn-primary" style={{ marginTop: 14 }} href={reg.zoomLink} target="_blank" rel="noreferrer">
                          <svg className="icon" style={{ width: 15, height: 15 }}><use href="#i-zoom" /></svg>Join Zoom Class
                        </a>
                      ) : (
                        <p className="empty-note" style={{ marginTop: 14, marginBottom: 0 }}>
                          Your Zoom link will appear here once available.
                        </p>
                      )}

                      <div className="fig-grid">
                        <div>
                          <span className="lbl">Course fee</span>
                          {reg.originalFee > reg.courseFee ? (
                            <>
                              <span className="val tnum" style={{ textDecoration: 'line-through', fontWeight: 400, color: 'var(--ink-faint)', fontSize: 12 }}>
                                {formatGhs(reg.originalFee)}
                              </span>
                              <span className="val tnum" style={{ color: 'var(--success)', display: 'block' }}>{formatGhs(reg.courseFee)}</span>
                            </>
                          ) : (
                            <span className="val tnum">{formatGhs(reg.courseFee)}</span>
                          )}
                        </div>
                        <div><span className="lbl">Amount paid</span><span className="val tnum">{formatGhs(reg.amountPaid)}</span></div>
                        <div><span className="lbl">Balance</span><span className={`val tnum${reg.balance > 0 ? ' balance' : ''}`}>{formatGhs(reg.balance)}</span></div>
                      </div>

                      <div className="join-row">
                        {reg.amountPaid > 0 && (
                          <a className="btn btn-outline btn-sm" href={`/api/portal/receipt/${reg.registrationId}`} target="_blank" rel="noreferrer">
                            <svg className="icon" style={{ width: 15, height: 15 }}><use href="#i-download" /></svg>Download receipt
                          </a>
                        )}
                        {activeCert && (
                          <button type="button" className="btn btn-outline btn-sm" onClick={() => setActivePanel('certificates')}>
                            <svg className="icon" style={{ width: 15, height: 15 }}><use href="#i-award" /></svg>View certificate
                          </button>
                        )}
                      </div>

                      {reg.balance > 0 && (
                        <div className="pay-block">
                          {confirmingRegistrationId === reg.registrationId ? (
                            <p className="confirming-note">
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
                            <button type="button" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setPayingRegistrationId(reg.registrationId)}>
                              <svg className="icon" style={{ width: 15, height: 15 }}><use href="#i-card" /></svg>
                              Pay {formatGhs(reg.balance)} now — Card or Mobile Money
                            </button>
                          )}

                          {reg.installments.length > 0 ? (
                            <div className="plan-box">
                              <p className="plan-box-label">Payment plan</p>
                              {reg.installments.map((installment) => (
                                <div key={installment.installmentNumber} className="plan-row">
                                  <span>Installment {installment.installmentNumber}: {formatGhs(installment.amountDue)}</span>
                                  {installment.paymentStatus === 'Paid' ? (
                                    <span className="pill pill-success">Paid</span>
                                  ) : (
                                    <span className="pill pill-warning">Due {formatDate(installment.dueDate)}</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            reg.paymentStatus === 'Unpaid' &&
                            (confirmingPlanRegistrationId === reg.registrationId ? (
                              <div className="plan-confirm">
                                <p>
                                  Split {formatGhs(reg.balance)} into two installments — 50% now, 50% closer to the
                                  course start date. Available once, before you make any payment.
                                </p>
                                {planError && <p className="plan-confirm-error">{planError}</p>}
                                <div style={{ display: 'flex', gap: 8 }}>
                                  <button type="button" className="btn btn-primary btn-sm" disabled={planSaving} onClick={() => void handleSetUpPlan(reg.registrationId)}>
                                    {planSaving ? 'Setting up…' : 'Confirm payment plan'}
                                  </button>
                                  <button type="button" className="btn btn-ghost btn-sm" disabled={planSaving} onClick={() => setConfirmingPlanRegistrationId(null)}>
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className="link-btn"
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

                      <div className="tabbed">
                        <div className="tabbed-nav">
                          <button
                            className={!openAttendance[reg.registrationId] ? 'active' : ''}
                            type="button"
                            onClick={() => setOpenAttendance((cur) => ({ ...cur, [reg.registrationId]: false }))}
                          >
                            Attendance ({reg.attendance.length})
                          </button>
                          <button
                            className={openAttendance[reg.registrationId] ? 'active' : ''}
                            type="button"
                            onClick={() => {
                              setOpenAttendance((cur) => ({ ...cur, [reg.registrationId]: true }));
                              if (!messages) fetchMessages(reg.registrationId);
                            }}
                          >
                            Messages
                          </button>
                        </div>
                        <div className="tabbed-body">
                          {!openAttendance[reg.registrationId] ? (
                            reg.attendance.length === 0 ? (
                              <p className="empty-note">No attendance recorded yet.</p>
                            ) : (
                              <ul className="att-list">
                                {reg.attendance.map((session, index) => (
                                  <li key={index}>
                                    <span>{formatDate(session.sessionDate)}</span>
                                    <span className="duration tnum">
                                      {session.durationMinutes > 0 ? `${session.durationMinutes} min attended` : 'no attendance recorded'}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )
                          ) : (
                            <MessageList entry={messages} />
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </section>
            )}

            {activePanel === 'payments' && (
              <section className="panel active" role="tabpanel">
                <p className="eyebrow">Payments &amp; Receipts</p>
                <h2 className="panel-title">Payment history</h2>
                <p className="panel-sub">One receipt per course, generated fresh each time so it always reflects your latest payment.</p>

                {dashboard.registrations.length === 0 ? (
                  <p className="empty-note">No payments to show yet.</p>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr><th>Course</th><th className="num">Fee</th><th className="num">Paid</th><th className="num">Balance</th><th>Status</th><th></th></tr>
                      </thead>
                      <tbody>
                        {dashboard.registrations.map((reg) => (
                          <tr key={reg.registrationId}>
                            <td className="course-cell"><strong>{reg.courseName}</strong><span>{reg.cohortLabel}</span></td>
                            <td className="num tnum">{formatGhs(reg.courseFee)}</td>
                            <td className="num tnum">{formatGhs(reg.amountPaid)}</td>
                            <td className="num tnum">{formatGhs(reg.balance)}</td>
                            <td>{paymentPill(reg.paymentStatus)}</td>
                            <td>
                              {reg.amountPaid > 0 && (
                                <a className="btn btn-ghost btn-sm" href={`/api/portal/receipt/${reg.registrationId}`} target="_blank" rel="noreferrer">
                                  <svg className="icon" style={{ width: 14, height: 14 }}><use href="#i-download" /></svg>Receipt
                                </a>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td>Total</td>
                          <td className="num tnum">{formatGhs(dashboard.registrations.reduce((s, r) => s + r.courseFee, 0))}</td>
                          <td className="num tnum">{formatGhs(dashboard.registrations.reduce((s, r) => s + r.amountPaid, 0))}</td>
                          <td className="num tnum">{formatGhs(totalBalance)}</td>
                          <td colSpan={2}></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </section>
            )}

            {activePanel === 'certificates' && (
              <section className="panel active" role="tabpanel">
                <p className="eyebrow">Certificates</p>
                <h2 className="panel-title">Your certificates</h2>
                <p className="panel-sub">Issued once a course is complete. Download the PDF any time, or add it straight to LinkedIn.</p>

                {allCertificates.length === 0 && registrationsWithoutCertificate.length === 0 ? (
                  <p className="empty-note">No registrations found on this account.</p>
                ) : (
                  <div className="cert-grid">
                    {allCertificates.map((cert) => (
                      <div key={cert.id} className={cert.revoked ? 'cert-pending' : 'cert-card'}>
                        {cert.revoked ? (
                          <>
                            <div className="icon-wrap"><svg className="icon"><use href="#i-award" /></svg></div>
                            <div>
                              <strong>{cert.courseName}</strong>
                              <span className="pill pill-danger" style={{ marginTop: 4 }}>Revoked</span>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="cert-icon"><svg className="icon" style={{ width: 20, height: 20 }}><use href="#i-award" /></svg></div>
                            <h4>{cert.courseName}</h4>
                            <div className="num">{cert.certificateNumber}</div>
                            <div className="issued">Issued {formatDate(cert.issuedDate)}</div>
                            <div className="actions">
                              <a className="btn btn-primary btn-sm" href={`/api/certificates/download/${cert.id}`} target="_blank" rel="noreferrer">
                                <svg className="icon" style={{ width: 14, height: 14 }}><use href="#i-download" /></svg>Download PDF
                              </a>
                              <AddToLinkedInButton
                                certificateName={cert.courseName}
                                issuedDate={cert.issuedDate}
                                certificateNumber={cert.certificateNumber}
                              />
                            </div>
                            <div className="verify">
                              Verify at <a href={`/verify/${cert.certificateNumber}`}>reg.knowsia.com/verify/{cert.certificateNumber}</a>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                    {registrationsWithoutCertificate.map((reg) => (
                      <div key={reg.registrationId} className="cert-pending">
                        <div className="icon-wrap"><svg className="icon"><use href="#i-award" /></svg></div>
                        <div>
                          <strong>{reg.courseName}</strong>
                          <span>Certificate will appear here once the course is complete and eligible.</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {activePanel === 'messages' && (
              <section className="panel active" role="tabpanel">
                <p className="eyebrow">Messages</p>
                <h2 className="panel-title">Communication history</h2>
                <p className="panel-sub">Every email, SMS, and WhatsApp message we&apos;ve sent you, grouped by course.</p>

                {dashboard.registrations.length === 0 && (
                  <p className="empty-note">No registrations found on this account.</p>
                )}
                {dashboard.registrations.map((reg) => (
                  <div key={reg.registrationId}>
                    <div className="section-heading"><h3>{reg.courseName}</h3></div>
                    <div className="course-card" style={{ padding: '16px 20px' }}>
                      <MessageList entry={messagesByRegistration[reg.registrationId]} />
                    </div>
                  </div>
                ))}
              </section>
            )}

            {activePanel === 'explore' && (
              <section className="panel active" role="tabpanel">
                <p className="eyebrow">Explore Courses</p>
                <h2 className="panel-title">More courses you can register for</h2>
                <p className="panel-sub">Showing active intakes you&apos;re not already enrolled in.</p>

                {otherCourses.length === 0 ? (
                  <p className="empty-note">No other active intakes right now — check back soon.</p>
                ) : (
                  <div className="explore-grid">
                    {otherCourses.map((course) => (
                      <div key={course.batchId} className="explore-card">
                        <h4>{course.courseName}</h4>
                        <div className="meta">{course.cohortLabel} · Starts {formatDate(course.startDate)}</div>
                        <div className="price">
                          {course.discountedFee !== null ? (
                            <>
                              <span className="was tnum">{formatGhs(course.courseFee)}</span>
                              <span className="now disc tnum">{formatGhs(course.discountedFee)}</span>
                            </>
                          ) : (
                            <span className="now tnum">{formatGhs(course.courseFee)}</span>
                          )}
                        </div>
                        <div className="foot">
                          {course.isFull ? (
                            <>
                              <span className="seats">Full</span>
                              <a className="btn btn-outline btn-sm" href={`/register?batchId=${course.batchId}`}>Join waitlist</a>
                            </>
                          ) : (
                            <>
                              <span className="seats">{course.seatsRemaining ?? '—'} seats left</span>
                              <a className="btn btn-primary btn-sm" href={`/register?batchId=${course.batchId}`}>Register</a>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {activePanel === 'account' && (
              <section className="panel active" role="tabpanel">
                <p className="eyebrow">Account</p>
                <h2 className="panel-title">Your details</h2>
                <p className="panel-sub">This is the name that appears on your certificate — fix it here any time, including retroactively.</p>

                {editingName ? (
                  <NameEditForm
                    nameForm={nameForm}
                    setNameForm={setNameForm}
                    nameError={nameError}
                    nameSaving={nameSaving}
                    onSubmit={handleSaveName}
                    onCancel={() => setEditingName(false)}
                    boxed
                  />
                ) : (
                  <div className="account-card">
                    <div className="field-static">
                      <span className="lbl">Name</span>
                      <span className="val">{dashboard.fullName}</span>
                    </div>
                    <div className="field-static">
                      <span className="lbl">Email</span>
                      <span className="val">{dashboard.email}</span>
                    </div>
                    <div className="field-static">
                      <span className="lbl">Mobile</span>
                      <span className="val">{dashboard.phone}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                      <button type="button" className="btn btn-primary" onClick={handleStartEditingName}>
                        <svg className="icon" style={{ width: 15, height: 15 }}><use href="#i-edit" /></svg>Edit name
                      </button>
                      <Link href="/portal/change-pin" className="btn btn-ghost">Change PIN</Link>
                    </div>
                    <div className="session-note"><span className="dot" />Signed in from this device · Session active</div>
                  </div>
                )}
              </section>
            )}

          </div>
        </main>
      </div>
    </div>
  );
}

function NameEditForm({
  nameForm,
  setNameForm,
  nameError,
  nameSaving,
  onSubmit,
  onCancel,
  boxed,
}: {
  nameForm: { firstName: string; middleName: string; surname: string };
  setNameForm: React.Dispatch<React.SetStateAction<{ firstName: string; middleName: string; surname: string }>>;
  nameError: string | null;
  nameSaving: boolean;
  onSubmit: (event: React.FormEvent) => void;
  onCancel: () => void;
  boxed?: boolean;
}) {
  return (
    <form onSubmit={onSubmit} className={boxed ? 'account-card' : 'name-edit-form'}>
      <p className="plan-box-label" style={{ marginBottom: 12 }}>Confirm your name as it should appear on your certificate</p>
      {nameError && <p className="plan-confirm-error">{nameError}</p>}
      <div className="field">
        <label htmlFor="editFirstName">First name</label>
        <input
          id="editFirstName"
          required
          value={nameForm.firstName}
          onChange={(event) => setNameForm((form) => ({ ...form, firstName: event.target.value }))}
        />
      </div>
      <div className="field">
        <label htmlFor="editMiddleName">Middle name (optional)</label>
        <input
          id="editMiddleName"
          value={nameForm.middleName}
          onChange={(event) => setNameForm((form) => ({ ...form, middleName: event.target.value }))}
        />
      </div>
      <div className="field">
        <label htmlFor="editSurname">Surname</label>
        <input
          id="editSurname"
          required
          value={nameForm.surname}
          onChange={(event) => setNameForm((form) => ({ ...form, surname: event.target.value }))}
        />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" className="btn btn-primary" disabled={nameSaving}>
          {nameSaving ? 'Saving…' : 'Save name'}
        </button>
        <button type="button" className="btn btn-ghost" disabled={nameSaving} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function MessageList({ entry }: { entry: MessageHistoryEntry[] | 'loading' | undefined }) {
  if (entry === undefined) return <p className="empty-note">Loading…</p>;
  if (entry === 'loading') return <p className="empty-note">Loading…</p>;
  if (entry.length === 0) return <p className="empty-note">No messages sent yet.</p>;
  return (
    <div>
      {entry.map((message, index) => (
        <div key={index} className={`msg-item${message.success ? '' : ' failed'}`}>
          <div className="chan">
            <svg className="icon" style={{ width: 14, height: 14 }}><use href={message.success ? '#i-check' : '#i-alert'} /></svg>
          </div>
          <div className="body">
            <div className="type">{message.messageType} · {message.channel.toUpperCase()}</div>
            <div className="when">
              {new Date(message.sentAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
              {!message.success && ' · Failed to deliver'}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function PortalIcons() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
      <defs>
        <symbol id="i-grid" viewBox="0 0 24 24"><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="8" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /><rect x="13" y="13" width="8" height="8" rx="1.5" /></symbol>
        <symbol id="i-book" viewBox="0 0 24 24"><path d="M4 5.5C4 4.7 4.7 4 5.5 4H12v16H5.5A1.5 1.5 0 0 1 4 18.5z" /><path d="M20 5.5c0-.8-.7-1.5-1.5-1.5H12v16h6.5a1.5 1.5 0 0 0 1.5-1.5z" /></symbol>
        <symbol id="i-card" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18" /><path d="M7 15h4" /></symbol>
        <symbol id="i-award" viewBox="0 0 24 24"><circle cx="12" cy="8" r="5.5" /><path d="M8.5 12.8 7 21l5-2.5 5 2.5-1.5-8.2" /></symbol>
        <symbol id="i-chat" viewBox="0 0 24 24"><path d="M4 5.5C4 4.7 4.7 4 5.5 4h13c.8 0 1.5.7 1.5 1.5v10c0 .8-.7 1.5-1.5 1.5H9l-4 3v-3H5.5A1.5 1.5 0 0 1 4 15.5z" /></symbol>
        <symbol id="i-compass" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M15 9l-2 6-6 2 2-6z" /></symbol>
        <symbol id="i-user" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" /><path d="M4.5 20c1.2-4 4-6 7.5-6s6.3 2 7.5 6" /></symbol>
        <symbol id="i-logout" viewBox="0 0 24 24"><path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" /><path d="M15 16l4-4-4-4" /><path d="M19 12H9" /></symbol>
        <symbol id="i-download" viewBox="0 0 24 24"><path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M4 19h16" /></symbol>
        <symbol id="i-linkedin" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M8 10.5V17M8 7.2v.1M12.2 17v-4c0-1.4.9-2.4 2.2-2.4 1.3 0 2.1.9 2.1 2.4V17" /></symbol>
        <symbol id="i-check" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.5 2.5 5.5-6" /></symbol>
        <symbol id="i-alert" viewBox="0 0 24 24"><path d="M12 3.5 21 19H3z" /><path d="M12 9.5v4.2" /><path d="M12 16.8v.1" /></symbol>
        <symbol id="i-play" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M10 8.5l6 3.5-6 3.5z" /></symbol>
        <symbol id="i-zoom" viewBox="0 0 24 24"><rect x="2" y="6" width="14" height="12" rx="2" /><path d="M16 10l5-3v10l-5-3z" /></symbol>
        <symbol id="i-edit" viewBox="0 0 24 24"><path d="M4 20l.9-3.6L16.4 5 19 7.6 7.6 19z" /><path d="M14.5 6.9 17.1 9.5" /></symbol>
      </defs>
    </svg>
  );
}

const PORTAL_STYLES = `
:root {
  --font-display: Georgia, 'Iowan Old Style', 'Palatino Linotype', 'Times New Roman', serif;
  --font-body: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;

  --rail-bg: #12204C;
  --rail-bg-2: #1E3A8A;
  --rail-fg: #F3F5FA;
  --rail-fg-muted: #9FB0D9;
  --rail-active-bg: rgba(255,255,255,0.09);
  --rail-line: rgba(255,255,255,0.10);
  --rail-accent: #FB923C;

  --ink: #211C17;
  --ink-muted: #5C554B;
  --ink-faint: #948C7E;
  --paper: #F7F6F3;
  --surface: #FFFFFF;
  --surface-2: #FBFAF8;
  --line: #E6E2DA;
  --accent: #C2410C;
  --accent-deep: #9A3412;
  --accent-contrast: #FFFFFF;
  --accent-tint: #FFEDD5;
  --success: #047857;
  --success-bg: #D1FAE5;
  --warning: #A16207;
  --warning-bg: #FEF3C7;
  --danger: #B91C1C;
  --danger-bg: #FEE2E2;
  --shadow: 0 1px 2px rgba(33,28,23,0.05), 0 8px 24px -12px rgba(33,28,23,0.14);
}
@media (prefers-color-scheme: dark) {
  :root {
    --ink: #EDEFF3; --ink-muted: #A6ADBD; --ink-faint: #6E7690;
    --paper: #0E1526; --surface: #17203A; --surface-2: #1C2544; --line: #2B3555;
    --accent: #FB923C; --accent-deep: #F97316; --accent-contrast: #1C1109; --accent-tint: rgba(251,146,60,0.16);
    --success: #34D399; --success-bg: rgba(52,211,153,0.14);
    --warning: #EAB308; --warning-bg: rgba(234,179,8,0.14);
    --danger: #F87171; --danger-bg: rgba(248,113,113,0.14);
    --shadow: 0 1px 2px rgba(0,0,0,0.3), 0 12px 28px -14px rgba(0,0,0,0.6);
  }
}
.portal-app * { box-sizing: border-box; }
.portal-app {
  background: var(--paper); color: var(--ink); font-family: var(--font-body);
  font-size: 15px; line-height: 1.6; -webkit-font-smoothing: antialiased; min-height: 100vh;
}
.portal-app h1, .portal-app h2, .portal-app h3, .portal-app h4 { font-family: var(--font-display); font-weight: 600; margin: 0; }
.portal-app a { color: inherit; }
.portal-app button { font-family: inherit; }
.portal-app .tnum { font-variant-numeric: tabular-nums; }
.portal-loading { min-height: 100vh; display: grid; place-items: center; font-family: var(--font-body, sans-serif); color: #5C554B; }
.portal-app .icon { width: 18px; height: 18px; stroke: currentColor; fill: none; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; flex-shrink: 0; }

.portal-app .app { display: flex; min-height: 100vh; }
.portal-app .rail {
  width: 264px; flex-shrink: 0; background: linear-gradient(180deg, var(--rail-bg), var(--rail-bg-2));
  color: var(--rail-fg); display: flex; flex-direction: column; padding: 22px 16px 16px;
  position: sticky; top: 0; height: 100vh;
}
.portal-app .rail-brand { display: flex; align-items: center; gap: 10px; padding: 4px 8px 20px; }
.portal-app .rail-brand .mark { width: 34px; height: 34px; border-radius: 50%; flex-shrink: 0; object-fit: cover; }
.portal-app .rail-brand .name { font-family: var(--font-display); font-size: 17px; font-weight: 600; }
.portal-app .rail-brand .tag { display: block; font-size: 11px; color: var(--rail-fg-muted); letter-spacing: 0.04em; }
.portal-app .identity { display: flex; align-items: center; gap: 10px; padding: 12px; margin: 0 4px 18px; background: rgba(255,255,255,0.05); border: 1px solid var(--rail-line); border-radius: 10px; }
.portal-app .identity .avatar { width: 38px; height: 38px; border-radius: 50%; background: var(--rail-active-bg); color: var(--rail-accent); display: grid; place-items: center; font-weight: 600; font-size: 14px; border: 1px solid var(--rail-line); flex-shrink: 0; }
.portal-app .identity .who { min-width: 0; }
.portal-app .identity .who strong { display: block; font-size: 13.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.portal-app .identity .who span { display: block; font-size: 11.5px; color: var(--rail-fg-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.portal-app .rail-nav { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; flex: 1; }
.portal-app .rail-nav button { width: 100%; display: flex; align-items: center; gap: 10px; background: none; border: none; color: var(--rail-fg-muted); padding: 9px 10px; border-radius: 8px; font-size: 13.5px; font-weight: 500; cursor: pointer; text-align: left; }
.portal-app .rail-nav button:hover { background: rgba(255,255,255,0.05); color: var(--rail-fg); }
.portal-app .rail-nav button[aria-current="page"] { background: var(--rail-active-bg); color: #fff; }
.portal-app .rail-nav button[aria-current="page"] .icon { stroke: var(--rail-accent); }
.portal-app .rail-nav .badge { margin-left: auto; font-size: 10.5px; font-weight: 700; background: var(--rail-accent); color: var(--rail-bg); min-width: 17px; height: 17px; border-radius: 999px; display: grid; place-items: center; padding: 0 5px; }
.portal-app .rail-foot { border-top: 1px solid var(--rail-line); padding-top: 12px; margin-top: 8px; }
.portal-app .rail-foot .support { font-size: 12px; color: var(--rail-fg-muted); padding: 0 10px 10px; line-height: 1.5; }
.portal-app .rail-foot .support a { color: var(--rail-accent); text-decoration: none; }
.portal-app .rail-foot button.logout { width: 100%; display: flex; align-items: center; gap: 9px; background: none; border: 1px solid var(--rail-line); color: var(--rail-fg); padding: 9px 10px; border-radius: 8px; font-size: 13px; cursor: pointer; }
.portal-app .rail-foot button.logout:hover { background: rgba(255,255,255,0.06); }

.portal-app .main { flex: 1; min-width: 0; }
.portal-app .topbar { display: none; }
.portal-app .content { max-width: 960px; margin: 0 auto; padding: 40px 40px 80px; }
.portal-app .panel.active { display: block; }
.portal-app .eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: var(--accent); margin: 0 0 6px; }
.portal-app .panel-title { font-size: 24px; margin-bottom: 4px; }
.portal-app .panel-sub { color: var(--ink-muted); font-size: 14px; margin: 0 0 28px; max-width: 68ch; }
.portal-app .empty-note { color: var(--ink-muted); font-size: 13.5px; }
.portal-app .link-btn { background: none; border: none; padding: 0; color: var(--accent); font-weight: 600; font-size: inherit; cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }

.portal-app .hero-banner { background: linear-gradient(135deg, #C2410C, #1E3A8A); color: #fff; border-radius: 14px; padding: 22px 26px; display: flex; justify-content: space-between; align-items: center; gap: 20px; flex-wrap: wrap; margin-bottom: 24px; }
.portal-app .hero-banner .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.07em; opacity: 0.85; margin-bottom: 6px; }
.portal-app .hero-banner h2 { font-size: 19px; color: #fff; }
.portal-app .hero-banner .when { font-size: 13.5px; opacity: 0.92; margin-top: 4px; }
.portal-app .btn { display: inline-flex; align-items: center; gap: 7px; font-size: 13.5px; font-weight: 600; padding: 10px 16px; border-radius: 8px; border: 1px solid transparent; cursor: pointer; text-decoration: none; white-space: nowrap; }
.portal-app .btn-primary { background: var(--accent); color: var(--accent-contrast); }
.portal-app .btn-primary:hover { background: var(--accent-deep); }
.portal-app .btn-onaccent { background: #fff; color: #1E3A8A; }
.portal-app .btn-onaccent:hover { background: #EEF2FB; }
.portal-app .btn-ghost { background: transparent; color: var(--ink); border-color: var(--line); }
.portal-app .btn-ghost:hover { background: var(--surface-2); }
.portal-app .btn-outline { background: transparent; color: var(--accent); border-color: var(--accent); }
.portal-app .btn-outline:hover { background: var(--accent-tint); }
.portal-app .btn-sm { padding: 7px 12px; font-size: 12.5px; }
.portal-app .btn[disabled] { opacity: 0.5; cursor: not-allowed; }

.portal-app .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; margin-bottom: 28px; }
.portal-app .stat-tile { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 16px 18px; box-shadow: var(--shadow); }
.portal-app .stat-tile .icon-wrap { width: 30px; height: 30px; border-radius: 8px; background: var(--accent-tint); color: var(--accent); display: grid; place-items: center; margin-bottom: 10px; }
.portal-app .stat-tile .num { font-family: var(--font-display); font-size: 26px; display: block; }
.portal-app .stat-tile .lbl { font-size: 12.5px; color: var(--ink-muted); }
.portal-app .stat-tile.warn .num { color: var(--warning); }

.portal-app .section-heading { display: flex; align-items: baseline; justify-content: space-between; margin: 30px 0 14px; }
.portal-app .section-heading h3 { font-size: 16px; }
.portal-app .mini-course-row { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 13px 16px; background: var(--surface); border: 1px solid var(--line); border-radius: 10px; margin-bottom: 8px; }
.portal-app .mini-course-row .name { font-weight: 600; font-size: 14px; }
.portal-app .mini-course-row .meta { font-size: 12.5px; color: var(--ink-muted); margin-top: 2px; }

.portal-app .pill { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 700; padding: 3px 9px; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.03em; }
.portal-app .pill::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.portal-app .pill-success { background: var(--success-bg); color: var(--success); }
.portal-app .pill-warning { background: var(--warning-bg); color: var(--warning); }
.portal-app .pill-danger { background: var(--danger-bg); color: var(--danger); }
.portal-app .pill-neutral { background: var(--surface-2); color: var(--ink-muted); border: 1px solid var(--line); }

.portal-app .course-card { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 22px; margin-bottom: 20px; box-shadow: var(--shadow); }
.portal-app .course-card .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
.portal-app .course-card .head h4 { font-size: 18px; margin: 0 0 4px; }
.portal-app .course-card .head .meta { font-size: 13px; color: var(--ink-muted); }
.portal-app .course-card .badges { display: flex; gap: 6px; flex-wrap: wrap; }
.portal-app .fig-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; background: var(--line); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; margin: 18px 0; }
.portal-app .fig-grid > div { background: var(--surface-2); padding: 12px 14px; }
.portal-app .fig-grid .lbl { font-size: 11px; color: var(--ink-muted); text-transform: uppercase; letter-spacing: 0.04em; display: block; }
.portal-app .fig-grid .val { font-size: 16px; font-weight: 600; margin-top: 2px; }
.portal-app .fig-grid .val.balance { color: var(--warning); }
.portal-app .join-row { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 4px; }
.portal-app .pay-block { margin-top: 16px; display: flex; flex-direction: column; gap: 12px; border-top: 1px solid var(--line); padding-top: 16px; }
.portal-app .confirming-note { background: var(--success-bg); color: var(--success); padding: 12px; border-radius: 8px; font-size: 13px; }
.portal-app .plan-box { background: var(--surface-2); border-radius: 8px; padding: 12px; }
.portal-app .plan-box-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink-muted); margin: 0 0 6px; }
.portal-app .plan-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; font-size: 13.5px; }
.portal-app .plan-confirm { border: 1px solid var(--line); border-radius: 8px; padding: 12px; font-size: 13.5px; }
.portal-app .plan-confirm-error { color: var(--danger); margin: 6px 0; }

.portal-app .tabbed { border: 1px solid var(--line); border-radius: 10px; margin-top: 18px; overflow: hidden; }
.portal-app .tabbed-nav { display: flex; background: var(--surface-2); border-bottom: 1px solid var(--line); overflow-x: auto; }
.portal-app .tabbed-nav button { background: none; border: none; padding: 10px 16px; font-size: 12.5px; font-weight: 600; color: var(--ink-muted); cursor: pointer; border-bottom: 2px solid transparent; white-space: nowrap; }
.portal-app .tabbed-nav button.active { color: var(--accent); border-bottom-color: var(--accent); }
.portal-app .tabbed-body { padding: 16px; }
.portal-app .att-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.portal-app .att-list li { display: flex; justify-content: space-between; font-size: 13px; padding: 6px 0; border-bottom: 1px dashed var(--line); }
.portal-app .att-list li:last-child { border-bottom: none; }
.portal-app .att-list .duration { color: var(--ink-muted); }

.portal-app .msg-item { display: flex; gap: 10px; padding: 9px 0; border-bottom: 1px dashed var(--line); font-size: 13px; align-items: flex-start; }
.portal-app .msg-item:last-child { border-bottom: none; }
.portal-app .msg-item .chan { width: 26px; height: 26px; border-radius: 7px; display: grid; place-items: center; flex-shrink: 0; background: var(--accent-tint); color: var(--accent); }
.portal-app .msg-item .body { flex: 1; min-width: 0; }
.portal-app .msg-item .type { font-weight: 600; }
.portal-app .msg-item .when { color: var(--ink-faint); font-size: 12px; }
.portal-app .msg-item.failed .chan { background: var(--danger-bg); color: var(--danger); }

.portal-app .table-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); box-shadow: var(--shadow); }
.portal-app table { width: 100%; border-collapse: collapse; font-size: 13.5px; min-width: 640px; }
.portal-app thead th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-muted); padding: 12px 16px; border-bottom: 1px solid var(--line); background: var(--surface-2); }
.portal-app tbody td { padding: 14px 16px; border-bottom: 1px solid var(--line); vertical-align: middle; }
.portal-app tbody tr:last-child td { border-bottom: none; }
.portal-app tbody td.num { text-align: right; }
.portal-app .course-cell strong { display: block; font-size: 13.5px; }
.portal-app .course-cell span { display: block; font-size: 12px; color: var(--ink-muted); }
.portal-app tfoot td { padding: 12px 16px; font-weight: 700; border-top: 1px solid var(--line); }

.portal-app .cert-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
.portal-app .cert-card { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 20px; box-shadow: var(--shadow); position: relative; overflow: hidden; }
.portal-app .cert-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px; background: linear-gradient(90deg, var(--accent), var(--accent-deep)); }
.portal-app .cert-card .cert-icon { width: 40px; height: 40px; border-radius: 10px; background: var(--accent-tint); color: var(--accent); display: grid; place-items: center; margin-bottom: 14px; }
.portal-app .cert-card h4 { font-size: 16px; margin-bottom: 4px; }
.portal-app .cert-card .num { font-size: 12px; color: var(--ink-muted); font-family: var(--font-body); }
.portal-app .cert-card .issued { font-size: 12.5px; color: var(--ink-muted); margin: 10px 0 16px; }
.portal-app .cert-card .actions { display: flex; gap: 8px; flex-wrap: wrap; }
.portal-app .cert-card .verify { margin-top: 12px; font-size: 11.5px; color: var(--ink-faint); }
.portal-app .cert-card .verify a { color: var(--accent); text-decoration: none; }
.portal-app .cert-pending { border: 1px dashed var(--line); border-radius: 14px; padding: 20px; display: flex; align-items: center; gap: 14px; color: var(--ink-muted); background: var(--surface-2); }
.portal-app .cert-pending .icon-wrap { width: 40px; height: 40px; border-radius: 10px; background: var(--surface); border: 1px solid var(--line); display: grid; place-items: center; color: var(--ink-faint); flex-shrink: 0; }
.portal-app .cert-pending strong { color: var(--ink); display: block; font-size: 13.5px; margin-bottom: 2px; }
.portal-app .cert-pending span { font-size: 12.5px; }

.portal-app .explore-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }
.portal-app .explore-card { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 18px; box-shadow: var(--shadow); display: flex; flex-direction: column; gap: 10px; }
.portal-app .explore-card h4 { font-size: 15.5px; }
.portal-app .explore-card .meta { font-size: 12.5px; color: var(--ink-muted); }
.portal-app .explore-card .price { margin-top: auto; display: flex; align-items: baseline; gap: 8px; }
.portal-app .explore-card .price .was { text-decoration: line-through; color: var(--ink-faint); font-size: 12.5px; }
.portal-app .explore-card .price .now { font-size: 17px; font-weight: 700; font-family: var(--font-display); }
.portal-app .explore-card .price .now.disc { color: var(--success); }
.portal-app .explore-card .foot { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.portal-app .seats { font-size: 12px; color: var(--ink-muted); }

.portal-app .account-card, .portal-app .name-edit-form { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 22px; max-width: 480px; box-shadow: var(--shadow); }
.portal-app .field-static { display: flex; flex-direction: column; gap: 2px; padding: 10px 0; border-bottom: 1px dashed var(--line); }
.portal-app .field-static:last-of-type { border-bottom: none; }
.portal-app .field-static .lbl { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink-muted); }
.portal-app .field-static .val { font-size: 14.5px; font-weight: 600; }
.portal-app .field { margin-bottom: 14px; }
.portal-app .field label { display: block; font-size: 12px; font-weight: 600; color: var(--ink-muted); margin-bottom: 6px; }
.portal-app .field input { width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--line); background: var(--paper); color: var(--ink); font-size: 14px; }
.portal-app .field input:focus { outline: 2px solid var(--accent); outline-offset: 1px; border-color: var(--accent); }
.portal-app .session-note { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--ink-muted); margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--line); }
.portal-app .session-note .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--success); }

.portal-app :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 4px; }

@media (max-width: 860px) {
  .portal-app .app { flex-direction: column; }
  .portal-app .rail { display: none; }
  .portal-app .topbar { display: block; position: sticky; top: 0; z-index: 10; background: var(--rail-bg); color: var(--rail-fg); padding: 12px 16px; }
  .portal-app .topbar .row1 { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
  .portal-app .topbar .row1 .brand { display: flex; align-items: center; gap: 8px; font-family: var(--font-display); font-size: 15px; font-weight: 600; }
  .portal-app .topbar .row1 .mark { width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0; object-fit: cover; }
  .portal-app .topbar .row1 button.logout { background: none; border: 1px solid var(--rail-line); color: var(--rail-fg); border-radius: 7px; padding: 6px 10px; font-size: 12px; display: flex; align-items: center; gap: 6px; }
  .portal-app .topbar-nav { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 2px; }
  .portal-app .topbar-nav button { flex-shrink: 0; background: none; border: 1px solid var(--rail-line); color: var(--rail-fg-muted); padding: 7px 12px; border-radius: 999px; font-size: 12.5px; font-weight: 600; cursor: pointer; }
  .portal-app .topbar-nav button[aria-current="page"] { background: var(--rail-accent); color: var(--rail-bg); border-color: var(--rail-accent); }
  .portal-app .content { padding: 26px 18px 60px; }
  .portal-app .fig-grid { grid-template-columns: 1fr 1fr; }
  .portal-app .fig-grid > div:first-child { grid-column: 1 / -1; }
}
`;
