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
import { UPLOAD_ACCEPT_ATTRIBUTE, UPLOAD_TYPES_HINT } from '@/lib/upload-constants';
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

// A material is either a shared link or an uploaded file (2026-08-04) —
// `kind` is the discriminator; a file's bytes are fetched through a
// short-lived presigned URL, never a stored public link.
interface MaterialEntry {
  id: string;
  title: string;
  kind: 'link' | 'file';
  link: string | null;
  fileName: string | null;
  fileSizeBytes: number | null;
  createdAt: string;
}

interface AssignmentEntry {
  id: string;
  title: string;
  instructions: string | null;
  dueAt: string | null;
  status: 'open' | 'closed';
  allowResubmission: boolean;
  submissionCount: number;
  reviewedCount: number;
  createdAt: string;
}

interface SubmissionEntry {
  submissionId: string;
  registrationId: string;
  participantName: string;
  participantEmail: string;
  fileName: string;
  fileSizeBytes: number;
  participantNotes: string | null;
  submittedAt: string;
  status: 'submitted' | 'reviewed';
  grade: number | null;
  feedback: string | null;
  reviewedAt: string | null;
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

// Course-specific referral links/QR (2026-08-02 follow-up) — the same
// active/future batch list already shown on the public /register form.
interface ActiveBatch {
  batchId: string;
  courseName: string;
  cohortLabel: string;
  startDate: string;
}

type PanelId =
  | 'overview'
  | 'schedule'
  | 'roster'
  | 'attendance'
  | 'materials'
  | 'assignments'
  | 'certificates'
  | 'referrals'
  | 'account';

const NAV_ITEMS: Array<{ id: PanelId; label: string; icon: string }> = [
  { id: 'overview', label: 'Overview', icon: 'i-grid' },
  { id: 'schedule', label: 'My Schedule', icon: 'i-book' },
  { id: 'roster', label: 'Roster', icon: 'i-users' },
  { id: 'attendance', label: 'Attendance', icon: 'i-check' },
  { id: 'materials', label: 'Materials', icon: 'i-book' },
  { id: 'assignments', label: 'Assignments', icon: 'i-check' },
  { id: 'certificates', label: 'Certificate Eligibility', icon: 'i-award' },
  { id: 'referrals', label: 'Referrals', icon: 'i-card' },
  { id: 'account', label: 'Account', icon: 'i-user' },
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Opens a presigned download in a new tab. The URL is fetched on click
// rather than rendered into the page, so a short-lived credential never sits
// in the DOM waiting to be scraped or shared.
async function openSignedDownload(url: string): Promise<void> {
  const { url: signedUrl } = await apiFetch<{ url: string }>(url);
  window.open(signedUrl, '_blank', 'noopener,noreferrer');
}

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
  const [batchOptions, setBatchOptions] = useState<ActiveBatch[] | 'loading' | null>(null);
  const [selectedBatchByCode, setSelectedBatchByCode] = useState<Record<string, string>>({});
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<{ code: string; dataUrl: string } | null>(null);

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
  const [materialMode, setMaterialMode] = useState<'link' | 'file'>('file');
  const [materialFile, setMaterialFile] = useState<File | null>(null);
  const [materialSaving, setMaterialSaving] = useState(false);
  const [materialError, setMaterialError] = useState<string | null>(null);

  // Assignments (2026-08-04)
  const [assignments, setAssignments] = useState<AssignmentEntry[] | 'loading' | null>(null);
  const [assignmentForm, setAssignmentForm] = useState({
    title: '',
    instructions: '',
    dueAt: '',
    allowResubmission: true,
  });
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const [openAssignmentId, setOpenAssignmentId] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<SubmissionEntry[] | 'loading' | null>(null);
  const [gradingId, setGradingId] = useState<string | null>(null);
  const [gradeForm, setGradeForm] = useState({ grade: '', feedback: '' });
  const [gradeSaving, setGradeSaving] = useState(false);
  const [gradeError, setGradeError] = useState<string | null>(null);

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
    if (activePanel === 'assignments') {
      // Switching batch invalidates whichever assignment was expanded.
      setOpenAssignmentId(null);
      setSubmissions(null);
      setAssignments('loading');
      apiFetch<AssignmentEntry[]>(`/api/tutor-portal/assignments?batchId=${encodeURIComponent(selectedBatchId)}`)
        .then(setAssignments)
        .catch(() => setAssignments([]));
    }
  }, [activePanel, selectedBatchId]);

  useEffect(() => {
    if (activePanel !== 'referrals') return;
    setReferrals('loading');
    apiFetch<ReferralSummary | null>('/api/tutor-portal/referrals')
      .then(setReferrals)
      .catch(() => setReferrals(null));
  }, [activePanel]);

  useEffect(() => {
    if (activePanel !== 'referrals') return;
    setBatchOptions('loading');
    apiFetch<{ batches: ActiveBatch[] }>('/api/register/active-batches')
      .then((r) => setBatchOptions(r.batches))
      .catch(() => setBatchOptions(null));
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

  function reloadMaterials() {
    setMaterials('loading');
    apiFetch<MaterialEntry[]>(`/api/tutor-portal/materials/${selectedBatchId}`)
      .then(setMaterials)
      .catch(() => setMaterials([]));
  }

  // One handler, two transports: a link posts JSON (the original shape), an
  // upload posts multipart. apiFetch leaves FormData's Content-Type to the
  // browser so the boundary header is correct.
  async function submitMaterial() {
    if (!materialForm.title.trim()) return;
    if (materialMode === 'link' ? !materialForm.link.trim() : !materialFile) return;

    setMaterialSaving(true);
    setMaterialError(null);
    try {
      if (materialMode === 'file' && materialFile) {
        const formData = new FormData();
        formData.append('batchId', selectedBatchId);
        formData.append('title', materialForm.title.trim());
        formData.append('file', materialFile);
        await apiFetch('/api/tutor-portal/materials', { method: 'POST', body: formData });
      } else {
        await apiFetch('/api/tutor-portal/materials', {
          method: 'POST',
          body: JSON.stringify({
            batchId: selectedBatchId,
            title: materialForm.title.trim(),
            link: materialForm.link.trim(),
          }),
        });
      }
      setMaterialForm({ title: '', link: '' });
      setMaterialFile(null);
      reloadMaterials();
    } catch (err) {
      setMaterialError(err instanceof Error ? err.message : 'Could not add material — try again.');
    } finally {
      setMaterialSaving(false);
    }
  }

  async function downloadMaterial(id: string) {
    try {
      await openSignedDownload(`/api/tutor-portal/materials/${id}/download-url`);
    } catch (err) {
      setMaterialError(err instanceof Error ? err.message : 'Could not open that file.');
    }
  }

  // --- Assignments (2026-08-04) ---

  function reloadAssignments() {
    setAssignments('loading');
    apiFetch<AssignmentEntry[]>(`/api/tutor-portal/assignments?batchId=${encodeURIComponent(selectedBatchId)}`)
      .then(setAssignments)
      .catch(() => setAssignments([]));
  }

  async function createAssignment() {
    if (!assignmentForm.title.trim()) return;
    setAssignmentSaving(true);
    setAssignmentError(null);
    try {
      await apiFetch('/api/tutor-portal/assignments', {
        method: 'POST',
        body: JSON.stringify({
          batchId: selectedBatchId,
          title: assignmentForm.title.trim(),
          instructions: assignmentForm.instructions.trim() || null,
          // datetime-local has no timezone; the browser reads it as local
          // (Ghana) time and toISOString converts to the UTC the API expects.
          dueAt: assignmentForm.dueAt ? new Date(assignmentForm.dueAt).toISOString() : null,
          allowResubmission: assignmentForm.allowResubmission,
        }),
      });
      setAssignmentForm({ title: '', instructions: '', dueAt: '', allowResubmission: true });
      reloadAssignments();
    } catch (err) {
      setAssignmentError(err instanceof Error ? err.message : 'Could not create it — try again.');
    } finally {
      setAssignmentSaving(false);
    }
  }

  async function setAssignmentStatus(id: string, status: 'open' | 'closed') {
    try {
      await apiFetch(`/api/tutor-portal/assignments/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setAssignments((current) =>
        Array.isArray(current) ? current.map((a) => (a.id === id ? { ...a, status } : a)) : current,
      );
    } catch (err) {
      setAssignmentError(err instanceof Error ? err.message : 'Could not update it — try again.');
    }
  }

  async function deleteAssignment(id: string) {
    // Cascades to every submission, so this one gets an explicit confirm —
    // unlike removing a material, it destroys learners' work.
    if (!window.confirm('Delete this assignment and every submission against it? This cannot be undone.')) {
      return;
    }
    try {
      await apiFetch(`/api/tutor-portal/assignments/${id}`, { method: 'DELETE' });
      if (openAssignmentId === id) {
        setOpenAssignmentId(null);
        setSubmissions(null);
      }
      setAssignments((current) => (Array.isArray(current) ? current.filter((a) => a.id !== id) : current));
    } catch (err) {
      setAssignmentError(err instanceof Error ? err.message : 'Could not delete it — try again.');
    }
  }

  function toggleSubmissions(assignmentId: string) {
    if (openAssignmentId === assignmentId) {
      setOpenAssignmentId(null);
      setSubmissions(null);
      return;
    }
    setOpenAssignmentId(assignmentId);
    setGradingId(null);
    setSubmissions('loading');
    apiFetch<SubmissionEntry[]>(`/api/tutor-portal/assignments/${assignmentId}/submissions`)
      .then(setSubmissions)
      .catch(() => setSubmissions([]));
  }

  async function downloadSubmission(submissionId: string) {
    try {
      await openSignedDownload(`/api/tutor-portal/submissions/${submissionId}/download-url`);
    } catch (err) {
      setGradeError(err instanceof Error ? err.message : 'Could not open that file.');
    }
  }

  async function saveGrade(submissionId: string) {
    if (!gradeForm.grade.trim() && !gradeForm.feedback.trim()) {
      setGradeError('Give a grade, written feedback, or both.');
      return;
    }
    setGradeSaving(true);
    setGradeError(null);
    try {
      await apiFetch(`/api/tutor-portal/submissions/${submissionId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          grade: gradeForm.grade.trim() ? Number(gradeForm.grade) : null,
          feedback: gradeForm.feedback.trim() || null,
        }),
      });
      setGradingId(null);
      setGradeForm({ grade: '', feedback: '' });
      if (openAssignmentId) {
        setSubmissions('loading');
        apiFetch<SubmissionEntry[]>(`/api/tutor-portal/assignments/${openAssignmentId}/submissions`)
          .then(setSubmissions)
          .catch(() => setSubmissions([]));
      }
      // The assignment's "n of m reviewed" count is now stale.
      reloadAssignments();
    } catch (err) {
      setGradeError(err instanceof Error ? err.message : 'Could not save — try again.');
    } finally {
      setGradeSaving(false);
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

  function referralLinkFor(code: string): string {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const batchId = selectedBatchByCode[code];
    return `${origin}/r/${code}${batchId ? `?batchId=${batchId}` : ''}`;
  }

  function copyLink(code: string) {
    void navigator.clipboard.writeText(referralLinkFor(code));
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  }

  async function showQrCode(code: string) {
    const batchId = selectedBatchByCode[code];
    const qs = new URLSearchParams({ code });
    if (batchId) qs.set('batchId', batchId);
    try {
      const result = await apiFetch<{ dataUrl: string }>(`/api/tutor-portal/qr-code?${qs}`);
      setQrCode({ code, dataUrl: result.dataUrl });
    } catch {
      // Non-fatal — the button simply doesn't render a QR image.
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
              activePanel === 'assignments' ||
              activePanel === 'certificates') && (
              <section className="panel active" role="tabpanel">
                <p className="eyebrow">
                  {activePanel === 'roster'
                    ? 'Roster'
                    : activePanel === 'attendance'
                      ? 'Attendance'
                      : activePanel === 'materials'
                        ? 'Materials'
                        : activePanel === 'assignments'
                          ? 'Assignments'
                          : 'Certificate Eligibility'}
                </p>
                <h2 className="panel-title">
                  {activePanel === 'roster' && 'Who’s registered'}
                  {activePanel === 'attendance' && 'Session attendance'}
                  {activePanel === 'materials' && 'Shared with your class'}
                  {activePanel === 'assignments' && 'Set work and mark it'}
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
                            <label htmlFor="materialMode">Share as</label>
                            <select
                              id="materialMode"
                              value={materialMode}
                              onChange={(event) => {
                                setMaterialMode(event.target.value as 'link' | 'file');
                                setMaterialError(null);
                              }}
                            >
                              <option value="file">Upload a file</option>
                              <option value="link">Link to somewhere else</option>
                            </select>
                          </div>

                          {materialMode === 'file' ? (
                            <div className="field">
                              <label htmlFor="materialFile">File</label>
                              <input
                                id="materialFile"
                                type="file"
                                accept={UPLOAD_ACCEPT_ATTRIBUTE}
                                onChange={(event) => setMaterialFile(event.target.files?.[0] ?? null)}
                              />
                              <p className="field-hint">{UPLOAD_TYPES_HINT}</p>
                            </div>
                          ) : (
                            <div className="field">
                              <label htmlFor="materialLink">Link</label>
                              <input
                                id="materialLink"
                                placeholder="https://drive.google.com/…"
                                value={materialForm.link}
                                onChange={(event) => setMaterialForm({ ...materialForm, link: event.target.value })}
                              />
                            </div>
                          )}

                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={
                              materialSaving ||
                              !materialForm.title.trim() ||
                              (materialMode === 'file' ? !materialFile : !materialForm.link.trim())
                            }
                            onClick={() => void submitMaterial()}
                          >
                            {materialSaving
                              ? materialMode === 'file'
                                ? 'Uploading…'
                                : 'Adding…'
                              : materialMode === 'file'
                                ? 'Upload resource'
                                : 'Add material'}
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
                                {material.kind === 'file' ? (
                                  <button
                                    type="button"
                                    className="link-btn"
                                    onClick={() => void downloadMaterial(material.id)}
                                  >
                                    {material.title}
                                  </button>
                                ) : (
                                  <a href={material.link ?? '#'} target="_blank" rel="noreferrer">
                                    {material.title}
                                  </a>
                                )}
                                <span className="duration">
                                  {material.kind === 'file' && material.fileSizeBytes !== null && (
                                    <>{formatFileSize(material.fileSizeBytes)}{' · '}</>
                                  )}
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

                    {activePanel === 'assignments' && (
                      <>
                        <div className="account-card" style={{ marginBottom: 16 }}>
                          {assignmentError && <p className="plan-confirm-error">{assignmentError}</p>}
                          <div className="field">
                            <label htmlFor="assignmentTitle">Title</label>
                            <input
                              id="assignmentTitle"
                              placeholder="Case study — risk register"
                              value={assignmentForm.title}
                              onChange={(event) =>
                                setAssignmentForm({ ...assignmentForm, title: event.target.value })
                              }
                            />
                          </div>
                          <div className="field">
                            <label htmlFor="assignmentInstructions">Instructions (optional)</label>
                            <textarea
                              id="assignmentInstructions"
                              rows={3}
                              placeholder="What should they submit, and in what format?"
                              value={assignmentForm.instructions}
                              onChange={(event) =>
                                setAssignmentForm({ ...assignmentForm, instructions: event.target.value })
                              }
                            />
                          </div>
                          <div className="field">
                            <label htmlFor="assignmentDueAt">Due (optional)</label>
                            <input
                              id="assignmentDueAt"
                              type="datetime-local"
                              value={assignmentForm.dueAt}
                              onChange={(event) =>
                                setAssignmentForm({ ...assignmentForm, dueAt: event.target.value })
                              }
                            />
                            <p className="field-hint">Ghana time. A due date is a signal, not a lock — close the assignment to stop submissions.</p>
                          </div>
                          <div className="field">
                            <label htmlFor="assignmentResubmit">
                              <input
                                id="assignmentResubmit"
                                type="checkbox"
                                checked={assignmentForm.allowResubmission}
                                onChange={(event) =>
                                  setAssignmentForm({
                                    ...assignmentForm,
                                    allowResubmission: event.target.checked,
                                  })
                                }
                              />
                              {' '}Allow resubmission
                            </label>
                            <p className="field-hint">A resubmission replaces the file and clears any grade already given.</p>
                          </div>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={assignmentSaving || !assignmentForm.title.trim()}
                            onClick={() => void createAssignment()}
                          >
                            {assignmentSaving ? 'Creating…' : 'Set assignment'}
                          </button>
                        </div>

                        {assignments === 'loading' || assignments === null ? (
                          <p className="empty-note">Loading…</p>
                        ) : assignments.length === 0 ? (
                          <p className="empty-note">No assignments set for {selectedBatch?.cohortLabel} yet.</p>
                        ) : (
                          assignments.map((assignment) => (
                            <article key={assignment.id} className="account-card" style={{ marginBottom: 12 }}>
                              <h3 style={{ margin: 0 }}>{assignment.title}</h3>
                              <p className="duration" style={{ marginTop: 4 }}>
                                {assignment.status === 'closed' ? 'Closed' : 'Open'}
                                {assignment.dueAt && <> · Due {formatDate(assignment.dueAt)}</>}
                                {' · '}
                                {assignment.reviewedCount} of {assignment.submissionCount} marked
                              </p>
                              {assignment.instructions && (
                                <p style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>{assignment.instructions}</p>
                              )}
                              <p style={{ marginTop: 8 }}>
                                <button type="button" className="link-btn" onClick={() => toggleSubmissions(assignment.id)}>
                                  {openAssignmentId === assignment.id ? 'Hide submissions' : `View submissions (${assignment.submissionCount})`}
                                </button>
                                {' · '}
                                <button
                                  type="button"
                                  className="link-btn"
                                  onClick={() =>
                                    void setAssignmentStatus(
                                      assignment.id,
                                      assignment.status === 'closed' ? 'open' : 'closed',
                                    )
                                  }
                                >
                                  {assignment.status === 'closed' ? 'Reopen' : 'Close'}
                                </button>
                                {' · '}
                                <button type="button" className="link-btn" onClick={() => void deleteAssignment(assignment.id)}>
                                  Delete
                                </button>
                              </p>

                              {openAssignmentId === assignment.id && (
                                <>
                                  {gradeError && <p className="plan-confirm-error">{gradeError}</p>}
                                  {submissions === 'loading' || submissions === null ? (
                                    <p className="empty-note">Loading…</p>
                                  ) : submissions.length === 0 ? (
                                    <p className="empty-note">Nobody has submitted yet.</p>
                                  ) : (
                                    <ul className="att-list">
                                      {submissions.map((submission) => (
                                        <li key={submission.submissionId} style={{ display: 'block' }}>
                                          <strong>{submission.participantName}</strong>
                                          <span className="duration" style={{ display: 'block' }}>
                                            {submission.participantEmail}
                                          </span>
                                          <span className="duration" style={{ display: 'block' }}>
                                            Submitted {formatDate(submission.submittedAt)} ·{' '}
                                            {formatFileSize(submission.fileSizeBytes)}
                                            {submission.status === 'reviewed' && (
                                              <>
                                                {' · Marked'}
                                                {submission.grade !== null && <> — {submission.grade}/100</>}
                                              </>
                                            )}
                                          </span>
                                          {submission.participantNotes && (
                                            <p style={{ whiteSpace: 'pre-wrap', margin: '4px 0' }}>
                                              {submission.participantNotes}
                                            </p>
                                          )}
                                          {submission.feedback && (
                                            <p className="duration" style={{ whiteSpace: 'pre-wrap', margin: '4px 0' }}>
                                              Your feedback: {submission.feedback}
                                            </p>
                                          )}
                                          <p style={{ margin: '4px 0' }}>
                                            <button
                                              type="button"
                                              className="link-btn"
                                              onClick={() => void downloadSubmission(submission.submissionId)}
                                            >
                                              Download {submission.fileName}
                                            </button>
                                            {' · '}
                                            <button
                                              type="button"
                                              className="link-btn"
                                              onClick={() => {
                                                setGradingId(
                                                  gradingId === submission.submissionId ? null : submission.submissionId,
                                                );
                                                setGradeError(null);
                                                setGradeForm({
                                                  grade: submission.grade !== null ? String(submission.grade) : '',
                                                  feedback: submission.feedback ?? '',
                                                });
                                              }}
                                            >
                                              {submission.status === 'reviewed' ? 'Edit mark' : 'Mark'}
                                            </button>
                                          </p>

                                          {gradingId === submission.submissionId && (
                                            <div style={{ marginBottom: 12 }}>
                                              <div className="field">
                                                <label htmlFor={`grade-${submission.submissionId}`}>Grade out of 100 (optional)</label>
                                                <input
                                                  id={`grade-${submission.submissionId}`}
                                                  type="number"
                                                  min={0}
                                                  max={100}
                                                  value={gradeForm.grade}
                                                  onChange={(event) =>
                                                    setGradeForm({ ...gradeForm, grade: event.target.value })
                                                  }
                                                />
                                              </div>
                                              <div className="field">
                                                <label htmlFor={`feedback-${submission.submissionId}`}>Feedback (optional)</label>
                                                <textarea
                                                  id={`feedback-${submission.submissionId}`}
                                                  rows={3}
                                                  value={gradeForm.feedback}
                                                  onChange={(event) =>
                                                    setGradeForm({ ...gradeForm, feedback: event.target.value })
                                                  }
                                                />
                                              </div>
                                              <button
                                                type="button"
                                                className="btn btn-primary btn-sm"
                                                disabled={gradeSaving}
                                                onClick={() => void saveGrade(submission.submissionId)}
                                              >
                                                {gradeSaving ? 'Saving…' : 'Save mark'}
                                              </button>
                                            </div>
                                          )}
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </>
                              )}
                            </article>
                          ))
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
                        <article key={code.id} className="course-card">
                          <div className="head">
                            <div>
                              <h4>{code.code}</h4>
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

                          <div className="field" style={{ marginTop: 12 }}>
                            <label htmlFor={`batch-${code.id}`}>Link this code to a course (optional)</label>
                            <select
                              id={`batch-${code.id}`}
                              value={selectedBatchByCode[code.code] ?? ''}
                              onChange={(event) => {
                                setSelectedBatchByCode((current) => ({
                                  ...current,
                                  [code.code]: event.target.value,
                                }));
                                setQrCode(null);
                              }}
                            >
                              <option value="">General link (no specific course)</option>
                              {Array.isArray(batchOptions) &&
                                batchOptions.map((batch) => (
                                  <option key={batch.batchId} value={batch.batchId}>
                                    {batch.courseName} — {batch.cohortLabel} — {formatDate(batch.startDate)}
                                  </option>
                                ))}
                            </select>
                          </div>

                          <p className="meta" style={{ marginTop: 8, wordBreak: 'break-all' }}>
                            {referralLinkFor(code.code)}
                          </p>

                          <div className="join-row">
                            <button type="button" className="btn btn-outline btn-sm" onClick={() => copyLink(code.code)}>
                              {copiedCode === code.code ? 'Copied!' : 'Copy link'}
                            </button>
                            <button type="button" className="btn btn-outline btn-sm" onClick={() => void showQrCode(code.code)}>
                              Show QR code
                            </button>
                          </div>

                          {qrCode?.code === code.code && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={qrCode.dataUrl}
                              alt={`QR code for ${code.code}`}
                              width={180}
                              height={180}
                              style={{ marginTop: 12 }}
                            />
                          )}
                        </article>
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
