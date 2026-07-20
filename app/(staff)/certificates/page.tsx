'use client';

// Certificate registry (founder-approved 2026-07-19), replacing the Google
// Sheets + AppScript registry. Three panels: batch issuance (eligibility
// auto-computed, admin-approved), manual issuance (incl. legacy backfill via
// custom numbers), and the registry list with download/verify/revoke.
import { useCallback, useEffect, useState } from 'react';

import { apiFetch } from '@/components/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Course {
  id: string;
  courseName: string;
}

interface BatchOption {
  id: string;
  courseId: string;
  cohortLabel: string;
  startDate: string;
}

interface Candidate {
  registrationId: string;
  participantName: string;
  participantEmail: string;
  paid: boolean;
  feedbackSubmitted: boolean;
  attendancePercent: number | null;
  alreadyIssued: boolean;
  eligible: boolean;
}

interface Certificate {
  id: string;
  certificateNumber: string;
  recipientName: string;
  courseTitle: string;
  issuedDate: string;
  revoked: boolean;
}

const EMPTY_MANUAL_FORM = {
  recipientName: '',
  courseCode: '',
  courseTitle: '',
  description: '',
  hours: '',
  cpdCredit: 'TBD',
  issuedDate: new Date().toISOString().slice(0, 10),
  recipientEmail: '',
  customNumber: '',
};

export default function CertificatesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [batches, setBatches] = useState<BatchOption[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Batch issuance state.
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchForm, setBatchForm] = useState({ hours: '', description: '', cpdCredit: 'TBD' });
  const [issuing, setIssuing] = useState(false);

  // Manual issuance state.
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualForm, setManualForm] = useState(EMPTY_MANUAL_FORM);
  const [savingManual, setSavingManual] = useState(false);

  const reloadRegistry = useCallback(async () => {
    const data = await apiFetch<{ certificates: Certificate[] }>('/api/certificates');
    setCertificates(data.certificates);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [coursesData, batchesData] = await Promise.all([
          apiFetch<{ courses: Course[] }>('/api/courses'),
          apiFetch<{ batches: BatchOption[] }>('/api/batches'),
        ]);
        setCourses(coursesData.courses);
        setBatches(batchesData.batches);
        await reloadRegistry();
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Failed to load.');
      }
    })();
  }, [reloadRegistry]);

  const courseNameById = new Map(courses.map((course) => [course.id, course.courseName]));

  async function loadCandidates(batchId: string) {
    setSelectedBatchId(batchId);
    setCandidates([]);
    setSelectedIds(new Set());
    if (!batchId) return;
    try {
      const data = await apiFetch<{ candidates: Candidate[] }>(
        `/api/certificates/batch?batchId=${encodeURIComponent(batchId)}`,
      );
      setCandidates(data.candidates);
      setSelectedIds(
        new Set(data.candidates.filter((c) => c.eligible).map((c) => c.registrationId)),
      );
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load eligibility.');
    }
  }

  function toggleCandidate(registrationId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(registrationId)) next.delete(registrationId);
      else next.add(registrationId);
      return next;
    });
  }

  async function handleBatchIssue() {
    if (selectedIds.size === 0 || !batchForm.hours) return;
    setIssuing(true);
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      const result = await apiFetch<{ issued: number; emailed: number; skipped: number }>(
        '/api/certificates/batch',
        {
          method: 'POST',
          body: JSON.stringify({
            batchId: selectedBatchId,
            registrationIds: [...selectedIds],
            hours: Number(batchForm.hours),
            description: batchForm.description,
            cpdCredit: batchForm.cpdCredit || 'TBD',
            sendEmail: true,
          }),
        },
      );
      setStatusMessage(
        `Issued ${result.issued} certificate${result.issued === 1 ? '' : 's'} (${result.emailed} emailed, ${result.skipped} skipped).`,
      );
      await Promise.all([reloadRegistry(), loadCandidates(selectedBatchId)]);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Batch issue failed.');
    } finally {
      setIssuing(false);
    }
  }

  async function handleManualIssue(event: React.FormEvent) {
    event.preventDefault();
    setSavingManual(true);
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      const issued = await apiFetch<Certificate>('/api/certificates', {
        method: 'POST',
        body: JSON.stringify({
          recipientName: manualForm.recipientName,
          courseCode: manualForm.courseCode,
          courseTitle: manualForm.courseTitle,
          description: manualForm.description,
          hours: Number(manualForm.hours || 0),
          cpdCredit: manualForm.cpdCredit || 'TBD',
          issuedDate: manualForm.issuedDate,
          ...(manualForm.recipientEmail ? { recipientEmail: manualForm.recipientEmail } : {}),
          ...(manualForm.customNumber ? { customNumber: manualForm.customNumber } : {}),
          sendEmail: Boolean(manualForm.recipientEmail),
        }),
      });
      setStatusMessage(`Issued ${issued.certificateNumber} to ${issued.recipientName}.`);
      setManualForm(EMPTY_MANUAL_FORM);
      setShowManualForm(false);
      await reloadRegistry();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Manual issue failed.');
    } finally {
      setSavingManual(false);
    }
  }

  async function handleRevoke(certificate: Certificate) {
    const reason = window.prompt(
      `Revoke ${certificate.certificateNumber} (${certificate.recipientName})? Enter a reason:`,
    );
    if (reason === null) return;
    try {
      await apiFetch(`/api/certificates/${certificate.id}/revoke`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      setStatusMessage(`${certificate.certificateNumber} revoked.`);
      await reloadRegistry();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Revoke failed.');
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Certificates</h1>
        <p className="text-sm text-muted-foreground">
          Issue Certificates of Competence, verify at /verify/&lt;number&gt;, and manage the
          registry. Eligibility: Paid + feedback submitted; attendance shown for judgment.
        </p>
      </div>

      {statusMessage && <p className="text-sm text-emerald-600">{statusMessage}</p>}
      {errorMessage && (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      )}

      {/* Batch issuance */}
      <section className="space-y-4 rounded-lg border p-4">
        <h2 className="font-semibold">Issue for a batch</h2>
        <div className="max-w-md space-y-2">
          <Label htmlFor="batch">Batch</Label>
          <select
            id="batch"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={selectedBatchId}
            onChange={(event) => loadCandidates(event.target.value)}
          >
            <option value="">Select a batch…</option>
            {batches.map((batch) => (
              <option key={batch.id} value={batch.id}>
                {courseNameById.get(batch.courseId) ?? 'Course'} — {batch.cohortLabel} (
                {batch.startDate})
              </option>
            ))}
          </select>
        </div>

        {candidates.length > 0 && (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="hours">Hours of learning</Label>
                <Input
                  id="hours"
                  type="number"
                  min={0}
                  placeholder="20"
                  value={batchForm.hours}
                  onChange={(event) => setBatchForm({ ...batchForm, hours: event.target.value })}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="cpd">CPD credit</Label>
                <Input
                  id="cpd"
                  value={batchForm.cpdCredit}
                  onChange={(event) =>
                    setBatchForm({ ...batchForm, cpdCredit: event.target.value })
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Certificate description line</Label>
              <textarea
                id="description"
                className="min-h-16 w-full rounded-md border bg-background px-3 py-2 text-sm"
                placeholder="focused on practical application of …"
                value={batchForm.description}
                onChange={(event) =>
                  setBatchForm({ ...batchForm, description: event.target.value })
                }
              />
            </div>

            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="px-3 py-2" />
                    <th className="px-3 py-2 font-medium">Participant</th>
                    <th className="px-3 py-2 font-medium">Paid</th>
                    <th className="px-3 py-2 font-medium">Feedback</th>
                    <th className="px-3 py-2 font-medium">Attendance</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((candidate) => (
                    <tr key={candidate.registrationId} className="border-t">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(candidate.registrationId)}
                          disabled={candidate.alreadyIssued}
                          onChange={() => toggleCandidate(candidate.registrationId)}
                        />
                      </td>
                      <td className="px-3 py-2">{candidate.participantName}</td>
                      <td className="px-3 py-2">{candidate.paid ? '✅' : '—'}</td>
                      <td className="px-3 py-2">{candidate.feedbackSubmitted ? '✅' : '—'}</td>
                      <td className="px-3 py-2">
                        {candidate.attendancePercent !== null
                          ? `${candidate.attendancePercent}%`
                          : 'n/a'}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {candidate.alreadyIssued
                          ? 'Issued'
                          : candidate.eligible
                            ? 'Eligible'
                            : 'Not eligible'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Button
              onClick={handleBatchIssue}
              disabled={issuing || selectedIds.size === 0 || !batchForm.hours}
            >
              {issuing
                ? 'Issuing…'
                : `Issue ${selectedIds.size} certificate${selectedIds.size === 1 ? '' : 's'} + email`}
            </Button>
          </>
        )}
      </section>

      {/* Manual issuance */}
      <section className="space-y-4 rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Issue manually</h2>
          <Button variant="outline" onClick={() => setShowManualForm(!showManualForm)}>
            {showManualForm ? 'Close' : 'New manual certificate'}
          </Button>
        </div>
        {showManualForm && (
          <form onSubmit={handleManualIssue} className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="m-name">Recipient name</Label>
              <Input
                id="m-name"
                required
                value={manualForm.recipientName}
                onChange={(e) => setManualForm({ ...manualForm, recipientName: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="m-code">Course code (for the number, e.g. AI01)</Label>
              <Input
                id="m-code"
                required
                value={manualForm.courseCode}
                onChange={(e) => setManualForm({ ...manualForm, courseCode: e.target.value })}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="m-title">Course title</Label>
              <Input
                id="m-title"
                required
                value={manualForm.courseTitle}
                onChange={(e) => setManualForm({ ...manualForm, courseTitle: e.target.value })}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="m-desc">Description line</Label>
              <Input
                id="m-desc"
                value={manualForm.description}
                onChange={(e) => setManualForm({ ...manualForm, description: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="m-hours">Hours</Label>
              <Input
                id="m-hours"
                type="number"
                min={0}
                required
                value={manualForm.hours}
                onChange={(e) => setManualForm({ ...manualForm, hours: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="m-cpd">CPD credit</Label>
              <Input
                id="m-cpd"
                value={manualForm.cpdCredit}
                onChange={(e) => setManualForm({ ...manualForm, cpdCredit: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="m-date">Issue date</Label>
              <Input
                id="m-date"
                type="date"
                required
                value={manualForm.issuedDate}
                onChange={(e) => setManualForm({ ...manualForm, issuedDate: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="m-email">Recipient email (optional — sends the link)</Label>
              <Input
                id="m-email"
                type="email"
                value={manualForm.recipientEmail}
                onChange={(e) => setManualForm({ ...manualForm, recipientEmail: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="m-number">Custom number (legacy backfill, optional)</Label>
              <Input
                id="m-number"
                placeholder="KNW-AI01-2026-0036"
                value={manualForm.customNumber}
                onChange={(e) => setManualForm({ ...manualForm, customNumber: e.target.value })}
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={savingManual}>
                {savingManual ? 'Issuing…' : 'Issue certificate'}
              </Button>
            </div>
          </form>
        )}
      </section>

      {/* Registry */}
      <section className="space-y-3">
        <h2 className="font-semibold">Registry ({certificates.length})</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Number</th>
                <th className="px-3 py-2 font-medium">Recipient</th>
                <th className="px-3 py-2 font-medium">Course</th>
                <th className="px-3 py-2 font-medium">Issued</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {certificates.map((certificate) => (
                <tr key={certificate.id} className="border-t">
                  <td className="px-3 py-2 font-mono text-xs">
                    {certificate.certificateNumber}
                  </td>
                  <td className="px-3 py-2">{certificate.recipientName}</td>
                  <td className="px-3 py-2">{certificate.courseTitle}</td>
                  <td className="px-3 py-2">{certificate.issuedDate}</td>
                  <td className="px-3 py-2">
                    {certificate.revoked ? (
                      <span className="text-destructive">Revoked</span>
                    ) : (
                      'Valid'
                    )}
                  </td>
                  <td className="space-x-3 px-3 py-2 text-xs">
                    {!certificate.revoked && (
                      <>
                        <a
                          className="text-primary underline"
                          href={`/api/certificates/download/${certificate.id}`}
                        >
                          PDF
                        </a>
                        <a
                          className="text-primary underline"
                          href={`/verify/${encodeURIComponent(certificate.certificateNumber)}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Verify
                        </a>
                        <button
                          type="button"
                          className="text-destructive underline"
                          onClick={() => handleRevoke(certificate)}
                        >
                          Revoke
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
