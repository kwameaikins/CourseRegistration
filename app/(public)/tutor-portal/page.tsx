'use client';

// Tutor portal dashboard (2026-07-27) — the replacement for the old staff
// /my-courses page. Tutors are external parties, not Knowsia staff (see
// modules/tutors and the tutor_auth/tutor_sessions migration header), so
// this is a third PIN + session-cookie portal, same architecture as the
// student and corporate portals — same shared app shell
// (components/portal/portal-design-system.tsx).
import { Fragment, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';

import { apiFetch } from '@/components/api-client';
import { PORTAL_STYLES, PortalIcons } from '@/components/portal/portal-design-system';
import { formatDate, formatGhs } from '@/lib/utils';

interface DashboardBatch {
  batchId: string;
  courseName: string;
  cohortLabel: string;
  startDate: string;
  endDate: string;
  zoomLink: string | null;
  registeredCount: number;
}

interface DashboardLiveSession {
  id: string;
  batchId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  status: string;
}

interface Dashboard {
  fullName: string;
  email: string;
  phone: string;
  mustChangePin: boolean;
  batches: DashboardBatch[];
  liveSessions: DashboardLiveSession[];
}

interface RosterEntry {
  registrationId: string;
  fullName: string;
  email: string;
  phone: string;
  registrationStatus: string;
  registeredAt: string;
}

interface AttendanceEntry {
  registrationId: string;
  participantName: string;
  participantEmail: string;
  sessionDate: string;
  joinTime: string | null;
  leaveTime: string | null;
  durationMinutes: number;
}

interface CertificateCandidate {
  registrationId: string;
  participantName: string;
  participantEmail: string;
  paid: boolean;
  feedbackSubmitted: boolean;
  attendancePercent: number | null;
  alreadyIssued: boolean;
  eligible: boolean;
}

interface MaterialEntry {
  id: string;
  title: string;
  link: string;
  createdAt: string;
}

// Knowsia Growth Partner Programme (2026-08-02) — a category='tutor'
// partner's referral summary, surfaced here rather than a second login
// (see modules/tutors/service.ts's getReferralSummaryForSession).
interface ReferralCode {
  id: string;
  code: string;
  discountType: 'percentage' | 'fixed_amount' | null;
  discountValue: number | null;
  usesCount: number;
}

interface ReferralPayout {
  id: string;
  totalAmount: number;
  method: string;
  paidAt: string;
}

interface ReferralSummary {
  codes: ReferralCode[];
  commissionTotals: Record<string, number>;
  recentPayouts: ReferralPayout[];
  payableCommissionIds: string[];
}

type PanelId =
  | 'overview'
  | 'schedule'
  | 'roster'
  | 'attendance'
  | 'materials'
  | 'certificates'
  | 'referrals'
  | 'account';

const NAV_ITEMS: Array<{ id: PanelId; label: string; icon: string }> = [
  { id: 'overview', label: 'Overview', icon: 'i-grid' },
  { id: 'schedule', label: 'My Schedule', icon: 'i-book' },
  { id: 'roster', label: 'Roster', icon: 'i-users' },
  { id: 'attendance', label: 'Attendance', icon: 'i-check' },
  { id: 'materials', label: 'Materials', icon: 'i-book' },
  { id: 'certificates', label: 'Certificate Eligibility', icon: 'i-award' },
  { id: 'referrals', label: 'Referrals', icon: 'i-card' },
  { id: 'account', label: 'Account', icon: 'i-user' },
];

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase();
}

export default function TutorPortalDashboardPage() {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [activePanel, setActivePanel] = useState<PanelId>('overview');
  const [selectedBatchId, setSelectedBatchId] = useState<string>('');

  const [roster, setRoster] = useState<RosterEntry[] | 'loading' | null>(null);
  const [attendance, setAttendance] = useState<AttendanceEntry[] | 'loading' | null>(null);
  const [certificates, setCertificates] = useState<CertificateCandidate[] | 'loading' | null>(null);
  const [materials, setMaterials] = useState<MaterialEntry[] | 'loading' | null>(null);
  const [referrals, setReferrals] = useState<ReferralSummary | null | 'loading'>(null);
  const [redeemEmail, setRedeemEmail] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [redeemSuccess, setRedeemSuccess] = useState<string | null>(null);

  const [editingContact, setEditingContact] = useState(false);
  const [contactForm, setContactForm] = useState({ fullName: '', phone: '' });
  const [contactSaving, setContactSaving] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);

  const [flaggingKey, setFlaggingKey] = useState<string | null>(null);
  const [flagForm, setFlagForm] = useState<{
    exceptionType: 'no_show_flag' | 'correction_request';
    reason: string;
    requestedPresent: boolean;
  }>({ exceptionType: 'no_show_flag', reason: '', requestedPresent: true });
  const [flagSubmitting, setFlagSubmitting] = useState(false);
  const [flagError, setFlagError] = useState<string | null>(null);
  const [flaggedKeys, setFlaggedKeys] = useState<Set<string>>(new Set());

  const [materialForm, setMaterialForm] = useState({ title: '', link: '' });
  const [materialSaving, setMaterialSaving] = useState(false);
  const [materialError, setMaterialError] = useState<string | null>(null);

  const loadDashboard = useCallback(() => {
    return apiFetch<Dashboard>('/api/tutor-portal/me')
      .then((data) => {
        if (data.mustChangePin) {
          router.push('/tutor-portal/change-pin');
          return;
        }
        setDashboard(data);
        if (data.batches.length > 0) setSelectedBatchId((current) => current || data.batches[0].batchId);
      })
      .catch(() => router.push('/tutor-portal/login'));
  }, [router]);

  useEffect(() => {
    loadDashboard().finally(() => setLoading(false));
  }, [loadDashboard]);

  useEffect(() => {
    if (!selectedBatchId) return;
    if (activePanel === 'roster') {
      setRoster('loading');
      apiFetch<RosterEntry[]>(`/api/tutor-portal/roster/${selectedBatchId}`).then(setRoster).catch(() => setRoster([]));
    }
    if (activePanel === 'attendance') {
      setAttendance('loading');
      apiFetch<AttendanceEntry[]>(`/api/tutor-portal/attendance/${selectedBatchId}`).then(setAttendance).catch(() => setAttendance([]));
    }
    if (activePanel === 'certificates') {
      setCertificates('loading');
      apiFetch<CertificateCandidate[]>(`/api/tutor-portal/certificates/${selectedBatchId}`).then(setCertificates).catch(() => setCertificates([]));
    }
    if (activePanel === 'materials') {
      setMaterials('loading');
      apiFetch<MaterialEntry[]>(`/api/tutor-portal/materials/${selectedBatchId}`).then(setMaterials).catch(() => setMaterials([]));
    }
  }, [activePanel, selectedBatchId]);

  useEffect(() => {
    if (activePanel !== 'referrals') return;
    setReferrals('loading');
    apiFetch<ReferralSummary | null>('/api/tutor-portal/referrals')
      .then(setReferrals)
      .catch(() => setReferrals(null));
  }, [activePanel]);

  function openFlagForm(registrationId: string, sessionDate: string) {
    setFlaggingKey(`${registrationId}:${sessionDate}`);
    setFlagForm({ exceptionType: 'no_show_flag', reason: '', requestedPresent: true });
    setFlagError(null);
  }

  async function submitFlag(registrationId: string, sessionDate: string) {
    if (!flagForm.reason.trim()) {
      setFlagError('Please explain what happened.');
      return;
    }
    setFlagSubmitting(true);
    setFlagError(null);
    try {
      await apiFetch('/api/tutor-portal/attendance-exceptions', {
        method: 'POST',
        body: JSON.stringify({
          registrationId,
          batchId: selectedBatchId,
          sessionDate,
          exceptionType: flagForm.exceptionType,
          reason: flagForm.reason.trim(),
          ...(flagForm.exceptionType === 'correction_request'
            ? { requestedPresent: flagForm.requestedPresent }
            : {}),
        }),
      });
      setFlaggedKeys((current) => new Set(current).add(`${registrationId}:${sessionDate}`));
      setFlaggingKey(null);
    } catch (err) {
      setFlagError(err instanceof Error ? err.message : 'Could not submit — try again.');
    } finally {
      setFlagSubmitting(false);
    }
  }

  async function submitMaterial() {
    if (!materialForm.title.trim() || !materialForm.link.trim()) return;
    setMaterialSaving(true);
    setMaterialError(null);
    try {
      await apiFetch('/api/tutor-portal/materials', {
        method: 'POST',
        body: JSON.stringify({
          batchId: selectedBatchId,
          title: materialForm.title.trim(),
          link: materialForm.link.trim(),
        }),
      });
      setMaterialForm({ title: '', link: '' });
      setMaterials('loading');
      apiFetch<MaterialEntry[]>(`/api/tutor-portal/materials/${selectedBatchId}`).then(setMaterials).catch(() => setMaterials([]));
    } catch (err) {
      setMaterialError(err instanceof Error ? err.message : 'Could not add material — try again.');
    } finally {
      setMaterialSaving(false);
    }
  }

  async function deleteMaterial(id: string) {
    try {
      await apiFetch(`/api/tutor-portal/materials/${id}?batchId=${encodeURIComponent(selectedBatchId)}`, {
        method: 'DELETE',
      });
      setMaterials((current) => (Array.isArray(current) ? current.filter((m) => m.id !== id) : current));
    } catch {
      // Non-fatal — the list will self-correct on the next panel visit.
    }
  }

  async function redeemCommissionCredit() {
    if (referrals === 'loading' || referrals === null || referrals.payableCommissionIds.length === 0) return;
    if (!redeemEmail.trim()) {
      setRedeemError("Enter the referred student's email.");
      return;
    }
    setRedeeming(true);
    setRedeemError(null);
    setRedeemSuccess(null);
    try {
      const result = await apiFetch<{ balance: number }>('/api/tutor-portal/redeem-credit', {
        method: 'POST',
        body: JSON.stringify({
          commissionIds: referrals.payableCommissionIds,
          targetParticipantEmail: redeemEmail.trim(),
        }),
      });
      setRedeemSuccess(`Applied — that registration's remaining balance is now ${formatGhs(result.balance)}.`);
      setRedeemEmail('');
      setReferrals('loading');
      apiFetch<ReferralSummary>('/api/tutor-portal/referrals').then(setReferrals).catch(() => setReferrals(null));
    } catch (err) {
      setRedeemError(err instanceof Error ? err.message : 'Could not redeem your commission — try again.');
    } finally {
      setRedeeming(false);
    }
  }

  async function handleLogout() {
    await apiFetch('/api/tutor-portal/logout', { method: 'POST' }).catch(() => undefined);
    router.push('/tutor-portal/login');
  }

  function startEditingContact() {
    if (!dashboard) return;
    setContactForm({ fullName: dashboard.fullName, phone: dashboard.phone });
    setContactError(null);
    setEditingContact(true);
  }

  async function handleSaveContact(event: React.FormEvent) {
    event.preventDefault();
    setContactSaving(true);
    setContactError(null);
    try {
      await apiFetch('/api/tutor-portal/update-contact', {
        method: 'POST',
        body: JSON.stringify(contactForm),
      });
      await loadDashboard();
      setEditingContact(false);
    } catch (err) {
      setContactError(err instanceof Error ? err.message : 'Could not save your details.');
    } finally {
      setContactSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="portal-loading">
        <p>Loading…</p>
      </main>
    );
  }

  if (!dashboard) return null;

  const now = Date.now();
  const upcomingSessions = dashboard.liveSessions.filter((s) => new Date(s.startsAt).getTime() > now);
  const nextSession = upcomingSessions[0] ?? null;
  const selectedBatch = dashboard.batches.find((b) => b.batchId === selectedBatchId) ?? null;

  return (
    <div className="portal-app">
      <style>{PORTAL_STYLES}</style>
      <PortalIcons />

      <div className="app">
        <aside className="rail" aria-label="Tutor portal navigation">
          <div className="rail-brand">
            <Image src="/knowsia-icon.png" alt="Knowsia" width={34} height={34} className="mark" priority />
            <div>
              <span className="name">Knowsia</span>
              <span className="tag">Tutor Portal</span>
            </div>
          </div>

          <div className="identity">
            <div className="avatar">{initials(dashboard.fullName)}</div>
            <div className="who">
              <strong>{dashboard.fullName}</strong>
              <span>{dashboard.email}</span>
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
          <nav className="topbar-nav" role="tablist" aria-label="Tutor portal sections">
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
                <h2 className="panel-title">Welcome back, {dashboard.fullName.split(' ')[0]}</h2>
                <p className="panel-sub">{dashboard.email} · {dashboard.phone}</p>

                {nextSession && (
                  <div className="hero-banner">
                    <div>
                      <div className="label">Next class</div>
                      <h2>{nextSession.title}</h2>
                      <div className="when">
                        {new Date(nextSession.startsAt).toLocaleString('en-GB', {
                          dateStyle: 'full',
                          timeStyle: 'short',
                          timeZone: 'Africa/Accra',
                        })}{' '}
                        GMT
                      </div>
                    </div>
                    {(() => {
                      const batch = dashboard.batches.find((b) => b.batchId === nextSession.batchId);
                      return batch?.zoomLink ? (
                        <a className="btn btn-onaccent" href={batch.zoomLink} target="_blank" rel="noreferrer">
                          <svg className="icon"><use href="#i-play" /></svg>Join Class
                        </a>
                      ) : null;
                    })()}
                  </div>
                )}

                <div className="stat-grid">
                  <div className="stat-tile">
                    <div className="icon-wrap"><svg className="icon"><use href="#i-book" /></svg></div>
                    <span className="num tnum">{dashboard.batches.length}</span>
                    <span className="lbl">Course{dashboard.batches.length === 1 ? '' : 's'} assigned</span>
                  </div>
                  <div className="stat-tile">
                    <div className="icon-wrap"><svg className="icon"><use href="#i-play" /></svg></div>
                    <span className="num tnum">{upcomingSessions.length}</span>
                    <span className="lbl">Upcoming sessions</span>
                  </div>
                </div>

                {dashboard.batches.length === 0 ? (
                  <p className="empty-note">No courses assigned to you yet.</p>
                ) : (
                  <>
                    <div className="section-heading">
                      <h3>Your courses</h3>
                      <button type="button" className="link-btn" onClick={() => setActivePanel('schedule')}>
                        View all →
                      </button>
                    </div>
                    {dashboard.batches.map((batch) => (
                      <div key={batch.batchId} className="mini-course-row">
                        <div>
                          <div className="name">{batch.courseName}</div>
                          <div className="meta">
                            {batch.cohortLabel} · {formatDate(batch.startDate)} – {formatDate(batch.endDate)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </section>
            )}

            {activePanel === 'schedule' && (
              <section className="panel active" role="tabpanel">
                <p className="eyebrow">My Schedule</p>
                <h2 className="panel-title">
                  {dashboard.batches.length} course{dashboard.batches.length === 1 ? '' : 's'}
                </h2>
                <p className="panel-sub">Every batch you&apos;re facilitating, and every scheduled session.</p>

                {dashboard.batches.length === 0 && (
                  <p className="empty-note">No courses assigned to you yet.</p>
                )}

                {dashboard.batches.map((batch) => {
                  const sessions = dashboard.liveSessions.filter((s) => s.batchId === batch.batchId);
                  return (
                    <article key={batch.batchId} className="course-card">
                      <div className="head">
                        <div>
                          <h4>{batch.courseName}</h4>
                          <div className="meta">
                            {batch.cohortLabel} · {formatDate(batch.startDate)} – {formatDate(batch.endDate)} · {batch.registeredCount} registered
                          </div>
                        </div>
                      </div>
                      {batch.zoomLink && (
                        <a className="btn btn-primary" style={{ marginTop: 14 }} href={batch.zoomLink} target="_blank" rel="noreferrer">
                          <svg className="icon" style={{ width: 15, height: 15 }}><use href="#i-zoom" /></svg>Join Zoom Class
                        </a>
                      )}
                      {sessions.length > 0 && (
                        <div className="tabbed">
                          <div className="tabbed-nav">
                            <button className="active" type="button">Sessions ({sessions.length})</button>
                          </div>
                          <div className="tabbed-body">
                            <ul className="att-list">
                              {sessions.map((session) => (
                                <li key={session.id}>
                                  <span>{session.title} — {new Date(session.startsAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                                  <span className="duration">{session.status.replace('_', ' ')}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })}
              </section>
            )}

            {(activePanel === 'roster' ||
              activePanel === 'attendance' ||
              activePanel === 'materials' ||
              activePanel === 'certificates') && (
              <section className="panel active" role="tabpanel">
                <p className="eyebrow">
                  {activePanel === 'roster'
                    ? 'Roster'
                    : activePanel === 'attendance'
                      ? 'Attendance'
                      : activePanel === 'materials'
                        ? 'Materials'
                        : 'Certificate Eligibility'}
                </p>
                <h2 className="panel-title">
                  {activePanel === 'roster' && 'Who’s registered'}
                  {activePanel === 'attendance' && 'Session attendance'}
                  {activePanel === 'materials' && 'Shared with your class'}
                  {activePanel === 'certificates' && 'Ready for a certificate'}
                </h2>

                {dashboard.batches.length === 0 ? (
                  <p className="empty-note">No courses assigned to you yet.</p>
                ) : (
                  <>
                    <div className="field" style={{ maxWidth: 400, marginBottom: 24 }}>
                      <label htmlFor="batchSelect">Course</label>
                      <select
                        id="batchSelect"
                        value={selectedBatchId}
                        onChange={(event) => setSelectedBatchId(event.target.value)}
                      >
                        {dashboard.batches.map((batch) => (
                          <option key={batch.batchId} value={batch.batchId}>
                            {batch.courseName} — {batch.cohortLabel} ({batch.registeredCount} registered)
                          </option>
                        ))}
                      </select>
                    </div>

                    {activePanel === 'roster' && (
                      roster === 'loading' || roster === null ? (
                        <p className="empty-note">Loading…</p>
                      ) : roster.length === 0 ? (
                        <p className="empty-note">No confirmed participants yet for {selectedBatch?.cohortLabel}.</p>
                      ) : (
                        <>
                          <p className="panel-sub">{roster.length} registered</p>
                          <div className="table-wrap">
                            <table>
                              <thead>
                                <tr><th>Name</th><th>Email</th><th>Phone</th><th>Registered</th></tr>
                              </thead>
                              <tbody>
                                {roster.map((entry) => (
                                  <tr key={entry.registrationId}>
                                    <td className="course-cell"><strong>{entry.fullName}</strong></td>
                                    <td>{entry.email}</td>
                                    <td>{entry.phone}</td>
                                    <td>{formatDate(entry.registeredAt)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </>
                      )
                    )}

                    {activePanel === 'attendance' && (
                      attendance === 'loading' || attendance === null ? (
                        <p className="empty-note">Loading…</p>
                      ) : attendance.length === 0 ? (
                        <p className="empty-note">No attendance recorded yet for {selectedBatch?.cohortLabel}.</p>
                      ) : (
                        <div className="table-wrap">
                          <table>
                            <thead>
                              <tr><th>Participant</th><th>Session Date</th><th className="num">Duration</th><th></th></tr>
                            </thead>
                            <tbody>
                              {attendance.map((entry, index) => {
                                const key = `${entry.registrationId}:${entry.sessionDate}`;
                                const alreadyFlagged = flaggedKeys.has(key);
                                return (
                                  <Fragment key={index}>
                                    <tr>
                                      <td className="course-cell"><strong>{entry.participantName}</strong></td>
                                      <td>{formatDate(entry.sessionDate)}</td>
                                      <td className="num tnum">{entry.durationMinutes > 0 ? `${entry.durationMinutes} min` : 'no attendance'}</td>
                                      <td>
                                        {alreadyFlagged ? (
                                          <span className="pill pill-neutral">Flagged</span>
                                        ) : flaggingKey === key ? null : (
                                          <button
                                            type="button"
                                            className="link-btn"
                                            onClick={() => openFlagForm(entry.registrationId, entry.sessionDate)}
                                          >
                                            Flag an issue
                                          </button>
                                        )}
                                      </td>
                                    </tr>
                                    {flaggingKey === key && (
                                      <tr>
                                        <td colSpan={4}>
                                          <div className="account-card" style={{ margin: '8px 0' }}>
                                            {flagError && <p className="plan-confirm-error">{flagError}</p>}
                                            <div className="field">
                                              <label htmlFor={`exType-${index}`}>What happened?</label>
                                              <select
                                                id={`exType-${index}`}
                                                value={flagForm.exceptionType}
                                                onChange={(event) =>
                                                  setFlagForm({
                                                    ...flagForm,
                                                    exceptionType: event.target.value as 'no_show_flag' | 'correction_request',
                                                  })
                                                }
                                              >
                                                <option value="no_show_flag">No-show (advisory flag)</option>
                                                <option value="correction_request">Request an attendance correction</option>
                                              </select>
                                            </div>
                                            {flagForm.exceptionType === 'correction_request' && (
                                              <div className="field">
                                                <label htmlFor={`exPresent-${index}`}>Should be marked</label>
                                                <select
                                                  id={`exPresent-${index}`}
                                                  value={flagForm.requestedPresent ? 'present' : 'absent'}
                                                  onChange={(event) =>
                                                    setFlagForm({
                                                      ...flagForm,
                                                      requestedPresent: event.target.value === 'present',
                                                    })
                                                  }
                                                >
                                                  <option value="present">Present</option>
                                                  <option value="absent">Absent</option>
                                                </select>
                                              </div>
                                            )}
                                            <div className="field">
                                              <label htmlFor={`exReason-${index}`}>Reason</label>
                                              <textarea
                                                id={`exReason-${index}`}
                                                rows={2}
                                                value={flagForm.reason}
                                                onChange={(event) => setFlagForm({ ...flagForm, reason: event.target.value })}
                                              />
                                            </div>
                                            <p className="panel-sub" style={{ marginTop: 0 }}>
                                              An admin reviews every flag before anything changes.
                                            </p>
                                            <div style={{ display: 'flex', gap: 8 }}>
                                              <button
                                                type="button"
                                                className="btn btn-primary btn-sm"
                                                disabled={flagSubmitting}
                                                onClick={() => void submitFlag(entry.registrationId, entry.sessionDate)}
                                              >
                                                {flagSubmitting ? 'Submitting…' : 'Submit'}
                                              </button>
                                              <button
                                                type="button"
                                                className="btn btn-ghost btn-sm"
                                                disabled={flagSubmitting}
                                                onClick={() => setFlaggingKey(null)}
                                              >
                                                Cancel
                                              </button>
                                            </div>
                                          </div>
                                        </td>
                                      </tr>
                                    )}
                                  </Fragment>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )
                    )}

                    {activePanel === 'materials' && (
                      <>
                        <div className="account-card" style={{ marginBottom: 16 }}>
                          {materialError && <p className="plan-confirm-error">{materialError}</p>}
                          <div className="field">
                            <label htmlFor="materialTitle">Title</label>
                            <input
                              id="materialTitle"
                              placeholder="Slides — Session 3"
                              value={materialForm.title}
                              onChange={(event) => setMaterialForm({ ...materialForm, title: event.target.value })}
                            />
                          </div>
                          <div className="field">
                            <label htmlFor="materialLink">Link</label>
                            <input
                              id="materialLink"
                              placeholder="https://drive.google.com/…"
                              value={materialForm.link}
                              onChange={(event) => setMaterialForm({ ...materialForm, link: event.target.value })}
                            />
                          </div>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={materialSaving || !materialForm.title.trim() || !materialForm.link.trim()}
                            onClick={() => void submitMaterial()}
                          >
                            {materialSaving ? 'Adding…' : 'Add material'}
                          </button>
                        </div>

                        {materials === 'loading' || materials === null ? (
                          <p className="empty-note">Loading…</p>
                        ) : materials.length === 0 ? (
                          <p className="empty-note">Nothing shared yet for {selectedBatch?.cohortLabel}.</p>
                        ) : (
                          <ul className="att-list">
                            {materials.map((material) => (
                              <li key={material.id}>
                                <a href={material.link} target="_blank" rel="noreferrer">{material.title}</a>
                                <span className="duration">
                                  {formatDate(material.createdAt)}
                                  {' · '}
                                  <button type="button" className="link-btn" onClick={() => void deleteMaterial(material.id)}>
                                    Remove
                                  </button>
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    )}

                    {activePanel === 'certificates' && (
                      certificates === 'loading' || certificates === null ? (
                        <p className="empty-note">Loading…</p>
                      ) : certificates.length === 0 ? (
                        <p className="empty-note">No candidates yet for {selectedBatch?.cohortLabel}.</p>
                      ) : (
                        <div className="table-wrap">
                          <table>
                            <thead>
                              <tr><th>Participant</th><th>Paid</th><th>Feedback</th><th>Attendance</th><th>Status</th></tr>
                            </thead>
                            <tbody>
                              {certificates.map((c) => (
                                <tr key={c.registrationId}>
                                  <td className="course-cell"><strong>{c.participantName}</strong></td>
                                  <td>{c.paid ? <span className="pill pill-success">Paid</span> : <span className="pill pill-danger">Unpaid</span>}</td>
                                  <td>{c.feedbackSubmitted ? <span className="pill pill-success">Submitted</span> : <span className="pill pill-neutral">Pending</span>}</td>
                                  <td className="tnum">{c.attendancePercent !== null ? `${c.attendancePercent}%` : '—'}</td>
                                  <td>
                                    {c.alreadyIssued ? (
                                      <span className="pill pill-neutral">Issued</span>
                                    ) : c.eligible ? (
                                      <span className="pill pill-success">Eligible</span>
                                    ) : (
                                      <span className="pill pill-warning">Not yet</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )
                    )}
                  </>
                )}
              </section>
            )}

            {activePanel === 'referrals' && (
              <section className="panel active" role="tabpanel">
                <p className="eyebrow">Referrals</p>
                <h2 className="panel-title">Your referral earnings</h2>
                <p className="panel-sub">
                  Every approved tutor automatically earns a commission when someone registers using
                  your code.
                </p>

                {referrals === 'loading' ? (
                  <p className="empty-note">Loading…</p>
                ) : referrals === null ? (
                  <p className="empty-note">
                    You&apos;re not set up as a referral partner yet — contact Knowsia to get your
                    code.
                  </p>
                ) : (
                  <>
                    <div className="stat-grid">
                      <div className="stat-tile"><span className="num tnum">{formatGhs(referrals.commissionTotals.pending ?? 0)}</span><span className="lbl">Pending</span></div>
                      <div className="stat-tile"><span className="num tnum">{formatGhs(referrals.commissionTotals.approved ?? 0)}</span><span className="lbl">Approved</span></div>
                      <div className="stat-tile"><span className="num tnum">{formatGhs(referrals.commissionTotals.payable ?? 0)}</span><span className="lbl">Payable</span></div>
                      <div className="stat-tile"><span className="num tnum">{formatGhs(referrals.commissionTotals.paid ?? 0)}</span><span className="lbl">Paid</span></div>
                    </div>

                    <div className="section-heading">
                      <h3>Your codes</h3>
                    </div>
                    {referrals.codes.length === 0 ? (
                      <p className="empty-note">No codes assigned yet.</p>
                    ) : (
                      referrals.codes.map((code) => (
                        <div key={code.id} className="mini-course-row">
                          <div>
                            <div className="name">{code.code}</div>
                            <div className="meta">
                              {code.discountType && code.discountValue !== null
                                ? code.discountType === 'percentage'
                                  ? `${code.discountValue}% off`
                                  : `${formatGhs(code.discountValue)} off`
                                : 'Attribution only'}
                              {' · '}
                              {code.usesCount} use(s)
                            </div>
                          </div>
                        </div>
                      ))
                    )}

                    {referrals.payableCommissionIds.length > 0 && (
                      <div className="account-card" style={{ marginTop: 16 }}>
                        <p className="plan-box-label" style={{ marginBottom: 8 }}>
                          Redeem {formatGhs(referrals.commissionTotals.payable ?? 0)} of payable commission as
                          course-fee credit for a referred student
                        </p>
                        {redeemError && <p className="plan-confirm-error">{redeemError}</p>}
                        {redeemSuccess && <p className="panel-sub" style={{ color: '#1a7f4b' }}>{redeemSuccess}</p>}
                        <div className="field">
                          <label htmlFor="redeemEmail">Student&apos;s email</label>
                          <input
                            id="redeemEmail"
                            type="email"
                            placeholder="student@example.com"
                            value={redeemEmail}
                            onChange={(event) => setRedeemEmail(event.target.value)}
                          />
                        </div>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={redeeming || !redeemEmail.trim()}
                          onClick={() => void redeemCommissionCredit()}
                        >
                          {redeeming ? 'Redeeming…' : 'Apply as course credit'}
                        </button>
                      </div>
                    )}

                    <div className="section-heading">
                      <h3>Payout history</h3>
                    </div>
                    {referrals.recentPayouts.length === 0 ? (
                      <p className="empty-note">No payouts yet.</p>
                    ) : (
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr><th>Date</th><th className="num">Amount</th><th>Method</th></tr>
                          </thead>
                          <tbody>
                            {referrals.recentPayouts.map((payout) => (
                              <tr key={payout.id}>
                                <td>{formatDate(payout.paidAt)}</td>
                                <td className="num tnum">{formatGhs(payout.totalAmount)}</td>
                                <td>{payout.method}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}
              </section>
            )}

            {activePanel === 'account' && (
              <section className="panel active" role="tabpanel">
                <p className="eyebrow">Account</p>
                <h2 className="panel-title">Your details</h2>
                <p className="panel-sub">Keep your contact details current so we can reach you about classes.</p>

                {editingContact ? (
                  <form onSubmit={handleSaveContact} className="account-card">
                    {contactError && <p className="plan-confirm-error">{contactError}</p>}
                    <div className="field">
                      <label htmlFor="fullName">Full name</label>
                      <input
                        id="fullName"
                        required
                        value={contactForm.fullName}
                        onChange={(event) => setContactForm({ ...contactForm, fullName: event.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="phone">Phone</label>
                      <input
                        id="phone"
                        required
                        value={contactForm.phone}
                        onChange={(event) => setContactForm({ ...contactForm, phone: event.target.value })}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="submit" className="btn btn-primary" disabled={contactSaving}>
                        {contactSaving ? 'Saving…' : 'Save'}
                      </button>
                      <button type="button" className="btn btn-ghost" disabled={contactSaving} onClick={() => setEditingContact(false)}>
                        Cancel
                      </button>
                    </div>
                  </form>
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
                      <span className="lbl">Phone</span>
                      <span className="val">{dashboard.phone}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                      <button type="button" className="btn btn-primary" onClick={startEditingContact}>
                        <svg className="icon" style={{ width: 15, height: 15 }}><use href="#i-edit" /></svg>Edit details
                      </button>
                      <Link href="/tutor-portal/change-pin" className="btn btn-ghost">Change PIN</Link>
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
