'use client';

// Tutor portal dashboard (2026-07-27) — the replacement for the old staff
// /my-courses page. Tutors are external parties, not Knowsia staff (see
// modules/tutors and the tutor_auth/tutor_sessions migration header), so
// this is a third PIN + session-cookie portal, same architecture as the
// student and corporate portals — same shared app shell
// (components/portal/portal-design-system.tsx).
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';

import { apiFetch } from '@/components/api-client';
import { PORTAL_STYLES, PortalIcons } from '@/components/portal/portal-design-system';
import { formatDate } from '@/lib/utils';

interface DashboardBatch {
  batchId: string;
  courseName: string;
  cohortLabel: string;
  startDate: string;
  endDate: string;
  zoomLink: string | null;
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

type PanelId = 'overview' | 'schedule' | 'roster' | 'attendance' | 'certificates' | 'account';

const NAV_ITEMS: Array<{ id: PanelId; label: string; icon: string }> = [
  { id: 'overview', label: 'Overview', icon: 'i-grid' },
  { id: 'schedule', label: 'My Schedule', icon: 'i-book' },
  { id: 'roster', label: 'Roster', icon: 'i-users' },
  { id: 'attendance', label: 'Attendance', icon: 'i-check' },
  { id: 'certificates', label: 'Certificate Eligibility', icon: 'i-award' },
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

  const [editingContact, setEditingContact] = useState(false);
  const [contactForm, setContactForm] = useState({ fullName: '', phone: '' });
  const [contactSaving, setContactSaving] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);

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
  }, [activePanel, selectedBatchId]);

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
                            {batch.cohortLabel} · {formatDate(batch.startDate)} – {formatDate(batch.endDate)}
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

            {(activePanel === 'roster' || activePanel === 'attendance' || activePanel === 'certificates') && (
              <section className="panel active" role="tabpanel">
                <p className="eyebrow">
                  {activePanel === 'roster' ? 'Roster' : activePanel === 'attendance' ? 'Attendance' : 'Certificate Eligibility'}
                </p>
                <h2 className="panel-title">
                  {activePanel === 'roster' && 'Who’s registered'}
                  {activePanel === 'attendance' && 'Session attendance'}
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
                            {batch.courseName} — {batch.cohortLabel}
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
                              <tr><th>Participant</th><th>Session Date</th><th className="num">Duration</th></tr>
                            </thead>
                            <tbody>
                              {attendance.map((entry, index) => (
                                <tr key={index}>
                                  <td className="course-cell"><strong>{entry.participantName}</strong></td>
                                  <td>{formatDate(entry.sessionDate)}</td>
                                  <td className="num tnum">{entry.durationMinutes > 0 ? `${entry.durationMinutes} min` : 'no attendance'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )
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
