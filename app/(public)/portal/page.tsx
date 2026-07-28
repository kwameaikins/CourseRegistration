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
import { PORTAL_STYLES, PortalIcons } from '@/components/portal/portal-design-system';
import { formatDate, formatGhs } from '@/lib/utils';
import {
  FEEDBACK_IMPROVEMENT_LABEL,
  FEEDBACK_MATERIALS_LABEL,
  FEEDBACK_MATERIALS_OPTIONS,
  FEEDBACK_MOST_VALUABLE_LABEL,
  FEEDBACK_OTHER_COURSE_LABEL,
  FEEDBACK_RATING_QUESTIONS,
  FEEDBACK_RECOMMEND_LABEL,
  FEEDBACK_RECOMMEND_OPTIONS,
  FEEDBACK_TESTIMONIAL_LABEL,
  FEEDBACK_TESTIMONIAL_OPTIONS,
} from '@/lib/feedback-questions';

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
  resourcesLink: string | null;
  installments: Array<{
    installmentNumber: number;
    amountDue: number;
    amountPaid: number;
    dueDate: string;
    paymentStatus: 'Pending' | 'Paid';
  }>;
  feedbackSubmitted: boolean;
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
  const [courseTab, setCourseTab] = useState<Record<string, 'attendance' | 'messages' | 'feedback'>>({});

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
  const pendingFeedback = dashboard.registrations.filter(
    (r) => r.paymentStatus === 'Paid' && !r.feedbackSubmitted,
  );

  return (
    <div className="portal-app">
      <style>{PORTAL_STYLES}</style>
      <PortalIcons />
      <a href="#portal-main" className="skip-link">Skip to content</a>

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

        <main id="portal-main" className="main">
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

                {pendingFeedback.length > 0 && (
                  <div className="feedback-banner">
                    <div>
                      <strong>
                        {pendingFeedback.length} course{pendingFeedback.length === 1 ? '' : 's'} awaiting your feedback
                      </strong>
                      <span>Submit it to get your certificate — it takes under two minutes.</span>
                    </div>
                    <button type="button" className="btn btn-primary" onClick={() => setActivePanel('courses')}>
                      <svg className="icon" style={{ width: 15, height: 15 }}><use href="#i-chat" /></svg>Give Feedback
                    </button>
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
                        {reg.resourcesLink && (
                          <a className="btn btn-outline btn-sm" href={reg.resourcesLink} target="_blank" rel="noreferrer">
                            <svg className="icon" style={{ width: 15, height: 15 }}><use href="#i-book" /></svg>Course Resources
                          </a>
                        )}
                        {reg.paymentStatus === 'Paid' && !reg.feedbackSubmitted && (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => setCourseTab((cur) => ({ ...cur, [reg.registrationId]: 'feedback' }))}
                          >
                            <svg className="icon" style={{ width: 15, height: 15 }}><use href="#i-chat" /></svg>Give Feedback
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
                            className={(courseTab[reg.registrationId] ?? 'attendance') === 'attendance' ? 'active' : ''}
                            type="button"
                            onClick={() => setCourseTab((cur) => ({ ...cur, [reg.registrationId]: 'attendance' }))}
                          >
                            Attendance ({reg.attendance.length})
                          </button>
                          <button
                            className={courseTab[reg.registrationId] === 'messages' ? 'active' : ''}
                            type="button"
                            onClick={() => {
                              setCourseTab((cur) => ({ ...cur, [reg.registrationId]: 'messages' }));
                              if (!messages) fetchMessages(reg.registrationId);
                            }}
                          >
                            Messages
                          </button>
                          <button
                            className={courseTab[reg.registrationId] === 'feedback' ? 'active' : ''}
                            type="button"
                            onClick={() => setCourseTab((cur) => ({ ...cur, [reg.registrationId]: 'feedback' }))}
                          >
                            Feedback{reg.feedbackSubmitted ? ' ✓' : ''}
                          </button>
                        </div>
                        <div className="tabbed-body">
                          {(courseTab[reg.registrationId] ?? 'attendance') === 'attendance' && (
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
                          )}
                          {courseTab[reg.registrationId] === 'messages' && <MessageList entry={messages} />}
                          {courseTab[reg.registrationId] === 'feedback' && (
                            reg.feedbackSubmitted ? (
                              <p className="fb-submitted">
                                <svg className="icon" style={{ width: 16, height: 16 }}><use href="#i-check" /></svg>
                                Feedback submitted — thank you!
                              </p>
                            ) : (
                              <PortalFeedbackForm
                                registrationId={reg.registrationId}
                                onSubmitted={() => void loadDashboard()}
                              />
                            )
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

interface FeedbackSubmitResult {
  submitted: true;
  certificateIssued: boolean;
  certificateDownloadUrl: string | null;
}

function RatingRow({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="fb-row" role="radiogroup">
      {[1, 2, 3, 4, 5].map((score) => (
        <button
          key={score}
          type="button"
          role="radio"
          aria-checked={value === score}
          className={value === score ? 'active' : ''}
          onClick={() => onChange(score)}
        >
          {score}
        </button>
      ))}
    </div>
  );
}

function ChoiceRow<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T | '';
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="fb-row" role="radiogroup">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          className={value === option.value ? 'active' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

// In-portal feedback (2026-07-27) — same 5-group question set and shared
// copy (lib/feedback-questions.ts) as the public /feedback/[registrationId]
// page, styled with the portal's own bespoke CSS instead of shadcn. On
// success calls onSubmitted so the parent reloads the dashboard (picks up
// feedbackSubmitted + any auto-issued certificate).
function PortalFeedbackForm({
  registrationId,
  onSubmitted,
}: {
  registrationId: string;
  onSubmitted: () => void;
}) {
  const [overallRating, setOverallRating] = useState(0);
  const [relevanceRating, setRelevanceRating] = useState(0);
  const [facilitatorRating, setFacilitatorRating] = useState(0);
  const [confidenceRating, setConfidenceRating] = useState(0);
  const [materialsClarity, setMaterialsClarity] = useState<(typeof FEEDBACK_MATERIALS_OPTIONS)[number] | ''>('');
  const [mostValuableText, setMostValuableText] = useState('');
  const [improvementText, setImprovementText] = useState('');
  const [recommendation, setRecommendation] = useState<(typeof FEEDBACK_RECOMMEND_OPTIONS)[number] | ''>('');
  const [otherCourseSuggestion, setOtherCourseSuggestion] = useState('');
  const [testimonialChoice, setTestimonialChoice] = useState<'Named' | 'Anonymous' | 'No'>('No');

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<FeedbackSubmitResult | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!overallRating || !relevanceRating || !facilitatorRating || !confidenceRating) {
      setErrorMessage('Please answer all four rating questions.');
      return;
    }
    if (!materialsClarity) {
      setErrorMessage('Please let us know about the course materials.');
      return;
    }
    if (!recommendation) {
      setErrorMessage('Please let us know if you would recommend this course.');
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const data = await apiFetch<FeedbackSubmitResult>(`/api/portal/feedback/${registrationId}`, {
        method: 'POST',
        body: JSON.stringify({
          overallRating,
          relevanceRating,
          facilitatorRating,
          confidenceRating,
          materialsClarity,
          mostValuableText,
          improvementText,
          recommendation,
          otherCourseSuggestion,
          testimonialChoice,
        }),
      });
      setResult(data);
      onSubmitted();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Submission failed — try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div>
        <p className="fb-submitted">
          <svg className="icon" style={{ width: 16, height: 16 }}><use href="#i-check" /></svg>
          Thank you — your feedback has been recorded.
        </p>
        {result.certificateIssued && result.certificateDownloadUrl && (
          <a
            className="btn btn-primary btn-sm"
            style={{ marginTop: 12 }}
            href={result.certificateDownloadUrl}
            target="_blank"
            rel="noreferrer"
          >
            <svg className="icon" style={{ width: 15, height: 15 }}><use href="#i-award" /></svg>Your certificate is ready — download it
          </a>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="fb-group">
        <p className="fb-group-title">Rate your experience</p>
        {FEEDBACK_RATING_QUESTIONS.map((question) => (
          <div className="fb-question" key={question.key}>
            <label>{question.label}</label>
            <RatingRow
              value={
                { overallRating, relevanceRating, facilitatorRating, confidenceRating }[question.key]
              }
              onChange={
                {
                  overallRating: setOverallRating,
                  relevanceRating: setRelevanceRating,
                  facilitatorRating: setFacilitatorRating,
                  confidenceRating: setConfidenceRating,
                }[question.key]
              }
            />
          </div>
        ))}
      </div>

      <div className="fb-group">
        <p className="fb-group-title">Course materials</p>
        <div className="fb-question">
          <label>{FEEDBACK_MATERIALS_LABEL}</label>
          <ChoiceRow
            value={materialsClarity}
            options={FEEDBACK_MATERIALS_OPTIONS.map((o) => ({ value: o, label: o }))}
            onChange={setMaterialsClarity}
          />
        </div>
      </div>

      <div className="fb-group">
        <p className="fb-group-title">In your own words</p>
        <div className="field">
          <label htmlFor={`mostValuable-${registrationId}`}>{FEEDBACK_MOST_VALUABLE_LABEL} (optional)</label>
          <textarea
            id={`mostValuable-${registrationId}`}
            maxLength={1000}
            value={mostValuableText}
            onChange={(event) => setMostValuableText(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={`improvement-${registrationId}`}>{FEEDBACK_IMPROVEMENT_LABEL} (optional)</label>
          <textarea
            id={`improvement-${registrationId}`}
            maxLength={2000}
            value={improvementText}
            onChange={(event) => setImprovementText(event.target.value)}
          />
        </div>
      </div>

      <div className="fb-group">
        <p className="fb-group-title">Looking ahead</p>
        <div className="fb-question">
          <label>{FEEDBACK_RECOMMEND_LABEL}</label>
          <ChoiceRow
            value={recommendation}
            options={FEEDBACK_RECOMMEND_OPTIONS.map((o) => ({ value: o, label: o }))}
            onChange={setRecommendation}
          />
        </div>
        <div className="field">
          <label htmlFor={`otherCourse-${registrationId}`}>{FEEDBACK_OTHER_COURSE_LABEL} (optional)</label>
          <input
            id={`otherCourse-${registrationId}`}
            maxLength={300}
            value={otherCourseSuggestion}
            onChange={(event) => setOtherCourseSuggestion(event.target.value)}
          />
        </div>
      </div>

      <div className="fb-group">
        <p className="fb-group-title">Testimonial permission</p>
        <div className="fb-question">
          <label>{FEEDBACK_TESTIMONIAL_LABEL}</label>
          <ChoiceRow value={testimonialChoice} options={FEEDBACK_TESTIMONIAL_OPTIONS} onChange={setTestimonialChoice} />
        </div>
      </div>

      {errorMessage && <p className="plan-confirm-error">{errorMessage}</p>}

      <button type="submit" className="btn btn-primary" disabled={submitting} style={{ width: '100%', justifyContent: 'center' }}>
        {submitting ? 'Submitting…' : 'Submit feedback'}
      </button>
    </form>
  );
}

